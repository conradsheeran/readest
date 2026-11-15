# Self-hosted deep prune — specification

Second-wave thin-patch specification for pruning residual official-service
surfaces, isolating the Android package for side-by-side installation, enabling
BOOX EMR stylus hardware acceleration by default, and streamlining the Android
`selfhost release` build on top of `upstream release` `v0.12.20` (with existing
patches `P1`–`P16` applied).

Status: **Applied** — `P17`–`P25`, the single-`arm64` Android CI workflow, and `deploy/` documentation updates are in place on `v0.12.20`.

---

## Problem Statement

Even after the initial self-hosting and paywall-residue patches (`P1`–`P16`), a
reader using this deployment across Web, an Android phone, and a BOOX Android
E-ink tablet still encounters upstream surfaces and packaging choices built for
Readest's commercial multi-tenant service:

1. **Android package collision and missing E-ink stylus acceleration.** The
   self-hosted APK still shares upstream's `com.bilingify.readest` application
   ID, preventing side-by-side installation with the official Readest release on
   the same phone or E-ink device. Default Android builds also select the no-op
   stylus flavor rather than the Onyx Pen SDK flavor, leaving BOOX EMR stylus
   handwriting on high-latency WebView pointer events, while the CI workflow
   spends roughly an hour compiling a four-architecture universal APK in
   addition to `arm64`.
2. **Residual Android permissions, deep-links, and form-factor declarations.**
   The Android manifest and mobile configuration still declare Google Play
   billing and package-install permissions, Android TV leanback entries,
   Android Auto car-media metadata and its runtime bridge, an `autoVerify` App
   Link for `web.readest.com`, and official Google Drive / OneDrive OAuth
   redirect schemes that a self-hosted build cannot or does not use.
3. **Dead or misleading UI controls and silent upstream network calls.** New
   installations still roll a 10% bucket that displays a telemetry consent
   dialog despite PostHog being blanked, while Settings and the Command Palette
   still expose telemetry toggles. The sign-in view still displays four OAuth
   provider buttons (`Google`, `Apple`, `GitHub`, `Discord`) unbacked by the
   self-hosted GoTrue deployment. Three book menus still offer `Share Book`,
   which generates broken `web.readest.com` share links. TTS settings still list
   the official cloud `Readest Voice` provider. Settings Integrations and the
   Library Import menu still expose eleven unconfigured third-party sync/social
   connectors and three brittle scraper/browser import entries alongside the
   connectors that actually work. About and Profile screens still render
   upstream support/legal links, and logged-out Web sessions still fetch demo
   books from `storage.readest.com`.

---

## Solution

Apply a focused sequence of nine single-purpose source patches (`P17`–`P25`),
paired with separate Android CI and deployment documentation updates, that follow
the fork's thin-patch invariants (ADR-0001 through ADR-0004):

- **Isolate and tailor the Android APK (`P17`, `P18`, plus CI workflow):**
  Switch the default Android application ID to `com.bilingify.readest.selfhost`
  while keeping the launcher display name `Readest` so the self-hosted APK
  coexists cleanly alongside the official app. Enable the BOOX stylus flavor by
  default so BOOX E-ink devices get low-latency Onyx raw drawing while regular
  Android phones automatically fall back to standard pointer events at runtime.
  Strip unused install/billing permissions, Android TV leanback declarations,
  Android Auto metadata and its root React bridge, official `web.readest.com`
  App Links, and Google Drive / OneDrive OAuth deep-links, while preserving LAN
  cleartext HTTP, external storage access, home-screen widgets, `Save Book
  Cover`, and third-party dictionary / AnkiDroid intent queries. Narrow the
  Android `selfhost release` workflow to a single unified `arm64` APK.
- **Prune dead and official-only client surfaces (`P19`–`P25`):**
  Permanently silence the new-user telemetry consent prompt and hide telemetry
  toggles; restrict the authentication view to email and password; remove
  `Share Book` from all three book/reader menus; short-circuit the official
  `Readest Voice` TTS provider so only System, Edge, and Custom OpenAI TTS
  appear; narrow Integrations (and its Data Flow view) to the seven working
  self-hosted/local connectors; narrow the Library Import menu to the four
  working local/OPDS import paths; stub upstream support/legal link blocks; and
  stop logged-out Web sessions from fetching demo books from upstream storage.
