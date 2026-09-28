# ER Map for Goblins Web

[简体中文](README.zh-CN.md)

A read-only Elden Ring save viewer with an interactive map, character equipment, and item and enemy databases. Inspired by [Map for Goblins](https://github.com/VirusAlex/ERR-MapForGoblins-DLL), it works outside the game: no injected mod, process-memory access, or save editing.

This is an early development project. The interface is primarily Simplified Chinese; available game text and map categories support multiple languages. PC saves using supported BND4 layouts can be read from `.sl2`, `.co2`, and compatible `.err` files. Vanilla and Elden Ring Reforged datasets are supported, but the filename alone does not establish compatibility with a mod or game update.

## Features and boundaries

- Searchable maps of the Lands Between, underground areas, and the Realm of Shadow.
- Category filters and collected, available, locked, or unknown states based on saved event flags.
- Last saved character location, lost runes, equipment, inventory, and storage.
- Item details and an enemy database with NG-cycle comparisons.
- Browser file selection, read-only persistent file handles where supported, and an optional Save Bridge on the game host.

Saves are parsed in a browser Web Worker and are not uploaded to the application server. Save Bridge sends a snapshot directly to an authorized browser and exposes no save-writing endpoint. Progress reflects the **last disk save**, not live game state.

GEOM/GEOF collection tracking, parts of equipment/effect interpretation, NPC quest graphs, and mobile layouts are incomplete. Local exploration-fog rendering is paused. Insufficient evidence stays unknown rather than being inferred from an empty inventory.

## Requirements

| Component | Tools |
| --- | --- |
| Web application | Node.js 24 or a compatible newer version; pnpm **11.19.0**, pinned in `package.json` |
| Server and Save Bridge | JDK **25**, Maven **3.9+** |
| Data tools and tests | Python **3.12+**; Pillow for image generation |
| Optional map generation | Rust/Cargo, WitchyBND 3.x, locally unpacked game resources; JPEXS FFDec for the game font |
| Optional containers | Docker Engine with Docker Compose v2 |

You can manage tools with [mise](https://mise.jdx.dev/) and prefix the commands below with `mise exec --`. Otherwise, place them on PATH. Python must also be visible to the shell used by package scripts; separate test commands are provided below.

Local checks have used Java 25, Maven 3.9.11, Node 26.3.0, and Python 3.14.6. Container configuration uses Node 24. This does not establish support for every browser or operating system.

## Run the web application

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The default page is the map; `?page=items` and `?page=monsters` open the databases. The side control bar contains save connection and character panels.

**Game datasets are not included.** A fresh checkout builds and starts the development server, but data-dependent views report missing resources until you supply a locally generated bundle. The application does not download game assets for you.

To run the optional application server in a second terminal:

```sh
mvn -f apps/server/pom.xml spring-boot:run
```

It listens on port 8080 and provides `/api/v1/system/info` and `/actuator/health`. Vite proxies `/api` and `/actuator` during development. There is no account database or save-upload service.

## Prepare local game data

Use a legally obtained installation and matching game/mod resources. Keep each version's regulation, maps, scripts, text, and textures together. Outputs go under `runtime/assets/`; intermediate files go under `runtime/work/`. Both are excluded from Git.

The entry point is `runtime/assets/dataset-index.v1.json`, with per-profile manifests under `datasets/<profile>/`. Manifests reference content-addressed resources. The last audited data baseline was App/Calibrations **1.17/1.17**; later inputs require a new audit. Enemy numbers may come from a community-workbook version different from the official text version; manifests retain that distinction.

| Guide | Output |
| --- | --- |
| [Source manifests](tools/game-data/README.md) | Game/tool fingerprints and version comparisons |
| [Marker datasets](tools/data-builder/README.md) | Profile markers and categories from the reference pipeline |
| [Maps and text](tools/map-assets/README.md) | Map tiles, reveal layers, and text exports |
| [Map icons](tools/icon-assets/README.md) | Official/MFG atlases and map facilities |
| [Items](tools/item-data/README.md) | Parameters, localized text, and images |
| [Enemies](tools/monster-data/README.md) | Data from an explicitly supplied reference workbook |

These are offline developer tools, not a one-command game extractor. Install third-party tools and prepare upstream generated inputs separately. Specific Nuxe/WitchyBND distributions may require Windows. Open-source code does not grant permission to redistribute extracted game content.

Vite serves `runtime/assets/` at the site root and copies it into local production builds. Use build-time `VITE_MFG_ASSET_BASE_URL` for another asset host. The Java server uses `MFG_ASSETS_DIRECTORY` for a read-only directory and `MFG_ASSET_BASE_URL` for its public URL. See [`.env.example`](.env.example). Offline CLI tools read explicit arguments or exported environment variables; they do not automatically load `.env`.

## Optional Save Bridge

Run Bridge on the computer holding the save. It serves one configured file, supports short-lived one-time pairing links, and listens on loopback by default.

```sh
mvn -f pom.xml -pl apps/save-bridge -am package
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --web-url "http://localhost:5173"
```

For another device, build the frontend and serve it from Bridge in same-origin mode:

```sh
pnpm build
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --lan --advertise-host "GAME-PC-LAN-IP" --web-root "apps/web/dist"
```

Open the printed connection link. `--lan` explicitly enables network listening; use it on a trusted network. Remote HTTP pages may lack browser file-picker capabilities, but Bridge mode does not require those capabilities. See [the Bridge guide](apps/save-bridge/README.md) for more options.

## Build and test

```sh
pnpm typecheck
pnpm --filter @mfg/web test
python tools/monster-data/build_monster_data_test.py
python tools/item-data/build_item_data_test.py
node --test tools/data-builder/*.test.mjs tools/game-data/*.test.mjs tools/save-analysis/*.test.mjs
mvn -f pom.xml test
pnpm build
```

`pnpm test` combines the Python, Web, and Node tests when Python is on the package-script PATH. Optional local-resource/save tests skip when inputs are absent. No real saves are distributed as fixtures. Source tests do not certify untested game versions or in-game behavior.

Web output is `apps/web/dist/`. Maven modules can be packaged separately. A plain server JAR built by Maven alone does **not** include the frontend; the Docker build integrates it. Bridge's `--web-root` mode is another combined local option.

## Containers

```sh
docker compose config
docker compose up --build app
```

Open [http://localhost:8080](http://localhost:8080). Compose mounts `runtime/assets/` read-only. Optional profiles provide a static assets service and Bridge:

```sh
docker compose --profile assets up --build
docker compose --profile bridge up --build save-bridge
```

Set the save directory, container save path, and advertised host before starting the Bridge profile. Building an image does not create game data. Signed native installers are not currently provided.

## Repository layout

`apps/web` contains the React/TypeScript client; `apps/server` the Spring Boot host; `apps/save-bridge` the independent Java reader. `packages` contains protocols and parser-boundary notes. `tools` contains the offline pipeline. Public builds do not depend on a private repository.

## License and acknowledgements

Original project code is licensed under the **GNU GPL version 3 only**, identified as [GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html). See [LICENSE](LICENSE), [NOTICE](NOTICE), and [third-party notices](THIRD_PARTY_NOTICES.md). This does not relicense third-party code or game content.

Thanks to **VirusAlex** for Map for Goblins and his save-format research guidance, **Gacsam** for Goblin-ERR, and the authors of the save parser, MapLibre, and community research tools referenced in the notices. This is an independent fan project, not an official FromSoftware or Bandai Namco product.
