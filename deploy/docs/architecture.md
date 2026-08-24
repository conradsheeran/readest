# Architecture

What a running deployment consists of, and where configuration comes from. Read
this before `deployment.md` or `android.md` — both assume the model described
here.

## The two artifacts

This fork publishes exactly two things:

| Artifact | Built by | Contains |
| --- | --- | --- |
| Docker image | `.github/workflows/selfhost-image.yml` | The patched Next.js server: web UI **and** the HTTP API the mobile app calls |
| Android APK | `.github/workflows/selfhost-android.yml` | The patched Tauri app, baked to talk to our server |

Both are built from the same `main` commit. They must be published together —
the APK's API expectations are the patched server's, not upstream's.

## The deployment stack

Five containers. Only the first is ours.

| Service | Image | Role |
| --- | --- | --- |
| `client` | ours, from GHCR | Next.js. Serves the web UI, and serves `/api/*` for both web and mobile |
| `db` | `supabase/postgres` | Postgres with the Supabase extensions. Holds the library, notes, sync state, and the signup allowlist |
| `kong` | `kong` | API gateway. Routes `/auth/v1/*` to GoTrue and `/rest/v1/*` to PostgREST |
| `auth` | `supabase/gotrue` | Email/password auth, JWT issuance, and the `before_user_created` hook that enforces the allowlist |
| `rest` | `postgrest/postgrest` | REST interface over Postgres |

Object storage is **external** — Cloudflare R2, reached over the S3 API. No MinIO
container. The pre-fork deployment ran one; it was removed deliberately, and
nothing in this fork provides local object storage.

There is no separate "mobile backend". The mobile app calls the same `client`
container as the browser does, plus Kong for auth and data. That is why one image
and one container serve both.

## What the browser and the app talk to directly

Three of these are reached from outside the Docker network, so each needs a URL
that resolves publicly:

| What | Variable | Reaches |
| --- | --- | --- |
| The app itself | `SITE_URL` / `API_BASE_URL` | `client` |
| Auth and data | `SUPABASE_PUBLIC_URL` | `kong` |
| File transfer | `S3_PUBLIC_ENDPOINT` | R2 |

`S3_PUBLIC_ENDPOINT` signs presigned upload and download URLs (`src/utils/s3.ts`),
so it has to be the endpoint a browser can actually reach. With R2 that is
already a public hostname, so it is simply the same value as `S3_ENDPOINT`.

Putting the client and Kong on one public origin behind a reverse proxy means
there are no cross-origin requests at all, which is the configuration this fork
assumes.

## Where configuration comes from

This is the part that causes the most confusion, and the difference decides
whether a change needs a patch or not.

### Runtime configuration — the web image

Since upstream `v0.12.1`, the server reads its public URLs from container
environment at request time and injects them into the page as
`window.__READEST_RUNTIME_CONFIG` (`src/services/runtimeConfig.ts`). That takes
precedence over anything baked into the bundle.

The consequence is that **one generic image serves any deployment**. CI builds it
with only `NEXT_PUBLIC_APP_PLATFORM=web`, and `compose.yaml` supplies
`SUPABASE_PUBLIC_URL`, `API_BASE_URL`, `S3_*`, and the quota values as container
environment. Changing any of them is a container restart, not a rebuild.

### Baked configuration — the Android APK

The Tauri build has no server, so nothing injects anything at runtime.
`getRuntimeConfig()` returns `undefined` and every lookup falls through to
`process.env['NEXT_PUBLIC_*']`, which Next inlined into the bundle at build time.

The consequence is that **the APK's server is fixed at build time**. Pointing a
build at a different server means rebuilding. This is a deliberate choice, not a
limitation we failed to work around — see ADR-0004.

### The fallback chain, and why it matters

Every lookup has the same shape, for example in `utils/supabase.ts`:

```
runtime config  →  process.env  →  atob(baked official default)
```

The last link is the dangerous one. Upstream commits `apps/readest-app/.env` with
base64-obfuscated production credentials for PostHog, Supabase and Stripe, so a
build that supplies nothing does not fail — it silently connects to Readest's own
infrastructure. P5 in the patch ledger removes that fallback, which converts a
silent misconfiguration into a loud one.

## Data at rest

| Data | Lives in |
| --- | --- |
| Library metadata, notes, reading progress, sync state | Postgres |
| Users, sessions | Postgres (`auth` schema, owned by GoTrue) |
| Book files, covers | R2 |
| Schema migration ledger | Postgres, `readest_meta.migrations` |

The migration ledger is upstream's. The pre-fork deployment maintained its own
parallel ledger in `readest_private.schema_migrations`; that mechanism is gone,
and reconciling an existing database that used it is a one-time task documented
in `deployment.md`.
