# 10: Streamline Android selfhost release CI workflow to single arm64 BOOX-enabled APK

**What to build:** Update the fork's Android `selfhost release` GitHub Actions workflow so CI installs only the `aarch64-linux-android` Rust target, builds a single unified `arm64` APK with `booxPen` enabled under the isolated `com.bilingify.readest.selfhost` package ID, and uploads only `Readest_<version>_arm64.apk` to workflow artifacts and GitHub Releases — retiring the slow four-architecture `universal` build.

**Blocked by:** 01: Isolate Android selfhost package, enable BOOX stylus by default, and prune manifest/deep-links (P17), 02: Disable Android Auto across all flavors and unmount car-media runtime bridge (P18)

**Status:** completed

- [x] Rust toolchain setup in the Android workflow installs only `aarch64-linux-android` (removing `armv7-linux-androideabi`, `i686-linux-android`, and `x86_64-linux-android`).
- [x] The build step sets `ORG_GRADLE_PROJECT_penFlavor=booxPen` explicitly alongside the default Gradle setting, runs only the `aarch64` Android build, and produces `Readest_<version>_arm64.apk` without running the duplicate `universal` build.
- [x] Release upload and workflow artifact upload steps reference only `Readest_<version>_arm64.apk` with `if-no-files-found: error` preserved.
- [x] Workflow YAML syntax and action step inputs are validated cleanly.
- [x] Committed in its own dedicated CI commit (separate from `patch(P<n>)` commits per fork commit-shape rules).
