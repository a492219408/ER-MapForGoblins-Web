#!/usr/bin/env python3
"""把怪物参考工作簿转换为浏览器可读取的内容寻址资源。

只使用 Python 标准库，避免把体积较大的 XLSX 解析依赖带进网页运行时。
工作簿是研究输入，生成物写入 runtime/assets，不进入 Git 历史。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS, "pr": PACKAGE_REL_NS}

CYCLE_SHEETS = ["NG", "NG+", "NG+2", "NG+3", "NG+4", "NG+5", "NG+6", "NG+7"]
CYCLE_IDS = ["ng", "ng-plus-1", "ng-plus-2", "ng-plus-3", "ng-plus-4", "ng-plus-5", "ng-plus-6", "ng-plus-7"]
MULTIPLAYER_FIELDS = [
    ("health", "生命值"),
    ("attackPhysical", "物理攻击"),
    ("attackMagic", "魔力攻击"),
    ("attackFire", "火焰攻击"),
    ("attackLightning", "雷电攻击"),
    ("attackHoly", "圣属性攻击"),
    ("resistancePoison", "中毒抗性"),
    ("resistanceRot", "猩红腐败抗性"),
    ("resistanceBleed", "出血抗性"),
    ("resistanceFrost", "冻伤抗性"),
    ("resistanceSleep", "催眠抗性"),
    ("resistanceMadness", "发狂抗性"),
    ("resistanceDeath", "死亡抗性"),
    ("poise", "韧性"),
]

GAME_LOCALES = [
    "zh-CN", "zh-TW", "en-US", "fr-FR", "it-IT", "de-DE", "es-ES",
    "ja-JP", "ko-KR", "pl-PL", "pt-BR", "ru-RU", "es-419", "th-TH", "ar-AE",
]
DEFAULT_LOCALE = "en-US"
FMG_TABLES = ("NpcName", "PlaceName")
OFFICIAL_NAME_ALIASES = {
    "abductor virgin (scythe)": "Abductor Virgin (Swinging Sickle)",
    "bloodhound knight darriwill": "Bloodhound Knight Darriwil",
    "burial watchdog": "Erdtree Burial Watchdog",
    "burial watchdog (lightning tail)": "Erdtree Burial Watchdog",
    "burial watchdog (scepter)": "Erdtree Burial Watchdog (Scepter)",
    "burial watchdog (sword)": "Erdtree Burial Watchdog (Sword)",
    "hoarah loux": "Hoarah Loux, Warrior",
}
# 这些 Boss 的 NpcParam.nameId 为 0，血条名称由 EMEVD 的
# EnableBossHealthBar 指令指定。参考表又只保留了泛称，因此不能通过英文精确
# 匹配还原专名。这里直接记录指令最终指向的官方 NpcName 文本 ID。
BOSS_EVENT_NAME_IDS = {
    "33000940": 903300560,  # Nox Monk（同场另有 Nox Swordstress）
    "41200910": 904120310,  # Demi-Human Chief
    "41300032": 904130600,  # Demi-Human Queen Maggie
    "41301030": 904130540,  # Demi-Human Queen Gilika
    "41301932": 904130310,  # Demi-Human Queen Margot
}


@dataclass(frozen=True)
class Field:
    id: str
    label: str
    group: str
    column: int
    unit: str | None = None

    def json(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "group": self.group,
            "sourceColumn": column_name(self.column),
        }
        if self.unit:
            result["unit"] = self.unit
        return result


FIELDS = [
    Field("health", "生命值", "基础", 5),
    Field("defensePhysical", "物理防御", "防御力", 8),
    Field("defenseStrike", "打击防御", "防御力", 9),
    Field("defenseSlash", "斩击防御", "防御力", 10),
    Field("defensePierce", "突刺防御", "防御力", 11),
    Field("defenseMagic", "魔力防御", "防御力", 12),
    Field("defenseFire", "火焰防御", "防御力", 13),
    Field("defenseLightning", "雷电防御", "防御力", 14),
    Field("defenseHoly", "圣防御", "防御力", 15),
    Field("negationPhysical", "物理减伤率", "减伤率", 17, "%"),
    Field("negationStrike", "打击减伤率", "减伤率", 18, "%"),
    Field("negationSlash", "斩击减伤率", "减伤率", 19, "%"),
    Field("negationPierce", "突刺减伤率", "减伤率", 20, "%"),
    Field("negationMagic", "魔力减伤率", "减伤率", 21, "%"),
    Field("negationFire", "火焰减伤率", "减伤率", 22, "%"),
    Field("negationLightning", "雷电减伤率", "减伤率", 23, "%"),
    Field("negationHoly", "圣减伤率", "减伤率", 24, "%"),
    Field("resistancePoison", "中毒抗性", "异常抗性", 26),
    Field("resistanceRot", "猩红腐败抗性", "异常抗性", 27),
    Field("resistanceBleed", "出血抗性", "异常抗性", 28),
    Field("resistanceFrost", "冻伤抗性", "异常抗性", 29),
    Field("resistanceSleep", "催眠抗性", "异常抗性", 30),
    Field("resistanceMadness", "发狂抗性", "异常抗性", 31),
    Field("resistanceDeath", "死亡抗性", "异常抗性", 32),
    Field("incomingBleed", "出血累积倍率", "异常伤害倍率", 34),
    Field("incomingFrost", "冻伤累积倍率", "异常伤害倍率", 35),
    Field("incomingSleep", "催眠累积倍率", "异常伤害倍率", 36),
    Field("incomingMadness", "发狂累积倍率", "异常伤害倍率", 37),
    Field("incomingHpBurn", "百分比生命伤害倍率", "异常伤害倍率", 38),
    Field("poiseBase", "基础韧性", "韧性", 40),
    Field("poiseIncomingMultiplier", "韧性伤害倍率", "韧性", 41),
    Field("poiseEffective", "有效韧性", "韧性", 42),
    Field("poiseRegenDelay", "韧性恢复延迟", "韧性", 43, "s"),
    *[Field(f"partMultiplier{index}", f"部位 {index} 伤害倍率", "部位", 44 + index) for index in range(1, 9)],
    Field("weakPart", "弱点部位", "部位", 53),
    Field("partsDamageType", "部位伤害类型", "部位", 54),
]


class XlsxReader:
    def __init__(self, path: Path):
        self.archive = zipfile.ZipFile(path)
        self.shared_strings = self._read_shared_strings()
        self.sheet_paths = self._read_sheet_paths()

    def close(self) -> None:
        self.archive.close()

    def _read_shared_strings(self) -> list[str]:
        try:
            root = ET.fromstring(self.archive.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        return ["".join(node.text or "" for node in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]

    def _read_sheet_paths(self) -> dict[str, str]:
        workbook = ET.fromstring(self.archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(self.archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall("pr:Relationship", NS)
        }
        paths: dict[str, str] = {}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
            target = PurePosixPath(targets[relationship_id])
            paths[sheet.attrib["name"]] = str(PurePosixPath("xl") / target)
        return paths

    def rows(self, sheet_name: str) -> Iterable[tuple[int, dict[int, Any]]]:
        path = self.sheet_paths.get(sheet_name)
        if not path:
            raise ValueError(f"工作簿缺少 Sheet：{sheet_name}")
        with self.archive.open(path) as stream:
            for _, element in ET.iterparse(stream, events=("end",)):
                if element.tag != f"{{{MAIN_NS}}}row":
                    continue
                row_number = int(element.attrib.get("r", "0"))
                values: dict[int, Any] = {}
                for cell in element.findall("m:c", NS):
                    reference = cell.attrib.get("r", "")
                    column = column_number(reference)
                    values[column] = self._cell_value(cell)
                element.clear()
                yield row_number, values

    def _cell_value(self, cell: ET.Element) -> Any:
        cell_type = cell.attrib.get("t")
        if cell_type == "inlineStr":
            return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
        value_node = cell.find("m:v", NS)
        if value_node is None or value_node.text is None:
            return None
        raw = value_node.text
        if cell_type == "s":
            return self.shared_strings[int(raw)]
        if cell_type in {"str", "e"}:
            return raw
        if cell_type == "b":
            return raw == "1"
        try:
            number = float(raw)
            return int(number) if number.is_integer() else number
        except ValueError:
            return raw


def build_dataset(
    workbook_path: Path,
    messages_root: Path | None = None,
    npc_name_ids_path: Path | None = None,
) -> dict[str, Any]:
    reader = XlsxReader(workbook_path)
    try:
        cycle_rows: list[list[tuple[int, dict[int, Any]]]] = []
        for sheet in CYCLE_SHEETS:
            rows = [(row_number, values) for row_number, values in reader.rows(sheet) if row_number > 2 and values]
            cycle_rows.append(rows)

        item_drop_rows = [(row_number, values) for row_number, values in reader.rows("Item Drops") if row_number > 1 and values]
        flag_rows = [(row_number, values) for row_number, values in reader.rows("FlagsOther") if row_number > 1 and values]

        expected_count = len(cycle_rows[0])
        if any(len(rows) != expected_count for rows in cycle_rows):
            counts = ", ".join(f"{sheet}={len(rows)}" for sheet, rows in zip(CYCLE_SHEETS, cycle_rows))
            raise ValueError(f"周目 Sheet 行数不一致：{counts}")
        if len(flag_rows) != expected_count:
            raise ValueError(f"FlagsOther 行数不一致：FlagsOther={len(flag_rows)}，NG={expected_count}")
        if len(item_drop_rows) != expected_count:
            raise ValueError(f"Item Drops 行数不一致：Item Drops={len(item_drop_rows)}，NG={expected_count}")

        dlc_completion_effects = read_dlc_completion_effects(reader)
        multiplayer_corrections = read_multiplayer_corrections(reader)
        resistance_corrections = read_resistance_corrections(reader)

        enemies: list[dict[str, Any]] = []
        for index, base_entry in enumerate(cycle_rows[0]):
            row_number, base = base_entry
            identity = tuple(clean_identity(base.get(column)) for column in (1, 2, 3))
            _, item_drop_values = item_drop_rows[index]
            _, flag_values = flag_rows[index]
            item_drop_identity = tuple(clean_identity(item_drop_values.get(column)) for column in (1, 2, 3))
            flag_identity = tuple(clean_identity(flag_values.get(column)) for column in (1, 2, 3))
            if item_drop_identity != identity:
                raise ValueError(f"Item Drops 与 NG 第 {row_number} 行不是同一个敌人：{item_drop_identity!r} != {identity!r}")
            if flag_identity != identity:
                raise ValueError(f"FlagsOther 与 NG 第 {row_number} 行不是同一个敌人：{flag_identity!r} != {identity!r}")
            stats_by_cycle: list[list[Any]] = []
            for sheet, rows in zip(CYCLE_SHEETS, cycle_rows):
                other_row_number, values = rows[index]
                other_identity = tuple(clean_identity(values.get(column)) for column in (1, 2, 3))
                if other_row_number != row_number or other_identity != identity:
                    raise ValueError(
                        f"{sheet} 第 {other_row_number} 行与 NG 第 {row_number} 行不是同一个敌人："
                        f"{other_identity!r} != {identity!r}"
                    )
                stats_by_cycle.append([normalize_value(values.get(field.column)) for field in FIELDS])
            location, name, npc_id = identity
            if not any((location, name, npc_id)):
                continue
            enemies.append({
                "key": f"row-{row_number}",
                "location": location,
                "name": name,
                "id": npc_id,
                "drops": [drop for column in range(5, 17) if (drop := normalize_value(item_drop_values.get(column))) is not None],
                "flags": {
                    "void": flag_values.get(5) is True,
                    "thoseWhoLiveInDeath": flag_values.get(6) is True,
                    "ancientDragon": flag_values.get(7) is True,
                    "dragonOrWyrm": flag_values.get(8) is True,
                    "calculatePvpDamage": flag_values.get(9) is True,
                    "defFlickPower": normalize_value(flag_values.get(19)),
                },
                "dlcCompletionSpEffectId": positive_id(flag_values.get(10)),
                "multiPlayCorrectionId": positive_id(flag_values.get(11)),
                "resistanceCorrectionIds": [positive_id(flag_values.get(column)) for column in range(12, 19)],
                "cycles": stats_by_cycle,
            })

        source_sha256 = sha256_file(workbook_path)
        dataset = {
            "schemaVersion": 1,
            "game": "elden-ring",
            "source": {
                "kind": "community-reference-workbook",
                "fileName": workbook_path.name,
                "applicationVersion": parse_application_version(workbook_path.name),
                "sha256": source_sha256,
                "note": "数值和默认英文名称来自社区参考表；可精确关联的名称与地区使用游戏官方 FMG 文本。",
            },
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "cycleModel": {
                "kind": "table",
                "maximumClearCount": 7,
                "parameter": "ClearCountCorrectParam",
                "dlcCompletion": "NpcParam.dlcGameClearSpEffectID is applied once and does not ramp with NG+.",
                "areaScaling": "NpcParam resident SpEffects (including the 7000 series) can change health and other stats by area tier.",
            },
            "dlcCompletionEffects": dlc_completion_effects,
            "multiplayerFields": [
                {"id": field_id, "label": label}
                for field_id, label in MULTIPLAYER_FIELDS
            ],
            "multiplayerCorrections": multiplayer_corrections,
            "resistanceCorrections": resistance_corrections,
            "cycles": [
                {"id": cycle_id, "label": label, "clearCount": index}
                for index, (cycle_id, label) in enumerate(zip(CYCLE_IDS, CYCLE_SHEETS))
            ],
            "fields": [field.json() for field in FIELDS],
            "enemyCount": len(enemies),
            "enemies": enemies,
        }
        if messages_root and messages_root.is_dir():
            dataset["localization"] = apply_official_localization(
                enemies,
                messages_root,
                npc_name_ids_path if npc_name_ids_path and npc_name_ids_path.is_file() else None,
            )
        else:
            dataset["localization"] = {
                "defaultLocale": DEFAULT_LOCALE,
                "locales": [],
                "nameRows": 0,
                "locationRows": 0,
                "npcParamNameRows": 0,
                "bossEventNameRows": 0,
                "exactNameRows": 0,
                "note": "未找到已解包的游戏消息，名称与地区使用参考表默认英文。",
            }
        return dataset
    finally:
        reader.close()


def apply_official_localization(
    enemies: list[dict[str, Any]],
    messages_root: Path,
    npc_name_ids_path: Path | None,
) -> dict[str, Any]:
    tables_by_locale = {
        locale: read_fmg_tables(messages_root / locale)
        for locale in GAME_LOCALES
        if (messages_root / locale).is_dir()
    }
    default_tables = tables_by_locale.get(DEFAULT_LOCALE, {})
    default_npc_names = default_tables.get("NpcName", {})
    default_place_names = default_tables.get("PlaceName", {})
    npc_name_ids = read_npc_name_ids(npc_name_ids_path)
    npc_name_index = text_id_index(default_npc_names)
    place_name_index = text_id_index(default_place_names)
    place_candidates = sorted(
        ((text, text_id) for text_id, text in default_place_names.items() if len(text.strip()) >= 4),
        key=lambda item: (-len(item[0]), item[0]),
    )

    name_rows = 0
    npc_param_name_rows = 0
    boss_event_name_rows = 0
    exact_name_rows = 0
    location_rows = 0
    for enemy in enemies:
        name_id = npc_name_id_for_enemy(enemy, npc_name_ids)
        name_source = "npc-param"
        if name_id is None:
            name_id = BOSS_EVENT_NAME_IDS.get(clean_identity(enemy.get("id")))
            name_source = "boss-event"
        if name_id is None:
            name_id = exact_text_id(enemy["name"], npc_name_index, strip_qualifier=True)
            name_source = "exact-name"
        if name_id is not None:
            labels = localized_labels(name_id, "NpcName", tables_by_locale, enemy["name"])
            if labels:
                enemy["labels"] = labels
                enemy["nameLocalizationSource"] = name_source
                name_rows += 1
                if name_source == "npc-param":
                    npc_param_name_rows += 1
                elif name_source == "boss-event":
                    boss_event_name_rows += 1
                else:
                    exact_name_rows += 1

        location_labels = localize_location(
            enemy["location"],
            place_name_index,
            place_candidates,
            tables_by_locale,
        )
        if location_labels:
            enemy["locationLabels"] = location_labels
            location_rows += 1

    return {
        "defaultLocale": DEFAULT_LOCALE,
        "locales": list(tables_by_locale),
        "nameRows": name_rows,
        "locationRows": location_rows,
        "npcParamNameRows": npc_param_name_rows,
        "bossEventNameRows": boss_event_name_rows,
        "exactNameRows": exact_name_rows,
        "note": (
            "名称只在 NpcParam.nameId、Boss 事件名称或默认英文与 NpcName 精确匹配时采用官方译文；"
            "地区按 PlaceName 的完整名称或不重叠名称片段替换，未匹配部分保留默认英文。"
        ),
    }


def read_fmg_tables(locale_root: Path) -> dict[str, dict[int, str]]:
    result: dict[str, dict[int, str]] = {table: {} for table in FMG_TABLES}
    files = list(locale_root.rglob("*.fmg.xml"))
    for table in FMG_TABLES:
        candidates = sorted(
            (
                path
                for path in files
                if re.fullmatch(rf"{re.escape(table)}(?:_dlc\d+)?\.fmg\.xml", path.name, re.IGNORECASE)
            ),
            key=lambda path: (fmg_file_priority(path), str(path).casefold()),
        )
        for path in candidates:
            root = ET.parse(path).getroot()
            for node in root.findall("./entries/text"):
                try:
                    text_id = int(node.attrib["id"])
                except (KeyError, ValueError):
                    continue
                text = usable_fmg_text(node.text)
                if text:
                    result[table][text_id] = text
    return result


def fmg_file_priority(path: Path) -> int:
    normalized = str(path).replace("\\", "/").casefold()
    if "dlc02" in normalized:
        return 2
    if "dlc01" in normalized:
        return 1
    return 0


def usable_fmg_text(value: str | None) -> str | None:
    text = (value or "").strip()
    return text if text and text not in {"%null%", "[ERROR]"} else None


def read_npc_name_ids(path: Path | None) -> dict[str, int]:
    if path is None:
        return {}
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    raw = payload.get("mappings", payload) if isinstance(payload, dict) else {}
    return {
        str(key): int(value)
        for key, value in raw.items()
        if str(value).lstrip("-").isdigit() and int(value) > 0
    }


def npc_name_id_for_enemy(enemy: dict[str, Any], mapping: dict[str, int]) -> int | None:
    numeric_id = re.match(r"\d+", enemy["id"])
    return mapping.get(numeric_id.group(0)) if numeric_id else None


def text_id_index(values: dict[int, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for text_id, text in values.items():
        result.setdefault(normalized_text(text), text_id)
    return result


def exact_text_id(value: str, index: dict[str, int], strip_qualifier: bool = False) -> int | None:
    candidates = [value]
    if strip_qualifier:
        without_brackets = re.sub(r"\s*\[[^\]]+\]\s*", " ", value).strip()
        candidates.append(without_brackets)
        candidates.append(re.sub(r"\s*\([^\)]*\)\s*$", "", without_brackets).strip())
        alias = OFFICIAL_NAME_ALIASES.get(normalized_text(without_brackets))
        if alias:
            candidates.append(alias)
    for candidate in candidates:
        text_id = index.get(normalized_text(candidate))
        if text_id is not None:
            return text_id
    return None


def normalized_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def localized_labels(
    text_id: int,
    table: str,
    tables_by_locale: dict[str, dict[str, dict[int, str]]],
    fallback: str,
) -> dict[str, str]:
    default = tables_by_locale.get(DEFAULT_LOCALE, {}).get(table, {}).get(text_id, fallback)
    return {
        locale: tables.get(table, {}).get(text_id, default)
        for locale, tables in tables_by_locale.items()
    }


def localize_location(
    location: str,
    place_name_index: dict[str, int],
    place_candidates: list[tuple[str, int]],
    tables_by_locale: dict[str, dict[str, dict[int, str]]],
) -> dict[str, str] | None:
    exact_id = exact_text_id(location, place_name_index)
    if exact_id is not None:
        return localized_labels(exact_id, "PlaceName", tables_by_locale, location)

    matches = non_overlapping_place_matches(location, place_candidates)
    if not matches:
        return None
    labels: dict[str, str] = {}
    for locale, tables in tables_by_locale.items():
        translated = []
        cursor = 0
        for start, end, text_id in matches:
            translated.append(location[cursor:start])
            translated.append(tables.get("PlaceName", {}).get(text_id, location[start:end]))
            cursor = end
        translated.append(location[cursor:])
        labels[locale] = "".join(translated)
    return labels


def non_overlapping_place_matches(
    location: str,
    candidates: list[tuple[str, int]],
) -> list[tuple[int, int, int]]:
    lower = location.casefold()
    possible: list[tuple[int, int, int]] = []
    for text, text_id in candidates:
        needle = text.casefold()
        start = lower.find(needle)
        while start >= 0:
            end = start + len(needle)
            before_ok = start == 0 or not lower[start - 1].isalnum()
            after_ok = end == len(lower) or not lower[end].isalnum()
            if before_ok and after_ok:
                possible.append((start, end, text_id))
            start = lower.find(needle, start + 1)
    selected: list[tuple[int, int, int]] = []
    for match in sorted(possible, key=lambda item: (-(item[1] - item[0]), item[0])):
        if not any(match[0] < other[1] and other[0] < match[1] for other in selected):
            selected.append(match)
    return sorted(selected)


def read_dlc_completion_effects(reader: XlsxReader) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row_number, values in reader.rows("dlcGameClearSpEffect"):
        if row_number <= 2:
            continue
        effect_id = positive_id(values.get(1))
        if effect_id is None:
            continue
        result.append({
            "spEffectId": effect_id,
            "damageMultipliers": [normalize_value(values.get(column)) for column in range(3, 8)],
        })
    return result


def read_multiplayer_corrections(reader: XlsxReader) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row_number, values in reader.rows("MultiPlayCorrection"):
        if row_number <= 2:
            continue
        correction_id = positive_id(values.get(1))
        if correction_id is None:
            continue
        result.append({
            "id": correction_id,
            "summons": [
                [normalize_value(values.get(column)) for column in range(start, start + len(MULTIPLAYER_FIELDS))]
                for start in (3, 18, 33)
            ],
        })
    return result


def read_resistance_corrections(reader: XlsxReader) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row_number, values in reader.rows("ResistanceCorrectParam"):
        if row_number <= 1:
            continue
        correction_id = positive_id(values.get(1))
        if correction_id is None:
            continue
        result.append({
            "id": correction_id,
            "name": normalize_value(values.get(2)),
            "addPoints": [normalize_value(values.get(column)) for column in range(3, 8)],
            "addRates": [normalize_value(values.get(column)) for column in range(8, 13)],
        })
    return result


def game_release_from_source_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("files"), list):
        raise SystemExit("不支持的游戏源清单")
    regulation = next((entry for entry in manifest["files"] if PurePosixPath(str(entry.get("path", "")).replace("\\", "/")).name.lower() == "regulation.bin"), None)
    result = dict(manifest.get("release") or {})
    result["sourceFingerprint"] = manifest.get("sourceFingerprint")
    if regulation and regulation.get("sha256"):
        result["regulationSha256"] = regulation["sha256"]
    return {key: value for key, value in result.items() if value is not None}


def write_dataset(
    dataset: dict[str, Any],
    output_root: Path,
    game_release: dict[str, Any] | None = None,
) -> tuple[Path, Path]:
    compact = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha256(compact).hexdigest()
    resource_directory = output_root / "monster-data"
    resource_directory.mkdir(parents=True, exist_ok=True)
    resource_name = f"monster-data.v1.{digest[:16]}.json"
    resource_path = resource_directory / resource_name
    resource_path.write_bytes(compact)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": dataset["generatedAt"],
        "source": dataset["source"],
        **({"gameRelease": game_release} if game_release else {}),
        "resource": {
            "path": f"monster-data/{resource_name}",
            "sha256": digest,
            "bytes": len(compact),
            "schemaVersion": 1,
        },
    }
    manifest_path = resource_directory / "monster-data-manifest.v1.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return resource_path, manifest_path


def normalize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped in {"", "-", "—", "N/A", "n/a"}:
            return None
        return stripped
    return value


def positive_id(value: Any) -> int | None:
    if isinstance(value, (int, float)) and int(value) >= 0:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def clean_identity(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def column_number(reference: str) -> int:
    match = re.match(r"([A-Z]+)", reference.upper())
    if not match:
        return 0
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - 64
    return result


def column_name(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_application_version(file_name: str) -> str | None:
    match = re.search(r"App Ver\.\s*([0-9.]+)", file_name, re.IGNORECASE)
    return match.group(1) if match else None


def main() -> None:
    parser = argparse.ArgumentParser(description="构建怪物数值静态资源")
    parser.add_argument(
        "--workbook",
        type=Path,
        default=Path("ER - PvE Health_Defense_DmgNeg_Resistances_Drops_Flags (App Ver. 1.13) 20260822.xlsx"),
        help="研究用 XLSX 工作簿",
    )
    parser.add_argument("--output", type=Path, default=Path("runtime/assets"), help="静态资源根目录")
    parser.add_argument(
        "--messages",
        type=Path,
        default=Path("runtime/work/map-assets/game-messages"),
        help="build:game-texts 解包出的 15 语言 FMG 根目录",
    )
    parser.add_argument(
        "--npc-name-ids",
        type=Path,
        default=Path("runtime/work/monster-data/npc-name-ids.json"),
        help="可选的官方 NpcParam.nameId 映射",
    )
    parser.add_argument("--source-manifest", type=Path, help="game-source-manifest.v1 JSON")
    args = parser.parse_args()
    if not args.workbook.is_file():
        raise SystemExit(f"找不到怪物参考工作簿：{args.workbook}")
    dataset = build_dataset(args.workbook, args.messages, args.npc_name_ids)
    game_release = game_release_from_source_manifest(args.source_manifest) if args.source_manifest else None
    resource_path, manifest_path = write_dataset(dataset, args.output, game_release)
    print(f"已生成 {dataset['enemyCount']} 条怪物记录、{len(dataset['cycles'])} 个周目档位")
    localization = dataset["localization"]
    print(
        f"本地化：名称 {localization['nameRows']} 条、地区 {localization['locationRows']} 条，"
        f"语言 {len(localization['locales'])} 种"
    )
    print(f"数据：{resource_path}")
    print(f"清单：{manifest_path}")


if __name__ == "__main__":
    main()
