use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, File},
    io::BufReader,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use ddsfile::Dds;
use image::{
    DynamicImage, ImageFormat, Rgba, RgbaImage,
    imageops::{self, FilterType},
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildPlan {
    output_directory: PathBuf,
    source_tile_size: u32,
    tile_size: u32,
    source_zoom: u8,
    max_zoom: u8,
    xyz_origin: [u32; 2],
    grid_size: u32,
    maps: Vec<MapPlan>,
    #[serde(default)]
    marker_profiles: Vec<MarkerProfilePlan>,
    #[serde(default)]
    marker_mask_output: Option<PathBuf>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MapPlan {
    id: String,
    tiles: Vec<TilePlan>,
    #[serde(default)]
    difference_tiles: Vec<TilePlan>,
    #[serde(default)]
    content_mask: Option<ContentMask>,
    #[serde(default)]
    seam_optimization: Option<SeamOptimization>,
    #[serde(default)]
    discovery_mask_bit: Option<u32>,
    #[serde(default)]
    discovery_plane: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkerProfilePlan {
    profile: String,
    marker_count: usize,
    markers: Vec<MarkerSample>,
}

#[derive(Deserialize)]
struct MarkerSample {
    index: usize,
    plane: String,
    x: f32,
    y: f32,
}

#[derive(Serialize)]
struct MarkerMaskOutput {
    profiles: BTreeMap<String, Vec<u32>>,
}

#[derive(Deserialize)]
struct ContentMask {
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
    fade: u32,
}

#[derive(Deserialize)]
struct SeamOptimization {
    radius: u32,
    strength: f32,
}

#[derive(Deserialize)]
struct TilePlan {
    col: u32,
    row: u32,
    dds: PathBuf,
}

fn main() -> Result<()> {
    let plan_path = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .context("用法：mfg-map-codec <build-plan.json>")?;
    let plan: BuildPlan = serde_json::from_reader(BufReader::new(
        File::open(&plan_path).with_context(|| format!("无法读取 {}", plan_path.display()))?,
    ))
    .context("地图构建计划 JSON 无效")?;

    if plan.source_tile_size != 256
        || plan.tile_size != 1024
        || plan.grid_size != 41
        || plan.source_zoom != 6
        || plan.max_zoom != 4
    {
        bail!(
            "当前编解码器只接受 256 像素游戏格、1024 像素 Web 瓦片、41×41、源级别 6 / 输出级别 4 的地图"
        );
    }
    fs::create_dir_all(&plan.output_directory)?;
    let mut marker_masks = plan
        .marker_profiles
        .iter()
        .map(|profile| (profile.profile.clone(), vec![0_u32; profile.marker_count]))
        .collect::<BTreeMap<_, _>>();
    for map in &plan.maps {
        build_map(&plan, map, &mut marker_masks)?;
    }
    if let Some(output) = &plan.marker_mask_output {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        serde_json::to_writer(
            File::create(output).with_context(|| format!("无法创建 {}", output.display()))?,
            &MarkerMaskOutput {
                profiles: marker_masks,
            },
        )?;
        println!("标记地图碎片归属清单完成：{}", output.display());
    }
    Ok(())
}

fn build_map(
    plan: &BuildPlan,
    map: &MapPlan,
    marker_masks: &mut BTreeMap<String, Vec<u32>>,
) -> Result<()> {
    println!("正在生成 {}：{} 个有效 L0 纹理", map.id, map.tiles.len());
    let canvas_size = plan.grid_size * plan.source_tile_size;
    let mut canvas = RgbaImage::from_pixel(canvas_size, canvas_size, Rgba([0, 0, 0, 0]));

    let difference_tiles = map
        .difference_tiles
        .iter()
        .map(|tile| ((tile.col, tile.row), tile))
        .collect::<HashMap<_, _>>();
    if !difference_tiles.is_empty() && difference_tiles.len() != map.tiles.len() {
        bail!("{} 的差分底图数量与目标纹理数量不一致", map.id);
    }

    for (index, tile) in map.tiles.iter().enumerate() {
        if tile.col >= plan.grid_size || tile.row >= plan.grid_size {
            bail!("{} 的纹理坐标越界：{},{}", map.id, tile.col, tile.row);
        }
        let (_, screen_row) = xyz_position([0, 0], plan.grid_size, tile.col, tile.row);
        if map.content_mask.as_ref().is_some_and(|mask| {
            let left = tile.col * plan.source_tile_size;
            let top = screen_row * plan.source_tile_size;
            left + plan.source_tile_size <= mask.left
                || left >= mask.right
                || top + plan.source_tile_size <= mask.top
                || top >= mask.bottom
        }) {
            continue;
        }
        let mut decoded = decode_dds(&tile.dds)?;
        if decoded.dimensions() != (plan.source_tile_size, plan.source_tile_size) {
            bail!("DDS 尺寸不是 256×256：{}", tile.dds.display());
        }
        if let Some(base_tile) = difference_tiles.get(&(tile.col, tile.row)) {
            let base = decode_dds(&base_tile.dds)?;
            if base.dimensions() != decoded.dimensions() {
                bail!(
                    "{} 的差分底图尺寸不一致：{}",
                    map.id,
                    base_tile.dds.display()
                );
            }
            make_difference_overlay(&mut decoded, &base);
        }
        imageops::overlay(
            &mut canvas,
            &decoded,
            i64::from(tile.col * plan.source_tile_size),
            i64::from(screen_row * plan.source_tile_size),
        );
        if (index + 1) % 200 == 0 || index + 1 == map.tiles.len() {
            println!("{}：已解码 {}/{}", map.id, index + 1, map.tiles.len());
        }
    }

    if let Some(optimization) = &map.seam_optimization {
        if optimization.radius == 0 || optimization.radius >= plan.source_tile_size / 2 {
            bail!("{} 的接缝优化半径无效：{}", map.id, optimization.radius);
        }
        if !(0.0..=1.0).contains(&optimization.strength) {
            bail!("{} 的接缝优化强度必须位于 0–1", map.id);
        }
        let before = mean_seam_delta(&canvas, plan.source_tile_size, plan.grid_size);
        optimize_canvas_seams(
            &mut canvas,
            plan.source_tile_size,
            plan.grid_size,
            optimization,
        );
        let after = mean_seam_delta(&canvas, plan.source_tile_size, plan.grid_size);
        println!(
            "{}：整图接缝优化完成，平均边界色差 {:.2} → {:.2}",
            map.id, before, after
        );
    } else {
        println!("{}：保留原始 L0 接缝", map.id);
    }
    if let Some(mask) = &map.content_mask {
        apply_content_mask(&mut canvas, mask);
    }
    if let (Some(mask_bit), Some(plane)) = (map.discovery_mask_bit, map.discovery_plane.as_deref())
    {
        sample_marker_masks(
            &canvas,
            &plan.marker_profiles,
            marker_masks,
            plane,
            mask_bit,
        )?;
    }

    let mut current = canvas;
    for zoom in (0..=plan.max_zoom).rev() {
        let scale = 1_u32 << (plan.max_zoom - zoom);
        let origin = [
            plan.xyz_origin[0] * plan.source_tile_size / scale,
            plan.xyz_origin[1] * plan.source_tile_size / scale,
        ];
        write_zoom_from_canvas(
            &plan.output_directory,
            &map.id,
            zoom,
            &current,
            origin,
            plan.tile_size,
        )?;
        if zoom > 0 {
            current = imageops::resize(
                &current,
                current.width() / 2,
                current.height() / 2,
                FilterType::Lanczos3,
            );
        }
    }
    println!("{}：瓦片金字塔完成", map.id);
    Ok(())
}

fn sample_marker_masks(
    image: &RgbaImage,
    profiles: &[MarkerProfilePlan],
    output: &mut BTreeMap<String, Vec<u32>>,
    plane: &str,
    mask_bit: u32,
) -> Result<()> {
    let mut matched = 0_usize;
    for profile in profiles {
        let masks = output
            .get_mut(&profile.profile)
            .with_context(|| format!("缺少 {} 的标记掩码数组", profile.profile))?;
        for marker in profile
            .markers
            .iter()
            .filter(|marker| marker.plane == plane)
        {
            if marker.index >= masks.len() {
                bail!("{} 的标记索引越界：{}", profile.profile, marker.index);
            }
            if revealed_near(image, marker.x, marker.y, 4) {
                masks[marker.index] |= mask_bit;
                matched += 1;
            }
        }
    }
    println!("碎片位 {mask_bit:#010x}：精确命中 {matched} 个 profile 标记");
    Ok(())
}

fn revealed_near(image: &RgbaImage, x: f32, y: f32, radius: i32) -> bool {
    if !x.is_finite() || !y.is_finite() {
        return false;
    }
    let center_x = x.round() as i32;
    let center_y = y.round() as i32;
    for offset_y in -radius..=radius {
        for offset_x in -radius..=radius {
            let sample_x = center_x + offset_x;
            let sample_y = center_y + offset_y;
            if sample_x < 0 || sample_y < 0 {
                continue;
            }
            if let Some(pixel) = image.get_pixel_checked(sample_x as u32, sample_y as u32)
                && pixel.0[3] > 0
            {
                return true;
            }
        }
    }
    false
}

fn decode_dds(path: &Path) -> Result<RgbaImage> {
    let file = File::open(path).with_context(|| format!("无法读取 DDS：{}", path.display()))?;
    let dds = Dds::read(BufReader::new(file))
        .with_context(|| format!("DDS 头无效：{}", path.display()))?;
    image_dds::image_from_dds(&dds, 0).with_context(|| format!("无法解码 DDS：{}", path.display()))
}

// 每个 WorldMapPiece 的正式纹理仍包含未揭示底图。把与 00000000
// 变体一致的像素变透明后，浏览器可以按存档旗标叠加各碎片，同时保留
// 游戏纹理中已经烘焙好的烟雾边缘，而不再绘制 256px 方块遮罩。
fn make_difference_overlay(target: &mut RgbaImage, base: &RgbaImage) {
    for (target_pixel, base_pixel) in target.pixels_mut().zip(base.pixels()) {
        let delta = (0..4)
            .map(|channel| target_pixel.0[channel].abs_diff(base_pixel.0[channel]))
            .max()
            .unwrap_or(0);
        if delta <= 2 {
            target_pixel.0[3] = 0;
        }
    }
}

fn apply_content_mask(image: &mut RgbaImage, mask: &ContentMask) {
    for (x, y, pixel) in image.enumerate_pixels_mut() {
        if x < mask.left || x >= mask.right || y < mask.top || y >= mask.bottom {
            pixel.0[3] = 0;
            continue;
        }
        if mask.fade == 0 {
            continue;
        }
        let opacity = rounded_content_opacity(x, y, mask);
        pixel.0[3] = (f32::from(pixel.0[3]) * opacity).round() as u8;
    }
}

// 以距完全不透明核心矩形的欧氏距离生成圆角，而不是取四边距离的最小值。
// 后者的等透明度线仍是矩形，四角看起来像直线倒角；这里的等透明度线是
// 四分之一圆，并用 smoothstep 避免线性渐变在起止位置出现视觉折点。
fn rounded_content_opacity(x: u32, y: u32, mask: &ContentMask) -> f32 {
    let fade = mask.fade as f32;
    let core_left = mask.left as f32 + fade;
    let core_top = mask.top as f32 + fade;
    let core_right = (mask.right - 1) as f32 - fade;
    let core_bottom = (mask.bottom - 1) as f32 - fade;
    let x = x as f32;
    let y = y as f32;
    let dx = if x < core_left {
        core_left - x
    } else if x > core_right {
        x - core_right
    } else {
        0.0
    };
    let dy = if y < core_top {
        core_top - y
    } else if y > core_bottom {
        y - core_bottom
    } else {
        0.0
    };
    let linear = (1.0 - dx.hypot(dy) / fade).clamp(0.0, 1.0);
    linear * linear * (3.0 - 2.0 * linear)
}

// 先把全部 41×41 个 L0 纹理放到同一张逻辑画布，再对固定的 256px
// 边界做窄带过渡。算法只在接缝附近把原像素轻度拉向两侧锚点之间的
// 插值，不复制边缘列，也不改变瓦片或标记坐标；native 模式会跳过这里。
fn optimize_canvas_seams(
    image: &mut RgbaImage,
    source_tile_size: u32,
    grid_size: u32,
    optimization: &SeamOptimization,
) {
    for tile_col in 1..grid_size {
        feather_vertical_seam(
            image,
            tile_col * source_tile_size,
            optimization.radius,
            optimization.strength,
        );
    }
    for tile_row in 1..grid_size {
        feather_horizontal_seam(
            image,
            tile_row * source_tile_size,
            optimization.radius,
            optimization.strength,
        );
    }
}

fn feather_vertical_seam(image: &mut RgbaImage, seam: u32, radius: u32, strength: f32) {
    let start = seam - radius - 1;
    let end = seam + radius;
    let span = end - start;
    let mut row = Vec::with_capacity((span + 1) as usize);
    for y in 0..image.height() {
        row.clear();
        row.extend((start..=end).map(|x| *image.get_pixel(x, y)));
        if row[0].0[3] == 0 || row[span as usize].0[3] == 0 {
            continue;
        }
        let left = row[0];
        let right = row[span as usize];
        for offset in 1..span {
            let x = start + offset;
            let weight = seam_weight(x as f32 + 0.5, seam as f32, radius, strength);
            let target = lerp_pixel(left, right, offset as f32 / span as f32);
            image.put_pixel(x, y, lerp_pixel(row[offset as usize], target, weight));
        }
    }
}

fn feather_horizontal_seam(image: &mut RgbaImage, seam: u32, radius: u32, strength: f32) {
    let start = seam - radius - 1;
    let end = seam + radius;
    let span = end - start;
    let mut column = Vec::with_capacity((span + 1) as usize);
    for x in 0..image.width() {
        column.clear();
        column.extend((start..=end).map(|y| *image.get_pixel(x, y)));
        if column[0].0[3] == 0 || column[span as usize].0[3] == 0 {
            continue;
        }
        let top = column[0];
        let bottom = column[span as usize];
        for offset in 1..span {
            let y = start + offset;
            let weight = seam_weight(y as f32 + 0.5, seam as f32, radius, strength);
            let target = lerp_pixel(top, bottom, offset as f32 / span as f32);
            image.put_pixel(x, y, lerp_pixel(column[offset as usize], target, weight));
        }
    }
}

fn seam_weight(position: f32, seam: f32, radius: u32, strength: f32) -> f32 {
    let linear = (1.0 - (position - seam).abs() / radius as f32).clamp(0.0, 1.0);
    strength * linear * linear * (3.0 - 2.0 * linear)
}

fn lerp_pixel(from: Rgba<u8>, to: Rgba<u8>, amount: f32) -> Rgba<u8> {
    let mut result = [0_u8; 4];
    for (channel, value) in result.iter_mut().enumerate() {
        *value = (f32::from(from.0[channel])
            + (f32::from(to.0[channel]) - f32::from(from.0[channel])) * amount)
            .round()
            .clamp(0.0, 255.0) as u8;
    }
    Rgba(result)
}

fn mean_seam_delta(image: &RgbaImage, source_tile_size: u32, grid_size: u32) -> f64 {
    let mut total = 0_u64;
    let mut channels = 0_u64;
    for tile_col in 1..grid_size {
        let seam = tile_col * source_tile_size;
        for y in 0..image.height() {
            accumulate_rgb_delta(
                image.get_pixel(seam - 1, y),
                image.get_pixel(seam, y),
                &mut total,
                &mut channels,
            );
        }
    }
    for tile_row in 1..grid_size {
        let seam = tile_row * source_tile_size;
        for x in 0..image.width() {
            accumulate_rgb_delta(
                image.get_pixel(x, seam - 1),
                image.get_pixel(x, seam),
                &mut total,
                &mut channels,
            );
        }
    }
    total as f64 / channels.max(1) as f64
}

fn accumulate_rgb_delta(first: &Rgba<u8>, second: &Rgba<u8>, total: &mut u64, channels: &mut u64) {
    if first.0[3] == 0 || second.0[3] == 0 {
        return;
    }
    for channel in 0..3 {
        *total += u64::from(first.0[channel].abs_diff(second.0[channel]));
        *channels += 1;
    }
}

// 游戏纹理行号向北递增，XYZ 行号向南递增。
fn xyz_position(origin: [u32; 2], grid_size: u32, col: u32, row: u32) -> (u32, u32) {
    (origin[0] + col, origin[1] + (grid_size - 1 - row))
}

fn write_zoom_from_canvas(
    output: &Path,
    map_id: &str,
    zoom: u8,
    canvas: &RgbaImage,
    origin: [u32; 2],
    tile_size: u32,
) -> Result<()> {
    let min_x = origin[0] / tile_size;
    let min_y = origin[1] / tile_size;
    let max_x = (origin[0] + canvas.width() - 1) / tile_size;
    let max_y = (origin[1] + canvas.height() - 1) / tile_size;
    let mut count = 0;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let global_left = x * tile_size;
            let global_top = y * tile_size;
            let overlap_left = global_left.max(origin[0]);
            let overlap_top = global_top.max(origin[1]);
            let overlap_right = (global_left + tile_size).min(origin[0] + canvas.width());
            let overlap_bottom = (global_top + tile_size).min(origin[1] + canvas.height());
            let mut tile = RgbaImage::from_pixel(tile_size, tile_size, Rgba([0, 0, 0, 0]));
            let view = imageops::crop_imm(
                canvas,
                overlap_left - origin[0],
                overlap_top - origin[1],
                overlap_right - overlap_left,
                overlap_bottom - overlap_top,
            )
            .to_image();
            imageops::overlay(
                &mut tile,
                &view,
                i64::from(overlap_left - global_left),
                i64::from(overlap_top - global_top),
            );
            let directory = output
                .join(map_id)
                .join(zoom.to_string())
                .join(x.to_string());
            fs::create_dir_all(&directory)?;
            let path = directory.join(format!("{y}.webp"));
            DynamicImage::ImageRgba8(tile)
                .save_with_format(&path, ImageFormat::WebP)
                .with_context(|| format!("无法写入 WebP：{}", path.display()))?;
            count += 1;
        }
    }
    println!("{}：z{} 已写入 {} 个瓦片", map_id, zoom, count);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_rows_are_flipped_into_xyz_rows() {
        assert_eq!((11, 51), xyz_position([11, 11], 41, 0, 0));
        assert_eq!((51, 11), xyz_position([11, 11], 41, 40, 40));
    }

    #[test]
    fn content_mask_uses_rounded_corners_and_removes_border() {
        let mut image = RgbaImage::from_pixel(10, 10, Rgba([10, 20, 30, 255]));
        let mask = ContentMask {
            left: 1,
            top: 1,
            right: 10,
            bottom: 10,
            fade: 4,
        };

        apply_content_mask(&mut image, &mask);

        assert_eq!(0, image.get_pixel(0, 0).0[3]);
        assert_eq!(0, image.get_pixel(1, 1).0[3]);
        assert_eq!(128, image.get_pixel(3, 5).0[3]);
        assert!(image.get_pixel(3, 3).0[3] < image.get_pixel(3, 5).0[3]);
        assert_eq!(255, image.get_pixel(5, 5).0[3]);
        assert_eq!(0, image.get_pixel(9, 9).0[3]);
    }

    #[test]
    fn seam_optimization_reduces_boundary_jump_without_touching_far_pixels() {
        let mut image = RgbaImage::from_pixel(8, 8, Rgba([20, 20, 20, 255]));
        for y in 0..8 {
            for x in 4..8 {
                image.put_pixel(x, y, Rgba([220, 220, 220, 255]));
            }
        }
        let before = mean_seam_delta(&image, 4, 2);

        optimize_canvas_seams(
            &mut image,
            4,
            2,
            &SeamOptimization {
                radius: 1,
                strength: 1.0,
            },
        );

        assert!(mean_seam_delta(&image, 4, 2) < before);
        assert_eq!(Rgba([20, 20, 20, 255]), *image.get_pixel(0, 0));
        assert_eq!(Rgba([220, 220, 220, 255]), *image.get_pixel(7, 0));
    }
}
