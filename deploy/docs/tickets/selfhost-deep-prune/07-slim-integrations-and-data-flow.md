# 07: Slim Settings Integrations and Data Flow to the 7 supported connectors (P23)

**What to build:** Narrow Settings → Integrations and its Data Flow page (`P23`) so only the seven self-hosted and local connectors actually usable in this deployment (`Readest Cloud`, `WebDAV`, `S3`, `Obsidian`, `KOReader Sync`, `OPDS Catalogs`, and `Nearby BookDrop`) are rendered and health-checked, hiding the eleven unsupported third-party cloud storage, social reading, and desktop presence connectors without altering underlying settings serialization schemas.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P23` when committing to `main`)

**Status:** completed

- [x] Settings → Integrations renders rows only for `Readest Cloud`, `WebDAV`, `S3`, `Obsidian`, `KOReader Sync`, `OPDS Catalogs`, and `Nearby BookDrop` (when supported on the current platform), plus the `Data Flow` entry row.
- [x] `Google Drive`, `OneDrive`, `iCloud`, `Notion`, `Audiobookshelf`, `Readwise`, `Hardcover`, `Pagebound`, `BookOrbit`, `Grimmory`, and `Discord Rich Presence` (along with `Send to Readest`, already hidden by `P13`) do not render in Settings → Integrations.
- [x] The Data Flow visualization and connection health checker only display and probe connectors from the seven kept integrations.
- [x] Connector TypeScript types, persisted settings schemas, and unused connector modules remain untouched so future upstream rebases and existing stored configurations stay compatible.
- [x] Test-first component render assertions for both Integrations and Data Flow at the Rendered UI Surface seam fail before the change and pass after it; targeted Vitest (`IntegrationsPanel*`, `DataFlow*`, `dataFlow*`), `biome check` on modified files, and `tsc --noEmit` pass (full-repo `pnpm test` / `pnpm lint` deferred to integration commit).
- [x] Committed atomically as `patch(P23)` with `P23` registered as `applied` in the `patch ledger` in the same commit.
