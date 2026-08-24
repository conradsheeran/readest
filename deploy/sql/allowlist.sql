-- Signup allowlist for self-hosted Readest.
-- See deploy/docs/deployment.md — this is the database object behind
-- GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED/URI on the auth service.
--
-- Apply once per database (idempotent, safe to re-run):
--   psql -h <host> -U supabase_admin -d postgres -f deploy/sql/allowlist.sql
-- or inside the db container:
--   docker compose -f deploy/compose.yaml exec db \
--     psql -U supabase_admin -d postgres -f /path/to/allowlist.sql
--
-- The grants at the end are what let GoTrue (role supabase_auth_admin) call
-- the hook. They are wrapped in exception blocks so the same file also runs
-- on a vanilla Postgres (e.g. in CI `docker run postgres`) where those
-- Supabase roles do not exist — there they become no-ops, which is the
-- behaviour the "blank postgres" acceptance checks.

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

-- Grants: GoTrue connects as supabase_auth_admin and must be able to execute
-- the hook. Keep the allowlist unreadable via PostgREST.
-- On a plain Postgres without Supabase roles, the blocks below are no-ops.
do $$
begin
  begin
    revoke all on function readest_selfhost.check_signup_allowlist(jsonb) from public;
  exception when others then null;
  end;
  begin
    revoke all on function readest_selfhost.check_signup_allowlist(jsonb) from anon;
  exception when others then null;
  end;
  begin
    revoke all on function readest_selfhost.check_signup_allowlist(jsonb) from authenticated;
  exception when others then null;
  end;
  begin
    grant usage on schema readest_selfhost to supabase_auth_admin;
  exception when others then null;
  end;
  begin
    grant execute on function readest_selfhost.check_signup_allowlist(jsonb) to supabase_auth_admin;
  exception when others then null;
  end;
end
$$;

-- Example: add a person (store emails lowercased; the function lowercases the
-- candidate before comparing):
--
--   insert into readest_selfhost.signup_allowlist (email, note)
--   values ('someone@example.com', 'why they are here')
--   on conflict (email) do nothing;
--
-- Removing an entry does NOT remove an existing account — it only prevents a
-- new registration.
