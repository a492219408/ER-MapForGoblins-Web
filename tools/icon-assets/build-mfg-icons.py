#!/usr/bin/env python3
"""把 MapForGoblins 的分类 PNG 构建为 Web 图标图集。

MFG 2.x 的 ``iconId`` 不是游戏原生 WorldMap 帧号，而是
``tools/icon_registry.py`` 生成的稳定占位编号。游戏 DLL 会在运行时把这些
编号映射到动态注入的 PNG；网页版不运行 DLL，因此需要在构建期重建同一份
``iconId -> PNG`` 映射。

输入来自本地的 ERR-MapForGoblins-DLL 参考项目，生成物写入被忽略的
``runtime/work``，不会把第三方源图提交到业务源码中。
"""

from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
from pathlib import Path
from typing import Any

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build MapForGoblins Web icon atlas")
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--cell-size", type=int, default=128)
    parser.add_argument("--columns", type=int, default=16)
    return parser.parse_args()


def fit_cell(source: Image.Image, cell_size: int) -> Image.Image:
    """复用 MFG 覆盖层的 alpha>16 裁剪和低 alpha 归一化规则。"""
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > 16 else 0)
    bounds = mask.getbbox() or image.getbbox() or (0, 0, image.width, image.height)
    image = image.crop(bounds)

    alpha = image.getchannel("A")
    peak = alpha.getextrema()[1]
    if 0 < peak < 230:
        red, green, blue, _ = image.split()
        alpha = alpha.point(lambda value: min(255, round(value * 255 / peak)))
        image = Image.merge("RGBA", (red, green, blue, alpha))

    available = cell_size - 8
    scale = min(available / image.width, available / image.height)
    size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    image = image.resize(size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    cell.alpha_composite(image, ((cell_size - size[0]) // 2, (cell_size - size[1]) // 2))
    return cell


def load_registry(reference: Path) -> Any:
    tools_dir = reference / "tools"
    sys.path.insert(0, str(tools_dir))
    try:
        return importlib.import_module("icon_registry")
    finally:
        sys.path.remove(str(tools_dir))


def build() -> None:
    args = parse_args()
    registry = load_registry(args.reference)
    icon_directory = args.reference / "assets" / "map_icons" / "custom"
    entries = sorted(
        (
            int(registry.iconid(slug)),
            str(slug),
            registry.png_for(slug),
        )
        for slug in registry.all_slugs()
    )
    if not entries:
        raise SystemExit("MFG icon registry is empty")

    rows = math.ceil(len(entries) / args.columns)
    atlas = Image.new(
        "RGBA",
        (args.columns * args.cell_size, rows * args.cell_size),
        (0, 0, 0, 0),
    )
    frames: list[dict[str, Any]] = []
    missing: list[str] = []
    for atlas_index, (icon_id, slug, png_name) in enumerate(entries):
        path = icon_directory / str(png_name or "")
        if not png_name or not path.exists():
            missing.append(slug)
            continue
        cell = fit_cell(Image.open(path), args.cell_size)
        column = atlas_index % args.columns
        row = atlas_index // args.columns
        x = column * args.cell_size
        y = row * args.cell_size
        atlas.alpha_composite(cell, (x, y))
        frames.append({
            "key": f"mfg-{icon_id}",
            "iconId": icon_id,
            "slug": slug,
            "source": png_name,
            "x": x,
            "y": y,
            "width": args.cell_size,
            "height": args.cell_size,
            "contentBounds": list(cell.getbbox()) if cell.getbbox() else None,
        })

    if missing:
        raise SystemExit(f"missing MFG icon PNGs: {', '.join(missing)}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    atlas_path = args.output_dir / "mfg-marker-icons.png"
    manifest_path = args.output_dir / "mfg-marker-icons.json"
    atlas.save(atlas_path, format="PNG", optimize=True)
    manifest = {
        "schemaVersion": 1,
        "kind": "map-for-goblins-marker-icons",
        "atlas": atlas_path.name,
        "pixelRatio": 1,
        "cellSize": args.cell_size,
        "columns": args.columns,
        "rows": rows,
        "iconCount": len(frames),
        "frames": frames,
        "evidence": {
            "registry": "ERR-MapForGoblins-DLL/tools/icon_registry.py",
            "categories": "ERR-MapForGoblins-DLL/tools/map_categories.py",
            "images": "ERR-MapForGoblins-DLL/assets/map_icons/custom/*.png",
            "license": "MIT-style reference project",
        },
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Built {len(frames)} MFG icons into {atlas_path}")


if __name__ == "__main__":
    build()
