-- Versões da app: as novidades que a equipa publica e o aviso por push a todos os aparelhos.
--
-- A app avisa sozinha "Nova versão disponível — Actualizar" a cada publicação do site
-- (scripts/app-version.mjs e app/web/src/lib/appVersion.js: não precisa de nada daqui). Isto é
-- o resto:
--
--   * a equipa com "Configurações" (manage_settings) escreve o que mudou — um título e uma linha
--     por novidade — e publica: aparece em /novidades e no aviso "App actualizada";
--   * e, se quiser, avisa por push todos os aparelhos com notificações ligadas, também os de quem
--     não tem conta. Uma só vez por novidade, e só depois de publicada. O envio é da Edge Function
--     (cada push é cifrado para o seu aparelho), em lotes: o primeiro sai logo, os seguintes de
--     2 em 2 minutos pelo agendador "avisos-equipa";
--   * cada aparelho pode desligar só as novidades e continuar a receber os avisos das encomendas
--     e da comunidade (push_subscriptions.app_updates).
--
-- As colunas do envio (push_*) só a Edge Function as escreve, com o papel de serviço: a equipa
-- pede o envio pela rota /admin/releases/notify, que confirma a permissão e regista quem pediu.

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null default '',
  title text not null,
  notes text not null default '',
  published_at timestamptz,
  push_requested_at timestamptz,
  push_cursor text,
  push_finished_at timestamptz,
  push_sent integer not null default 0,
  push_failed integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint app_releases_title_len check (char_length(btrim(title)) between 3 and 90),
  constraint app_releases_notes_len check (char_length(notes) <= 2000),
  constraint app_releases_version_fmt check (version = '' or version ~ '^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$'),
  -- Uma novidade anunciada por push fica publicada: o aviso no telemóvel abre /novidades.
  constraint app_releases_push_after_publish check (push_requested_at is null or published_at is not null)
);

create index if not exists app_releases_published_idx on public.app_releases (published_at desc)
  where published_at is not null;
create index if not exists app_releases_push_pending_idx on public.app_releases (push_requested_at)
  where push_requested_at is not null and push_finished_at is null;

-- Antes de gravar: texto limpo, autor e data de criação fixos.
create or replace function public.app_releases_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created := old.created;
    new.created_by := old.created_by;
  end if;
  new.title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
  new.notes := btrim(replace(coalesce(new.notes, ''), E'\r', ''));
  new.version := btrim(coalesce(new.version, ''));
  new.updated := now();
  return new;
end;
$$;
revoke all on function public.app_releases_before_save() from public, anon, authenticated;

drop trigger if exists app_releases_before_save on public.app_releases;
create trigger app_releases_before_save
  before insert or update on public.app_releases
  for each row execute function public.app_releases_before_save();

alter table public.app_releases enable row level security;

-- A tabela é da equipa. O público lê as publicadas pela função `app_releases_published`, que só
-- devolve o que se mostra (sem o progresso do envio nem quem escreveu).
drop policy if exists "app_releases: a equipa lê" on public.app_releases;
create policy "app_releases: a equipa lê" on public.app_releases
  for select to authenticated using ((select private.has_permission('manage_settings')));
drop policy if exists "app_releases: a equipa cria" on public.app_releases;
create policy "app_releases: a equipa cria" on public.app_releases
  for insert to authenticated with check ((select private.has_permission('manage_settings')));
drop policy if exists "app_releases: a equipa edita" on public.app_releases;
create policy "app_releases: a equipa edita" on public.app_releases
  for update to authenticated using ((select private.has_permission('manage_settings')))
  with check ((select private.has_permission('manage_settings')));
-- Uma novidade já anunciada por push não se apaga: o aviso nos telemóveis aponta para ela.
drop policy if exists "app_releases: a equipa apaga as não anunciadas" on public.app_releases;
create policy "app_releases: a equipa apaga as não anunciadas" on public.app_releases
  for delete to authenticated using ((select private.has_permission('manage_settings')) and push_requested_at is null);

