# Patch ledger

The authority on what this fork changes in upstream source, and why.

**Each entry's `Status` field is the authority on whether that patch is applied.**
Every entry below is a decision reached and verified against upstream `v0.12.1`.
Implementing an entry means writing the patch *and* moving its status to
`applied` in the same commit, so that the ledger and `git diff upstream..main`
never disagree.

Verified against upstream `v0.12.1` (`f3e1df7`). Line numbers come from that tag
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
| Quotas decoupled from plans | `STORAGE_FIXED_QUOTA` / `TRANSLATION_FIXED_QUOTA`. `utils/access.ts` prefers the fixed value over the per-plan table. | `deployment.md` |
| No Sentry crash reporting | Do not set `SENTRY_DSN`. `src-tauri/src/sentry_config.rs::dsn_from_env` maps unset or empty to `None`, and `scripts/upload-sourcemaps.mjs` no-ops without `SENTRY_AUTH_TOKEN`. Upstream built this for fork builds. | `android.md` |
| Signup restricted to an allowlist | GoTrue `before_user_created` hook backed by a database function. Confirmed present in `supabase/auth` v2.185.0 as `HookConfiguration.BeforeUserCreated`. | `deployment.md` |
| Android app talks to our server | Baked configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_NODE_BASE_URL`. The Tauri build has no runtime injection, so these are the whole story. | `android.md` |
| OPDS proxy served by us | `NEXT_PUBLIC_NODE_BASE_URL` pointed at our origin. The route `apps/readest-app/src/app/api/opds/proxy/route.ts` ships in our image, so it answers. | `android.md` |
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

- **Target**: `apps/readest-app/src/utils/access.ts`
- **Change**: `CLOUD_SYNC_REQUIRES_PREMIUM = false` and
  `TTS_CACHE_REQUIRES_PREMIUM = false`.
- **Effect**: third-party cloud sync (WebDAV, Google Drive, S3) and the offline
  TTS audio download stop requiring a paid plan. Upstream documents both
  constants as master switches — "Every gate goes through `isCloudSyncAllowed`,
  so this flag is the whole toggle" — so no call site needs touching, and the
  Premium badges disappear with the gate.
- **Why not configuration**: compile-time constants. No environment variable
  reads them.
- **Conflict risk**: **low.** Two boolean literals in a stable file.
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
- **Change**: reduce to a component that returns `null`.
- **Effect**: removes the four-plan comparison carousel from the profile page.
  `app/user/page.tsx` renders it **unconditionally** — it does not check the
  user's plan — so it is visible on every self-hosted deployment regardless of P1
  or of what the plan claim says.
- **Why not configuration**: no flag guards the render.
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

- **Target**: `apps/readest-app/.env` — a file upstream commits to the tree
- **Change**: two different treatments, and the difference matters.
  - **Blank** these four outright:
    `NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64`,
    `NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64`,
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64`,
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV_BASE64`.
  - **Replace with placeholders** — not blank — these two:
    `NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64` (base64 of
    `https://placeholder.invalid`) and `NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64`
    (base64 of any non-empty dummy string).
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

- **Target**: `.github/workflows/` — all nine files: `android-e2e`, `codeql`,
  `docker-image`, `nightly`, `pull-request`, `release`, `scorecard`,
  `upload-to-r2`, `vercel-merge`.
- **Change**: delete them. Only `selfhost-*.yml` remain.
- **Effect**: stops upstream CI from firing in this fork. Five of the nine
  trigger on `push` to `main`. Worse, `release.yml` and `docker-image.yml`
  trigger on `release: published`, which is exactly what a selfhost release does
  — and `release.yml` alone is a seven-leg matrix of up-to-60-minute platform
  builds that would every one of them fail for want of upstream's signing
  secrets.
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
- **Conflict risk**: **medium.** Two files, and the updater is occasionally
  reworked upstream. Re-apply by intent: find the manifest fetch, stop it.
- **Status**: not applied

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

### O4 — Residual plan wording → **deferred until after the first build**

`UserInfo` renders a plan name on the profile page, and every user here is
`free`. Deciding now would be guesswork: P2 and P3 substantially rework that
page, so look at what actually remains once they are applied rather than
patching speculatively.
