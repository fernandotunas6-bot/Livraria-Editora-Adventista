// Postgres em WASM (PGlite) com o mínimo do Supabase que as migrações usam: papéis, auth.*,
// storage.*, cron.*, net.*, vault.*. Serve para correr as migrações reais e testar cenários sem
// Docker nem Postgres instalado (ver docs/PAGAMENTOS.md, "Testes").
//
// O PGlite não é dependência do projecto: instala-se à parte e passa-se o caminho em
// PGLITE_MODULE, por exemplo
//   npm i --prefix /tmp/pglite @electric-sql/pglite@0.2.17
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/pglite/pagamentos.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_SQL = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role authenticator noinherit;
create role dashboard_user nologin;
grant anon, authenticated, service_role to postgres;

-- Como no Supabase: o que se cria em public fica acessível aos três papéis da API; as
-- migrações retiram o que não deve ser.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create schema storage;
create schema extensions;
create schema cron;
create schema net;
create schema vault;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text,
  email text, phone text, encrypted_password text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, confirmed_at timestamptz,
  last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), banned_until timestamptz,
  deleted_at timestamptz, is_anonymous boolean default false, is_sso_user boolean default false
);
create table auth.sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz, aal text, not_after timestamptz,
  user_agent text, ip inet, refreshed_at timestamp, factor_id uuid, tag text
);
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade,
  friendly_name text, factor_type text, status text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade,
  provider text, provider_id text, identity_data jsonb, email text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz
);
create table auth.refresh_tokens (
  id bigserial primary key, instance_id uuid, user_id varchar(255), session_id uuid, token varchar(255),
  revoked boolean, parent varchar(255), created_at timestamptz default now(), updated_at timestamptz
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'role', nullif(current_setting('request.jwt.claim.role', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), ''),
    'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1')
  ))
$$;
grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key, name text, public boolean default false, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text,
  owner uuid, owner_id text, metadata jsonb, path_tokens text[], version text, user_metadata jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
create function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create table cron.job (
  jobid bigserial primary key, schedule text, command text, nodename text default 'localhost',
  nodeport int default 5432, database text default 'postgres', username text default 'postgres',
  active boolean default true, jobname text unique
);
create table cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid int, database text, username text, command text,
  status text, return_message text, start_time timestamptz, end_time timestamptz
);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = job_name;
  return found;
end $$;
create function cron.unschedule(job_id bigint) returns boolean language plpgsql as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end $$;

create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;

create table vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, secret text, description text default '',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create view vault.decrypted_secrets as
  select id, name, secret, secret as decrypted_secret, description, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
$$;
`;

/** As migrações sem o que o PGlite não tem (as extensões pg_cron e pg_net). */
export function migrationSql(text) {
  return text.replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, '-- (extensão simulada)');
}

export function migrationFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/** Base nova com todas as migrações de `dir`. `upTo` (inclusive) pára numa versão. */
export async function freshDb(dir, { upTo = null, log = false } = {}) {
  const db = new PGlite();
  await db.exec(BASE_SQL);
  for (const f of migrationFiles(dir)) {
    if (upTo && f.slice(0, 14) > upTo) break;
    try {
      await db.exec(migrationSql(readFileSync(join(dir, f), 'utf8')));
      if (log) console.log('ok  ', f);
    } catch (err) {
      err.message = `${f}: ${err.message}`;
      throw err;
    }
  }
  return db;
}

/** Corre `fn` como alguém: papel e claims do JWT, dentro de uma transacção. */
export async function as(db, { role = 'authenticated', sub = null, email = null, aal = 'aal1' } = {}, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true),
      set_config('request.jwt.claim.email', $3, true), set_config('request.jwt.claim.aal', $4, true)`, [role, sub || '', email || '', aal]);
    await tx.exec(`set local role ${role === 'service_role' ? 'service_role' : role === 'anon' ? 'anon' : 'authenticated'}`);
    return fn(tx);
  });
}
