# 08: Slim Library Import menu to local and OPDS sources (P24)

**What to build:** Narrow the Library Import menu (`P24`) so readers on Web, Android phones, and BOOX E-ink devices see only the four reliable local and self-hosted catalog import options (`From Local File`, `From Directory`, `From Pasted Text`, and `OPDS Catalogs`), hiding the brittle web-novel scraper, RSS feed importer, and embedded web-browser importer.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P24` when committing to `main`)

**Status:** completed

- [x] The Library Import popup menu retains `From Local File`, `From Directory` (where supported by the platform), `From Pasted Text`, and `OPDS Catalogs`.
- [x] `From Web Novel`, `From Feed URL`, and `From Web Browser` (plus any orphaned menu separators) are hidden from the Library Import popup menu across all platforms.
- [x] Underlying import dialog modules and locale JSON bundles are not deleted or modified so rebase conflict surface stays minimal.
- [x] Test-first component render assertions at the Rendered UI Surface seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass.
- [x] Committed atomically as `patch(P24)` with `P24` registered as `applied` in the `patch ledger` in the same commit.
