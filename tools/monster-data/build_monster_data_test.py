from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build-monster-data.py")
SPEC = importlib.util.spec_from_file_location("build_monster_data", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class OfficialLocalizationTest(unittest.TestCase):
    def test_reference_annotations_do_not_hide_official_boss_name(self) -> None:
        index = MODULE.text_id_index(
            {
                902120000: "Malenia, Blade of Miquella",
                902120001: "Malenia, Goddess of Rot",
            }
        )

        self.assertEqual(
            MODULE.exact_text_id("Malenia, Blade of Miquella [Boss]", index, strip_qualifier=True),
            902120000,
        )
        self.assertEqual(
            MODULE.exact_text_id("Malenia, Goddess of Rot [Boss]", index, strip_qualifier=True),
            902120001,
        )

    def test_base_and_dlc_fmg_tables_are_merged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fmg(root / "NpcName.fmg.xml", 1, "Base Boss")
            self.write_fmg(root / "NpcName_dlc01.fmg.xml", 2, "DLC Boss")
            self.write_fmg(root / "NpcName_dlc02.fmg.xml", 3, "Future DLC Boss")
            self.write_fmg(root / "PlaceName.fmg.xml", 4, "Base Place")
            self.write_fmg(root / "PlaceName_dlc01.fmg.xml", 5, "DLC Place")

            tables = MODULE.read_fmg_tables(root)

        self.assertEqual(tables["NpcName"], {1: "Base Boss", 2: "DLC Boss", 3: "Future DLC Boss"})
        self.assertEqual(tables["PlaceName"], {4: "Base Place", 5: "DLC Place"})

    def test_generic_boss_rows_have_audited_event_name_ids(self) -> None:
        self.assertEqual(MODULE.BOSS_EVENT_NAME_IDS["41301030"], 904130540)
        self.assertEqual(MODULE.BOSS_EVENT_NAME_IDS["41300032"], 904130600)
        self.assertEqual(MODULE.BOSS_EVENT_NAME_IDS["41301932"], 904130310)

    @staticmethod
    def write_fmg(path: Path, text_id: int, value: str) -> None:
        path.write_text(
            f'<fmg><entries><text id="{text_id}">{value}</text></entries></fmg>',
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
