-- Registo de segurança: quem mudou o quê nos dados que um atacante (ou alguém de dentro)
-- usaria para desviar dinheiro ou clientes, e aviso imediato aos administradores.
--
-- Porquê. A loja recebe por transferência e Multicaixa: o golpe mais rentável contra ela não
-- é partir o site, é trocar o IBAN ou a referência de um método de pagamento, ou o WhatsApp e
-- o email de contacto, e deixar os clientes pagarem a outra pessoa. Basta uma conta da equipa
-- com a palavra-passe roubada (nenhuma das quatro tinha a verificação em dois passos activa a
-- 2026-11-07). Até aqui essas mudanças não deixavam rasto nenhum: o `updated` da linha diz
-- quando, não quem nem o que estava antes.
--
-- O que fica:
--   * `public.security_audit_log`: só acrescenta. Ninguém altera nem apaga uma linha (nem a
--     service role: um gatilho recusa), excepto a limpeza das que têm mais de dois anos.
--     Só os administradores a lêem, pela API, como qualquer outra tabela.
--   * Gatilhos nas tabelas sensíveis. Gravam o antes e o depois dos campos que importam; os
--     segredos aparecem só como "alterado", nunca o valor.
--   * Aviso crítico (`staff_notifications`, kind 'security') a todos os administradores para o
--     que pede reacção já: dados de pagamento, permissões da equipa, contactos da loja,
--     segredos e integrações. Crítico sai logo por email e push, mesmo fora de horas
--     (`channelsFor` em opsRouting.ts). O aviso vai também para quem fez a mudança: se a
--     conta foi roubada, é o dono verdadeiro que lê o email.
--
-- Quem fez a mudança:
--   * pedido com a sessão de alguém (painel → PostgREST): `auth.uid()`;
--   * pedido da Edge Function (service role) em nome de alguém: o cabeçalho `x-actor-id`,
--     que só conta quando o JWT é da service role (um cliente não o consegue forjar: o JWT
--     dele é `authenticated`);
--   * o próprio Supabase Auth (por exemplo, o admin pré-autorizado promovido ao confirmar o
--     email): "login";
--   * tarefa do pg_cron: "agendador";
--   * sem JWT nenhum: SQL directo (SQL Editor ou ligação à base) — também fica registado.
--
-- O que não passa por uma tabela com gatilho — suspender, apagar ou terminar as sessões de uma
-- conta, gerar um link de acesso, mudar o email de outra pessoa — é registado pela Edge
-- Function com `public.security_audit_record`, que só a service role pode chamar. O email não
-- é vigiado no gatilho dos perfis: a mudança chega sempre pelo Supabase Auth
-- (`sync_profile_email`), seja o dono da conta a confirmá-la, seja um administrador, e o
-- gatilho não distingue os dois casos; a Edge Function distingue.
--
-- Os gatilhos nunca impedem a gravação que observam: se o registo falhar, a alteração passa e
-- o erro fica nos registos do Postgres (WARNING). Para uma loja pequena, não conseguir mudar o
-- stock porque o registo rebentou é pior do que uma linha a menos no registo.

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  actor_kind text not null check (actor_kind in ('conta', 'servidor', 'login', 'agendador', 'sql')),
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  summary text not null,
  changes jsonb not null default '{}'::jsonb,
  alerted boolean not null default false
);
comment on table public.security_audit_log is
  'Registo só de acrescentar das alterações sensíveis (pagamentos, permissões, contactos, segredos). Lido pelos administradores; escrito só pelos gatilhos.';

create index if not exists security_audit_log_at_idx on public.security_audit_log (at desc);
create index if not exists security_audit_log_row_idx on public.security_audit_log (table_name, row_id, at desc);
create index if not exists security_audit_log_actor_idx on public.security_audit_log (actor_id) where actor_id is not null;

alter table public.security_audit_log enable row level security;
revoke all on public.security_audit_log from anon, authenticated;
grant select on public.security_audit_log to authenticated;

drop policy if exists "security_audit_log: só administradores lêem" on public.security_audit_log;
create policy "security_audit_log: só administradores lêem"
  on public.security_audit_log for select to authenticated
  using ((select private.is_admin()));

-- Só acrescentar: nem a service role muda ou apaga o que lá está. A excepção é a limpeza das
-- linhas com mais de dois anos (`private.purge_security_audit_log`).
create or replace function private.security_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'O registo de segurança não pode ser alterado nem apagado.'
    using errcode = '42501';
end;
$$;
revoke execute on function private.security_audit_log_append_only() from public, anon, authenticated;

