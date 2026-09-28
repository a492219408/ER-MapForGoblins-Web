# Browser save-parser boundary

The implementation currently lives in `apps/web/src/save-parser.worker.ts`; this directory is not an independently published npm package.

The Worker uses `@zebbedaja/er-save-parser` for the PC BND4 container and combines it with narrow parsers for map state and character equipment/inventory. Input buffers are transferred from the main thread. Output snapshots include `schemaVersion: 1`, active slots, character/loadout summaries, map evidence, and compact marker-state arrays for the selected dataset.

Parsing is read-only and remains in the browser. Supported layouts are explicitly checked; unknown layouts and truncated input must fail instead of being silently misread. A filename extension does not establish compatibility.

Event flags currently drive collection state. GEOM/GEOF-only markers and permanent facilities without collection evidence remain `UNKNOWN`. The other states are `AVAILABLE`, `COLLECTED`, and `LOCKED`; inventory absence is not proof of non-collection.

All-message protocol versioning and additional state parsing remain work in progress. See [third-party notices](../../THIRD_PARTY_NOTICES.md) for parser and research provenance.
