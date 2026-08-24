# Known limitations

Things that are broken or absent when self-hosting, verified against upstream
`v0.12.1`. Each is either accepted, or tracked as an open decision in the patch
ledger. This file exists so that the next person to hit one does not spend an
afternoon rediscovering it.

## Broken by upstream, not by our patches

### Published book covers point at Readest's CDN

`pages/api/storage/upload.ts`, the `media` branch, uploads into the bucket named
by `TEMP_STORAGE_PUBLIC_BUCKET_NAME` and returns
`downloadUrl: https://assets.readest.com/<fileKey>`.

Two independent problems: upstream's own self-host `.env.example` never defines
that variable, so the bucket name is empty; and the returned URL points at
Readest's CDN, which will never hold our object.

Affects publishing a book cover — share links and the Discord Rich Presence
cover. Tracked as ledger **O2**.

### The in-app updater offers official builds

`helpers/updater.ts` and `components/UpdaterWindow.tsx` fetch
`https://download.readest.com/releases/latest.json`. In our APK this presents
**official** Readest releases as available updates, and taking one replaces the
self-hosted app with the stock build.

Tracked as ledger **O1**, and it is the reason `android.md` says not to
distribute the APK widely yet.

### CJK webfonts need mirroring

The reader loads CJK webfont bundles from `storage.readest.com`, which only sends
`Access-Control-Allow-Origin` for readest.com origins. On any other domain the
browser blocks them.

Fixed by configuration: mirror
`https://storage.readest.com/public/font/dist/<Family>/` onto a path the reverse
proxy serves and set `FONT_BASE_URL` (and `NEXT_PUBLIC_FONT_BASE_URL` for
Android). System fonts and Google Fonts are unaffected.

### WordLens dictionary packs come from Readest's CDN

`services/wordlens/glossPacks.ts` downloads from
`https://cdn.readest.com/wordlens`. This is a working optional feature rather
than telemetry, but it is a third-party call with no configuration hook.

Tracked as ledger **O3**.

## Absent because they depend on Readest's own infrastructure

These are not bugs. The features are structurally tied to services only Readest
operates, and no amount of patching makes them work here.

| Feature | Why it cannot work |
| --- | --- |
| Send to Readest via a personal email address | Depends on inbound email for `readest.com` and a Cloudflare Worker that bounces non-subscribers. The other Send channels — the in-app `/send` page, the mobile share sheet, the browser extension — are unaffected |
| Subscriptions, in-app purchases | Stripe and the Apple/Google billing accounts are Readest's. The entry points are removed by ledger P2 and P3 |
| Crash reporting | Deliberately off. Sentry needs a DSN we do not set |

## Consequences of our own decisions

### The Android server cannot be changed after the build

Baked at build time, by design. Pointing the app at a different server means
rebuilding the APK. See ADR-0004.

### Everyone is on the `free` plan

Deliberate (ADR-0002). Quotas come from `STORAGE_FIXED_QUOTA` and
`TRANSLATION_FIXED_QUOTA` instead, and the premium feature gates are opened by
ledger P1. A consequence is that `UserInfo` still renders a plan name on the
profile page — cosmetic, tracked as ledger **O4**.

### `main` is force-pushed on every upgrade

Rebase, not merge (ADR-0001). A clone that has been sitting on an old `main`
cannot fast-forward; reset to the remote instead of pulling.

### Upstream stack images do not update themselves

`compose.yaml` is ours, so a new Postgres, GoTrue, Kong, or PostgREST version in
upstream's `docker/compose.yaml` does not arrive automatically. Security updates
to those four reach this deployment only when someone reconciles the file.
Comparing upstream's compose between the old and new release tags is part of the
upgrade runbook's step 3 reading.

### S3 providers requiring virtual-hosted-style addressing are unsupported

`utils/s3.ts` hardcodes `forcePathStyle: true`. R2 and MinIO are fine. A provider
that mandates virtual-hosted-style would need a patch that no ledger entry
covers.
