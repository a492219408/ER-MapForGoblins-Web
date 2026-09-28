#!/usr/bin/env python3
"""Build the official Elden Ring world-map catalog and MapLibre sprite.

The inputs are local extracts made by the project owner.  The generated catalog
keeps every flag predicate from ``WorldMapPointParam`` instead of collapsing NPC
locations into one guessed point.  This is important both for save-aware display
and for a future NPC quest-state graph.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build official Elden Ring map data")
    parser.add_argument("--world-map-param", required=True, type=Path)
    parser.add_argument("--marker-catalog", required=True, type=Path)
    parser.add_argument("--icon-manifest", required=True, type=Path)
    parser.add_argument("--icon-atlas", required=True, type=Path)
    parser.add_argument("--mfg-icon-manifest", type=Path)
    parser.add_argument("--mfg-icon-atlas", type=Path)
    parser.add_argument(
        "--supplemental-markers",
        type=Path,
        default=Path(__file__).with_name("official-map-supplemental.v1.json"),
        help="Game-script-derived marker states missing from WorldMapPointParam",
    )
    parser.add_argument(
        "--msb-entity-index",
        type=Path,
        help="MapForGoblins MSB entity index; AEG099_510/511 sending gates are imported",
    )
    parser.add_argument(
        "--locale",
        action="append",
        default=[],
        metavar="LOCALE=DIR",
        help="WitchyBND-extracted message directory; may be repeated",
    )
    parser.add_argument("--output-assets", required=True, type=Path)
    return parser.parse_args()


def scalar(value: str | None, fallback: Any = 0) -> Any:
    if value is None:
        return fallback
    lowered = value.lower()
    if lowered in ("true", "false"):
        return lowered == "true"
    try:
        return float(value) if any(token in value for token in (".", "e", "E")) else int(value)
    except ValueError:
        return value


def field_value(row: ET.Element, defaults: dict[str, Any], name: str) -> Any:
    return scalar(row.get(name), defaults.get(name, 0))


def parse_fmg(path: Path) -> dict[int, str]:
    values: dict[int, str] = {}
    root = ET.parse(path).getroot()
    for entry in root.findall(".//text"):
        text_id = int(entry.get("id", "-1"))
        text = entry.text or ""
        if text_id > 0 and text and text != "%null%":
            values[text_id] = text
    return values


def message_priority(path: Path) -> tuple[int, str]:
    lowered = str(path).lower()
    if "dlc02" in lowered:
        return (2, lowered)
    if "dlc01" in lowered:
        return (1, lowered)
    return (0, lowered)


def load_locales(locale_args: list[str]) -> dict[str, dict[str, dict[int, str]]]:
    locales: dict[str, dict[str, dict[int, str]]] = {}
    for definition in locale_args:
        if "=" not in definition:
            raise SystemExit(f"invalid --locale value: {definition}")
        locale, raw_root = definition.split("=", 1)
        root = Path(raw_root)
        tables = {"place": {}, "npc": {}}
        for kind, pattern in (("place", "PlaceName*.fmg.xml"), ("npc", "NpcName*.fmg.xml")):
            for path in sorted(root.rglob(pattern), key=message_priority):
                tables[kind].update(parse_fmg(path))
        locales[locale] = tables
    return locales


def localized_text(
    locales: dict[str, dict[str, dict[int, str]]],
    kind: str,
    text_id: int,
) -> dict[str, str]:
    return {
        locale: tables[kind][text_id]
        for locale, tables in locales.items()
        if text_id in tables[kind]
    }


def project(
    area: int,
    grid_x: int,
    grid_z: int,
    pos_x: float,
    pos_z: float,
    conversions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    target_area = area
    if area in (60, 61):
        world_x = grid_x * 256 + pos_x
        world_z = grid_z * 256 + pos_z
    else:
        conversion = next((
            value for value in conversions
            if value["sourceArea"] == area and value["sourceGridX"] == grid_x
        ), None)
        if conversion is None:
            return None
        target_area = conversion["targetArea"]
        world_x = (
            conversion["targetGridX"] * 256
            + conversion["targetX"]
            + pos_x - conversion["sourceX"]
        )
        world_z = (
            conversion["targetGridZ"] * 256
            + conversion["targetZ"]
            + pos_z - conversion["sourceZ"]
        )
    return {
        "coordinate": [round(world_x - 7040, 3), round(16512 - world_z, 3)],
        "targetArea": target_area,
    }


def plane_for(area: int, target_area: int | None) -> str:
    if area == 12:
        return "underground"
    return "shadow" if (target_area if target_area is not None else area) == 61 else "surface"


def capital_state_for(area: int, grid_x: int) -> str | None:
    if area != 11:
        return None
    if grid_x == 0:
        return "royal"
    if grid_x == 5:
        return "ashen"
    return None


MAP_ID_PATTERN = re.compile(r"^m(?P<area>\d{2})_(?P<grid_x>\d{2})_(?P<grid_z>\d{2})_\d{2}$")


def map_components(map_id: str) -> tuple[int, int, int]:
    match = MAP_ID_PATTERN.match(map_id)
    if match is None:
        raise ValueError(f"invalid Elden Ring map id: {map_id}")
    return tuple(int(match.group(name)) for name in ("area", "grid_x", "grid_z"))


def supplemental_text_slot(
    raw: dict[str, Any],
    text_state_index: int,
    locales: dict[str, dict[str, dict[int, str]]],
) -> dict[str, Any]:
    kind = raw.get("kind", "place")
    text_id = int(raw["textId"])
    slot = {
        "slot": int(raw.get("slot", 3)),
        "textStateIndex": text_state_index,
        "textId": text_id,
        "kind": kind,
        "labels": localized_text(locales, kind, text_id),
        "enableFlagId": int(raw.get("enableFlagId", 0)),
        "disableFlagId": int(raw.get("disableFlagId", 0)),
        "secondaryEnableFlagId": int(raw.get("secondaryEnableFlagId", 0)),
        "secondaryDisableFlagId": int(raw.get("secondaryDisableFlagId", 0)),
    }
    if "activeWhenAny" in raw:
        slot["activeWhenAny"] = [
            {
                "enabledFlagIds": [int(value) for value in predicate.get("enabledFlagIds", [])],
                "disabledFlagIds": [int(value) for value in predicate.get("disabledFlagIds", [])],
            }
            for predicate in raw["activeWhenAny"]
        ]
    return slot


def build_supplemental_marker(
    raw: dict[str, Any],
    marker_catalog: dict[str, Any],
    locales: dict[str, dict[str, dict[int, str]]],
    text_state_count: int,
) -> tuple[dict[str, Any], int]:
    map_id = raw["mapId"]
    area, grid_x, grid_z = map_components(map_id)
    position = [float(value) for value in raw["position"]]
    map_position = project(
        area,
        grid_x,
        grid_z,
        position[0],
        position[2],
        marker_catalog["legacyConversions"],
    )
    text_slots: list[dict[str, Any]] = []
    for text_slot in raw.get("textSlots", []):
        text_slots.append(supplemental_text_slot(text_slot, text_state_count, locales))
        text_state_count += 1
    place_slot = next((slot for slot in text_slots if slot["kind"] == "place"), None)
    marker = {
        "id": int(raw["id"]),
        "paramdexName": raw.get("paramdexName", ""),
        "labels": dict(place_slot["labels"]) if place_slot else {},
        "iconId": int(raw["iconId"]),
        "alternateIconId": int(raw.get("alternateIconId", raw["iconId"])),
        "angle": float(raw.get("angle", 0)),
        "area": area,
        "gridX": grid_x,
        "gridZ": grid_z,
        "position": position,
        "mapPosition": map_position,
        "plane": plane_for(area, map_position["targetArea"] if map_position else None),
        "openEventFlagId": int(raw.get("openEventFlagId", 6001)),
        "clearedEventFlagId": int(raw.get("clearedEventFlagId", 0)),
        "showWithoutText": bool(raw.get("showWithoutText", False)),
        "isAreaIcon": False,
        "displayMasks": raw.get("displayMasks", [1, 0, 0]),
        "minZoomStep": int(raw.get("minZoomStep", 0)),
        "entryFEType": int(raw.get("entryFEType", 1)),
        "textSlots": text_slots,
        "zPriority": int(raw.get("zPriority", 100)),
        "source": raw["source"],
    }
    capital_state = raw.get("capitalState") if "capitalState" in raw else capital_state_for(area, grid_x)
    if capital_state:
        marker["capitalState"] = capital_state
    if raw.get("iconKey"):
        marker["iconKey"] = str(raw["iconKey"])
    if raw.get("availableWhenAny") is not None:
        marker["availableWhenAny"] = raw["availableWhenAny"]
    return marker, text_state_count


def portal_marker_specs(
    entity_index: dict[str, Any],
    sending_gate_entity_ids: set[int],
    sending_gate_activation_flags: dict[int, int],
    sending_gate_shared_capital_state_entity_ids: set[int],
) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for raw_entity_id, entity in entity_index.items():
        entity_id = int(raw_entity_id)
        # AEG099_510/511 也被当作传送目的地、区域代理和预加载资产。
        # 只导入由 EMEVD common event 90005605 初始化的可交互入口。
        if entity_id not in sending_gate_entity_ids:
            continue
        map_id = entity.get("map", "")
        if entity.get("model") not in ("AEG099_510", "AEG099_511") or MAP_ID_PATTERN.match(map_id) is None:
            continue
        activation_flag = sending_gate_activation_flags.get(entity_id)
        specs.append({
            "id": 1_000_000_000 + entity_id,
            "paramdexName": f"Supplemental Sending Gate ({map_id}/{entity_id})",
            "mapId": map_id,
            "position": [entity["x"], entity["y"], entity["z"]],
            "iconId": 0,
            "iconKey": "supplemental-sending-gate",
            **({"capitalState": None} if entity_id in sending_gate_shared_capital_state_entity_ids else {}),
            **({
                "availableWhenAny": [{
                    "enabledFlagIds": [activation_flag],
                    "disabledFlagIds": [],
                }],
            } if activation_flag else {}),
            "textSlots": [{"textId": 6108700, "kind": "place"}],
            "source": {
                "kind": "msb-asset",
                "mapId": map_id,
                "entityId": entity_id,
                "eventId": 90005605,
            },
        })
    return sorted(specs, key=lambda value: (value["mapId"], value["id"]))


def build_catalog(
    param_path: Path,
    marker_catalog: dict[str, Any],
    locales: dict[str, dict[str, dict[int, str]]],
    sprite_path: str,
    icon_manifest: dict[str, Any],
    supplemental_specs: list[dict[str, Any]],
    sending_gate_entity_ids: set[int],
    sending_gate_activation_flags: dict[int, int],
    sending_gate_shared_capital_state_entity_ids: set[int],
    entity_index: dict[str, Any] | None,
) -> dict[str, Any]:
    root = ET.parse(param_path).getroot()
    defaults = {
        field.get("name", ""): scalar(field.get("defaultValue"))
        for field in root.findall("./fields/field")
    }
    markers: list[dict[str, Any]] = []
    text_state_count = 0
    npc_entity_ids: set[int] = set()
    for row in root.findall("./rows/row"):
        area = int(field_value(row, defaults, "areaNo"))
        grid_x = int(field_value(row, defaults, "gridXNo"))
        grid_z = int(field_value(row, defaults, "gridZNo"))
        position = [
            float(field_value(row, defaults, "posX")),
            float(field_value(row, defaults, "posY")),
            float(field_value(row, defaults, "posZ")),
        ]
        map_position = project(
            area,
            grid_x,
            grid_z,
            position[0],
            position[2],
            marker_catalog["legacyConversions"],
        )
        text_slots: list[dict[str, Any]] = []
        for slot in range(1, 9):
            text_id = int(field_value(row, defaults, f"textId{slot}"))
            if text_id <= 0:
                continue
            text_type = int(field_value(row, defaults, f"textType{slot}"))
            kind = "npc" if text_type == 1 else "place"
            if kind == "npc":
                npc_entity_ids.add(text_id)
            text_slots.append({
                "slot": slot,
                "textStateIndex": text_state_count,
                "textId": text_id,
                "kind": kind,
                "labels": localized_text(locales, kind, text_id),
                "enableFlagId": int(field_value(row, defaults, f"textEnableFlagId{slot}")),
                "disableFlagId": int(field_value(row, defaults, f"textDisableFlagId{slot}")),
                "secondaryEnableFlagId": int(field_value(row, defaults, f"textEnableFlag2Id{slot}")),
                "secondaryDisableFlagId": int(field_value(row, defaults, f"textDisableFlag2Id{slot}")),
            })
            text_state_count += 1
        place_slot = next((slot for slot in text_slots if slot["kind"] == "place"), None)
        labels = dict(place_slot["labels"]) if place_slot else {}
        paramdex_name = row.get("paramdexName", "")
        marker = {
            "id": int(row.get("id", "0")),
            "paramdexName": paramdex_name,
            "labels": labels,
            "iconId": int(field_value(row, defaults, "iconId")),
            "alternateIconId": int(field_value(row, defaults, "altIconId")),
            "angle": float(field_value(row, defaults, "angle")),
            "area": area,
            "gridX": grid_x,
            "gridZ": grid_z,
            "position": position,
            "mapPosition": map_position,
            "plane": plane_for(area, map_position["targetArea"] if map_position else None),
            "openEventFlagId": int(field_value(row, defaults, "eventFlagId")),
            "clearedEventFlagId": int(field_value(row, defaults, "clearedEventFlagId")),
            "showWithoutText": bool(field_value(row, defaults, "isEnableNoText")),
            "isAreaIcon": bool(field_value(row, defaults, "isAreaIcon")),
            "displayMasks": [
                int(field_value(row, defaults, "dispMask00")),
                int(field_value(row, defaults, "dispMask01")),
                int(field_value(row, defaults, "dispMask02")),
            ],
            "minZoomStep": int(field_value(row, defaults, "dispMinZoomStep")),
            "entryFEType": int(field_value(row, defaults, "entryFEType")),
            "textSlots": text_slots,
            "zPriority": 20 if bool(field_value(row, defaults, "isAreaIcon")) else 100,
            "source": {"kind": "world-map-param"},
        }
        capital_state = capital_state_for(area, grid_x)
        if capital_state:
            marker["capitalState"] = capital_state
        if any(slot["kind"] == "place" and slot["textId"] == 6108700 for slot in text_slots):
            marker["iconKey"] = "supplemental-sending-gate"
        markers.append(marker)

    for raw in supplemental_specs:
        marker, text_state_count = build_supplemental_marker(
            raw, marker_catalog, locales, text_state_count,
        )
        markers.append(marker)
        for slot in marker["textSlots"]:
            if slot["kind"] == "npc":
                npc_entity_ids.add(slot["textId"])

    if entity_index is not None:
        for raw in portal_marker_specs(
            entity_index,
            sending_gate_entity_ids,
            sending_gate_activation_flags,
            sending_gate_shared_capital_state_entity_ids,
        ):
            marker, next_text_state_count = build_supplemental_marker(
                raw, marker_catalog, locales, text_state_count,
            )
            if marker["mapPosition"] is None:
                continue
            coordinate = marker["mapPosition"]["coordinate"]
            duplicates_official_portal = any(
                existing["mapPosition"] is not None
                and any(slot["textId"] == 6108700 for slot in existing["textSlots"])
                and math.dist(existing["mapPosition"]["coordinate"], coordinate) < 4
                for existing in markers
            )
            if duplicates_official_portal:
                continue
            markers.append(marker)
            text_state_count = next_text_state_count

    mapped = [marker for marker in markers if marker["mapPosition"] is not None]
    return {
        "schemaVersion": 1,
        "game": "elden-ring",
        "coordinateSystemId": "elden-ring-world-map-v1",
        "locales": list(locales),
        "markerCount": len(markers),
        "mappedMarkerCount": len(mapped),
        "textStateCount": text_state_count,
        "npcEntityCount": len(npc_entity_ids),
        "iconSprite": {
            "path": sprite_path,
            "cellSize": icon_manifest["cellSize"],
            "worldMapFrameCount": icon_manifest["officialFrameCount"],
            "mfgIconCount": icon_manifest.get("mfgIconCount", 0),
            "keys": [frame["key"] for frame in icon_manifest["frames"]],
        },
        "evidence": {
            "markers": "regulation.bin/WorldMapPointParam",
            "supplementalMarkers": "map/MapStudio MSB entities + EMEVD quest predicates",
            "localization": "msg/*/item*.msgbnd.dcx/{PlaceName,NpcName}.fmg",
            "icons": "menu/hi/01_common.tpf.dcx + 01_common.sblytbnd.dcx + worldmap Scaleform",
        },
        "markers": markers,
    }


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def combine_icon_assets(args: argparse.Namespace) -> tuple[bytes, dict[str, Any]]:
    base_manifest = json.loads(args.icon_manifest.read_text(encoding="utf-8"))
    if bool(args.mfg_icon_manifest) != bool(args.mfg_icon_atlas):
        raise SystemExit("--mfg-icon-manifest and --mfg-icon-atlas must be used together")
    if not args.mfg_icon_manifest or not args.mfg_icon_atlas:
        return args.icon_atlas.read_bytes(), base_manifest

    extra_manifest = json.loads(args.mfg_icon_manifest.read_text(encoding="utf-8"))
    cell_size = int(base_manifest["cellSize"])
    if int(extra_manifest["cellSize"]) != cell_size:
        raise SystemExit("official and MFG icon atlases must use the same cell size")

    sources = [
        (Image.open(args.icon_atlas).convert("RGBA"), base_manifest["frames"]),
        (Image.open(args.mfg_icon_atlas).convert("RGBA"), extra_manifest["frames"]),
    ]
    source_frames = [(atlas, frame) for atlas, frames in sources for frame in frames]
    columns = int(base_manifest["columns"])
    rows = math.ceil(len(source_frames) / columns)
    combined_atlas = Image.new(
        "RGBA",
        (columns * cell_size, rows * cell_size),
        (0, 0, 0, 0),
    )
    combined_frames: list[dict[str, Any]] = []
    for index, (source_atlas, frame) in enumerate(source_frames):
        source_box = (
            int(frame["x"]),
            int(frame["y"]),
            int(frame["x"]) + int(frame["width"]),
            int(frame["y"]) + int(frame["height"]),
        )
        x = index % columns * cell_size
        y = index // columns * cell_size
        combined_atlas.alpha_composite(source_atlas.crop(source_box), (x, y))
        combined_frames.append({**frame, "x": x, "y": y})

    output = io.BytesIO()
    combined_atlas.save(output, format="PNG", optimize=True)
    combined_manifest = {
        **base_manifest,
        "rows": rows,
        "frames": combined_frames,
        "mfgIconCount": len(extra_manifest["frames"]),
        "mfgEvidence": extra_manifest.get("evidence", {}),
    }
    return output.getvalue(), combined_manifest


def write_assets(args: argparse.Namespace) -> None:
    locales = load_locales(args.locale)
    marker_catalog = json.loads(args.marker_catalog.read_text(encoding="utf-8"))
    supplemental = json.loads(args.supplemental_markers.read_text(encoding="utf-8"))
    if supplemental.get("schemaVersion") != 1:
        raise SystemExit(f"unsupported supplemental marker schema: {args.supplemental_markers}")
    entity_index = (
        json.loads(args.msb_entity_index.read_text(encoding="utf-8"))
        if args.msb_entity_index
        else None
    )
    atlas_bytes, icon_manifest = combine_icon_assets(args)
    sprite = {
        frame["key"]: {
            "width": frame["width"],
            "height": frame["height"],
            "x": frame["x"],
            "y": frame["y"],
            "pixelRatio": 1,
            "visible": frame["contentBounds"] is not None,
        }
        for frame in icon_manifest["frames"]
    }
    sprite_bytes = json.dumps(sprite, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sprite_hash = digest(atlas_bytes + b"\0" + sprite_bytes)[:16]
    output_directory = args.output_assets / "official-map"
    output_directory.mkdir(parents=True, exist_ok=True)
    sprite_name = f"official-world-map-icons.v1.{sprite_hash}"
    (output_directory / f"{sprite_name}.png").write_bytes(atlas_bytes)
    (output_directory / f"{sprite_name}.json").write_bytes(sprite_bytes)
    # MapLibre 在高 DPI 屏幕会自动请求 @2x 后缀。当前图集已经按游戏原图
    # 进行高质量重采样，同一份像素资源即可避免浏览器回退为缺失图标。
    (output_directory / f"{sprite_name}@2x.png").write_bytes(atlas_bytes)
    (output_directory / f"{sprite_name}@2x.json").write_bytes(sprite_bytes)

    sprite_path = f"official-map/{sprite_name}"
    catalog = build_catalog(
        args.world_map_param,
        marker_catalog,
        locales,
        sprite_path,
        icon_manifest,
        supplemental.get("markers", []),
        {int(value) for value in supplemental.get("sendingGateEntityIds", [])},
        {
            int(entity_id): int(flag_id)
            for entity_id, flag_id in supplemental.get("sendingGateActivationFlagIds", {}).items()
        },
        {int(value) for value in supplemental.get("sendingGateSharedCapitalStateEntityIds", [])},
        entity_index,
    )
    catalog_bytes = json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    catalog_hash = digest(catalog_bytes)
    catalog_name = f"official-map-catalog.v1.{catalog_hash[:16]}.json"
    (output_directory / catalog_name).write_bytes(catalog_bytes)
    resource = {
        "path": f"official-map/{catalog_name}",
        "sha256": catalog_hash,
        "bytes": len(catalog_bytes),
        "schemaVersion": 1,
    }
    update_manifests(args.output_assets, resource)
    npc_slot_count = sum(
        1 for marker in catalog["markers"] for slot in marker["textSlots"] if slot["kind"] == "npc"
    )
    print(
        f"Built {catalog['markerCount']} official markers, "
        f"{npc_slot_count} NPC locations / {catalog['npcEntityCount']} NPC text identities"
    )
    print(f"Catalog: {output_directory / catalog_name}")
    print(f"Sprite: {output_directory / sprite_name}.png/.json")


def update_manifests(asset_root: Path, resource: dict[str, Any]) -> None:
    paths = list((asset_root / "datasets").glob("*/dataset-manifest.v1.json"))
    root_manifest = asset_root / "dataset-manifest.v1.json"
    if root_manifest.exists():
        paths.append(root_manifest)
    for path in paths:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest.setdefault("resources", {})["officialMap"] = resource
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_assets(parse_args())
