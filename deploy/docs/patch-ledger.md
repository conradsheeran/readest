# Patch ledger

The authority on what this fork changes in upstream source, and why.

**Each entry's `Status` field is the authority on whether that patch is applied.**
Every entry below is a decision reached and verified against upstream `v0.12.20`.
Implementing an entry means writing the patch *and* moving its status to
`applied` in the same commit, so that the ledger and `git diff upstream..main`
never disagree.

Verified against upstream `v0.12.20` (`28aab23e0`). Line numbers come from that tag
and are a starting point for a search, not an anchor — locate code by its
surrounding text, never by line number.

---

## Part 1 — Changes that need no patch

Read this part before concluding that something requires source surgery. Every
row below was a candidate for a patch and turned out not to need one. Patching
here would buy permanent upgrade cost for nothing.

| Goal | How it is actually done | Documented in |
| --- | --- | --- |
| S3-compatible object storage | `OBJECT_STORAGE_TYPE=s3` plus the `S3_*` variables on the client container. Upstream has supported arbitrary S3 endpoints since it introduced the `s3` storage type. | `deployment.md` |
| Premium features open with or without sign-in | `SELF_HOSTED=true` on the client container. Upstream documents it as unlocking every premium feature with or without a signed-in user; the client-side default when it is absent is P1. | `deployment.md` |
| Quotas decoupled from plans | `STORAGE_FIXED_QUOTA` / `TRANSLATION_FIXED_QUOTA` / `TTS_FIXED_QUOTA`. `utils/access.ts` prefers the fixed value over the per-plan table. `getTTSQuota()` is server-only, so it has no `NEXT_PUBLIC_` form; in Tauri builds the `NEXT_PUBLIC_` forms of the first two are read through P15. | `deployment.md`, `android.md` |
| No Sentry crash reporting | Do not set `SENTRY_DSN`. `src-tauri/src/sentry_config.rs::dsn_from_env` maps unset or empty to `None`, and `scripts/upload-sourcemaps.mjs` no-ops without `SENTRY_AUTH_TOKEN`. Upstream built this for fork builds. | `android.md` |
| Updater toggles hidden in Tauri/Android settings | `NEXT_PUBLIC_DISABLE_UPDATER=true` baked into `.env.local`. `services/nativeAppService.ts::hasUpdater` evaluates to `false`, which hides the Settings → Control "Update" section without a patch. | `android.md`, `ci.md` |
| Signup restricted to an allowlist | GoTrue `before_user_created` hook backed by a database function. Confirmed present in `supabase/auth` v2.185.0 as `HookConfiguration.BeforeUserCreated`. | `deployment.md` |
| Android app talks to our server | Baked configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_NODE_BASE_URL`. The Tauri build has no runtime injection, so these are the whole story. | `android.md` |
| OPDS proxy served by us | On the web, the runtime config's `apiBaseUrl` is used through P5's `getNodeBaseUrl()` fallback chain; on Android, `NEXT_PUBLIC_NODE_BASE_URL` points at our origin. The route `apps/readest-app/src/app/api/opds/proxy/route.ts` ships in our image, so it answers. | `android.md`, `deployment.md` |
| CJK webfonts served by us | `FONT_BASE_URL` for web, `NEXT_PUBLIC_FONT_BASE_URL` for Android. Readest's CDN only sends CORS headers to readest.com origins. | `deployment.md` |
| Tauri CSP permits our server | Nothing to do. `connect-src` in `src-tauri/tauri.conf.json` already contains `https://*:*`. | — |

### Why the plan claim is not used

The obvious way to open every paywall at once is to have GoTrue issue
`plan: 'pro'` in the access token, since every gate reads that claim. It was
considered and rejected. It *opens* the gates, but it simultaneously *reveals* a
"Manage Subscription" button whose visibility condition is `userPlan !== 'free'`
(`apps/readest-app/src/app/user/components/AccountActions.tsx:120`), which then
calls a Stripe endpoint that cannot work here. Measured against a clean
interface, that is a net loss. See ADR-0002.

The consequence for this ledger: plans stay `free`, and gates are opened by
flipping their master switches, which is P1.

---

## Part 2 — The patches

### P1 — Open the premium feature gates

- **Target**: `apps/readest-app/src/utils/access.ts` and
  `apps/readest-app/src/services/runtimeConfig.ts`
- **Change**: flip all five master switches to `false`:
  `CLOUD_SYNC_REQUIRES_PREMIUM`, `TTS_CACHE_REQUIRES_PREMIUM`,
  `ABS_OFFLINE_REQUIRES_PREMIUM`, `ANKI_REQUIRES_PREMIUM`, and
  `NEARBY_PAIRING_REQUIRES_PREMIUM`. Also make `isSelfHosted()` default to
  `true`: it requires all three of `getRuntimeConfig()?.selfHosted !== false`,
  `process.env['SELF_HOSTED'] !== 'false'`, and
  `process.env['NEXT_PUBLIC_SELF_HOSTED'] !== 'false'`. For that to work from the
  browser, `getServerRuntimeConfig()` in `runtimeConfig.ts` preserves an
  explicit `SELF_HOSTED=false` by emitting `selfHosted: false` instead of
  `undefined`. Setting `SELF_HOSTED=false` on the client container therefore
  opts both server routes and the web browser back into upstream's paywall
  behavior. Make `isTTSInPlan()` and `isVoiceTierInPlan()` honor
  `isSelfHosted()` too, so Readest Voice never shows a Plus/Pro badge or an
  upgrade prompt if a voice catalog is ever present or cached.
