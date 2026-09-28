import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("build-item-data.py")
SPEC = importlib.util.spec_from_file_location("build_item_data", SCRIPT)
assert SPEC and SPEC.loader
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def empty_params():
    return {
        "weapon": {}, "armor": {}, "talisman": {}, "goods": {},
        "magic": {}, "ash-of-war": {}, "gesture": {},
        "reinforcement": {}, "sp-effect": {},
    }


class ItemDataBuilderTest(unittest.TestCase):
    def test_uses_weapon_type_for_detailed_categories(self):
        params = empty_params()
        params["weapon"] = {
            "1": {"wepType": 57, "sortId": 1, "originEquipWep": -1, "iconId": 10},
            "2": {"wepType": 61, "sortId": 2, "originEquipWep": -1, "iconId": 11},
        }
        items = builder.build_items(params, {"WeaponName": {"1": "Staff", "2": "Seal"}})
        by_id = {item["id"]: item for item in items}
        self.assertEqual(by_id["1"]["categoryPath"], ["equipment", "weapons", "ranged", "staff"])
        self.assertEqual(by_id["2"]["categoryPath"], ["equipment", "weapons", "ranged", "sacred-seal"])

    def test_builds_spells_from_magic_params_and_goods_text(self):
        params = empty_params()
        params["magic"] = {
            "4900": {"paramdexName": "[Sorcery] Briars of Sin", "sortId": 9, "iconId": 4000},
            "53852": {"paramdexName": "[NPC: Sorcery] Briars of Sin", "sortId": 9, "iconId": 4000},
            "6000": {"paramdexName": "[Incantation] Test Prayer", "sortId": 10, "iconId": 4000},
        }
        params["goods"] = {
            "4900": {"paramdexName": "[Sorcery] Briars of Sin", "sortId": 100, "iconId": 500, "goodsType": 5},
            "6000": {"paramdexName": "[Incantation] Test Prayer", "sortId": 101, "iconId": 600, "goodsType": 16},
        }
        items = builder.build_items(params, {"GoodsName": {"4900": "Spell", "6000": "Prayer"}})
        self.assertEqual([(item["kind"], item["iconId"]) for item in items], [
            ("incantation", 600), ("sorcery", 500),
        ])
        sorcery = next(item for item in items if item["kind"] == "sorcery")
        self.assertEqual(sorcery["id"], "4900")
        self.assertEqual(sorcery["params"]["magicParamId"], 4900)

    def test_excludes_bare_armor_and_splits_special_effects(self):
        params = empty_params()
        params["armor"] = {
            "10000": {"protectorCategory": 0, "sortId": 1, "iconIdM": 99},
            "20000": {"protectorCategory": 0, "sortId": 2, "iconIdM": 100, "residentSpEffectId": 123},
        }
        items = builder.build_items(params, {"ProtectorName": {"10000": "Head", "20000": "Special Hat"}})
        self.assertEqual([item["id"] for item in items], ["20000"])
        self.assertEqual(items[0]["categoryPath"], ["equipment", "armor", "head", "head-special-effect"])

    def test_classifies_great_runes_and_marks_hidden_rows_as_cut(self):
        params = empty_params()
        params["goods"] = {
            "191": {"goodsType": 15, "sortId": 1, "iconId": 10},
            "999": {"goodsType": 0, "sortId": 9_999_999, "iconId": 10},
        }
        items = builder.build_items(params, {"GoodsName": {"191": "Great Rune", "999": "Unused"}})
        by_id = {item["id"]: item for item in items}
        self.assertEqual(by_id["191"]["categoryPath"], ["valuables", "great-rune"])
        self.assertFalse(by_id["191"]["isCutContent"])
        self.assertTrue(by_id["999"]["isCutContent"])

    def test_moves_torches_before_shields(self):
        params = empty_params()
        params["weapon"] = {"1": {"wepType": 87, "sortId": 1, "originEquipWep": -1, "iconId": 10}}
        items = builder.build_items(params, {"WeaponName": {"1": "Torch"}})
        self.assertEqual(items[0]["categoryPath"], ["equipment", "weapons", "shield", "torch"])

    def test_classifies_expansion_and_tarnished_pack_from_official_evidence(self):
        params = empty_params()
        params["weapon"] = {
            "1500000": {"wepType": 1, "sortId": 1, "originEquipWep": -1, "iconId": 10},
            "3560000": {"wepType": 5, "sortId": 2, "originEquipWep": -1, "iconId": 11},
            "10000": {"wepType": 1, "sortId": 3, "originEquipWep": -1, "iconId": 12},
        }
        origins = {"WeaponName": {
            "base": {"3560000", "10000"},
            "shadow-of-the-erdtree": {"1500000"},
        }}
        names = {"WeaponName": {"1500000": "DLC", "3560000": "Pack", "10000": "Base"}}
        items = builder.build_items(params, names, origins)
        by_id = {item["id"]: item for item in items}
        self.assertEqual(by_id["1500000"]["contentPack"], "shadow-of-the-erdtree")
        self.assertEqual(by_id["3560000"]["contentPack"], "tarnished-pack")
        self.assertEqual(by_id["10000"]["contentPack"], "base")


if __name__ == "__main__":
    unittest.main()