drop trigger if exists security_audit_log_append_only on public.security_audit_log;
create trigger security_audit_log_append_only
  before update or delete on public.security_audit_log
  for each row execute function private.security_audit_log_append_only();

create or replace function private.security_audit_log_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O registo de segurança não pode ser esvaziado.' using errcode = '42501';
end;
$$;
revoke execute on function private.security_audit_log_no_truncate() from public, anon, authenticated;

drop trigger if exists security_audit_log_no_truncate on public.security_audit_log;
create trigger security_audit_log_no_truncate
  before truncate on public.security_audit_log
  for each statement execute function private.security_audit_log_no_truncate();

-- O aviso novo.
alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind = any (array[
    'new_order', 'support', 'order_stuck', 'order_problem', 'order_confirmed', 'payment_reported',
    'order_overdue', 'order_unacknowledged', 'ticket_sla', 'escalation', 'ops_test', 'security'
  ]));

-- ---------------------------------------------------------------------------
-- 2. Ajudantes
-- ---------------------------------------------------------------------------

-- Quem está a fazer a alteração (ver o cabeçalho deste ficheiro).
create or replace function private.audit_actor(out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_header text;
begin
  actor_id := auth.uid();
  if actor_id is not null then
    actor_kind := 'conta';
    return;
  end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    actor_kind := 'servidor';
    begin
      v_header := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id';
    exception when others then
      v_header := null;
    end;
    if v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      actor_id := v_header::uuid;
    end if;
    return;
  end if;
  -- `session_user` é quem abriu a ligação; não muda dentro de funções `security definer`.
  if session_user = 'supabase_auth_admin' then
    actor_kind := 'login';
  elsif current_setting('application_name', true) = 'pg_cron' then
    actor_kind := 'agendador';
  else
    actor_kind := 'sql';
  end if;
end;
$$;
revoke execute on function private.audit_actor() from public, anon, authenticated;

-- Um valor para o registo: texto longo cortado, para uma descrição de 10 KB não encher a tabela.
create or replace function private.audit_clip(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then 'null'::jsonb
    when jsonb_typeof(p) = 'string' and char_length(p #>> '{}') > 400
      then to_jsonb(left(p #>> '{}', 400) || '…')
    when jsonb_typeof(p) in ('object', 'array') and char_length(p::text) > 600
      then to_jsonb(left(p::text, 600) || '…')
    else p
  end;
$$;
revoke execute on function private.audit_clip(jsonb) from public, anon, authenticated;

-- O que mudou entre duas versões da linha: {"campo": {"de": …, "para": …}}.
-- `p_only`: só estes campos (null = todos); `p_skip`: nunca estes; `p_mask`: só "alterado".
create or replace function private.audit_diff(
  p_old jsonb, p_new jsonb, p_only text[] default null, p_skip text[] default '{}', p_mask text[] default '{}'
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k,
    case when k = any (p_mask)
      then jsonb_build_object('de', case when coalesce(p_old ->> k, '') = '' then '(vazio)' else '(definido)' end,
                              'para', case when coalesce(p_new ->> k, '') = '' then '(vazio)' else '(alterado)' end)
      else jsonb_build_object('de', private.audit_clip(p_old -> k), 'para', private.audit_clip(p_new -> k))
    end), '{}'::jsonb)
  from (
    select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(p_new, '{}'::jsonb))
  ) keys
  where (p_only is null or k = any (p_only))
    and not (k = any (p_skip))
    and (p_old -> k) is distinct from (p_new -> k);
$$;
revoke execute on function private.audit_diff(jsonb, jsonb, text[], text[], text[]) from public, anon, authenticated;

-- Grava uma linha e, se `p_alert`, avisa os administradores (no máximo um aviso por linha da
-- tabela de origem a cada 10 minutos: quem corrige um IBAN três vezes seguidas recebe um
-- email, não três; as três alterações ficam todas no registo).
create or replace function private.audit_write(
  p_table text, p_row_id text, p_action text, p_summary text, p_changes jsonb, p_alert boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_kind text;
  v_email text;
  v_who text;
  v_alert boolean := coalesce(p_alert, false);
  v_summary text := left(coalesce(nullif(btrim(p_summary), ''), 'Alteração'), 300);
begin
  select a.actor_id, a.actor_kind into v_actor_id, v_actor_kind from private.audit_actor() a;
  if v_actor_id is not null then
    select p.email into v_email from public.profiles p where p.id = v_actor_id;
  end if;

  if v_alert and exists (
    select 1 from public.security_audit_log l
    where l.alerted and l.table_name = p_table and l.row_id is not distinct from p_row_id
      and l.at > now() - interval '10 minutes'
  ) then
    v_alert := false;
  end if;

  insert into public.security_audit_log
    (actor_id, actor_email, actor_kind, table_name, row_id, action, summary, changes, alerted)
  values
    (v_actor_id, v_email, v_actor_kind, p_table, p_row_id, p_action, v_summary,
     coalesce(p_changes, '{}'::jsonb), v_alert);

  if v_alert then
    v_who := coalesce(v_email, case v_actor_kind
      when 'sql' then 'acesso directo à base de dados'
      when 'login' then 'o sistema de login'
      when 'agendador' then 'uma tarefa automática'
      else 'o servidor' end);
    insert into public.staff_notifications (staff_id, kind, severity, title, body)
    select p.id, 'security', 'critical',
      left('Segurança: ' || v_summary, 120),
      left(v_summary || ' — por ' || v_who || ', '
        || to_char(now() at time zone 'Africa/Luanda', 'DD/MM/YYYY "às" HH24:MI') || '. '
        || 'Se não foi alguém da equipa, mude já a palavra-passe dessa conta e veja o Registo de segurança no painel (Utilizadores).',
        500)
    from public.profiles p
    where p.role = 'admin';
  end if;
exception when others then
  raise warning 'Registo de segurança: não foi possível registar "%" (%).', v_summary, sqlerrm;
end;
$$;
revoke execute on function private.audit_write(text, text, text, text, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gatilhos
-- ---------------------------------------------------------------------------

-- Métodos de pagamento: é aqui que estão o IBAN, a referência, o link e o QR que o cliente usa.
create or replace function private.audit_payment_methods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_name text := coalesce(v_new ->> 'name', v_old ->> 'name', '');
  v_changes jsonb;
  v_money text[] := array['account_info', 'instructions', 'payment_link', 'qr_url', 'qr_code',
                          'gateway_provider', 'requires_reference', 'enabled'];
begin
  v_changes := private.audit_diff(v_old, v_new,
    array['name', 'code', 'type', 'category', 'enabled', 'instructions', 'account_info', 'payment_link',
          'qr_url', 'qr_code', 'gateway_provider', 'requires_reference', 'shipping_methods']);
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write(
    'payment_methods', coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op),
    case tg_op
      when 'INSERT' then 'Método de pagamento criado: ' || v_name
      when 'DELETE' then 'Método de pagamento apagado: ' || v_name
      else 'Dados de pagamento alterados: ' || v_name
    end,
    v_changes,
    tg_op <> 'UPDATE' or exists (select 1 from jsonb_object_keys(v_changes) k where k = any (v_money))
  );
  return null;
end;
$$;
revoke execute on function private.audit_payment_methods() from public, anon, authenticated;

drop trigger if exists payment_methods_audit on public.payment_methods;
create trigger payment_methods_audit
  after insert or update or delete on public.payment_methods
  for each row execute function private.audit_payment_methods();

-- Configurações do site: contactos, endereço do site e envio de email avisam; o resto fica só
-- registado. Os campos de segredos aparecem como "alterado" (o gatilho `capture_secrets` já os
-- passa para `private.site_secrets` e deixa a coluna vazia, mas o registo não conta com isso).
create or replace function private.audit_site_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changes jsonb;
  v_alert_fields text[] := array['contact_email', 'contact_phone', 'contact_address', 'whatsapp', 'site_url',
    'email_provider', 'smtp_host', 'smtp_user', 'smtp_password', 'smtp_from_email', 'sendgrid_api_key',
    'brevo_api_key', 'cloudflare_email_token', 'cloudflare_account_id', 'google_oauth_enabled',
    'maintenance_mode', 'header_cta_link'];
  v_secret_fields text[] := array['sendgrid_api_key', 'smtp_password', 'vapid_private_key', 'gemini_api_key',
    'deepseek_api_key', 'brevo_api_key', 'cloudflare_email_token', 'google_maps_embed_key'];
begin
  v_changes := private.audit_diff(v_old, v_new, null, array['updated', 'created'], v_secret_fields);
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write(
    'site_settings', coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op),
    case tg_op
      when 'INSERT' then 'Nova linha de configurações do site'
      when 'DELETE' then 'Configurações do site apagadas'
      else 'Configurações alteradas: ' || (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_changes) k)
    end,
    case when tg_op = 'UPDATE' then v_changes else '{}'::jsonb end,
    tg_op <> 'UPDATE' or exists (select 1 from jsonb_object_keys(v_changes) k where k = any (v_alert_fields))
  );
  return null;
end;
$$;
revoke execute on function private.audit_site_settings() from public, anon, authenticated;

drop trigger if exists site_settings_audit on public.site_settings;
create trigger site_settings_audit
  after insert or update or delete on public.site_settings
  for each row execute function private.audit_site_settings();

-- Perfis: quem ganha ou perde poderes (o email é registado pela Edge Function; ver o topo).
create or replace function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_changes jsonb;
begin
  -- Papéis: 'member' (cliente), 'manager' e 'admin' (a equipa). Um cliente novo não interessa.
  if tg_op = 'INSERT' then
    if coalesce(new.role, 'member') not in ('admin', 'manager') then return null; end if;
    perform private.audit_write('profiles', new.id::text, 'insert',
      'Conta da equipa criada: ' || coalesce(new.email, new.id::text) || ' (' || new.role || ')',
      jsonb_build_object('role', jsonb_build_object('de', null, 'para', new.role),
                         'permissions', jsonb_build_object('de', null, 'para', new.permissions)),
      true);
    return null;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.role, 'member') not in ('admin', 'manager') then return null; end if;
    perform private.audit_write('profiles', old.id::text, 'delete',
      'Conta da equipa apagada: ' || coalesce(old.email, old.id::text) || ' (' || old.role || ')',
      '{}'::jsonb, true);
    return null;
  end if;

  v_label := coalesce(new.email, old.email, new.id::text);
  if new.role is distinct from old.role or new.permissions is distinct from old.permissions then
    v_changes := private.audit_diff(to_jsonb(old), to_jsonb(new), array['role', 'permissions']);
    perform private.audit_write('profiles', new.id::text, 'update',
      'Permissões alteradas: ' || v_label
        || case when new.role is distinct from old.role
             then ' (' || coalesce(old.role, '—') || ' → ' || coalesce(new.role, '—') || ')' else '' end,
      v_changes, true);
  end if;
  return null;
end;
$$;
revoke execute on function private.audit_profiles() from public, anon, authenticated;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update of role, permissions or delete on public.profiles
  for each row execute function private.audit_profiles();

-- Lojas: o telefone e o WhatsApp de cada loja são onde o cliente liga para pagar ou levantar.
create or replace function private.audit_physical_stores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_name text := coalesce(v_new ->> 'name', v_old ->> 'name', '');
  v_changes jsonb;
begin
  v_changes := private.audit_diff(v_old, v_new,
    array['name', 'phone', 'whatsapp', 'email', 'address', 'active', 'pickup_enabled']);
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write(
    'physical_stores', coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op),
    case tg_op
      when 'INSERT' then 'Loja criada: ' || v_name
      when 'DELETE' then 'Loja apagada: ' || v_name
      else 'Dados da loja alterados: ' || v_name
    end,
    v_changes,
    tg_op <> 'UPDATE' or exists (
      select 1 from jsonb_object_keys(v_changes) k where k in ('phone', 'whatsapp', 'email'))
  );
  return null;
