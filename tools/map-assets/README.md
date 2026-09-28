# Map tiles and game text

This offline tool converts locally unpacked game resources into XYZ WebP tiles and exports localized text. It requires a matching unpacked resource tree, WitchyBND 3.x, and Rust/Cargo for BC7 decoding. Game-font export additionally uses JPEXS FFDec.

```sh
pnpm build:maps -- --unpacked "/path/to/unpacked/game-version" --witchy "/path/to/WitchyBND.exe" --ffdec "/path/to/ffdec.jar" --seam-mode native
pnpm build:game-texts -- --unpacked "/path/to/unpacked/game-version" --witchy "/path/to/WitchyBND.exe"
```

Environment alternatives are `MFG_ER_UNPACKED`, `MFG_WITCHY_BND`, and `MFG_FFDEC_JAR`. These CLI tools do not automatically load a root `.env` file.

Map inputs include `menu/71_maptile.tpfbhd`, `menu/71_maptile.tpfbdt`, and `menu/71_maptile.mtmskbnd.dcx`. Intermediates go to `runtime/work/map-assets/` (override with `--work`); generated assets go to `runtime/assets/` (override with `--output`). Use a distinct work directory for each source version to avoid stale intermediate inputs.

`--plan-only` inspects the texture-selection plan. `--seam-mode native` avoids the optional source-seam smoothing pass; `optimized` enables it and is the tool's default. Outputs use different hashes. The main application exposes M00/M01/M10; additional planes and local exploration-fog rendering remain incomplete.

The builder updates existing dataset manifests with the map resource reference. Generate the target marker profiles first, and keep map, text, and profile inputs version-aligned.

Install optional Python image-tool requirements separately when using the neighboring icon/item tools:

```sh
python -m venv .venv
# Activate the virtual environment using your platform's normal command.
python -m pip install Pillow
```

No game resources or third-party executables are included. Local web builds copy `runtime/assets/` into their output, so review the output before sharing it. See the [main setup guide](../../README.md#prepare-local-game-data).
