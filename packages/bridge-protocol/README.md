# Bridge protocol

[bridge-protocol-v1.schema.json](bridge-protocol-v1.schema.json) describes the versioned JSON contract used by the web client and Save Bridge.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Unauthenticated version and readiness check |
| `POST /v1/pair` | Consume a one-time pairing credential and obtain an access token |
| `GET /v1/status` | Authenticated save metadata and revision |
| `HEAD /v1/save`, `GET /v1/save` | Authenticated stable, read-only snapshot |

Pairing credentials are placed in a URL fragment so opening the page does not send them to the application server. The browser fetches bytes from Bridge and parses them in its own Worker. No save-write or arbitrary-path endpoint is part of this protocol.

This directory is a contract, not an independently published npm package. See [Save Bridge](../../apps/save-bridge/README.md) for running the service.