end;
$$;
revoke execute on function private.audit_physical_stores() from public, anon, authenticated;

drop trigger if exists physical_stores_audit on public.physical_stores;
create trigger physical_stores_audit
  after insert or update or delete on public.physical_stores
  for each row execute function private.audit_physical_stores();

-- Segredos (chaves de email, WhatsApp, …): só o nome da chave, nunca o valor.
create or replace function private.audit_site_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(case when tg_op <> 'DELETE' then new.key end, old.key);
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return null;
  end if;
  perform private.audit_write('site_secrets', v_key, lower(tg_op),
    case
      when tg_op = 'DELETE' or coalesce(new.value, '') = '' then 'Segredo apagado: ' || v_key
      when tg_op = 'INSERT' then 'Segredo definido: ' || v_key
      else 'Segredo substituído: ' || v_key
    end,
    '{}'::jsonb, true);
  return null;
end;
$$;
revoke execute on function private.audit_site_secrets() from public, anon, authenticated;

drop trigger if exists site_secrets_audit on private.site_secrets;
create trigger site_secrets_audit
  after insert or update or delete on private.site_secrets
  for each row execute function private.audit_site_secrets();

-- Integrações (WhatsApp, Google Drive, …): a configuração pode levar credenciais, por isso o
-- registo diz só que mudou.
create or replace function private.audit_app_integrations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_code text := coalesce(v_new ->> 'code', v_old ->> 'code', '');
  v_changes jsonb;