- **Preserve rebase ergonomics toward upstream `1.0`:**
  Leave dependency manifests, lockfiles, Rust/Gradle dependency graphs, server
  API routes, persisted settings/sync schemas, and all 33 locale JSON trees
  untouched, registering every source `patch` in the `patch ledger` in the same
  commit.

---

## User Stories

1. As an Android phone or BOOX E-ink user, I want the self-hosted APK to use an independent application ID (`com.bilingify.readest.selfhost`), so that I can install and use it side by side with the official Readest app without package or signature conflicts.
2. As an Android user, I want the app launcher label to remain `Readest`, so that my home screen and E-ink app drawer stay clean without verbose suffixes.
3. As an Android user running both official and self-hosted Readest, I want FileProvider authorities and home-screen widgets to bind dynamically to the installed package name, so that installation, file sharing, and bookshelf/reading widgets work without authority collisions.
4. As a BOOX E-ink tablet reader with an EMR stylus, I want the APK built with BOOX Pen SDK support by default, so that handwritten annotations render directly on the E-ink panel with low latency.
5. As an Android phone reader installing the same `arm64` APK, I want BOOX raw-drawing initialization to detect hardware capabilities at runtime and fall back cleanly to standard pointer events on non-BOOX devices, so that a single APK works reliably across both my phone and my BOOX reader.
6. As a self-hosted operator, I want the Android CI workflow to build and publish a single `arm64` APK rather than both `universal` and `arm64` variants, so that release builds finish much faster while covering all target phones and BOOX devices.
7. As a privacy-conscious Android user, I want `REQUEST_INSTALL_PACKAGES` and `com.android.vending.BILLING` removed from the APK manifest, so that the self-hosted app requests neither sideload-installer nor Google Play billing privileges.
8. As an Android phone and E-ink user, I want Android TV leanback features/categories and Android Auto declarations/bridges disabled across all flavors, so that the app never advertises unused TV or automotive surfaces or runs idle car-media synchronization hooks.
9. As an Android user, I want `web.readest.com` App Links and official Google Drive / OneDrive OAuth redirect schemes removed from the APK, so that the self-hosted app does not hijack official Readest web links or claim third-party OAuth callbacks it cannot complete.
10. As an Android user signing into my self-hosted server, I want the `readest://` custom deep-link scheme and all ebook MIME/extension associations and system Share targets preserved, so that auth callbacks and opening ebooks from file managers or other apps continue to work.
11. As a self-hosted reader on a home LAN, I want cleartext HTTP support (`usesCleartextTraffic`), external storage access, third-party dictionary `PROCESS_TEXT` queries, and AnkiDroid queries preserved on Android, so that local OPDS/WebDAV/KOReader Sync servers, local SD/storage folders, popup dictionaries, and flashcard export keep working seamlessly.
12. As a BOOX E-ink reader, I want `Save Book Cover` preserved on book menus, so that I can still export book covers for E-ink sleep/lock screens.
13. As a new user opening the Web app or Android APK on a fresh profile, I want telemetry consent to default silently to opted-out without ever rolling into a consent modal, so that I am never prompted to send analytics when PostHog is disabled.
14. As a reader using Settings or the Command Palette, I want telemetry switches and toggle commands hidden, so that I am not presented with non-functional analytics controls.
15. As a user signing into the self-hosted deployment, I want the authentication screen to show only email and password fields without Google, Apple, GitHub, or Discord OAuth buttons or the `"or continue with email"` divider, so that every visible sign-in path is backed by the deployment's `email allowlist` and GoTrue server.
16. As a reader browsing my bookshelf, viewing book metadata, or adjusting the reader View Menu, I want `Share Book` hidden in all three places while keeping every layout and reading mode intact, so that I never trigger dead links pointing at `web.readest.com`.
17. As a listener using Read Aloud (TTS), I want the official `Readest Voice` cloud provider disabled and absent from the voice selector and voice library without firing `/tts/readest` warmup requests, so that only working engines (System TTS, Edge TTS, and Custom OpenAI-compatible TTS) appear.
18. As a reader using translation, I want built-in translation providers, the DeepLX adapter (`P6`), and Custom LLM translation left untouched when pruning TTS, so that in-book translation continues to work out of the box.
19. As a reader configuring sync and external tools in Settings → Integrations, I want to see only the seven connectors supported in my self-hosted workflow (`Readest Cloud`, `WebDAV`, `S3`, `Obsidian`, `KOReader Sync`, `OPDS Catalogs`, and `Nearby BookDrop`) and have the Data Flow diagram reflect only those active connectors, so that the settings panel isn't cluttered with eleven unconfigured cloud/social integrations.
20. As a reader importing books into my library, I want the Import menu to list only `From Local File`, `From Directory`, `From Pasted Text`, and `OPDS Catalogs`, so that unsupported scraper, RSS feed, and embedded-browser import options stay out of the way.
21. As a reader opening the About dialog or my user profile page, I want upstream Discord/GitHub/feedback/translation support links and official Terms/Privacy/Contact legal links hidden, so that the UI feels like a self-contained private deployment.
22. As a visitor opening the self-hosted Web app before signing in, I want the empty library to stay empty rather than fetching sample ebooks from `storage.readest.com`, so that logged-out sessions make zero outbound requests to Readest's CDN.
23. As the maintainer of this fork, I want every upstream source change isolated into one atomic commit per `patch`, paired with its `patch ledger` update and zero dependency or i18n churn, so that rebasing `main` onto future `upstream release` tags up to `1.0` stays fast and low-conflict.

