# Third-party notices

The project's original code is GPL-3.0-only. The dependencies and referenced implementations below retain their original terms. Generated game resources are not part of this source distribution.

## Map for Goblins / Goblin-ERR

The marker converters, text-ID conventions, coordinate conversions, and icon rendering rules draw on [ERR-MapForGoblins-DLL](https://github.com/VirusAlex/ERR-MapForGoblins-DLL).

- Copyright (c) 2026 VirusAlex
- Copyright (c) 2024 Gacsam

The applicable upstream MIT-style notices are retained verbatim in [third_party/licenses/ERR-MapForGoblins-DLL.txt](third_party/licenses/ERR-MapForGoblins-DLL.txt). This repository does not ship the injected DLL, its native hooking dependencies, upstream PNG artwork, or extracted game assets. Generated data and artwork require their own provenance review before distribution.

## Browser dependencies

| Dependency | License and retained notice |
| --- | --- |
| `@zebbedaja/er-save-parser` | MIT; Copyright (c) 2026 Daniel Zsebedits; [license](third_party/licenses/er-save-parser.txt) |
| MapLibre GL JS | BSD-3-Clause and notices for included components; [complete upstream notice](third_party/licenses/maplibre-gl.txt) |
| React | MIT; [license](third_party/licenses/react.txt) |
| React DOM | MIT; [license](third_party/licenses/react-dom.txt) |

Exact versions are pinned in package manifests and `pnpm-lock.yaml`. Vite emits `dist/.vite/license.md` for bundled dependencies. Keep it with any web build you distribute; this table does not replace that full dependency list.

## Save-format research

The independently implemented narrow parsers have been cross-checked against public research, including:

- [EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge)
- [EldenRingSaveTemplate](https://github.com/ClayAmore/EldenRingSaveTemplate)
- [eldenring-savegame-analyzer](https://github.com/arfipod/eldenring-savegame-analyzer)

These projects are not bundled runtime dependencies. Reference access does not itself grant permission to copy their source. The separately supplied save-format notes from VirusAlex are not redistributed here.

## Java and offline tools

Spring Boot and its managed dependencies retain their own licenses and packaged notices. Save Bridge uses Java HTTP server APIs; JDK distributions retain their respective terms.

The offline Rust codec depends on `anyhow`, `ddsfile`, `image`, `image_dds`, `serde`, and `serde_json`, as pinned by `tools/map-assets/Cargo.lock`. Python image tools use Pillow. These dependencies are not relicensed by the project's Cargo metadata. Compiled-codec or packaged-Python distributions must retain the notices for the dependencies in those artifacts.

Nuxe, WitchyBND, and JPEXS FFDec are separately installed offline tools and are not bundled.

## Game content

Elden Ring names and game content belong to their respective rights holders. Extracted maps, icons, fonts, FMG text, audio, archives, and actual saves are excluded from Git. The project's GPL license grants no permission to redistribute them. No community workbook is included in this source distribution.
