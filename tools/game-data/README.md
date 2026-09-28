# Game source manifests

Generate a versioned fingerprint of a local installation or backup. No game files are uploaded. Replace placeholders with the actual version and paths; do not relabel an old input as a newer version.

```sh
pnpm build:source-manifest -- --game "/path/to/ELDEN RING/Game" --mode quick --application-version "<app-version>" --calibrations-version "<calibrations-version>" --output runtime/work/source-current.json
```

Optional `--nuxe <executable>` and `--witchy <executable>` record tool hashes. Optional `--executable-file-version` and `--regulation-internal-version` record already verified version metadata; they are not automatically inferred from the supplied labels.

Quick mode hashes core small files and records sizes for large BDT archives. Full mode (`--mode full`) hashes the large archives too; use it when byte-for-byte identity matters. The source manifest uses relative paths, though source-root and tool filenames are recorded.

```sh
pnpm compare:source-manifests -- --previous runtime/work/source-previous.json --current runtime/work/source-current.json --output runtime/work/source-diff.json
```

Generated manifests stay in Git-ignored `runtime/work/`. Reviewed release metadata in `releases/` contains hashes and version information, not game assets. Return to the [setup guide](../../README.md#prepare-local-game-data).
