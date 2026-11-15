# 02: Disable Android Auto across all flavors and unmount car-media runtime bridge (P18)

**What to build:** Completely disable Android Auto discovery and runtime car-media synchronization (`P18`) across every build flavor of this self-hosted fork so the Android APK never advertises an automotive media service and the client application never mounts or runs the car-media library bridge at startup, while keeping the bridge module's exported pure helper functions intact so upstream unit tests for those helpers continue to pass untouched.

**Blocked by:** 01: Isolate Android selfhost package, enable BOOX stylus by default, and prune manifest/deep-links (P17)

**Status:** completed

- [x] The Android `carAppMetaName` manifest placeholder resolves unconditionally to the inert `com.bilingify.readest.androidauto.withheld` value across all store flavors (including `foss`), rather than withholding `com.google.android.gms.car.application` only for `googleplay`.
- [x] The root React providers tree no longer mounts the car-media library bridge component, eliminating boot-time car-media selection listeners, playback source projections, and native bridge invocations.
- [x] The car-media library bridge module's pure helper exports remain intact so existing unit tests exercising its pure projection helpers continue passing without invasive rewrites.
- [x] Test-first assertions at the Android Native Declarations seam and Root Provider Surface seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass with zero dependency, lockfile, or locale churn.
- [x] Committed atomically as `patch(P18)` with `P18` registered as `applied` in the `patch ledger` in the same commit.
