# Save Bridge

A Java 25, read-only bridge for one configured PC save. It has no directory listing, arbitrary-path API, or write endpoint. Saves go directly to the browser parser, not through the application server.

## Build and run

Run from the repository root:

```sh
mvn -f pom.xml -pl apps/save-bridge -am package
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --web-url "http://localhost:5173"
```

The default bind address is `127.0.0.1:51337`. For another device, use `--lan` and an explicit `--advertise-host` when automatic address selection is unsuitable.

## Same-origin web mode

```sh
pnpm build
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --lan --advertise-host "GAME-PC-LAN-IP" --web-root "apps/web/dist"
```

The printed pairing link opens the frontend served by Bridge. Supply generated game assets before building if you need the map/databases. This mode avoids a remote HTTPS site's cross-origin access to a local HTTP bridge.

## Pairing and configuration

Pairing uses a 256-bit random token in the link fragment. It expires after ten minutes and is consumed once; generating a new link invalidates the previous unused token. Failed attempts are rate-limited. Authenticated status/save requests require a Bearer token and accepted Origin.

The CLI accepts `status`, `link`, and `stop`. Use `--no-console` for a supervised process, `--config <file>` for an explicit configuration file, and `--help` for all supported options. Configuration is stored on the Bridge host and includes the save path and access token. Do not publish it or pairing links.

The [versioned protocol](../../packages/bridge-protocol/README.md) defines health, pairing, status, and stable-snapshot endpoints. A snapshot represents the last disk save.

## Containers and packaging

The root Compose file has a `bridge` profile. Set `BRIDGE_SAVE_DIRECTORY`, `BRIDGE_SAVE_PATH`, and `BRIDGE_ADVERTISE_HOST` before using it. The save mount is read-only.

The Docker frontend is built with `/game-assets` as its asset base. Compose mounts `runtime/assets/` read-only at `/opt/mfg/web/game-assets`, separately from the bundled JS/CSS. This does not embed game resources into the image. Missing static files return 404; only `/` serves `index.html` (page selection uses query parameters and pairing uses a URL fragment).

`jpackage` can create a platform-specific app image from the JAR using Java 25. A signed, automated multi-platform installer pipeline is not included. See the [main README](../../README.md) for development requirements and licensing.
