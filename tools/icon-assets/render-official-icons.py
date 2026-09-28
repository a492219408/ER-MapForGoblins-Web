#!/usr/bin/env python3
"""Render Elden Ring's official world-map icon frames into one Web atlas.

The game stores each icon as a Scaleform timeline frame.  A frame may contain
several depth-ordered image layers with transforms and colour transforms.  This
tool keeps that composition model, but bakes each frame into an atlas so the Web
client does not need a Flash/Scaleform runtime.

Inputs are user-generated local extracts and are never intended to be committed:

* ``02_120_worldmap`` decompiled XML (frame/depth definitions)
* WitchyBND-extracted ``01_common.tpf.dcx`` DDS sheets
* WitchyBND-extracted ``01_common.sblytbnd.dcx`` layout XML files

The frame walker and colour-transform rules follow the MIT-style reference
implementation in ERR-MapForGoblins-DLL/tools/render_map_icons.py.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


TWIPS = 20.0
EXTRA_TEXTURES = {
    "player": "MENU_MAP_Player_01",
    "map-cursor": "MENU_MAP_Cursor_01",
    "memo-cursor": "MENU_MAP_MemoCursor",
}


@dataclass(frozen=True)
class SubTexture:
    sheet: Path
    box: tuple[int, int, int, int]


@dataclass(frozen=True)
class ShapeStroke:
    start: tuple[float, float]
    end: tuple[float, float]
    width: float
    colour: tuple[int, int, int, int]
    round_start: bool
    round_end: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render official Elden Ring world-map icons")
    parser.add_argument("--gfx-xml", required=True, type=Path)
    parser.add_argument("--texture-dir", required=True, type=Path)
    parser.add_argument("--layout-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--first-frame", type=int, default=1)
    parser.add_argument("--last-frame", type=int, default=348)
    parser.add_argument("--cell-size", type=int, default=128)
    parser.add_argument("--columns", type=int, default=16)
    return parser.parse_args()


def build_subtexture_index(layout_dir: Path, texture_dir: Path) -> dict[str, SubTexture]:
    result: dict[str, SubTexture] = {}
    for layout_path in sorted(layout_dir.glob("*.layout")):
        root = ET.parse(layout_path).getroot()
        image_path = root.get("imagePath", "")
        sheet_name = Path(image_path).stem or layout_path.stem
        sheet = texture_dir / f"{sheet_name}.dds"
        if not sheet.exists():
            continue
        for element in root.findall(".//SubTexture"):
            name = Path(element.get("name", "")).stem
            if not name:
                continue
            x = int(element.get("x", "0"))
            y = int(element.get("y", "0"))
            width = int(element.get("width", "0"))
            height = int(element.get("height", "0"))
            if width > 0 and height > 0:
                result[name] = SubTexture(sheet, (x, y, x + width, y + height))
    return result


def parse_gfx(root: ET.Element) -> tuple[
    dict[int, str],
    dict[int, str],
    dict[int, list[dict[int, dict[str, Any]]]],
    dict[int, list[ShapeStroke]],
]:
    external_names: dict[int, str] = {}
    character_types: dict[int, str] = {}
    sprite_frames: dict[int, list[dict[int, dict[str, Any]]]] = {}
    shape_strokes: dict[int, list[ShapeStroke]] = {}

    for item in root.iter("item"):
        tag_type = item.get("type", "")
        if tag_type == "DefineExternalImage2":
            character_id = int(item.get("characterID", "0"))
            external_names[character_id] = item.get("exportName", "")
            character_types[character_id] = "image"
        elif tag_type.startswith("DefineShape"):
            shape_id = int(item.get("shapeId", "0"))
            character_types[shape_id] = "shape"
            shape_strokes[shape_id] = parse_shape_strokes(item)
        elif tag_type.startswith("DefineBits"):
            character_id = int(item.get("characterID", "0"))
            character_types[character_id] = "bits"
        elif tag_type == "DefineSpriteTag":
            sprite_id = int(item.get("spriteId", "0"))
            sprite_frames[sprite_id] = parse_sprite_frames(item)
            character_types[sprite_id] = "sprite"

    return external_names, character_types, sprite_frames, shape_strokes


def parse_shape_strokes(shape: ET.Element) -> list[ShapeStroke]:
    """Read the line geometry used by Scaleform vector overlays.

    Elden Ring's disabled-fast-travel marker is a small red diagonal
    ``DefineShape4`` stroke placed over the normal grace image.  The earlier
    renderer handled bitmap leaves only, making frames 1 and 2 identical.
    """
    styles: list[tuple[float, tuple[int, int, int, int], bool, bool]] = []
    for style in shape.findall("./shapes/lineStyles/lineStyles2/item"):
        colour = style.find("color")
        if colour is None:
            continue
        styles.append((
            float(style.get("width", "0")),
            (
                int(colour.get("red", "0")),
                int(colour.get("green", "0")),
                int(colour.get("blue", "0")),
                int(colour.get("alpha", "255")),
            ),
            style.get("startCapStyle", "0") == "0",
            style.get("endCapStyle", "0") == "0",
        ))

    strokes: list[ShapeStroke] = []
    current_x = 0.0
    current_y = 0.0
    line_style = 0
    records = shape.find("./shapes/shapeRecords")
    if records is None:
        return strokes
    for record in records:
        record_type = record.get("type", "")
        if record_type == "StyleChangeRecord":
            if record.get("stateMoveTo", "false").lower() == "true":
                current_x = float(record.get("moveDeltaX", "0"))
                current_y = float(record.get("moveDeltaY", "0"))
            if record.get("stateLineStyle", "false").lower() == "true":
                line_style = int(record.get("lineStyle", "0"))
        elif record_type == "StraightEdgeRecord":
            next_x = current_x + float(record.get("deltaX", "0"))
            next_y = current_y + float(record.get("deltaY", "0"))
            if 0 < line_style <= len(styles):
                width, colour, round_start, round_end = styles[line_style - 1]
                strokes.append(ShapeStroke(
                    start=(current_x, current_y),
                    end=(next_x, next_y),
                    width=width,
                    colour=colour,
                    round_start=round_start,
                    round_end=round_end,
                ))
            current_x = next_x
            current_y = next_y
    return strokes


def parse_sprite_frames(sprite: ET.Element) -> list[dict[int, dict[str, Any]]]:
    frames: list[dict[int, dict[str, Any]]] = []
    current: dict[int, dict[str, Any]] = {}
    sub_tags = sprite.find("subTags")
    if sub_tags is None:
        return frames

    for tag in sub_tags:
        tag_type = tag.get("type", "")
        if tag_type in ("PlaceObject2Tag", "PlaceObject3Tag"):
            depth = int(tag.get("depth", "0"))
            layer = dict(current.get(depth, {}))
            if tag.get("characterId") is not None:
                layer["characterId"] = int(tag.get("characterId", "0"))
            matrix = tag.find("matrix")
            if matrix is not None:
                has_scale = matrix.get("hasScale", "true").lower() not in ("false", "0", "0.0")
                layer.update(
                    scaleX=float(matrix.get("scaleX", "1")) if has_scale else 1.0,
                    scaleY=float(matrix.get("scaleY", "1")) if has_scale else 1.0,
                    translateX=float(matrix.get("translateX", "0")),
                    translateY=float(matrix.get("translateY", "0")),
                )
            layer.setdefault("scaleX", 1.0)
            layer.setdefault("scaleY", 1.0)
            layer.setdefault("translateX", 0.0)
            layer.setdefault("translateY", 0.0)
            colour = tag.find("colorTransform")
            if colour is not None:
                layer["colourTransform"] = {
                    "redMult": int(colour.get("redMultTerm", "256")),
                    "greenMult": int(colour.get("greenMultTerm", "256")),
                    "blueMult": int(colour.get("blueMultTerm", "256")),
                    "alphaMult": int(colour.get("alphaMultTerm", "256")),
                    "redAdd": int(colour.get("redAddTerm", "0")),
                    "greenAdd": int(colour.get("greenAddTerm", "0")),
                    "blueAdd": int(colour.get("blueAddTerm", "0")),
                    "alphaAdd": int(colour.get("alphaAddTerm", "0")),
                }
            current[depth] = layer
        elif tag_type == "RemoveObject2Tag":
            current.pop(int(tag.get("depth", "0")), None)
        elif tag_type == "ShowFrameTag":
            frames.append({depth: dict(layer) for depth, layer in current.items()})
    return frames


def compose_colour(parent: dict[str, int] | None, child: dict[str, int] | None) -> dict[str, int] | None:
    if parent is None:
        return child
    if child is None:
        return parent

    def channel(mult_key: str, add_key: str) -> tuple[int, int]:
        parent_mult = parent[mult_key]
        return (
            parent_mult * child[mult_key] // 256,
            parent_mult * child[add_key] // 256 + parent[add_key],
        )

    red_mult, red_add = channel("redMult", "redAdd")
    green_mult, green_add = channel("greenMult", "greenAdd")
    blue_mult, blue_add = channel("blueMult", "blueAdd")
    alpha_mult, alpha_add = channel("alphaMult", "alphaAdd")
    return {
        "redMult": red_mult,
        "greenMult": green_mult,
        "blueMult": blue_mult,
        "alphaMult": alpha_mult,
        "redAdd": red_add,
        "greenAdd": green_add,
        "blueAdd": blue_add,
        "alphaAdd": alpha_add,
    }


def apply_colour(image: Image.Image, transform: dict[str, int] | None) -> Image.Image:
    if transform is None:
        return image
    channels = list(image.convert("RGBA").split())
    for index, (mult_key, add_key) in enumerate((
        ("redMult", "redAdd"),
        ("greenMult", "greenAdd"),
        ("blueMult", "blueAdd"),
        ("alphaMult", "alphaAdd"),
    )):
        multiplier = transform[mult_key]
        addition = transform[add_key]
        channels[index] = channels[index].point(
            lambda value, multiplier=multiplier, addition=addition: max(
                0,
                min(255, value * multiplier // 256 + addition),
            ),
        )
    return Image.merge("RGBA", channels)


def apply_colour_value(
    colour: tuple[int, int, int, int],
    transform: dict[str, int] | None,
) -> tuple[int, int, int, int]:
    if transform is None:
        return colour
    keys = (
        ("redMult", "redAdd"),
        ("greenMult", "greenAdd"),
        ("blueMult", "blueAdd"),
        ("alphaMult", "alphaAdd"),
    )
    return tuple(
        max(0, min(255, value * transform[mult_key] // 256 + transform[add_key]))
        for value, (mult_key, add_key) in zip(colour, keys)
    )


class Renderer:
    def __init__(
        self,
        texture_dir: Path,
        subtextures: dict[str, SubTexture],
        external_names: dict[int, str],
        character_types: dict[int, str],
        sprite_frames: dict[int, list[dict[int, dict[str, Any]]]],
        shape_strokes: dict[int, list[ShapeStroke]],
    ) -> None:
        self.texture_dir = texture_dir
        self.subtextures = subtextures
        self.external_names = external_names
        self.character_types = character_types
        self.sprite_frames = sprite_frames
        self.shape_strokes = shape_strokes
        self.sheet_cache: dict[Path, Image.Image] = {}
        self.texture_cache: dict[str, Image.Image] = {}
        self.missing: set[str] = set()

    def load_texture(self, name: str) -> Image.Image | None:
        if name in self.texture_cache:
            return self.texture_cache[name].copy()
        subtexture = self.subtextures.get(name)
        if subtexture is not None:
            sheet = self.sheet_cache.get(subtexture.sheet)
            if sheet is None:
                sheet = Image.open(subtexture.sheet).convert("RGBA")
                self.sheet_cache[subtexture.sheet] = sheet
            result = sheet.crop(subtexture.box)
            self.texture_cache[name] = result
            return result.copy()
        direct = self.texture_dir / f"{name}.dds"
        if direct.exists():
            result = Image.open(direct).convert("RGBA")
            self.texture_cache[name] = result
            return result.copy()
        self.missing.add(name)
        return None

    def draw_leaf(
        self,
        canvas: Image.Image,
        centre: tuple[int, int],
        character_id: int,
        scale_x: float,
        scale_y: float,
        translate_x: float,
        translate_y: float,
        colour: dict[str, int] | None,
    ) -> bool:
        character_type = self.character_types.get(character_id)
        if character_type == "shape":
            return self.draw_shape(
                canvas,
                centre,
                character_id,
                scale_x,
                scale_y,
                translate_x,
                translate_y,
                colour,
            )
        if character_type != "image":
            self.missing.add(f"character:{character_id}")
            return False
        name = self.external_names.get(character_id, "")
        image = self.load_texture(name)
        if image is None:
            return False
        width = max(1, round(image.width * abs(scale_x)))
        height = max(1, round(image.height * abs(scale_y)))
        image = image.resize((width, height), Image.Resampling.LANCZOS)
        if scale_x < 0:
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if scale_y < 0:
            image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        image = apply_colour(image, colour)
        x = round(centre[0] + translate_x / TWIPS)
        y = round(centre[1] + translate_y / TWIPS)
        # Flash 的负缩放以变换原点为右/下边界；Pillow 翻转像素后仍以
        # 左上角定位，因此需要把目标框退回一个宽/高。
        if scale_x < 0:
            x -= width
        if scale_y < 0:
            y -= height
        canvas.alpha_composite(image, (x, y))
        return True

    def draw_shape(
        self,
        canvas: Image.Image,
        centre: tuple[int, int],
        character_id: int,
        scale_x: float,
        scale_y: float,
        translate_x: float,
        translate_y: float,
        colour: dict[str, int] | None,
    ) -> bool:
        strokes = self.shape_strokes.get(character_id, [])
        if not strokes:
            self.missing.add(f"character:{character_id}")
            return False
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        width_scale = (abs(scale_x) + abs(scale_y)) / 2
        for stroke in strokes:
            start = (
                centre[0] + translate_x / TWIPS + stroke.start[0] * scale_x / TWIPS,
                centre[1] + translate_y / TWIPS + stroke.start[1] * scale_y / TWIPS,
            )
            end = (
                centre[0] + translate_x / TWIPS + stroke.end[0] * scale_x / TWIPS,
                centre[1] + translate_y / TWIPS + stroke.end[1] * scale_y / TWIPS,
            )
            width = max(1, round(stroke.width * width_scale / TWIPS))
            rgba = apply_colour_value(stroke.colour, colour)
            draw.line((start, end), fill=rgba, width=width)
            radius = width / 2
            if stroke.round_start:
                draw.ellipse(
                    (start[0] - radius, start[1] - radius, start[0] + radius, start[1] + radius),
                    fill=rgba,
                )
            if stroke.round_end:
                draw.ellipse(
                    (end[0] - radius, end[1] - radius, end[0] + radius, end[1] + radius),
                    fill=rgba,
                )
        canvas.alpha_composite(layer)
        return True

    def draw_sprite(
        self,
        canvas: Image.Image,
        centre: tuple[int, int],
        sprite_id: int,
        frame_index: int,
        scale_x: float,
        scale_y: float,
        translate_x: float,
        translate_y: float,
        colour: dict[str, int] | None,
        stack: tuple[int, ...] = (),
    ) -> int:
        frames = self.sprite_frames.get(sprite_id)
        if not frames or sprite_id in stack:
            return 0
        frame = frames[min(frame_index, len(frames) - 1)]
        drawn = 0
        for depth in sorted(frame):
            layer = frame[depth]
            character_id = layer.get("characterId")
            if character_id is None:
                continue
            effective_scale_x = scale_x * layer["scaleX"]
            effective_scale_y = scale_y * layer["scaleY"]
            effective_translate_x = scale_x * layer["translateX"] + translate_x
            effective_translate_y = scale_y * layer["translateY"] + translate_y
            effective_colour = compose_colour(colour, layer.get("colourTransform"))
            if self.character_types.get(character_id) == "sprite":
                drawn += self.draw_sprite(
                    canvas,
                    centre,
                    character_id,
                    0,
                    effective_scale_x,
                    effective_scale_y,
                    effective_translate_x,
                    effective_translate_y,
                    effective_colour,
                    stack + (sprite_id,),
                )
            elif self.draw_leaf(
                canvas,
                centre,
                character_id,
                effective_scale_x,
                effective_scale_y,
                effective_translate_x,
                effective_translate_y,
                effective_colour,
            ):
                drawn += 1
        return drawn


def render() -> None:
    args = parse_args()
    if args.first_frame < 1 or args.last_frame < args.first_frame:
        raise SystemExit("invalid frame range")
    root = ET.parse(args.gfx_xml).getroot()
    external_names, character_types, sprite_frames, shape_strokes = parse_gfx(root)
    icon_frames = sprite_frames.get(171)
    if icon_frames is None:
        raise SystemExit("sprite 171 not found")
    last_frame = min(args.last_frame, len(icon_frames))
    subtextures = build_subtexture_index(args.layout_dir, args.texture_dir)
    renderer = Renderer(
        args.texture_dir,
        subtextures,
        external_names,
        character_types,
        sprite_frames,
        shape_strokes,
    )

    frame_count = last_frame - args.first_frame + 1
    extra_textures = [
        (key, texture_name, renderer.load_texture(texture_name))
        for key, texture_name in EXTRA_TEXTURES.items()
    ]
    extra_textures = [entry for entry in extra_textures if entry[2] is not None]
    atlas_entry_count = frame_count + len(extra_textures)
    rows = math.ceil(atlas_entry_count / args.columns)
    atlas = Image.new(
        "RGBA",
        (args.columns * args.cell_size, rows * args.cell_size),
        (0, 0, 0, 0),
    )
    manifest_frames: list[dict[str, Any]] = []
    for atlas_index, icon_id in enumerate(range(args.first_frame, last_frame + 1)):
        work_size = args.cell_size * 4
        work = Image.new("RGBA", (work_size, work_size), (0, 0, 0, 0))
        layers = icon_frames[icon_id - 1]
        leaf_count = 0
        for depth in sorted(layers):
            layer = layers[depth]
            character_id = layer.get("characterId")
            if character_id is None:
                continue
            if character_types.get(character_id) == "sprite":
                leaf_count += renderer.draw_sprite(
                    work,
                    (work_size // 2, work_size // 2),
                    character_id,
                    0,
                    layer["scaleX"],
                    layer["scaleY"],
                    layer["translateX"],
                    layer["translateY"],
                    layer.get("colourTransform"),
                )
            elif renderer.draw_leaf(
                work,
                (work_size // 2, work_size // 2),
                character_id,
                layer["scaleX"],
                layer["scaleY"],
                layer["translateX"],
                layer["translateY"],
                layer.get("colourTransform"),
            ):
                leaf_count += 1

        cell = fit_rendered_icon(work, args.cell_size)

        column = atlas_index % args.columns
        row = atlas_index // args.columns
        x = column * args.cell_size
        y = row * args.cell_size
        atlas.alpha_composite(cell, (x, y))
        bounds = cell.getbbox()
        manifest_frames.append({
            "key": f"world-map-{icon_id}",
            "iconId": icon_id,
            "x": x,
            "y": y,
            "width": args.cell_size,
            "height": args.cell_size,
            "contentBounds": list(bounds) if bounds else None,
            "leafCount": leaf_count,
            "layers": [
                {
                    "depth": depth,
                    "characterId": layer.get("characterId"),
                    "kind": character_types.get(layer.get("characterId"), "unknown"),
                    **(
                        {"texture": external_names[layer["characterId"]]}
                        if layer.get("characterId") in external_names else {}
                    ),
                }
                for depth, layer in sorted(layers.items())
            ],
        })

    for extra_index, (key, texture_name, source_image) in enumerate(extra_textures, start=frame_count):
        assert source_image is not None
        cell = Image.new("RGBA", (args.cell_size, args.cell_size), (0, 0, 0, 0))
        available = args.cell_size - 8
        scale = min(available / source_image.width, available / source_image.height)
        size = (
            max(1, round(source_image.width * scale)),
            max(1, round(source_image.height * scale)),
        )
        resized = source_image.resize(size, Image.Resampling.LANCZOS)
        cell.alpha_composite(resized, ((args.cell_size - size[0]) // 2, (args.cell_size - size[1]) // 2))
        column = extra_index % args.columns
        row = extra_index // args.columns
        x = column * args.cell_size
        y = row * args.cell_size
        atlas.alpha_composite(cell, (x, y))
        manifest_frames.append({
            "key": key,
            "iconId": None,
            "x": x,
            "y": y,
            "width": args.cell_size,
            "height": args.cell_size,
            "contentBounds": list(cell.getbbox()) if cell.getbbox() else None,
            "leafCount": 1,
            "layers": [{"depth": 0, "kind": "image", "texture": texture_name}],
        })

    args.output_dir.mkdir(parents=True, exist_ok=True)
    atlas_path = args.output_dir / "official-world-map.png"
    atlas.save(atlas_path, format="PNG", optimize=True)
    manifest = {
        "schemaVersion": 1,
        "game": "elden-ring",
        "kind": "official-world-map-icons",
        "atlas": atlas_path.name,
        "pixelRatio": 1,
        "cellSize": args.cell_size,
        "columns": args.columns,
        "rows": rows,
        "officialFrameCount": last_frame,
        "extraFrameCount": len(extra_textures),
        "frames": manifest_frames,
        "missingCharacters": sorted(renderer.missing),
        "evidence": {
            "frames": str(args.gfx_xml),
            "textures": str(args.texture_dir),
            "layouts": str(args.layout_dir),
        },
    }
    with (args.output_dir / "official-world-map.icons.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, separators=(",", ":"))
    visible = sum(1 for frame in manifest_frames if frame["contentBounds"] is not None)
    print(f"Rendered {visible}/{atlas_entry_count} icon frames into {atlas_path}")
    if renderer.missing:
        print(f"Unresolved characters/textures: {', '.join(sorted(renderer.missing)[:16])}")


def fit_rendered_icon(work: Image.Image, cell_size: int) -> Image.Image:
    cell = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    bounds = work.getbbox()
    if bounds is None:
        return cell
    content = work.crop(bounds)
    available = cell_size - 8
    scale = min(1.0, available / content.width, available / content.height)
    if scale < 1:
        content = content.resize(
            (max(1, round(content.width * scale)), max(1, round(content.height * scale))),
            Image.Resampling.LANCZOS,
        )
    cell.alpha_composite(content, ((cell_size - content.width) // 2, (cell_size - content.height) // 2))
    return cell


if __name__ == "__main__":
    render()
