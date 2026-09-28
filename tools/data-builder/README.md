# Marker datasets

An offline converter for generated marker/category data from [Map for Goblins](https://github.com/VirusAlex/ERR-MapForGoblins-DLL). It reads a separately prepared reference tree and does not run the game or modify that tree.

```sh
pnpm build:data:err -- --reference "/path/to/ERR-MapForGoblins-DLL"
pnpm build:data:profile -- --profile vanilla --reference "/path/to/prepared-reference-tree" --source-manifest runtime/work/source-current.json
```

The reference must already contain the requested profile's generated sources and data, such as `src/generated_vanilla` and `data/vanilla`. Use the upstream project's own preparation instructions in a separate working copy. Do not assume a fresh upstream clone includes all generated inputs or that a newer upstream revision produces the same dataset.

`MFG_ERR_MAP_REFERENCE` is the environment-variable alternative to `--reference`. `--activate false` updates a profile without selecting it as the default. Outputs are Git-ignored under `runtime/assets/`: a dataset index, profile manifests, and content-addressed marker/category catalogs.

## Marker text

After exporting matching FMG text with the [map/text builder](../map-assets/README.md):

```sh
pnpm build:marker-texts -- --messages runtime/work/map-assets/game-messages
```

It resolves MFG text-ID conventions into localized text and updates the manifests. Unresolved IDs remain unresolved; it does not invent names.

The converter uses upstream mapping conventions with notices retained in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Game text, maps, and other generated assets are not distributed with this repository.
