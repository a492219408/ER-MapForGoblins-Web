# Map facilities and icon atlases

Offline tools for official map facilities/NPC slots and MFG category icons. They require Python with Pillow plus separately prepared game/UI exports. Generated content stays under Git-ignored `runtime/work/` and `runtime/assets/`.

## Build order

Prepare matching Scaleform XML, DDS/layout exports, WorldMapPointParam XML, and FMG locale directories with external tools. Then run from the repository root (PowerShell line continuation shown):

```powershell
python tools/icon-assets/render-official-icons.py `
  --gfx-xml "/path/to/worldmap_new_actual.xml" `
  --texture-dir "/path/to/01_common-tpf-dcx" `
  --layout-dir "/path/to/01_common-sblytbnd-dcx" `
  --output-dir "runtime/work/official-icons/rendered"

python tools/icon-assets/build-mfg-icons.py `
  --reference "/path/to/ERR-MapForGoblins-DLL" `
  --output-dir "runtime/work/mfg-icons"

python tools/icon-assets/build-official-map.py `
  --world-map-param "/path/to/WorldMapPointParam.param.xml" `
  --marker-catalog "runtime/assets/datasets/vanilla/<marker-catalog-file>.json" `
  --icon-manifest "runtime/work/official-icons/rendered/official-world-map.icons.json" `
  --icon-atlas "runtime/work/official-icons/rendered/official-world-map.png" `
  --mfg-icon-manifest "runtime/work/mfg-icons/mfg-marker-icons.json" `
  --mfg-icon-atlas "runtime/work/mfg-icons/mfg-marker-icons.png" `
  --msb-entity-index "/path/to/msb_entity_index.json" `
  --locale "en-US=/path/to/localization/en-US" `
  --output-assets "runtime/assets"
```

Add other `--locale` entries as available. Paths above are placeholders for your own extraction outputs. Prefix Python with `mise exec --` if it is managed by mise.

The official catalog preserves primary/secondary enable/disable predicates rather than collapsing NPC evidence into one position. Supplemental marker data records verified game-script conditions. Official sprite keys use `world-map-*`; MFG keys use `mfg-*`.

The renderer handles bitmap layers and supported vector shapes. Marker text is generated separately by [the data builder](../data-builder/README.md). No extracted image or upstream PNG is bundled in this source repository.
