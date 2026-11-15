# 11: Reconcile deploy/docs Android and known-limitations documentation

**What to build:** Bring the fork's operational documentation under `deploy/` into full agreement with the completed `P17`–`P25` patches and the streamlined single-`arm64` Android CI workflow so operators and future rebasing agents have an accurate record of side-by-side Android installation, BOOX stylus support, single-architecture CI output, and pruned client surfaces.

**Blocked by:** 01: Isolate Android selfhost package, enable BOOX stylus by default, and prune manifest/deep-links (P17), 02: Disable Android Auto across all flavors and unmount car-media runtime bridge (P18), 03: Silence telemetry consent prompts and hide user-facing telemetry controls (P19), 04: Restrict authentication UI to email and password (P20), 05: Remove Share Book across Reader, Bookshelf, and Book Detail surfaces (P21), 06: Disable official Readest Voice cloud TTS provider (P22), 07: Slim Settings Integrations and Data Flow to the 7 supported connectors (P23), 08: Slim Library Import menu to local and OPDS sources (P24), 09: Stub upstream Support/Legal link blocks and disable logged-out demo books (P25), 10: Streamline Android selfhost release CI workflow to single arm64 BOOX-enabled APK

**Status:** completed

- [x] Android documentation reflects the `com.bilingify.readest.selfhost` default application ID, `Readest` launcher label, first-install migration/coexistence note alongside official Readest, default `booxPen` Onyx Pen SDK support (with runtime fallback on non-BOOX phones), single `aarch64-linux-android` Rust target, and single `Readest_<version>_arm64.apk` build output.
- [x] Known-limitations documentation accurately reflects which upstream features are now cleanly hidden/disabled (`P17`–`P25`) versus what remains supported (`Readest Cloud`, `WebDAV`, `S3`, `Obsidian`, `KOReader Sync`, `OPDS Catalogs`, `Nearby BookDrop`, System/Edge/Custom OpenAI TTS, built-in + DeepLX + Custom LLM translation).
- [x] The deep-prune specification status header is updated from `Draft` to `Applied`.
- [x] Committed in its own dedicated `deploy/` documentation commit, separate from all `patch(P<n>)` commits.