begin
  v_changes := private.audit_diff(v_old, v_new, array['code', 'name', 'enabled', 'config'], '{}', array['config']);
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write(
    'app_integrations', coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op),
    case tg_op
      when 'INSERT' then 'Integração criada: ' || v_code
      when 'DELETE' then 'Integração apagada: ' || v_code
      else 'Integração alterada: ' || v_code
    end,
    v_changes, true);
  return null;
end;
$$;
revoke execute on function private.audit_app_integrations() from public, anon, authenticated;

drop trigger if exists app_integrations_audit on public.app_integrations;
create trigger app_integrations_audit
  after insert or update or delete on public.app_integrations
  for each row execute function private.audit_app_integrations();

-- Encomendas: pagamento marcado, total mudado, cancelamentos. Fica registado, sem aviso (cada
-- venda confirmada seria um email). É o que responde a "quem marcou esta como paga?".
create or replace function private.audit_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  v_changes := private.audit_diff(to_jsonb(old), to_jsonb(new),
    array['payment_status', 'status', 'total', 'shipping_cost', 'payment_reference']);
  if v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write('orders', new.id, 'update',
    'Encomenda ' || coalesce(new.order_number, new.id) || ': '
      || (select string_agg(case k
            when 'payment_status' then 'pagamento ' || coalesce(old.payment_status, '—') || ' → ' || coalesce(new.payment_status, '—')
            when 'status' then 'estado ' || coalesce(old.status, '—') || ' → ' || coalesce(new.status, '—')
            when 'total' then 'total ' || coalesce(old.total::text, '—') || ' → ' || coalesce(new.total::text, '—')
            when 'shipping_cost' then 'portes ' || coalesce(old.shipping_cost::text, '—') || ' → ' || coalesce(new.shipping_cost::text, '—')
            else 'referência de pagamento'
          end, '; ' order by k) from jsonb_object_keys(v_changes) k),
    v_changes, false);
  return null;
