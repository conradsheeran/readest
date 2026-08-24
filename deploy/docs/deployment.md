# Deployment

Server-side setup and operation. Read `architecture.md` first — this document
assumes the runtime/baked configuration distinction described there.

## Prerequisites

- A domain served over HTTPS by a reverse proxy in front of the stack. This fork
  assumes the client and Kong share **one public origin**, so there are no
  cross-origin requests. `read.conraaad.com` is the deployment this fork targets.
- A Cloudflare R2 bucket and an access key pair. There is no local object storage
  in this stack.
- Docker login to GHCR on the host, once, so it can pull our image.

Two details in the reverse proxy are easy to get wrong and hard to diagnose: the
`Host` header must reach the object-storage location unchanged or presigned
signatures fail to verify, and the request body size limit must be lifted on the
upload path or large books are silently truncated. Upstream's
`docker/nginx.conf.example` is a correct starting point.

## Configuration

Values live in `.env` next to `compose.yaml`. `.env` is never committed; the
committed `.env.example` carries placeholders only.

### Identity of the deployment

| Variable | Notes |
| --- | --- |
| `SITE_URL` | The public origin, e.g. `https://read.conraaad.com` |
| `API_EXTERNAL_URL` | Same origin. GoTrue builds confirmation links from it |
| `ADDITIONAL_REDIRECT_URLS` | `https://read.conraaad.com/**` |
| `PUBLIC_APP_URL` | Same origin. Becomes `API_BASE_URL` for the client |
| `PUBLIC_SUPABASE_URL` | Same origin. Becomes `SUPABASE_PUBLIC_URL` for the client |

`SUPABASE_PUBLIC_URL` must be the public origin, never the container-internal
`http://kong:8000`. Since upstream `v0.12.1` the server injects it into the
browser, so an internal hostname leaks straight into the page and nothing
resolves.

### Secrets

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | 32+ characters |
| `JWT_SECRET` | 32+ characters |
| `ANON_KEY` | HS256 JWT signed with `JWT_SECRET`, payload `{"role": "anon"}` |
| `SERVICE_ROLE_KEY` | HS256 JWT signed with `JWT_SECRET`, payload `{"role": "service_role"}` |

`ANON_KEY` and `SERVICE_ROLE_KEY` are derived from `JWT_SECRET`. Rotating the
secret invalidates both, and the Android APK carries `ANON_KEY` baked in — so
rotating it means rebuilding and redistributing the APK. Treat it as a
long-lived value.

### Object storage

| Variable | Notes |
| --- | --- |
| `OBJECT_STORAGE_TYPE` | `s3` |
| `S3_ENDPOINT` | The R2 endpoint |
| `S3_PUBLIC_ENDPOINT` | Same as `S3_ENDPOINT` for R2, which is already public. It signs the URLs browsers use |
| `S3_REGION` | `auto` for R2 |
| `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | |

Note that `src/utils/s3.ts` hardcodes `forcePathStyle: true`. R2 and MinIO are
fine with that; a provider that requires virtual-hosted-style addressing would
need a patch, which no ledger entry currently covers.

### Quotas

| Variable | Notes |
| --- | --- |
| `STORAGE_FIXED_QUOTA` | Bytes. Overrides the per-plan table for every user |
| `TRANSLATION_FIXED_QUOTA` | Characters per day, same |

These are how quotas are decoupled from paid plans. `utils/access.ts` prefers the
fixed value, so all users get it regardless of their plan claim.

### Signup

| Variable | Notes |
| --- | --- |
| `DISABLE_SIGNUP` | `false` — the allowlist hook does the gating, not this |
| `ENABLE_EMAIL_SIGNUP` | `true` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` unless SMTP is configured |
| `ENABLE_ANONYMOUS_USERS` | `false` |

### Optional

| Variable | Notes |
| --- | --- |
| `FONT_BASE_URL` | Where the CJK webfont bundles are mirrored. Empty falls back to Readest's CDN, which refuses CORS for our origin, so the fonts simply fail to load |
| `DEEPLX_API_URL`, `DEEPLX_API_TOKEN` | Self-hosted DeepLX proxy (patch P6) |
| `SMTP_*` | Only needed when `ENABLE_EMAIL_AUTOCONFIRM=false` |

Deliberately absent: every `MINIO_*` variable, and `SENTRY_DSN`. Leaving
`SENTRY_DSN` unset is what disables crash reporting — see the ledger, Part 1.

