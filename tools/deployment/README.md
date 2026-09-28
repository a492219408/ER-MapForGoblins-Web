# Deployment checks

From the repository root, check a running application server:

```sh
mise exec -- node tools/deployment/smoke-test.mjs http://localhost:8080/
```

This checks readiness, the system API, and the JavaScript/CSS referenced by the HTML. A healthy Java process alone does not prove that the web application can load.

After mounting your generated game bundle, check manifests and their referenced JSON catalogs, including hashes where provided:

```sh
mise exec -- node tools/deployment/smoke-test.mjs http://localhost:8080/ --assets
```

For the optional standalone assets service:

```sh
mise exec -- node tools/deployment/smoke-test.mjs http://localhost:8080/ --assets --asset-base http://localhost:8081/assets/
```

The command exits nonzero on failure and prints a JSON report. It does not upload saves, pair with Bridge, run a browser, or check every image/tile. Browser interaction and save compatibility require separate checks.
