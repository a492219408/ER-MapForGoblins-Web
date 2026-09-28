# Item data builder

Reads locally exported PARAM/FMG files and extracted menu icons. Python 3.12+ is required; image generation uses Pillow. Outputs default to Git-ignored `runtime/assets/item-data/`.

Export the relevant regulation PARAMs and text through your offline extraction workflow. Small/large icon inputs come from matching `menu/low/00_solo.tpfbhd` and `menu/hi/00_solo.tpfbhd` resources, including their recursively extracted `MENU_Knowledge_*` textures.

```sh
pnpm build:item-data -- --params "/path/to/exported/regulation-bin" --messages "/path/to/game-messages" --small-icons-work "/path/to/low/00_solo-tpfbhd" --icons-work "/path/to/hi/00_solo-tpfbhd" --source-manifest runtime/work/source-current.json
```

If the package-script shell cannot resolve Python, invoke `python tools/item-data/build-item-data.py` with the same arguments, or use `mise exec -- python`. Repeat `--messages` for additional locale roots. `--skip-icons` updates text and parameters without regenerating images.

The output separates shared parameters, locale files, small images, and large images. It retains game/source hashes, reinforcement tables, recognized content-pack/cut-content classification, and available special-effect data. Some effect interpretation and category rules are still incomplete.

The root [README](../../README.md#prepare-local-game-data) describes how these manifests are served. Do not commit exported game text or textures.