- **Effect**: third-party cloud sync (WebDAV, Google Drive, S3), the offline
  TTS audio download, Audiobookshelf offline downloads, Anki integration, and
  Nearby BookDrop pairing stop requiring a paid plan. `isSelfHosted()` unlocks
  custom translators, custom TTS, and LAN OPDS catalogs by default across Web,
  Android APK, desktop, signed-out sessions, and unit tests — including
  platforms where the runtime-config flag never reaches the client. Upstream documents the
  switches as master gates ("Every gate goes through `isCloudSyncAllowed`, so
  this flag is the whole toggle"), so no call site needs touching, and the
  Premium badges disappear with the gate.
- **Why not configuration**: compile-time constants, plus an environment default
  whose absence is indistinguishable from "not self-hosted" for Tauri builds.
  The runtime `SELF_HOSTED` flag alone cannot reach those platforms.
- **Tests**: reconciled `tts-cache-plan-gate`, `cloudSync`,
  `abs-offline-plan-gate`, `nearby-pairing-plan-gate`, `customization-access`,
  `useAbsOfflineDownload`, and `ReceiveRequestPairing` to assert the unlocked
  behavior and the `isSelfHosted()` default. `TTSPlayerSheet.test.tsx` (its
  offline-audio cases) is reconciled in P14, because the signed-out gate there
  survived the switch. `useTranslator.test.tsx`'s free-user and signed-out
  fallback cases stub `SELF_HOSTED=false` / `NEXT_PUBLIC_SELF_HOSTED=false` to
  exercise the non-self-hosted path. `send-address-plan-gate.test.ts` also
  stubs both variables, because `isEmailInPlan()` delegates to
  `isCustomizationAllowed()`. `access-tts.test.ts` covers the `isTTSInPlan()` /
  `isVoiceTierInPlan()` self-hosted default and the underlying `TTS_PLANS` table
  with self-hosting disabled. The three Readest Voice route suites —
  `tts-readest-route.test.ts`, `tts-readest-stream-route.test.ts`, and
  `tts-readest-jobs-route.test.ts` — stub `SELF_HOSTED=false` /
  `NEXT_PUBLIC_SELF_HOSTED=false` for upstream's plan/tier gating cases, and
  `tts-readest-route.test.ts` asserts the unlocked self-hosted default on
  `GET /api/tts/readest`. `customization-access.test.ts` covers
  `getServerRuntimeConfig()` — `selfHosted: false` for an explicit
  `SELF_HOSTED=false` and `undefined` when unset — and that
  `window.__READEST_RUNTIME_CONFIG.selfHosted === false` disables
  `isSelfHosted()` in the browser. `catalog-manager.test.tsx` needs no change:
  it mocks `isSelfHosted()` directly. Reconciled after the v0.12.20 sweep:
  `LangPanel.test.tsx` and `TTSPanel.test.tsx` stub `SELF_HOSTED=false` /
  `NEXT_PUBLIC_SELF_HOSTED=false` to exercise upstream's custom-translator and
  custom-TTS paywall; `readest-voice-catalog.test.ts` (plan filtering) and
  `tts-readest-provider.test.ts` (plan-greyed voices) stub both for the same
  reason. `useLibraryRefresh.test.tsx`, `TransferQueuePanel.test.tsx`,
  `runLibrarySync.test.ts`, and `VocabularyView.test.tsx` now assert the
  unlocked cloud-sync and Anki behavior instead of the paused/upgrade path.
- **Conflict risk**: **low.** Boolean literals and one small function in a
  stable file.
- **When it breaks**: the rebase fails on a missing line. Re-locate the switch. If
  upstream has abandoned the master-switch pattern, re-derive the gate list with
  the grep in `upgrade-runbook.md`.
- **Status**: applied

### P2 — Stop fetching subscription plans

- **Target**: `apps/readest-app/src/hooks/useAvailablePlans.ts`
- **Change**: return `availablePlans: []`, `iapAvailable: false`,
  `loading: false`, `error: null` without performing any request.
- **Effect**: three things at once.
  - Stops the unconditional call to `/api/stripe/plans`. That route has no Stripe
    key here and returns 500, and the failure dispatches a toast — so today a
    self-hosted user sees *"Failed to load subscription plans."* on every visit
    to the profile page. This is a live, visible defect, not a theoretical one.
  - Stops the Google Play IAP probe on Android.
  - Hides the "Restore Purchase" button, which is gated on
    `appService?.hasIAP && iapAvailable`.
- **Why not configuration**: `app/user/page.tsx` calls the hook unconditionally.
  Nothing gates it.
- **Conflict risk**: **medium.** The stub must preserve the parameter and return
  shapes its call site destructures. A new upstream field fails at type-check.
- **When it breaks**: `pnpm build-web` reports a type error naming the missing
  field. Add it to the stub.
- **Depended on by**: the "Restore Purchase" button staying hidden. Do not weaken
  `iapAvailable: false` without re-checking that.
- **Status**: applied

### P3 — Remove the plan comparison panel

- **Target**: `apps/readest-app/src/app/user/components/PlansComparison.tsx`
- **Change**: reduce to a component that returns `null`, keeping an optional
  `customizationPurchased?: boolean` in its props interface for the v0.12.20
  call site.
- **Effect**: removes the four-plan comparison carousel from the profile page.
  `app/user/page.tsx` renders it **unconditionally** — it does not check the
  user's plan — so it is visible on every self-hosted deployment regardless of P1
  or of what the plan claim says.
- **Why not configuration**: no flag guards the render.
- **Tests**: `plans-comparison.test.tsx` asserts the stub renders nothing.
- **Conflict risk**: **medium.** Props-shape coupling, as P2.
- **When it breaks**: type error at the call site. Widen the props interface.
- **Status**: applied

### P4 — Remove the upgrade entry from the settings menu

- **Target**: `apps/readest-app/src/app/library/components/SettingsMenu.tsx`
- **Change**: remove the `Upgrade to Readest Premium` menu item, its
  `handleUpgrade` handler, and the `userProfilePlan` binding from the
  `useQuotaStats` destructure once it is unused.
- **Effect**: the upgrade route disappears from the library settings menu.
  Upstream's condition is `user && userProfilePlan === 'free'`, and self-hosted
  users are always `free`, so without this patch it is always shown.
- **Why not configuration**: no flag.
- **Conflict risk**: **high.** An actively developed UI file, and the patch
  removes three separate fragments from it. Expect to redo it by hand on most
  upgrades.
- **When it breaks**: a rebase conflict, or an unused-variable lint error if
  upstream restructures the destructure. Re-apply by intent rather than by patch
  text: find the upgrade item, delete it, then delete whatever that leaves
  unused.
- **Status**: applied

### P5 — Neutralize the baked official defaults

- **Target**: `apps/readest-app/.env` — a file upstream commits to the tree —
  and `apps/readest-app/src/services/environment.ts`
- **Change**: two different treatments for `.env`, and the difference matters.
  - **Blank** these four outright:
    `NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64`,
    `NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64`,
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64`,
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64`.
  - **Replace with placeholders** — not blank — these two:
    `NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64` (base64 of
    `https://placeholder.invalid`) and `NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64`
    (base64 of any non-empty dummy string).
  - In `environment.ts`, extend `getNodeBaseUrl()`'s fallback chain with
    `getRuntimeConfig()?.apiBaseUrl`, then `API_BASE_URL`, then
    `NEXT_PUBLIC_API_BASE_URL`, before `READEST_NODE_BASE_URL`. The literal
    `NEXT_PUBLIC_NODE_BASE_URL` member expression still wins, so Tauri/Android
    builds keep their baked value.
- **Effect**: removes the base64-obfuscated production credentials upstream ships
  in-tree. PostHog is the one that matters. `context/PHContext.tsx` calls
  `posthog.init` at module scope with the baked key against
  `https://us.i.posthog.com` in any production build. Capturing is opt-out by
  default and 10% of new users are shown a consent prompt, but the client
  connects either way. With the key blank, the `&& posthogKey` guard skips `init`
  entirely.
- **Why not configuration**: the lookup is
  `process.env['NEXT_PUBLIC_POSTHOG_KEY'] || atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64']!)`.
  An empty override is falsy and falls through to the baked default, so the
  default itself has to go.
- **Effect of the `getNodeBaseUrl()` change**: in the web container the runtime
  config injects `apiBaseUrl` through `/runtime-config.js`, so the Standard
  Ebooks OPDS proxy in `opdsReq.ts` resolves to our server origin instead of
  `https://node.readest.com`, which does not exist here. `NEXT_PUBLIC_NODE_BASE_URL`
  still wins on Tauri/Android builds, and `READEST_NODE_BASE_URL` remains the
  last-resort default when nothing is configured.
- **Tests**: `src/__tests__/services/environment.test.ts` asserts that
  `getNodeBaseUrl()` falls back to `window.__READEST_RUNTIME_CONFIG.apiBaseUrl`
  when `NEXT_PUBLIC_NODE_BASE_URL` is unset. `src/__tests__/utils/supabase-storage-key.test.ts`
  asserts the baked default is the neutralized `https://placeholder.invalid` URL.
- **Why the Supabase defaults are placeholders rather than blank.**
  `utils/supabase.ts` calls `createClient` at module scope, and supabase-js v2.76
  validates the URL inside its constructor (`validateSupabaseUrl`) and rejects an
  empty key. That module is reachable from nearly every page, so blanking those
  two values makes `next build` fail outright.

  A placeholder keeps both builds working with no extra plumbing — no build args,
  no generated `.env` in CI. The web image builds against
  `https://placeholder.invalid` and the container's runtime config overrides it;
  the Android build overrides it from `.env.local` with the real values. Either
  way, upstream's real credentials are gone, which is the point: if configuration
  is ever missing or runtime injection fails, the app fails to connect instead of
  silently syncing a user's library into Readest's own Supabase.
- **Conflict risk**: **low.** Upstream rarely edits this file and a conflict here
  is trivial.
- **Status**: applied

### P6 — DeepLX translation adapter

- **Target**: `apps/readest-app/src/pages/api/deepl/translate.ts`
- **Change**: prefer `DEEPLX_API_URL` over the official DeepL endpoints, and when
  that URL is in use send `Authorization: Bearer <DEEPLX_API_TOKEN>` instead of
  `DeepL-Auth-Key`, omitting the `x-fingerprint` header.
- **Effect**: routes translation through a self-hosted DeepLX proxy.
- **Note**: the only patch here that *adds a capability* rather than removing a
  restriction. Carried over from the `legacy-deploy` branch, where it was in
  active use, and kept deliberately.
- **Why not configuration**: both the endpoint choice and the auth scheme are
  hardcoded.
- **Conflict risk**: **medium.** Two fragments of a route upstream still changes.
- **Status**: applied

### P7 — Delete upstream's workflows

- **Target**: `.github/workflows/` — all thirteen upstream files:
  `android-e2e`, `codeql`, `docker-image`, `nightly`, `nix-build`,
  `nix-deps-check`, `nix-update-inputs`, `pull-request`, `release`, `scorecard`,
  `try-appimage`, `upload-to-r2`, `vercel-merge`.
- **Change**: delete them. Only `selfhost-*.yml` remain.
- **Effect**: stops upstream CI from firing in this fork. Five of the thirteen
  trigger on `push` to `main`. Worse, `release.yml` and `docker-image.yml`
  trigger on `release: published`, which is exactly what a selfhost release does
  — and `release.yml` alone is a seven-leg matrix of up-to-60-minute platform
  builds that would every one of them fail for want of upstream's signing
  secrets. The four Nix/AppImage workflows added between v0.12.1 and v0.12.20
  are removed for the same reason.
- **Why not the GitHub UI**: disabling workflows there leaves no trace in git. It
  is invisible to an agent, lost if the fork is ever recreated, and silently
  bypassed the moment an upstream release adds a new workflow file.
- **Conflict risk**: **medium**, but mechanical. When upstream edits a file we
  deleted, the rebase reports a delete/modify conflict. The resolution is always
  `git rm` — keep it deleted — and `git rerere` remembers it.
- **Status**: applied

### P8 — Make the client-side storage type reachable in Tauri builds

- **Target**: `apps/readest-app/src/utils/storage.ts`
- **Change**: add `process.env['NEXT_PUBLIC_OBJECT_STORAGE_TYPE']` to the fallback
  chain in `getStorageType()`, and bake `NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3` into
  the Android build.
- **Effect**: fixes cloud book-file sync on Android. Without it, Android and the
  web client compute **different object keys for the same book**.
- **Why it is broken**: `getStorageType()` reads
  `getRuntimeConfig()?.objectStorageType ?? process.env['OBJECT_STORAGE_TYPE']`
  and defaults to `'r2'`. In a Tauri build there is no server, so
  `getRuntimeConfig()` is `undefined`; and `OBJECT_STORAGE_TYPE` has no
  `NEXT_PUBLIC_` prefix, so Next never inlines it into the client bundle. The
  Android app therefore always resolves to `'r2'`, whatever the build
  environment says. That matters because `getRemoteBookFilename` in
  `utils/book.ts` branches on it — `hash/Title.ext` for `r2` versus
  `hash/hash.ext` for `s3` — and `services/cloudService.ts`, which is
  client-side, uses the result to build cloud object keys. Against an `s3`
  server, Android uploads to and looks for a key the web client never uses.
- **Why upstream does not hit this**: their Tauri builds talk to their own R2, so
  the `'r2'` default is correct for them. It is only wrong for a self-hosted
  deployment on S3.
- **Why not configuration alone**: baking the variable is necessary but not
  sufficient — nothing on the client path reads the `NEXT_PUBLIC_` form today.
  The patch is what makes the configuration take effect.
- **Conflict risk**: **low.** One expression in a small, stable file.
- **Status**: applied

---

### P9 — Disable the in-app updater

- **Target**: `apps/readest-app/src/helpers/updater.ts` and
  `apps/readest-app/src/components/UpdaterWindow.tsx`
- **Change**: make the update check a no-op and remove its entry point.
- **Effect**: the app stops fetching
  `https://download.readest.com/releases/latest.json`. Without this, our APK
  presents **official** Readest releases as available updates, and accepting one
  replaces the self-hosted app with the stock build — server configuration,
  patches and all.
- **Why not repoint it at our own feed**: the Tauri updater verifies artifacts
  against `READEST_UPDATER_PUBKEY`, a minisign public key hardcoded in
  `services/constants.ts` and mirrored in `src-tauri/tauri.conf.json`. Publishing
  our own feed would mean generating a keypair, replacing that constant, signing
  every release, and safeguarding a second long-lived private key. For a
  single-operator deployment where the APK is installed by hand anyway, the
  updater has no value to justify that.
- **Why not configuration**: the URLs are constants with no environment hook.
- **Tests**: `src/__tests__/components/UpdaterWindow.test.tsx` asserts that the
  download button starts no download and installs no APK, that a `nightlyUpdate`
  passed by an old caller is ignored, and that the changelog auto-translation
  toggle still works.
- **Conflict risk**: **medium.** Two files, and the updater is occasionally
  reworked upstream. Re-apply by intent: find the manifest fetch, stop it.
- **Completed by**: **P12**. P9 silenced the manifest check but left the About
  dialog's "Check Update" button and the startup release-notes fetch reaching
  Readest's servers. P12 stubs `checkAppReleaseNotes`, removes the button, and
  reconciles `src/__tests__/helpers/updater.test.ts` so both entry points are
  asserted to return `false` without calling the Tauri updater or `fetch`.
- **Status**: applied

---

### P10 — Remove the consumption meters

- **Target**: `apps/readest-app/src/app/user/components/UsageStats.tsx` and
  `apps/readest-app/src/app/library/components/SettingsMenu.tsx`
- **Change**: reduce `UsageStats` to a component that returns `null`, keeping a
  `quotas?: unknown` prop so the untouched `app/user/page.tsx` call site still
  compiles when upstream changes `QuotaType`. In `SettingsMenu`, remove the
  logged-in submenu's quota button, then the `Quota` import, the
  `useQuotaStats` import, and its `const { quotas } = useQuotaStats(true);`
  binding. Because that button was the only reader of the local
  `readestEnabled`, also delete `readestEnabled` and its `isReadestCloudEnabled`
  import — `useCloudSyncStatus` computes its own copy for the sync row, so the
  "Synced {{time}}" indicator is unaffected. `Quota.tsx` itself is untouched.
- **Effect**: removes the "Cloud Sync Storage" and "Translation Characters"
  meters, with their progress bars and reset countdowns, from `/user` and the
  library settings dropdown. With the self-hosted quotas fixed at imperceptible
  ceilings, the meters only surface artificial quota anxiety.
- **Why not configuration**: no flag guards either render, and raising the
  quota values (P5) changes what the meters display without removing them.
- **Tests**: `src/__tests__/app/user/plans-comparison.test.tsx` (the profile-page
  billing-stub suite) asserts `UsageStats` renders nothing with the v0.12.20
  quota props.
- **Conflict risk**: **high.** `SettingsMenu.tsx` is now touched by both P4 and
  P10, and it is an actively developed UI file. Re-apply by intent rather than
  by patch text: find the quota row, delete it, then delete whatever that
  leaves unused. `UsageStats.tsx` is a small, stable file.
- **When it breaks**: a rebase conflict, or an unused-import lint error if
  upstream restructures the submenu. Keep P4's upgrade-item removal and P10's
  quota-row removal separate when resolving.
- **Status**: applied

---

### P11 — Remove the plan name from the profile page and account deletion modal

- **Target**: `apps/readest-app/src/app/user/components/UserInfo.tsx` and
  `apps/readest-app/src/app/user/components/AccountActions.tsx`
- **Change**: delete the plan name pill from `UserInfo` — the
  `<div className='mt-3'>` block that rendered `planDetails.color` and the
  translated `planDetails.name` — then drop the `useTranslation` import and its
  binding, which that block was the only reader of. Keep `planDetails` in the
  props interface, accepted and ignored, because `app/user/page.tsx` still
  computes and passes it. In the account deletion dialog, render the `planName`
  line only when `userPlan !== 'free'`, matching the adjacent paid-benefits
  warning.
- **Effect**: a self-hosted user — always on the `free` plan — sees no plan
  name on `/user` or in the account deletion modal. Non-free plans still show
  their name in the deletion dialog, so upstream behavior is preserved where it
  applies.
- **Why not configuration**: both are unconditional JSX with no flag guarding
  them.
- **Tests**: `src/__tests__/app/user/account-actions.test.tsx` asserts that
  `UserInfo` renders the display name and email and omits `Free Plan`, and that
  the deletion dialog omits the plan name for `free` accounts and still names a
  `plus` plan.
- **Conflict risk**: **low.** `UserInfo.tsx` is small and stable; the
  `AccountActions.tsx` change is one conditional around a single line.
- **When it breaks**: a rebase conflict, or an unused-import lint error after
  `useTranslation` leaves `UserInfo`. Re-apply by intent: remove the pill, then
  remove whatever it leaves unused.
- **Status**: applied

---

### P12 — Retire the update-check UI and startup release-notes fetch

- **Target**: `apps/readest-app/src/helpers/updater.ts`,
  `apps/readest-app/src/components/AboutWindow.tsx`,
  `apps/readest-app/src/__tests__/helpers/updater.test.ts`, and
  `apps/readest-app/src/__tests__/components/AboutWindow.test.tsx`
- **Change**: make `checkAppReleaseNotes` a no-op returning `false`, removing
  the five imports it orphaned (`semver`, `isTauriAppPlatform`,
  `READEST_CHANGELOG_FILE`, `setUpdaterWindowVisible`, `getAppVersion`). Keep
  `setLastShownReleaseNotesVersion` / `getLastShownReleaseNotesVersion` because
  `UpdaterWindow.tsx` still imports the setter. In `AboutWindow`, delete the
  "Check Update" button and all four `updateStatus` branches, then remove what
  that orphans: the `UpdateStatus` type, the status state, both handlers, the
  updater and settings-store imports, and `setUpdateStatus(null)` from
  `handleClose`. The logo, version string, and click-to-copy behaviour stay.
- **Effect**: completes P9. Neither the startup calls in `app/library/page.tsx`
  and `app/reader/page.tsx` nor the About dialog can fetch
  `https://download.readest.com/releases/release-notes.json` or open Readest's
  official changelog. The About dialog no longer offers a check that cannot
  check, and a version bump no longer pops upstream's "What's New in Readest".
- **Why not configuration**: no flag guards either call site or the button, and
  the URLs are constants with no environment hook.
- **Tests**: `src/__tests__/helpers/updater.test.ts` is reconciled: it asserts
  `checkForAppUpdates` resolves `false` for every channel and platform and
  `checkAppReleaseNotes` resolves `false` for both auto and manual checks, and
  that neither calls `check()`, the Tauri HTTP client, or `fetch`.
  `src/__tests__/components/AboutWindow.test.tsx` asserts the dialog no longer
  renders a "Check Update" button while the version label still copies.
- **Conflict risk**: **medium.** `AboutWindow.tsx` is a small but active UI file,
  and `updater.ts` is occasionally reworked upstream. Re-apply by intent: stub
  the release-notes fetch, then delete the update-check block and whatever it
  leaves unused. Keep `UpdaterWindow.tsx`, `UpdaterContent`, and
  `app/updater/page.tsx` in place — unreachable, but deleting them adds rebase
  surface for no user-visible gain.
- **When it breaks**: a rebase conflict, or an unused-import lint error after
  the update-check block leaves `AboutWindow`. Re-apply by removing the block,
  then removing whatever it leaves unused.
- **Status**: applied

---

### P13 — Hide the Send-to-Readest email row

- **Target**: `apps/readest-app/src/components/settings/IntegrationsPanel.tsx`
- **Change**: delete the `<IntegrationRow>` titled `_('Send to Readest')` — status
  `_('Email books to your library')`, `onClick={() => setSubPage('send')}` — from
  the Content Sources card, and drop the now-unused `RiSendPlaneLine` import.
  Leave the unreachable `if (subPage === 'send')` branch, the `'send'` member of
  the `SubPage` union, and `SendToReadestForm.tsx` in place; the union member is
  load-bearing for the deep-link `useEffect`'s type narrowing.
- **Effect**: Settings → Integrations no longer offers the only navigation into
  the personal-email-in card, whose "View plans" button routes to `/user` and
  whose form cannot work without inbound email for `readest.com`. OPDS Catalogs
  and Audiobookshelf remain. The other Send channels — the in-app `/send` page,
  the mobile share sheet, and the browser extension — are unaffected.
  `premiumBadge` in this file is deliberately untouched: P1 makes
  `isCloudSyncPremium` permanently `true`, so `shouldShowCloudProviderBadge`
  already returns `false` for every user.
- **Why not open the gate**: `EMAIL_IN_PLANS` has no master switch, so P1 never
  reached it. Opening it would replace a paywall card with a form that silently
  fails, because personal-address email-in depends on inbound email for
  `readest.com` and a Cloudflare Worker that do not exist here — see
  `deploy/docs/known-limitations.md`.
- **Why not configuration**: the row is unconditional JSX with no flag guarding
  it.
- **Tests**: `src/__tests__/components/settings/IntegrationsPanel-bookdrop.test.tsx`
  asserts `Send to Readest` is not rendered while `OPDS Catalogs` still is.
  `send-address-plan-gate.test.ts` and `SendToReadestForm.tsx` are untouched.
- **Conflict risk**: **low.** One JSX block and one import line in a stable file.
- **When it breaks**: a rebase conflict, or an unused-import lint error after the
  row leaves. Re-apply by intent: remove the row, then remove whatever it leaves
  unused.
- **Status**: applied

---

### P14 — Remove the Offline Audio premium badge and sign-in gate

- **Target**: `apps/readest-app/src/app/reader/components/tts/TTSPlayerSheet.tsx`
- **Change**: set `premiumBadge` to `undefined` for every user, and reduce
  `handleOpenDownloads` to `setView('chapters')` with no upgrade or sign-in
  redirect. Drop the now-unused `isTTSCacheAllowed` and `useQuotaStats`
  imports. `handleUpgrade` — and therefore the `user`, `router`, and
  `navigateTo*` bindings — stays, because `VoiceList` still routes a voice the
  reader's plan lacks through it.
- **Effect**: the **Offline Audio** row in the reader's Read Aloud sheet is
  unbadged for signed-in `free` and signed-out users alike, shows
  "{{done}} of {{total}} downloaded", and opens the per-chapter download view
  directly. The audio cache is local, so there was nothing to sign in for.
- **Why not configuration**: the badge and redirect are unconditional JSX and
  handler logic; no flag feeds them.
- **Tests**: `src/__tests__/components/tts/TTSPlayerSheet.test.tsx` rewrites the
  `free`-user and signed-out cases to assert no `Premium` badge, download
  progress, and the `chapters-view`, with no router navigation. The
  premium-user case already asserted that behavior.
- **Note**: in `v0.12.20`, upstream refactored `IntegrationsPanel.tsx` to use
  `shouldShowCloudProviderBadge`, which already hides the badge for signed-out
  users when `isPremium` is `true` (via P1), so only `TTSPlayerSheet.tsx` needed
  source changes in `v0.12.20`. In `TTSPlayerSheet.tsx`, the `!user || ...`
  disjunct in `premiumBadge` and the `else` branch in `handleOpenDownloads`
  bypassed P1's master switch for signed-out users; P14 removes both. This is
  the lesson: a master switch is necessary but not sufficient, and a future
  gate wearing the `!user || ...` pattern needs the same second look.
- **Conflict risk**: **low.** One binding and one handler in one file.
- **When it breaks**: a rebase conflict in `TTSPlayerSheet.tsx`, or an
  unused-import lint error if upstream removes `handleUpgrade`/`VoiceList`.
  Re-apply by intent: badge `undefined`, downloads open unconditionally, then
  remove whatever that leaves unused.
- **Status**: applied

---

### P15 — Make the fixed quotas reachable in Tauri builds

- **Target**: `apps/readest-app/src/utils/access.ts`
- **Change**: add `process.env['NEXT_PUBLIC_STORAGE_FIXED_QUOTA']` and
  `process.env['NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA']` to the fallback chains in
  `getStoragePlanData()` and `getTranslationQuota()`, after the non-prefixed
  forms. Both stay literal `process.env['NEXT_PUBLIC_…']` member expressions so
  Next inlines them into the client bundle.
- **Effect**: fixes Android storage and translation quotas. Without it, both
  resolve to `0` and fall through to upstream's free-plan defaults — 500 MB
  storage and 10 240 translation characters/day — whatever
  `deploy/docs/android.md` bakes into the APK. Uploads then fail with
  "云存储空间不足" and translation stops after a few pages.
- **Why it is broken**: same defect class as **P8**. In a Tauri build there is
  no server, so `getRuntimeConfig()` is `undefined`, and the fallback reads
  `STORAGE_FIXED_QUOTA` / `TRANSLATION_FIXED_QUOTA`, which have no
  `NEXT_PUBLIC_` prefix and so are never inlined into the client bundle.
  `getServerRuntimeConfig()` in `services/runtimeConfig.ts` already reads the
  `NEXT_PUBLIC_` forms, but it only ever runs on the server and does not help the
  APK.
- **Why not configuration**: the APK already bakes both variables; nothing on the
  client path reads them. The patch is what makes the configuration take effect.
- **Tests**: `src/__tests__/utils/customization-access.test.ts` asserts that,
  with `getRuntimeConfig()` undefined and the non-prefixed variables absent, the
  `NEXT_PUBLIC_` forms override the `free` plan defaults for both quotas, and
  that the injected runtime config still wins on the web.
- **Conflict risk**: **low.** Two expressions in a small, stable file, same as
  P8.
- **When it breaks**: a rebase conflict in `getStoragePlanData` /
  `getTranslationQuota`. Re-apply by intent: extend each `??` chain with the
  `NEXT_PUBLIC_` form as a literal member expression, before the `'0'` default.
- **Status**: applied

---

### P16 — Silence the translation quota upgrade toast

- **Target**: `apps/readest-app/src/hooks/useTranslator.ts`
- **Change**: in the `DAILY_QUOTA_EXCEEDED` branch of `useTranslator`'s
  `catch`, drop the `eventDispatcher.dispatch('toast', …)` that said "Daily
  translation quota reached. Upgrade your plan to continue using AI
  translations." Keep `setSelectedProvider('azure')`, so the next call falls
  back to the built-in provider. The `eventDispatcher` and `_` bindings stay:
  the `UNAUTHORIZED` branch below still uses both.
- **Effect**: the last runtime "Upgrade your plan" message on an active
  self-hosted path disappears. (`useTTSControl.ts:412` still has a Readest Voice
  daily-limit message, but it is unreachable without a voice catalog and is
  prevented by `TTS_FIXED_QUOTA` when one is configured.) Translation still
  degrades the same way when the daily quota is exhausted — automatically to
  azure — but without a toast that offers a purchase this deployment cannot
  sell.
- **Why not configuration**: the toast is unconditional handler logic inside
  the hook; no flag feeds it.
- **Tests**: `src/__tests__/hooks/useTranslator.test.tsx` adds "falls back to
  azure without an upgrade toast when the daily quota is exhausted", which
  rejects from a custom translator with `ErrorCodes.DAILY_QUOTA_EXCEEDED`,
  asserts the next call goes to azure, and asserts `eventDispatcher.dispatch`
  is never called with `toast`.
- **Conflict risk**: **low.** One branch of one `catch` block.
- **When it breaks**: a rebase conflict in `useTranslator.ts`, or an
  unused-import error if upstream removes the `UNAUTHORIZED` toast. Re-apply by
  intent: delete the quota toast dispatch, keep the azure fallback, and remove
  whatever the deletion leaves unused.
- **Status**: applied

### P17 — Isolate Android selfhost package, enable BOOX stylus by default, and prune manifest/deep-links

- **Target**: `apps/readest-app/src-tauri/gen/android/app/build.gradle.kts`,
  `apps/readest-app/src-tauri/plugins/tauri-plugin-native-bridge/android/build.gradle.kts`,
  `apps/readest-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`,
  `apps/readest-app/src-tauri/tauri.conf.json`,
  `apps/readest-app/scripts/test-android.sh`, and
  `apps/readest-app/src/__tests__/android/helpers/reader.ts`
- **Change**:
  - In `app/build.gradle.kts`, set `applicationId` via
    `project.findProperty("applicationId") -> System.getenv("ANDROID_APPLICATION_ID") -> "com.bilingify.readest.selfhost"`
    while keeping `namespace = "com.bilingify.readest"` and default
    `storeFlavor = "foss"`, and resolve a top-level
    `val penFlavor = project.findProperty("penFlavor")?.toString() ?: "booxPen"`
    across all four `booxPen` checks (`libc++_shared.so` `pickFirsts`,
    `missingDimensionStrategy("pen", penFlavor)`, `prestrippedLibs`, and the
    BOOX Maven repository).
  - In `plugins/tauri-plugin-native-bridge/android/build.gradle.kts`, match the
    same `(findProperty("penFlavor")?.toString() ?: "booxPen") == "booxPen"`
    default for the BOOX Maven repository and update its `penFlavor` / BOOX
    repository comments to match the `booxPen` default.
  - In `AndroidManifest.xml`, remove `REQUEST_INSTALL_PACKAGES`,
    `com.android.vending.BILLING`, the `android.software.leanback` feature, the
    `LEANBACK_LAUNCHER` intent filter, the `https://web.readest.com` App Link
    intent filter, and the Google Drive (`com.googleusercontent.apps.*`) and
    `readest-onedrive` OAuth callback `<data android:scheme=.../>` entries while
    keeping `readest`, `usesCleartextTraffic`, `MANAGE_EXTERNAL_STORAGE`,
    `${applicationId}.fileprovider`, ebook MIME/extension `VIEW` filters, and
    `SEND` / `SEND_MULTIPLE`.
  - In `tauri.conf.json`, trim `plugins.deep-link.mobile` to
    `[{"scheme": ["readest"], "appLink": false}]` (removing `web.readest.com`,
    Google Drive, and `readest-onedrive`), while leaving
    `plugins.deep-link.desktop.schemes` untouched because desktop builds are out
    of scope.
  - In `scripts/test-android.sh` (`PKG="${ANDROID_APPLICATION_ID:-com.bilingify.readest.selfhost}"`)
    and `src/__tests__/android/helpers/reader.ts` (`APP_PKG = process.env['ANDROID_APPLICATION_ID']?.trim() || 'com.bilingify.readest.selfhost'`),
    update the local `pnpm test:android` CDP e2e lane to target the isolated
    selfhost package and honor `ANDROID_APPLICATION_ID`.
- **Effect**: the self-hosted APK installs side-by-side with official Readest
  under `com.bilingify.readest.selfhost` (with launcher label `Readest` and zero
  Kotlin/JNI package rename churn), enables hardware Onyx BOOX stylus rendering
  by default on BOOX E-ink readers while falling back cleanly at runtime on
  standard Android phones, stops hijacking `web.readest.com` links or upstream
  OAuth schemes, and drops OTA self-install, Play Billing, and Android TV
  declarations.
- **Why not configuration**: `applicationId`, Gradle flavor selection, Android
  manifest permissions/intent-filters, and `tauri.conf.json` deep-link blocks
  are static native build declarations with no runtime override. Notice that
  `tauri android init` in CI is immediately followed by `git checkout .`, which
  restores these tracked files before Gradle runs.
- **Tests**: `src/__tests__/android/android-auto-declarations.test.ts` asserts
  the `com.bilingify.readest.selfhost` fallback chain, preserved
  `namespace = "com.bilingify.readest"`, `booxPen` default in both Gradle files,
  removed permissions/TV/App-Link/OAuth declarations, retained `readest` / LAN /
  storage / `FileProvider` / ebook / share-target declarations, pruned
  `tauri.conf.json` mobile deep-link config with untouched desktop schemes, and
  updated `scripts/test-android.sh` and `helpers/reader.ts` package resolution.
- **Conflict risk**: **medium.** Touches generated-and-tracked Android Gradle /
  manifest files and `tauri.conf.json`.
- **When it breaks**: upstream changes `app/build.gradle.kts`,
  `AndroidManifest.xml`, or `tauri.conf.json` (for example adding a new ebook
  extension filter or updating BOOX SDK coordinates). Keep upstream's new ebook
  filters/SDK versions and re-apply the `applicationId`, `booxPen` default, and
  permission/App-Link/OAuth deletions.
- **Status**: applied

---

## Part 3 — Resolved decisions

Recorded so they are not relitigated. Each was an open question during the design
session; the resolution is below.

### O1 — The in-app updater → **disable it**

Promoted to patch **P9**. Repointing the updater at our own release feed was
rejected on cost: it requires a minisign keypair, a constant replacement, and
per-release signing.

### O2 — `assets.readest.com` in the public media upload path → **accepted limitation**

Not fixed. `pages/api/storage/upload.ts` uploads the `media` branch into
`TEMP_STORAGE_PUBLIC_BUCKET_NAME` — a variable upstream's own self-host
`.env.example` never defines — and returns a `downloadUrl` on Readest's CDN, so
published book covers are broken here in two independent ways.

Fixing it means standing up a publicly readable bucket with its own domain and
making the constant configurable: new infrastructure, in exchange for share-link
and Discord-presence cover images. Revisit if share links are ever actually used.
Recorded in `known-limitations.md`.

### O3 — The WordLens glossary CDN → **keep it**

`services/wordlens/glossPacks.ts` continues to download dictionary packs from
`https://cdn.readest.com/wordlens`.

This is not telemetry. It reports nothing and downloads public static files. The
goal of this fork is to be free of billing, tracking, and dependence on an
official account; fetching a static asset violates none of those. Mirroring the
packs onto our own domain remains possible later if full offline operation
becomes a requirement.

### O4 — Residual plan wording → **resolved by P11**

`UserInfo` no longer renders a plan name on the profile page, and the account
deletion dialog hides the plan name for `free` accounts. The remaining residual
plan wording is covered by the second paywall pass in
`deploy/docs/paywall-residue-spec.md` (P10–P16): consumption meters, tier
badges, upgrade prompts, and benefit counts.