revoke all on public.app_releases from anon, authenticated;
grant select, delete on public.app_releases to authenticated;
grant insert (version, title, notes, published_at) on public.app_releases to authenticated;
grant update (version, title, notes, published_at) on public.app_releases to authenticated;

-- As novidades publicadas, da mais recente para a mais antiga (página /novidades).
create or replace function public.app_releases_published(p_limit integer default 20)
returns table (id uuid, version text, title text, notes text, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.version, r.title, r.notes, r.published_at
  from public.app_releases r
  where r.published_at is not null and r.published_at <= now()
  order by r.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.app_releases_published(integer) from public;
grant execute on function public.app_releases_published(integer) to anon, authenticated, service_role;

-- Progresso do envio, somado de uma vez (dois lotes a acabar ao mesmo tempo não perdem contas).
create or replace function public.app_release_push_progress(p_id uuid, p_sent integer, p_failed integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.app_releases
  set push_sent = push_sent + greatest(coalesce(p_sent, 0), 0),
      push_failed = push_failed + greatest(coalesce(p_failed, 0), 0)
  where id = p_id;
$$;
revoke all on function public.app_release_push_progress(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.app_release_push_progress(uuid, integer, integer) to service_role;

-- Registo de segurança: avisar todos os aparelhos é uma acção que chega a toda a gente.
create or replace function private.audit_app_releases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.push_requested_at is null and new.push_requested_at is not null then
    perform private.audit_write(
      'app_releases', new.id::text, 'update',
      left('Novidades da app avisadas por push a todos os aparelhos: ' || new.title, 300),
      jsonb_build_object('push_requested_at', jsonb_build_object('antes', null, 'depois', new.push_requested_at)),
      false
    );
  end if;
  return null;
end;
$$;
revoke execute on function private.audit_app_releases() from public, anon, authenticated;

drop trigger if exists app_releases_audit on public.app_releases;
create trigger app_releases_audit
  after update on public.app_releases
  for each row execute function private.audit_app_releases();

-- Cada aparelho escolhe se recebe as novidades da app (as encomendas e a comunidade não mudam).
alter table public.push_subscriptions add column if not exists app_updates boolean not null default true;
create index if not exists push_subscriptions_app_updates_idx on public.push_subscriptions (id) where app_updates;

-- O agendador dos avisos acorda a Edge Function também quando há um envio de novidades por acabar.
-- Igual à versão de 20261108100000_entregas_por_colportor.sql, com a última condição a mais.
create or replace function private.run_staff_dispatch()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
  v_open boolean;
  v_local timestamp := now() at time zone 'Africa/Luanda';
begin
  select (extract(isodow from v_local)::smallint = any (s.open_days)
          and extract(hour from v_local) >= s.open_hour
          and extract(hour from v_local) < s.close_hour)
  into v_open
  from public.staff_ops_settings s where s.id = 1;
  v_open := coalesce(v_open, true);

  -- Com a loja fechada, só o crítico sai para a equipa (o resto espera pela abertura); as
  -- respostas aos clientes, os avisos da comunidade e os dos colportores saem a qualquer hora.
  if not exists (
    select 1 from public.staff_notifications n
    where n.dispatched_at is null and n.created_at > now() - interval '2 days'
      and (v_open or n.severity = 'critical')
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind in ('support', 'colportagem') and c.created_at > now() - interval '2 days'
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind = 'community' and c.created_at > now() - interval '2 days'
      and (c.title <> 'Gostaram da sua publicação' or c.created_at < now() - interval '30 minutes')
  ) and not exists (
    select 1 from public.app_releases r
    where r.push_requested_at is not null and r.push_finished_at is null
      and r.push_requested_at > now() - interval '2 days'
  ) then
    return;
  end if;

  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Avisos: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/staff-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function private.run_staff_dispatch() from public, anon, authenticated;
