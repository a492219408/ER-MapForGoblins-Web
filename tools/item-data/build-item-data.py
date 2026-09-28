#!/usr/bin/env python3
"""Build the browser item database from WitchyBND PARAM/FMG XML exports.

The generated files live below runtime/assets and are intentionally not source
controlled: they are derived from the user's legally obtained game files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
import xml.etree.ElementTree as ET


LOCALES = (
    "zh-CN", "zh-TW", "en-US", "fr-FR", "it-IT", "de-DE", "es-ES",
    "ja-JP", "ko-KR", "pl-PL", "pt-BR", "ru-RU", "es-419", "th-TH", "ar-AE",
)

PARAM_FILES = {
    "weapon": "EquipParamWeapon.param.xml",
    "armor": "EquipParamProtector.param.xml",
    "talisman": "EquipParamAccessory.param.xml",
    "goods": "EquipParamGoods.param.xml",
    "ash-of-war": "EquipParamGem.param.xml",
    "magic": "Magic.param.xml",
    "gesture": "GestureParam.param.xml",
    "reinforcement": "ReinforceParamWeapon.param.xml",
    "sp-effect": "SpEffectParam.param.xml",
}

TEXT_TABLES = {
    "weapon": ("WeaponName", "WeaponInfo", "WeaponCaption", "WeaponEffect", "ArtsName", "ArtsCaption"),
    "armor": ("ProtectorName", "ProtectorInfo", "ProtectorCaption"),
    "talisman": ("AccessoryName", "AccessoryInfo", "AccessoryCaption"),
    "goods": ("GoodsName", "GoodsInfo", "GoodsInfo2", "GoodsCaption"),
    "ash-of-war": ("GemName", "GemInfo", "GemEffect", "GemCaption", "ArtsName", "ArtsCaption"),
    "magic": ("MagicName", "MagicInfo", "MagicCaption"),
}

WEAPON_FIELDS = (
    "sortId", "weight", "iconId", "originEquipWep", "reinforceTypeId", "weaponCategory", "wepmotionCategory",
    "wepType", "attackBasePhysics", "attackBaseMagic", "attackBaseFire", "attackBaseThunder", "attackBaseDark",
    "attackBaseParry", "staminaGuardDef", "physGuardCutRate", "magGuardCutRate", "fireGuardCutRate",
    "thunGuardCutRate", "darkGuardCutRate", "correctStrength", "correctAgility", "correctMagic", "correctFaith",
    "correctLuck", "properStrength", "properAgility", "properMagic", "properFaith", "properLuck", "enableMagic",
    "enableMiracle", "maxArrowQuantity", "swordArtsParamId", "gemMountType", "atkAttribute", "atkAttribute2",
    "residentSpEffectId", "residentSpEffectId1", "residentSpEffectId2", "spEffectMsgId0", "spEffectMsgId1",
    "spEffectMsgId2", "isCustom", "sortGroupId",
)

ARMOR_FIELDS = (
    "sortId", "weight", "iconIdM", "iconIdF", "protectorCategory", "neutralDamageCutRate", "slashDamageCutRate",
    "blowDamageCutRate", "thrustDamageCutRate", "magicDamageCutRate", "fireDamageCutRate", "thunderDamageCutRate",
    "darkDamageCutRate", "resistPoison", "resistDisease", "resistBlood", "resistCurse", "resistFreeze", "resistSleep",
    "resistMadness", "toughnessCorrectRate", "residentSpEffectId", "residentSpEffectId2", "residentSpEffectId3",
)

TALISMAN_FIELDS = (
    "sortId", "weight", "iconId", "refId", "residentSpEffectId1", "residentSpEffectId2", "residentSpEffectId3",
    "residentSpEffectId4", "rarity",
)

GOODS_FIELDS = (
    "sortId", "iconId", "maxNum", "maxRepositoryNum", "goodsType", "sortGroupId", "refId_default", "refId_1",
    "refCategory", "consumeMP", "consumeHP", "reinforceGoodsId", "reinforceMaterialId", "rarity", "isConsume",
)

GEM_FIELDS = (
    "sortId", "iconId", "swordArtsParamId", "mountWepTextId", "isDiscard", "canMountWep", "defaultGemId",
)

MAGIC_FIELDS = (
    "goodsParamId", "magicParamId",
    "sortId", "iconId", "maxNum", "maxRepositoryNum", "mp", "mp_charge", "stamina", "stamina_charge",
    "maxQuantity", "slotLength",
    "requirementIntellect", "requirementFaith", "requirementLuck", "ezStateBehaviorType", "refId1", "refId2",
    "refId3", "refId4", "refId5", "refId6", "refId7", "refId8", "refId9", "refId10",
)

REINFORCE_FIELDS = (
    "physicsAtkRate", "magicAtkRate", "fireAtkRate", "thunderAtkRate", "darkAtkRate", "staminaAtkRate",
    "correctStrengthRate", "correctAgilityRate", "correctMagicRate", "correctFaithRate", "correctLuckRate",
    "physicsGuardCutRate", "magicGuardCutRate", "fireGuardCutRate", "thunderGuardCutRate", "darkGuardCutRate",
    "staminaGuardDefRate", "materialSetId", "maxReinforceLevel", "baseAtkRate",
)

SP_EFFECT_FIELDS = (
    "effectEndurance", "maxHpRate", "maxMpRate", "maxStaminaRate", "physicsAttackPowerRate", "magicAttackPowerRate",
    "fireAttackPowerRate", "thunderAttackPowerRate", "darkAttackPowerRate", "changeStrengthPoint", "changeAgilityPoint",
    "changeMagicPoint", "changeFaithPoint", "changeLuckPoint", "changeMaxHp", "changeMaxMp", "changeMaxStamina",
    "staminaRecoverChangeSpeed", "equipWeightChangeRate", "itemDropRate", "soulRate",
)

WEAPON_TYPE_LEAVES = {
    0: "internal-weapon", 33: "unarmed",
    1: "dagger", 3: "straight-sword", 5: "greatsword", 7: "colossal-sword",
    9: "curved-sword", 11: "curved-greatsword", 13: "katana", 14: "twinblade",
    15: "thrusting-sword", 16: "heavy-thrusting-sword", 17: "axe", 19: "greataxe",
    21: "hammer", 23: "great-hammer", 24: "flail", 25: "spear", 28: "great-spear",
    29: "halberd", 31: "reaper", 35: "fist", 37: "claw", 39: "whip",
    41: "colossal-weapon", 50: "light-bow", 51: "bow", 53: "greatbow",
    55: "crossbow", 56: "ballista", 57: "staff", 61: "sacred-seal",
    65: "small-shield", 67: "medium-shield", 69: "greatshield", 81: "arrow",
    83: "great-arrow", 85: "bolt", 86: "ballista-bolt", 87: "torch",
    88: "hand-to-hand", 89: "perfume-bottle", 90: "thrusting-shield",
    91: "throwing-blade", 92: "backhand-blade", 93: "light-greatsword",
    94: "great-katana", 95: "beast-claw",
}

RANGED_WEAPON_TYPES = {50, 51, 53, 55, 56, 57, 61, 91}
SHIELD_WEAPON_TYPES = {65, 67, 69, 90}
AMMUNITION_WEAPON_TYPES = {81, 83, 85, 86}
BARE_PROTECTOR_IDS = {10_000, 10_100, 10_200, 10_300}

# These entries have valid-looking official text despite being unobtainable.
# The sets mirror the independently maintained Glorious Merchant audit; rows
# with hidden sort IDs or an official [ERROR] prefix are detected separately.
CUT_CONTENT_IDS = {
    "weapon": {33_290_000},
    "armor": {610_000, 610_100, 610_200, 610_300, 611_000, 611_100},
    "talisman": {3_100, 6_120, 6_121},
    "goods": {8_860, 8_861, 2_008_023},
}

# App 1.17 added Tarnished Pack rows to the base FMG tables rather than to
# *_dlc02.  These IDs are the named, canonical inventory rows from the
# 1.16.1 -> 1.17 Regulation delta.  Infusion variants and two unnamed hidden
# weapon prototypes are deliberately excluded.
TARNISHED_PACK_IDS = {
    "weapon": {
        3_560_000, 8_530_000, 13_510_000, 31_540_000,
        62_520_000, 64_530_000, 66_530_000, 67_530_000,
    },
    "armor": {
        5_340_000, 5_340_100, 5_340_200, 5_340_300,
        5_350_000, 5_350_100, 5_350_200, 5_350_300, 5_351_100,
        5_360_000, 5_360_100, 5_360_200, 5_360_300, 5_361_000,
        5_370_000, 5_370_100, 5_370_200, 5_370_300,
    },
    "goods": {2_009_600, 2_009_610, 2_009_620},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build localized Elden Ring item data")
    parser.add_argument("--params", type=Path, default=Path("runtime/work/official-icons/regulation/regulation-bin"))
    parser.add_argument("--messages", action="append", type=Path, help="FMG locale root; may be repeated")
    parser.add_argument("--icons-work", type=Path, default=Path("runtime/work/item-icons/00_solo-tpfbhd"), help="menu/hi/00_solo extracted directory")
    parser.add_argument("--small-icons-work", type=Path, help="menu/low/00_solo extracted directory; falls back to --icons-work")
    parser.add_argument("--output", type=Path, default=Path("runtime/assets/item-data"))
    parser.add_argument("--small-icon-size", type=int, default=256)
    parser.add_argument("--large-icon-size", type=int, default=1024)
    parser.add_argument("--icon-size", type=int, help=argparse.SUPPRESS)
    parser.add_argument("--skip-icons", action="store_true")
    parser.add_argument("--source-manifest", type=Path, help="game-source-manifest.v1 JSON")
    args = parser.parse_args()
    if args.icon_size is not None:
        args.small_icon_size = args.icon_size
        args.large_icon_size = args.icon_size
    return args


def game_release_from_source_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("files"), list):
        raise SystemExit("Unsupported game source manifest")

    def is_regulation_entry(entry: dict[str, Any]) -> bool:
        normalized = str(entry.get("path", "")).replace("\\", "/").lower()
        return normalized == "regulation.bin" or normalized.endswith("/regulation.bin")

    regulation = next((entry for entry in manifest["files"] if is_regulation_entry(entry)), None)
    result = dict(manifest.get("release") or {})
    result["sourceFingerprint"] = manifest.get("sourceFingerprint")
    if regulation and regulation.get("sha256"):
        result["regulationSha256"] = regulation["sha256"]
    return {key: value for key, value in result.items() if value is not None}


def parse_scalar(value: str | None) -> Any:
    if value is None:
        return None
    if value in ("True", "False"):
        return value == "True"
    try:
        if any(marker in value for marker in (".", "e", "E")):
            return float(value)
        return int(value)
    except ValueError:
        return value


def load_param(path: Path) -> dict[str, dict[str, Any]]:
    root = ET.parse(path).getroot()
    field_nodes = root.find("fields")
    row_nodes = root.find("rows")
    defaults = {
        field.attrib["name"]: parse_scalar(field.attrib.get("defaultValue"))
        for field in (field_nodes if field_nodes is not None else ())
        if "name" in field.attrib
    }
    rows: dict[str, dict[str, Any]] = {}
    for row in row_nodes if row_nodes is not None else ():
        values = dict(defaults)
        values.update({key: parse_scalar(value) for key, value in row.attrib.items()})
        rows[str(row.attrib["id"])] = values
    return rows


def selected(values: dict[str, Any], fields: Iterable[str]) -> dict[str, Any]:
    return {field: values.get(field) for field in fields if values.get(field) is not None}


def valid_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.replace("\\r\\n", "\n").replace("\\n", "\n").strip()
    if not normalized or normalized == "%null%" or normalized == "[ERROR]":
        return None
    return normalized


def load_locale_tables(locale_dirs: Iterable[Path]) -> dict[str, dict[str, str]]:
    tables: dict[str, dict[str, str]] = {}
    paths = sorted(
        (path for locale_dir in locale_dirs if locale_dir.exists() for path in locale_dir.rglob("*.fmg.xml")),
        key=lambda path: (str(path.parent), path.name),
    )
    for path in paths:
        table_name = re.sub(r"_dlc\d+$", "", path.name.removesuffix(".fmg.xml"))
        table = tables.setdefault(table_name, {})
        nodes = ET.parse(path).getroot().find("entries")
        for node in nodes if nodes is not None else ():
            value = valid_text(node.text)
            if value is not None:
                table[str(node.attrib["id"])] = value
    return tables


def load_name_table_origins(locale_dirs: Iterable[Path]) -> dict[str, dict[str, set[str]]]:
    """Return valid base/DLC1 IDs for official item name tables.

    Witchy can expose duplicated tables from recursively unpacked binders, so
    evidence is merged by the FMG file's own suffix rather than its directory.
    An ID is treated as Shadow of the Erdtree only when it exists in dlc01 and
    has no valid base-table name.  This avoids misclassifying base items whose
    text was overridden by the expansion.
    """
    origins: dict[str, dict[str, set[str]]] = {}
    for locale_dir in locale_dirs:
        if not locale_dir.exists():
            continue
        for path in locale_dir.rglob("*Name*.fmg.xml"):
            match = re.fullmatch(r"(.+Name)(?:_(dlc01|dlc02))?\.fmg\.xml", path.name)
            if not match:
                continue
            table_name, suffix = match.groups()
            source = "shadow-of-the-erdtree" if suffix == "dlc01" else "base" if suffix is None else "dlc02"
            ids = origins.setdefault(table_name, {}).setdefault(source, set())
            nodes = ET.parse(path).getroot().find("entries")
            for node in nodes if nodes is not None else ():
                if valid_text(node.text) is not None:
                    ids.add(str(node.attrib["id"]))
    return origins


def category_for_weapon(row: dict[str, Any]) -> list[str]:
    weapon_type = int(row.get("wepType", 0))
    leaf = WEAPON_TYPE_LEAVES.get(weapon_type, f"weapon-type-{weapon_type}")
    if weapon_type in AMMUNITION_WEAPON_TYPES:
        return ["equipment", "weapons", "ammo", leaf]
    if weapon_type == 87:
        return ["equipment", "weapons", "shield", "torch"]
    if weapon_type in SHIELD_WEAPON_TYPES:
        return ["equipment", "weapons", "shield", leaf]
    if weapon_type in RANGED_WEAPON_TYPES:
        return ["equipment", "weapons", "ranged", leaf]
    return ["equipment", "weapons", "melee", leaf]


def category_for_goods(row: dict[str, Any]) -> tuple[str, list[str]]:
    goods_type = int(row.get("goodsType", 0))
    sort_group = int(row.get("sortGroupId", 255))
    if goods_type in (7, 8):
        return "spirit-ash", ["arts", "spirit-ash"]
    if goods_type == 10:
        return "crystal-tear", ["items", "goods"]
    if goods_type == 2:
        return "material", ["items", "crafting-material"]
    if goods_type == 14:
        return "upgrade-material", ["items", "upgrade-material"]
    if goods_type == 12:
        return "information", ["valuables", "information"]
    if goods_type == 0 and sort_group == 250:
        return "gesture", ["valuables", "gesture"]
    if goods_type == 15:
        return "key-item", ["valuables", "great-rune"]
    if goods_type in (1, 3):
        return "key-item", ["valuables", "key-item"]
    return "goods", ["items", "goods"]


def icon_id_for(kind: str, row: dict[str, Any]) -> int | None:
    key = "iconIdM" if kind == "armor" else "iconId"
    value = row.get(key)
    return int(value) if isinstance(value, (int, float)) and int(value) > 0 else None


def visible_row(row: dict[str, Any]) -> bool:
    return int(row.get("sortId", 9_999_999)) < 9_999_999


def is_cut_content(kind: str, row_id: str, row: dict[str, Any], name: str) -> bool:
    return (
        not visible_row(row)
        or name.startswith("[ERROR]")
        or int(row_id) in CUT_CONTENT_IDS.get(kind, set())
        or (kind == "goods" and int(row.get("iconId", 0)) <= 0)
    )


def armor_has_special_effect(row: dict[str, Any]) -> bool:
    return any(int(row.get(field, -1)) > 0 for field in (
        "residentSpEffectId", "residentSpEffectId2", "residentSpEffectId3",
    ))


def normalized_paramdex_name(row: dict[str, Any]) -> str:
    return re.sub(r"^\[[^]]+\]\s*", "", str(row.get("paramdexName") or "")).strip().casefold()


def build_items(
    params: dict[str, dict[str, dict[str, Any]]],
    english: dict[str, dict[str, str]],
    name_origins: dict[str, dict[str, set[str]]] | None = None,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    origins = name_origins or {}

    def content_pack(kind: str, row_id: str) -> str:
        source_kind = "goods" if kind in (
            "goods", "material", "upgrade-material", "key-item", "information", "gesture",
            "spirit-ash", "crystal-tear", "sorcery", "incantation",
        ) else kind
        if int(row_id) in TARNISHED_PACK_IDS.get(source_kind, set()):
            return "tarnished-pack"
        table_name = {
            "weapon": "WeaponName", "armor": "ProtectorName", "talisman": "AccessoryName",
            "ash-of-war": "GemName", "goods": "GoodsName",
        }.get(source_kind, "GoodsName")
        table_origins = origins.get(table_name, {})
        if row_id in table_origins.get("shadow-of-the-erdtree", set()) and row_id not in table_origins.get("base", set()):
            return "shadow-of-the-erdtree"
        return "base"

    def add(
        kind: str,
        row_id: str,
        row: dict[str, Any],
        category_path: list[str],
        fields: Iterable[str],
        cut_content: bool,
    ) -> None:
        icon_id = icon_id_for(kind, row)
        result.append({
            "key": f"{kind}:{row_id}",
            "id": row_id,
            "kind": kind,
            "categoryPath": category_path,
            "iconId": icon_id,
            "sortId": int(row.get("sortId", 9_999_999)),
            "isCutContent": cut_content,
            "contentPack": content_pack(kind, row_id),
            "fallbackName": str(row.get("paramdexName") or f"#{row_id}"),
            "params": selected(row, fields),
        })

    weapon_names = english.get("WeaponName", {})
    for row_id, row in params["weapon"].items():
        name = weapon_names.get(row_id)
        if not name:
            continue
        cut_content = is_cut_content("weapon", row_id, row, name)
        if not visible_row(row) and not cut_content:
            continue
        origin = int(row.get("originEquipWep", -1))
        if origin >= 0 and origin != int(row_id):
            continue
        add("weapon", row_id, row, category_for_weapon(row), WEAPON_FIELDS, cut_content)

    armor_names = english.get("ProtectorName", {})
    armor_leaf = {0: "head", 1: "chest", 2: "arms", 3: "legs"}
    for row_id, row in params["armor"].items():
        name = armor_names.get(row_id)
        if not name or int(row_id) in BARE_PROTECTOR_IDS:
            continue
        cut_content = is_cut_content("armor", row_id, row, name)
        leaf = armor_leaf.get(int(row.get("protectorCategory", -1)))
        if leaf:
            effect_kind = "special-effect" if armor_has_special_effect(row) else "no-special-effect"
            effect_leaf = f"{leaf}-{effect_kind}"
            add("armor", row_id, row, ["equipment", "armor", leaf, effect_leaf], ARMOR_FIELDS, cut_content)

    accessory_names = english.get("AccessoryName", {})
    for row_id, row in params["talisman"].items():
        name = accessory_names.get(row_id)
        if name:
            add(
                "talisman", row_id, row, ["equipment", "talisman"], TALISMAN_FIELDS,
                is_cut_content("talisman", row_id, row, name),
            )

    goods_names = english.get("GoodsName", {})
    hidden_goods_types = {5, 16, 17, 18}
    for row_id, row in params["goods"].items():
        name = goods_names.get(row_id)
        if not name or int(row.get("goodsType", 0)) in hidden_goods_types:
            continue
        kind, category_path = category_for_goods(row)
        if kind == "spirit-ash" and int(row_id) % 100 != 0:
            continue
        add(kind, row_id, row, category_path, GOODS_FIELDS, is_cut_content("goods", row_id, row, name))

    # MagicName is only a dummy FMG in the retail game. Inventory identity,
    # icon and text use EquipParamGoods; combat requirements use MagicParam.
    # Retail 1.17 uses the same row ID for all 213 named player spells. Prefer
    # that authoritative relationship: Paramdex names are not unique because
    # NPC variants can share a name with the player spell. A unique-name match
    # remains as a guarded fallback for future versions only.
    magic_rows_by_name: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for magic_row_id, magic_row in params["magic"].items():
        normalized_name = normalized_paramdex_name(magic_row)
        if normalized_name:
            magic_rows_by_name.setdefault(normalized_name, []).append((magic_row_id, magic_row))
    for row_id, goods_row in params["goods"].items():
        goods_type = int(goods_row.get("goodsType", 0))
        if goods_type not in hidden_goods_types:
            continue
        name = goods_names.get(row_id)
        magic_match = (row_id, params["magic"][row_id]) if row_id in params["magic"] else None
        if not magic_match:
            candidates = magic_rows_by_name.get(normalized_paramdex_name(goods_row), [])
            if len(candidates) == 1:
                magic_match = candidates[0]
        if not name or not magic_match:
            continue
        magic_row_id, magic_row = magic_match
        display_row = {
            **goods_row,
            **magic_row,
            "goodsParamId": int(row_id),
            "magicParamId": int(magic_row_id),
            "iconId": goods_row.get("iconId", magic_row.get("iconId")),
            "sortId": goods_row.get("sortId", magic_row.get("sortId")),
        }
        kind = "sorcery" if goods_type in (5, 17) else "incantation"
        add(
            kind, row_id, display_row, ["arts", kind], MAGIC_FIELDS,
            is_cut_content("goods", row_id, goods_row, name),
        )

    gem_names = english.get("GemName", {})
    for row_id, row in params["ash-of-war"].items():
        name = gem_names.get(row_id)
        if name:
            add(
                "ash-of-war", row_id, row, ["arts", "ash-of-war"], GEM_FIELDS,
                is_cut_content("ash-of-war", row_id, row, name),
            )

    result.sort(key=lambda item: (item["categoryPath"], item["sortId"], int(item["id"])))
    return result


def build_reinforcements(rows: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row_id: selected(row, REINFORCE_FIELDS) for row_id, row in rows.items()}


def referenced_effect_ids(items: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for item in items:
        for key, value in item["params"].items():
            if ("SpEffectId" in key or key.startswith("refId")) and isinstance(value, int) and value > 0:
                ids.add(str(value))
    return ids


def build_effects(rows: dict[str, dict[str, Any]], wanted: set[str]) -> dict[str, dict[str, Any]]:
    effects: dict[str, dict[str, Any]] = {}
    for row_id in wanted:
        if row_id in rows:
            values = selected(rows[row_id], SP_EFFECT_FIELDS)
            if values:
                effects[row_id] = values
    return effects


def localized_item(item: dict[str, Any], tables: dict[str, dict[str, str]]) -> dict[str, Any]:
    item_id = item["id"]
    kind = item["kind"]
    if kind == "weapon":
        prefix = "Weapon"
    elif kind == "armor":
        prefix = "Protector"
    elif kind == "talisman":
        prefix = "Accessory"
    elif kind in ("sorcery", "incantation"):
        prefix = "Goods"
    elif kind == "ash-of-war":
        prefix = "Gem"
    else:
        prefix = "Goods"
    text = {
        "name": tables.get(f"{prefix}Name", {}).get(item_id),
        "info": tables.get(f"{prefix}Info", {}).get(item_id),
        "info2": tables.get(f"{prefix}Info2", {}).get(item_id),
        "caption": tables.get(f"{prefix}Caption", {}).get(item_id),
    }
    if kind == "weapon":
        effect_ids = [item["params"].get(f"spEffectMsgId{index}") for index in range(3)]
        text["effects"] = [
            tables.get("WeaponEffect", {}).get(str(effect_id))
            for effect_id in effect_ids
            if isinstance(effect_id, int) and effect_id >= 0 and tables.get("WeaponEffect", {}).get(str(effect_id))
        ]
        art_id = item["params"].get("swordArtsParamId")
        if isinstance(art_id, int) and art_id >= 0:
            text["skillName"] = tables.get("ArtsName", {}).get(str(art_id))
            text["skillCaption"] = tables.get("ArtsCaption", {}).get(str(art_id))
    elif kind == "ash-of-war":
        art_id = item["params"].get("swordArtsParamId")
        if isinstance(art_id, int) and art_id >= 0:
            text["skillName"] = tables.get("ArtsName", {}).get(str(art_id))
            text["skillCaption"] = tables.get("ArtsCaption", {}).get(str(art_id))
    return {key: value for key, value in text.items() if value not in (None, [], "")}


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def write_hashed_json(output: Path, stem: str, value: Any) -> tuple[str, str, int]:
    payload = json_bytes(value)
    digest = hashlib.sha256(payload).hexdigest()
    name = f"{stem}.{digest[:12]}.json"
    (output / name).write_bytes(payload)
    return name, digest, len(payload)


def convert_icons(
    items: list[dict[str, Any]],
    icons_work: Path,
    output: Path,
    variant: str,
    size: int,
) -> tuple[list[int], list[int]]:
    from PIL import Image

    icon_output = output / "icons" / variant
    icon_output.mkdir(parents=True, exist_ok=True)
    available: list[int] = []
    missing: list[int] = []
    icon_ids = sorted({item["iconId"] for item in items if isinstance(item.get("iconId"), int)})
    for icon_id in icon_ids:
        name = f"MENU_Knowledge_{icon_id:05d}"
        source = icons_work / f"{name}-tpf-dcx" / f"{name}.dds"
        target = icon_output / f"{icon_id}.webp"
        if not source.exists():
            missing.append(icon_id)
            continue
        if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
            with Image.open(source) as image:
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                image.save(target, "WEBP", quality=88, method=5)
        available.append(icon_id)
    return available, missing


def source_hash(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    param_paths = {key: args.params / file_name for key, file_name in PARAM_FILES.items()}
    missing_params = [str(path) for path in param_paths.values() if not path.exists()]
    if missing_params:
        raise SystemExit("Missing WitchyBND PARAM XML:\n" + "\n".join(missing_params))

    params = {key: load_param(path) for key, path in param_paths.items()}
    message_roots = args.messages or [
        Path("runtime/work/map-assets/game-messages"),
        Path("runtime/work/official-icons/localization"),
    ]
    locale_tables = {
        locale: load_locale_tables(root / locale for root in message_roots)
        for locale in LOCALES
    }
    english = locale_tables["en-US"]
    name_origins = load_name_table_origins(root / "en-US" for root in message_roots)
    items = build_items(params, english, name_origins)
    reinforcements = build_reinforcements(params["reinforcement"])
    effects = build_effects(params["sp-effect"], referenced_effect_ids(items))
    core = {
        "schemaVersion": 1,
        "game": "elden-ring",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "itemCount": len(items),
        "items": items,
        "reinforcements": reinforcements,
        "spEffects": effects,
    }
    core_name, core_digest, core_size = write_hashed_json(args.output, "item-data-core.v1", core)

    locale_manifest: dict[str, Any] = {}
    for locale, tables in locale_tables.items():
        localized = {
            "schemaVersion": 1,
            "locale": locale,
            "texts": {item["key"]: localized_item(item, tables) for item in items},
        }
        name, digest, size = write_hashed_json(args.output, f"item-data-{locale}.v1", localized)
        locale_manifest[locale] = {"path": f"item-data/{name}", "sha256": digest, "bytes": size}

    small_icons_work = args.small_icons_work or args.icons_work
    icon_variants: dict[str, dict[str, Any]] = {}
    if not args.skip_icons:
        for variant, source, size in (
            ("small", small_icons_work, args.small_icon_size),
            ("large", args.icons_work, args.large_icon_size),
        ):
            available, missing = convert_icons(items, source, args.output, variant, size)
            icon_variants[variant] = {
                "pathTemplate": f"item-data/icons/{variant}/{{iconId}}.webp",
                "size": size,
                "available": available,
                "missing": missing,
            }
    else:
        referenced_icons = sorted({item["iconId"] for item in items if isinstance(item.get("iconId"), int)})
        for variant, size in (("small", args.small_icon_size), ("large", args.large_icon_size)):
            available = [icon_id for icon_id in referenced_icons if (args.output / "icons" / variant / f"{icon_id}.webp").exists()]
            available_set = set(available)
            icon_variants[variant] = {
                "pathTemplate": f"item-data/icons/{variant}/{{iconId}}.webp",
                "size": size,
                "available": available,
                "missing": [icon_id for icon_id in referenced_icons if icon_id not in available_set],
            }

    manifest = {
        "schemaVersion": 1,
        "game": "elden-ring",
        "generatedAt": core["generatedAt"],
        **({"gameRelease": game_release_from_source_manifest(args.source_manifest)} if args.source_manifest else {}),
        "source": {
            "kind": "official-game-resources",
            "paramSha256": source_hash(param_paths.values()),
            "note": "WitchyBND PARAM/FMG XML exports; generated assets are not source controlled.",
        },
        "core": {"path": f"item-data/{core_name}", "sha256": core_digest, "bytes": core_size, "itemCount": len(items)},
        "locales": locale_manifest,
        "icons": {
            "variantsVersion": 1,
            "variants": icon_variants,
        },
    }
    (args.output / "item-data-manifest.v1.json").write_bytes(json_bytes(manifest))
    print(
        f"Built {len(items):,} items, {len(icon_variants['small']['available']):,} small / "
        f"{len(icon_variants['large']['available']):,} large icons, "
        f"{len(effects):,} referenced SpEffects and {len(LOCALES)} locales -> {args.output}"
    )
    for variant, values in icon_variants.items():
        if values["missing"]:
            print(f"Warning: {len(values['missing'])} referenced {variant} icons were not available in the extracted archive")


if __name__ == "__main__":
    main()