## The signup allowlist

Registration is restricted in the database, through GoTrue's
`before_user_created` hook. It is not enforced in the client, because the client
is under the user's control.

### Mechanism

GoTrue calls the hook inside the signup transaction as
`select <schema>.<function>(<request_json>)`. The request contains
`{"metadata": {...}, "user": {...}}`, and the user object carries `email`.
Returning an `error` object aborts the signup and surfaces the message to the
caller; returning an empty object allows it.

Confirmed against `supabase/auth` v2.185.0
(`internal/hooks/hookspgfunc/hookspgfunc.go`, `internal/hooks/v0hooks/v0hooks.go`).

### Compose configuration

On the `auth` service:

```yaml
GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED: "true"
GOTRUE_HOOK_BEFORE_USER_CREATED_URI: pg-functions://postgres/readest_selfhost/check_signup_allowlist
```

### Database objects

The allowlist is a table so that adding a person is one `INSERT` rather than a
redeploy. It lives in its own schema, `readest_selfhost`, to keep it clearly
separate from both upstream's schema and Supabase's.

```sql
create schema if not exists readest_selfhost;

create table if not exists readest_selfhost.signup_allowlist (
  email text primary key,
  note  text,
  added_at timestamptz not null default now()
);

create or replace function readest_selfhost.check_signup_allowlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = readest_selfhost, pg_temp
as $$
declare
  candidate text := lower(trim(event -> 'user' ->> 'email'));
begin
  if candidate is null or candidate = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'An email address is required.'));
  end if;

  if not exists (
    select 1 from readest_selfhost.signup_allowlist
    where email = candidate
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'This email address is not permitted to register.'));
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function readest_selfhost.check_signup_allowlist(jsonb) from public, anon, authenticated;
grant usage on schema readest_selfhost to supabase_auth_admin;
grant execute on function readest_selfhost.check_signup_allowlist(jsonb) to supabase_auth_admin;
```

The grants are not optional: GoTrue connects as `supabase_auth_admin` and can
only call a function it has been granted. The revoke from `anon` and
`authenticated` keeps the allowlist from being probed through PostgREST.

Store emails lowercased; the function lowercases the candidate before comparing.

Adding a person:

```sql
insert into readest_selfhost.signup_allowlist (email, note)
values ('someone@example.com', 'why they are here')
on conflict (email) do nothing;
```

Removing an entry does **not** remove an existing account. It only prevents a new
registration.

### Verifying it works

Attempt a signup with an address that is not on the list. It must fail with the
403 message. If it succeeds, the hook is not wired — check that the URI schema
and function name match exactly, and that the `grant execute` was applied.

## Schema migrations

Migrations are upstream's, applied through upstream's mechanism (ADR-0001 covers
why this fork stopped maintaining its own).

On a **fresh** database volume, the Supabase image runs everything under
`/docker-entrypoint-initdb.d` in glob order, which applies the base schema and
then `zz-readest-migrations.sh`. Nothing to do.

On an **upgrade**, the first-boot hook does not run, so migrations must be applied
by hand after pulling the new image:

```bash
docker compose exec db /docker-entrypoint-initdb.d/zz-readest-migrations.sh
```

The script records what it applied in `readest_meta.migrations` and skips those
next time, so running it repeatedly is safe. Skipping it is not: the new client
will query columns that do not exist.

To see whether an upgrade carries schema changes at all, compare
`docker/volumes/db/migrations/` between the two release tags.

### One-time reconciliation from the pre-fork deployment

The pre-fork stack tracked migrations in its own ledger,
`readest_private.schema_migrations`, applied from the host. That mechanism is
gone. An existing database therefore has migrations applied that
`readest_meta.migrations` does not know about, and upstream's script will fail on
an `already exists` error the first time it runs.

Record each already-applied file as applied, then re-run:

```bash
docker compose exec db psql -U supabase_admin -c \
  "INSERT INTO readest_meta.migrations (name) VALUES ('002_add_book_shares.sql') ON CONFLICT DO NOTHING"
```

Work through the errors one at a time. Once the script completes cleanly, the old
`readest_private` schema can be dropped.

## Routine upgrade

See `upgrade-runbook.md` for the full procedure. The server-side portion:

```bash
docker compose pull
docker compose up -d
docker compose exec db /docker-entrypoint-initdb.d/zz-readest-migrations.sh
```

The image tag to pull is the selfhost release, which reuses upstream's version
number (ADR-0003).
