# Enemy data builder

Builds content-addressed JSON from a separately supplied community reference workbook, optionally joined to matching official FMG text and NpcParam-name mappings. Python's standard library is sufficient for this builder.

```sh
pnpm build:monster-data -- --workbook "/path/to/reference.xlsx" --messages "/path/to/game-messages" --npc-name-ids runtime/work/monster-data/npc-name-ids.json --source-manifest runtime/work/source-current.json
```

If Python is not visible in the package-script shell, use `python tools/monster-data/build-monster-data.py` with the same arguments. Omit optional name-map/source-manifest arguments when unavailable; localization coverage and provenance will be more limited.

The optional `extract-npc-name-ids.ps1` helper reads `regulation.bin` using separately supplied SoulsFormats, Paramdex, and native decompression dependencies:

```powershell
./tools/monster-data/extract-npc-name-ids.ps1 -Regulation "/path/to/regulation.bin" -SoulsFormats "/path/to/Andre.SoulsFormats.dll" -NpcParamDef "/path/to/Paramdex/ER/Defs/NpcParam.xml" -LibZstdDirectory "/path/to/native-libraries"
```

The expected workbook contains NG through NG+7 and supporting drop/correction sheets. It is not bundled, and compatibility with an arbitrary workbook is not guaranteed. Outputs record the workbook filename, SHA-256, and stated version separately from the official-text/game-source version. Never label older table numbers as a new game's verified values merely because localization was refreshed.

Generated data lives under `runtime/assets/monster-data/`. The source workbook and cache are local inputs, not public repository content.