---

## Implementation Decisions

### Architectural & Fork Constraints

- **Configuration before patches (ADR-0001, ADR-0003, ADR-0004):** Where behavior is already controlled by `baked configuration` or `runtime configuration` (blanked PostHog/Stripe keys, disabled Sentry DSN, `NEXT_PUBLIC_DISABLE_UPDATER`, raised fixed quotas), existing configuration mechanisms remain authoritative; source patches are added only where upstream behavior is hardcoded in manifests, Gradle logic, providers, or JSX trees.
- **Thin-patch boundaries:** Dependency manifests, lockfiles, root pnpm dependency patches, server-side API handlers, database migrations, and persisted user settings / book / connector serialization types remain untouched. Hiding UI connectors or import options happens strictly at the presentation/registration layer so existing stored JSON configurations remain valid across upgrades.
- **Zero i18n key churn:** Because English UI strings double as i18next lookup keys across 33 locale bundles, patches only remove or short-circuit UI elements and never introduce or reword user-visible strings.
- **Atomic commit layout:** Source changes are split into nine single-purpose commits (`P17`–`P25`), each updating the `patch ledger` to `applied` in the same commit. Changes to the Android CI workflow and `deploy/` documentation land in separate non-patch commits so `git log upstream..main` remains cleanly replayable during rebases.

### Patch Breakdown (`P17`–`P25`)

