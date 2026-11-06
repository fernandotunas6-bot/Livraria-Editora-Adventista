-- Faixa de aviso no cabeçalho: um aviso curto no topo de todas as páginas da loja
-- (ex.: "A loja do Huambo fecha no feriado de 11 de Novembro", "Nova lição em Materiais").
--
--   * Vários avisos, cada um com início e fim opcionais: a equipa programa o do feriado com
--     antecedência. O site mostra um de cada vez: urgente, depois promoção, depois informação;
--     no mesmo tom, o que começou mais recentemente. Fechado um, aparece o seguinte.
--   * O visitante fecha o aviso se este o permitir; volta a aparecer se o texto ou o link mudar.
--   * Link opcional: um caminho do site (/materiais) ou um endereço http(s) sem credenciais.
--   * Todos lêem só os avisos ligados e dentro das datas; a equipa com manage_settings ou
--     manage_marketing lê todos e escreve (painel → Sistema → Faixa de aviso).
--
-- O site aplica as mesmas regras em app/web/src/lib/siteNotices.js; esta é a que manda.

create table if not exists public.site_notices (
  id text primary key default public.gen_record_id(),
  message text not null,
  link_url text not null default '',
  link_label text not null default '',
  tone text not null default 'info',
  dismissible boolean not null default true,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint site_notices_message_len check (char_length(btrim(message)) between 1 and 200),
  constraint site_notices_label_len check (char_length(link_label) <= 40),
  constraint site_notices_tone check (tone in ('info', 'promo', 'urgent')),
  constraint site_notices_dates check (starts_at is null or ends_at is null or ends_at > starts_at),
  -- Caminho do site ("/materiais", nunca "//outro.site") ou http(s) sem "utilizador@".
  constraint site_notices_link check (
    link_url = ''
    or (char_length(link_url) <= 300 and link_url ~ '^/([^/\\\s<>"''][^\s<>"'']*)?$')
    or (char_length(link_url) <= 500 and link_url ~* '^https?://[^\s<>"''@/\\]+(/[^\s<>"'']*)?$')
  )
);

create index if not exists site_notices_live_idx on public.site_notices (active, starts_at, ends_at);

-- Antes de gravar: texto limpo, datas de criação fixas, sem rótulo quando não há link.
create or replace function public.site_notices_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created := now();
  else
    new.created := old.created;
  end if;
  new.message := btrim(regexp_replace(coalesce(new.message, ''), '\s+', ' ', 'g'));
  new.link_url := btrim(coalesce(new.link_url, ''));
  new.link_label := btrim(coalesce(new.link_label, ''));
  if new.link_url = '' then new.link_label := ''; end if;
  new.updated := now();
  return new;
end;
$$;

drop trigger if exists site_notices_before_save on public.site_notices;
create trigger site_notices_before_save
  before insert or update on public.site_notices
  for each row execute function public.site_notices_before_save();

revoke all on function public.site_notices_before_save() from public, anon, authenticated;

create or replace function private.can_manage_notices()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('manage_settings') or private.has_permission('manage_marketing');
$$;

revoke all on function private.can_manage_notices() from public;
grant execute on function private.can_manage_notices() to anon, authenticated, service_role;

alter table public.site_notices enable row level security;

drop policy if exists "site_notices: todos lêem os que estão no ar" on public.site_notices;
create policy "site_notices: todos lêem os que estão no ar" on public.site_notices
  for select to anon, authenticated
  using (
    (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or (select private.can_manage_notices())
  );
drop policy if exists "site_notices: a equipa cria" on public.site_notices;
create policy "site_notices: a equipa cria" on public.site_notices
  for insert to authenticated with check ((select private.can_manage_notices()));
drop policy if exists "site_notices: a equipa edita" on public.site_notices;
create policy "site_notices: a equipa edita" on public.site_notices
  for update to authenticated using ((select private.can_manage_notices()))
  with check ((select private.can_manage_notices()));
drop policy if exists "site_notices: a equipa apaga" on public.site_notices;
create policy "site_notices: a equipa apaga" on public.site_notices
  for delete to authenticated using ((select private.can_manage_notices()));

revoke all on public.site_notices from anon, authenticated;
grant select on public.site_notices to anon, authenticated;
grant insert, update, delete on public.site_notices to authenticated;
