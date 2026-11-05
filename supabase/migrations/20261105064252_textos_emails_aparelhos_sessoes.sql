-- Textos dos emails editáveis com versões, aparelhos conhecidos de cada conta, e terminar
-- as sessões de uma conta em todos os aparelhos.
--
-- 1. `email_template_versions`: cada gravação no editor do painel é uma versão nova, nunca
--    uma alteração por cima. A versão em vigor de um modelo é a de número mais alto. Voltar
--    a uma versão anterior grava uma versão nova com o conteúdo dessa — o histórico fica
--    inteiro e o "voltar atrás" também se pode desfazer. `content` nulo quer dizer "texto de
--    origem" (o que está no código), e é assim que se repõe o original.
--
-- 2. `account_devices`: aparelhos ("Chrome em Android") de onde cada conta já entrou, como
--    hash. Serve só para o aviso de novo acesso: a primeira entrada num aparelho novo gera um
--    email; as seguintes não.
--
-- 3. `admin_end_user_sessions`: apaga as sessões de uma conta em `auth.sessions`, o que
--    invalida os refresh tokens em todos os aparelhos. Os tokens de acesso já emitidos
--    expiram sozinhos (1 hora, por omissão) — o mesmo que acontece com o "terminar sessão
--    em todos os aparelhos" do próprio Supabase.
--
-- Nada disto é lido pelo site: só a Edge Function (service role) mexe nestas tabelas.
-- Reverter: drop das duas tabelas e das duas funções.

create table if not exists public.email_template_versions (
  id bigint generated always as identity primary key,
  template_key text not null check (template_key ~ '^[a-z_]{2,40}$'),
  version integer not null check (version > 0),
  content jsonb check (content is null or jsonb_typeof(content) = 'object'),
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid,
  created_by_name text not null default '' check (char_length(created_by_name) <= 120),
  created_at timestamptz not null default now(),
  unique (template_key, version)
);
alter table public.email_template_versions enable row level security;
revoke all on public.email_template_versions from public, anon, authenticated;
comment on table public.email_template_versions is
  'Versões dos textos dos emails editados no painel. Em vigor: a de versão mais alta. content nulo = texto de origem.';

create table if not exists public.account_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_key text not null check (device_key ~ '^[0-9a-f]{64}$'),
  description text not null default '' check (char_length(description) <= 80),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_key)
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from public, anon, authenticated;
comment on table public.account_devices is
  'Aparelhos (navegador + sistema, em hash) de onde cada conta já entrou. Só para o aviso de novo acesso.';

-- Grava uma versão nova de um modelo e devolve-a. O número é calculado aqui, debaixo de um
-- bloqueio por modelo, para duas gravações ao mesmo tempo não tentarem o mesmo número.
create or replace function public.email_template_save(
  p_key text, p_content jsonb, p_note text, p_by uuid, p_by_name text
)
returns public.email_template_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  saved public.email_template_versions;
begin
  perform pg_advisory_xact_lock(hashtext('email_template:' || p_key));
  select coalesce(max(version), 0) + 1 into next_version
  from public.email_template_versions where template_key = p_key;
  insert into public.email_template_versions (template_key, version, content, note, created_by, created_by_name)
  values (p_key, next_version, p_content, left(coalesce(p_note, ''), 200), p_by, left(coalesce(p_by_name, ''), 120))
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.email_template_save(text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.email_template_save(text, jsonb, text, uuid, text) to service_role;

-- Termina todas as sessões de uma conta. Devolve quantas havia.
create or replace function public.admin_end_user_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  -- Os dois, como em users_admin_set_suspended: os refresh tokens antigos (sem sessão) também
  -- deixam de servir.
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.admin_end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_end_user_sessions(uuid) to service_role;