- **`P17` — Android package isolation, default BOOX stylus flavor, and manifest/deep-link pruning:**
  - Change the default Android `applicationId` to `com.bilingify.readest.selfhost`, while allowing override via a Gradle project property or environment variable so custom builds remain configurable without source edits; also update the local Android CDP e2e runner (`scripts/test-android.sh` and `src/__tests__/android/helpers/reader.ts`) to default to `com.bilingify.readest.selfhost` with `ANDROID_APPLICATION_ID` override. Keep the Kotlin/Android `namespace` (`com.bilingify.readest`), Tauri bundle `identifier`, and launcher `app_name` (`Readest`) unchanged.
  - Default `penFlavor` to `booxPen` (instead of `genericPen`) consistently across both the Android application Gradle module and the native-bridge Android plugin module — ensuring all `penFlavor` checks (missing-dimension strategy, BOOX Maven repository declaration in both modules, `libc++_shared` packaging pick-first rule, and pre-stripped `libneo_pen` / `libc++` exclusions during NDK `llvm-strip`) resolve to `booxPen` unless explicitly overridden to `genericPen`. Keep `storeFlavor` defaulted to `foss`.
  - Remove `android.permission.REQUEST_INSTALL_PACKAGES` and `com.android.vending.BILLING` permissions, and remove Android TV `android.software.leanback` feature and `LEANBACK_LAUNCHER` intent category from the Android manifest.
  - Remove the `https://web.readest.com` (`autoVerify="true"`) App Link, the Google Drive reverse-DNS OAuth redirect scheme, and the `readest-onedrive` OAuth redirect scheme from both the Android manifest (hand-written and deep-link plugin blocks) and the Tauri mobile deep-link configuration, retaining the `readest` custom scheme and all ebook MIME/file-extension associations and `SEND` / `SEND_MULTIPLE` share-in intent filters.
  - Preserve `usesCleartextTraffic="true"`, `MANAGE_EXTERNAL_STORAGE`, `${applicationId}.fileprovider`, home-screen widget receivers, and native-bridge `<queries>` (`PROCESS_TEXT` and `com.ichi2.anki`).

- **`P18` — Disable Android Auto across all flavors and unmount the car-media runtime bridge:**
  - Resolve the Android manifest `carAppMetaName` placeholder unconditionally to the inert `com.bilingify.readest.androidauto.withheld` value in all store flavors (rather than withholding it only for `googleplay`), preventing Android Auto from discovering the app as a car media service.
  - Unmount the car-media library bridge component from the root React providers tree so no car-media listeners, book-list projections, or native bridge calls run at boot, while leaving the bridge module's exported pure helper functions intact so upstream unit tests for that module require no invasive rewrite.

- **`P19` — Silence telemetry consent prompts and hide user-facing telemetry controls:**
  - Update boot-time telemetry consent resolution in the root providers tree so undecided (`null` or stale `pending`) and stale `opt-in` profiles unconditionally record silent `opt-out` and reconcile `telemetryEnabled` to `false`, and never roll into the 10% consent dialog bucket or invoke the prompt callback.
  - Hide the telemetry opt-in switch in the Settings Control panel and omit the telemetry toggle command from the Command Palette action list.

- **`P20` — Restrict authentication UI to email and password:**
  - Remove the OAuth provider button group (`Google`, `Apple`, `GitHub`, `Discord`) and the `"or continue with email"` visual divider from the authentication panel, leaving email/password sign-in, sign-up (governed server-side by the `email allowlist`), and password recovery flows intact.

- **`P21` — Remove `Share Book` across all three book and reader surfaces:**
  - Remove the `Share Book` action item (and any orphaned adjacent menu separator) from the Reader View Menu, the Library bookshelf item context/action menu, and the Book Detail metadata modal/sheet. Preserve all reading layout controls (scrolled/paginated, dual-page, animations, margins, E-ink mode) and preserve `Save Book Cover`.

- **`P22` — Disable the official `Readest Voice` cloud TTS provider:**
  - Short-circuit the official `Readest Voice` TTS provider so availability checks report unavailable, initialization and voice listing return immediately with an empty voice list without contacting `/tts/readest`, and synthesis never issues upstream requests. Hide `Readest` from TTS voice-library provider tabs/filters if rendered statically, leaving System TTS, Edge TTS, and Custom OpenAI-compatible TTS untouched. Leave all text translation services unchanged.

- **`P23` — Slim Settings Integrations and Data Flow to the seven supported connectors:**
  - Filter the Settings Integrations panel and its accompanying Data Flow visualization so only the seven supported self-hosted/local connectors render:
    1. `Readest Cloud`
    2. `WebDAV`
    3. `S3`
    4. `Obsidian`
    5. `KOReader Sync`
    6. `OPDS Catalogs`
    7. `Nearby BookDrop` (LocalSend)
  - Hide `Google Drive`, `OneDrive`, `iCloud`, `Notion`, `Audiobookshelf`, `Readwise`, `Hardcover`, `Pagebound`, `BookOrbit`, `Grimmory`, and `Discord Rich Presence` (alongside `Send to Readest`, already hidden by `P13`), without deleting their underlying connector modules or TypeScript settings definitions.