end;
$$;
revoke execute on function private.audit_orders() from public, anon, authenticated;

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after update of payment_status, status, total, shipping_cost, payment_reference on public.orders
  for each row execute function private.audit_orders();

-- Preços: um livro posto a 1 Kz e comprado logo a seguir é o golpe interno mais simples.
create or replace function private.audit_stock_prices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  v_changes := private.audit_diff(to_jsonb(old), to_jsonb(new), array['price', 'sale_price']);
  if v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write('stock_books', new.id, 'update',
    'Preço alterado: ' || coalesce(new.title, new.id), v_changes, false);
  return null;
end;
$$;
revoke execute on function private.audit_stock_prices() from public, anon, authenticated;

drop trigger if exists stock_books_price_audit on public.stock_books;
create trigger stock_books_price_audit
  after update of price, sale_price on public.stock_books
  for each row execute function private.audit_stock_prices();

-- Materiais pagos: passar um PDF pago a gratuito, ou trocar o ficheiro.
create or replace function private.audit_downloads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  v_changes := private.audit_diff(to_jsonb(old), to_jsonb(new), array['access', 'file_path']);
  if v_changes = '{}'::jsonb then
    return null;
  end if;
  perform private.audit_write('downloads', new.id, 'update',
    'Material para descarregar alterado: ' || coalesce(new.title, new.id), v_changes, false);
  return null;
end;
$$;
revoke execute on function private.audit_downloads() from public, anon, authenticated;

drop trigger if exists downloads_audit on public.downloads;
create trigger downloads_audit
  after update of access, file_path on public.downloads
  for each row execute function private.audit_downloads();

-- ---------------------------------------------------------------------------
-- 4. Entrada pela Edge Function (acções sobre contas que não mudam uma tabela vigiada)
-- ---------------------------------------------------------------------------
create or replace function public.security_audit_record(
  p_table text, p_row_id text, p_action text, p_summary text,
  p_changes jsonb default '{}'::jsonb, p_alert boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Só o servidor regista acções.' using errcode = '42501';
  end if;
  if p_action not in ('insert', 'update', 'delete') then
    raise exception 'Acção inválida.';
  end if;
  perform private.audit_write(left(coalesce(p_table, ''), 60), left(p_row_id, 200), p_action,
    p_summary, coalesce(p_changes, '{}'::jsonb), coalesce(p_alert, false));
end;
$$;
revoke execute on function public.security_audit_record(text, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.security_audit_record(text, text, text, text, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Limpeza: dois anos chegam para investigar; o resto sai uma vez por mês.
-- ---------------------------------------------------------------------------
create or replace function private.purge_security_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.security_audit_log where at < now() - interval '2 years';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.purge_security_audit_log() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('limpeza-registo-seguranca');
exception when others then null;
end
$$;
do $$
begin
  perform cron.schedule('limpeza-registo-seguranca', '17 4 1 * *', 'select private.purge_security_audit_log();');
exception when others then
  raise notice 'Não foi possível agendar a limpeza do registo de segurança (%).', sqlerrm;
end
$$;