- **`P24` — Slim the Library Import menu to local and OPDS sources:**
  - Retain `From Local File`, `From Directory`, `From Pasted Text`, and `OPDS Catalogs` in the Library Import menu, and hide `From Web Novel`, `From Feed URL`, and `From Web Browser`.

- **`P25` — Stub upstream external link blocks and disable logged-out demo book fetches:**
  - Turn the shared Support Links and Legal Links components into null-rendering stubs so neither the About window nor the User Profile view displays links to Readest's official Discord, GitHub, translation portal, feedback form, Terms of Service, Privacy Policy, or Contact address.
  - Short-circuit the demo-books hook to return an empty array immediately without reading or fetching remote demo book assets from `storage.readest.com` when the library has no signed-in user.

### Separate CI & Documentation Updates (Non-Patch Commits)

- **Android `selfhost release` workflow streamlining:**
  - Install only the `aarch64-linux-android` Rust target, build only the `aarch64` APK with `ORG_GRADLE_PROJECT_penFlavor=booxPen` set explicitly alongside the new default, and publish `Readest_<version>_arm64.apk` as the sole release/workflow APK artifact, retiring the four-target `universal` build.
- **Deployment documentation reconciliation:**
  - Update the Android build guide and known-limitations documentation under `deploy/` to document side-by-side installation (`com.bilingify.readest.selfhost`), the `Readest` launcher name, default BOOX EMR stylus support with automatic phone fallback, single `arm64` APK output, and the newly pruned UI surfaces.

---

## Testing Decisions

### Principles for Good Tests

- Tests must assert **observable external contracts** — rendered DOM output, absence of forbidden network calls, returned provider/hook values, and packaged manifest/Gradle declarations — never private component state or internal helper structure.
- Every behavioral change follows the repository's test-first acceptance rule: write or update an assertion that fails against the unpatched behavior before applying the `patch`, then run the full Vitest suite and linter (`pnpm test` and `pnpm lint`, plus Rust formatting/clippy/unit checks when Tauri configuration changes) to confirm zero regressions across upstream suites.
- Existing test seams are reused everywhere; no new test harness or framework is introduced.

### Agreed Testing Seams & Prior Art

1. **Seam 1 — Android Native Declarations Seam (Static Manifest / Gradle / Tauri Contract):**
   - **Modules covered:** Android manifest, Android app and native-bridge Gradle configurations, and Tauri mobile deep-link configuration (`P17`, `P18`).
   - **Observable assertions:** Default `applicationId` is `com.bilingify.readest.selfhost` with property override support; launcher label resource remains `Readest`; `penFlavor` defaults consistently to `booxPen` across app and native-bridge Gradle configurations; `carAppMetaName` resolves unconditionally to `com.bilingify.readest.androidauto.withheld`; `REQUEST_INSTALL_PACKAGES`, `com.android.vending.BILLING`, `leanback`, `web.readest.com` App Link, and Google Drive / OneDrive OAuth schemes are absent; `readest` auth scheme, `usesCleartextTraffic`, `${applicationId}.fileprovider`, and dictionary/Anki `<queries>` remain present.
   - **Prior art:** Existing Android Auto declarations static Vitest suite that inspects Android manifest and Gradle configuration declarations directly.

2. **Seam 2 — Rendered UI & Root Provider Surface Seam (Testing Library Component Contract):**
   - **Modules covered:** Root `Providers` container (`P18`, `P19`), Settings Control panel and Command Palette (`P19`), Authentication panel (`P20`), Reader View Menu / Library Bookshelf context menu / Book Detail view (`P21`), Settings Integrations panel and Data Flow view (`P23`), Library Import menu (`P24`), and About / Support / Legal link views (`P25`).
   - **Observable assertions:** Root providers do not mount the car-media bridge and never invoke the telemetry consent modal for new or undecided profiles; telemetry switches/commands do not render; `AuthPanel` renders email/password inputs and omits all four OAuth provider buttons and the divider; `Share Book` is absent from all three book/reader surfaces while `Save Book Cover` and layout controls still render; `IntegrationsPanel` and `Data Flow` render the seven kept connectors and omit the eleven pruned ones; `ImportMenu` renders the four kept import actions and omits Web Novel / Feed URL / Web Browser; `SupportLinks` and `LegalLinks` render empty output.
   - **Prior art:** Existing component render suites for `IntegrationsPanel` (used by `P13` to verify `Send to Readest` removal and `OPDS Catalogs` presence), `AuthPanel`, `ControlPanel`, `ViewMenu`, `BookDetailView`, `ImportMenu`, and `AboutWindow`.

3. **Seam 3 — Service & Hook Boundary Seam (Zero-Network Short-Circuit Contract):**
   - **Modules covered:** Official `ReadestVoiceProvider` (`P22`) and `useDemoBooks` (`P25`).
   - **Observable assertions:** `ReadestVoiceProvider` reports unavailable, returns an empty voice list, and performs zero `fetch` requests during initialization or synthesis; `useDemoBooks` returns an empty list for unauthenticated sessions without requesting remote catalog or `.epub` assets from `storage.readest.com`.
   - **Prior art:** Existing `ReadestVoiceProvider` unit suite, TTS Voice Library / Player Sheet suites (`P14`), and demo-books synchronization suite.

---

## Out of Scope

- **Desktop (macOS / Windows / Linux) and iOS Tauri builds:** Only the Docker Web/API deployment and the `arm64` Android APK (phone + BOOX E-ink) are targeted.
- **Dependency, lockfile, or bundle surgery:** Removing unused npm packages, Rust crates, or Gradle dependencies, or editing `package.json`, `pnpm-lock.yaml`, or root pnpm `patches/`, is intentionally excluded to keep future upstream rebases conflict-free.
- **Server-side API or schema changes:** Next.js `/api/*` endpoints, Supabase/GoTrue schema objects, and client sync/settings serialization schemas remain unchanged.
- **Runtime server URL switcher on Android:** Rejected per ADR-0004; server endpoints remain baked at build time via `.env.local`.
- **Translation service pruning:** Built-in translation fallbacks, the DeepLX adapter (`P6`), and Custom LLM translation remain intact.
- **Android LAN/storage/E-ink capabilities:** `usesCleartextTraffic`, `MANAGE_EXTERNAL_STORAGE`, Android home-screen widgets, `Save Book Cover`, and third-party dictionary (`PROCESS_TEXT`) / AnkiDroid queries are intentionally kept.
- **Adding or editing localized strings:** No locale JSON files are touched and no new user-visible strings are introduced.

---

## Further Notes

- **First-install migration note for existing self-hosted Android users:** Changing `applicationId` from `com.bilingify.readest` to `com.bilingify.readest.selfhost` causes Android to treat the new APK as a separate application rather than an in-place upgrade over a previously installed `com.bilingify.readest` self-hosted build. Signing into the self-hosted server in the new app restores synced library books, annotations, and reading progress; the legacy `com.bilingify.readest` copy can then be uninstalled (or replaced with the official Play/GitHub Readest app). Keep signing `com.bilingify.readest.selfhost` with the deployment's stable keystore for all subsequent upgrades.
- **BOOX Onyx Pen SDK runtime safety on non-BOOX phones:** Linking `booxPen` compiles the Onyx Pen SDK into the single `arm64` APK, while runtime activation remains gated on three checks inside the native-bridge controller: manufacturer/brand matching `onyx` or `boox`, presence of a true EMR stylus digitizer (`SOURCE_STYLUS` without capacitive `AXIS_TOUCH_MAJOR`), and a `try/catch`-guarded `EpdController.getMaxTouchPressure()` probe. On standard Android phones, `canRawDraw()` returns `false` before any Onyx view helper is opened, leaving pointer-event handwriting and touch scrolling unaffected.
- **Suggested patch execution order:** Apply `P17` → `P18` → `P19` → `P20` → `P21` → `P22` → `P23` → `P24` → `P25` as sequential `patch(P<n>)` commits (each bundling its test reconciliation and `patch ledger` update), followed by the Android workflow commit and the `deploy/` documentation commit.
