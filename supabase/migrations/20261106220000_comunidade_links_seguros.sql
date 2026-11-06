-- Comunidade: links maliciosos e pornográficos não entram (pedido do dono, 2026-11-06).
--
-- Três camadas, todas na base de dados, para não se contornarem chamando a API à mão:
--
--   1. Regras fixas, verificadas ao gravar: só sites com nome (sem endereço IP, sem número de
--      porta, sem "xn--", que disfarça letras), sem os domínios de topo de adultos (.xxx,
--      .porn, .sex, .adult) nem os que se confundem com ficheiros (.zip, .mov), sem palavras de
--      conteúdo adulto no nome do site, sem programas (.exe, .apk…).
--   2. Lista de domínios bloqueados (public.community_blocked_domains): sites adultos
--      conhecidos, encurtadores (escondem o destino) e "IP loggers". A equipa aumenta-a no
--      painel (Clientes → Comunidade). Juntar um domínio oculta logo as publicações que o têm.
--   3. Reputação: cada site novo é consultado no filtro de família do Cloudflare (1.1.1.3, que
--      bloqueia malware e conteúdo adulto), por DNS sobre HTTPS com o pg_net. O agendador lê as
--      respostas a cada minuto: um site filtrado entra na lista (2), o que oculta as publicações
--      com ele e recusa as próximas logo ao gravar. Cada site é consultado uma vez por 30 dias.
--      Sem pg_net ou pg_cron (ou sem resposta do Cloudflare), ficam as camadas 1 e 2.
--
-- Valem para os links da lista e para os endereços escritos no texto e na citação: o site
-- transforma-os em links (linkifySegments). Antes só a lista era verificada.
-- O site aplica a camada 1 em app/web/src/lib/communityLinks.js (linkProblem), para o aviso
-- aparecer antes de publicar; esta é a regra que manda.

-- ── Lista de domínios bloqueados ────────────────────────────────────────────

create table if not exists public.community_blocked_domains (
  domain text primary key,
  category text not null default 'outro',
  source text not null default 'equipa',
  note text not null default '',
  created timestamptz not null default now(),
  constraint community_blocked_domains_domain check (
    char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  constraint community_blocked_domains_category check (category in ('adulto', 'malicioso', 'encurtador', 'filtro', 'outro')),
  constraint community_blocked_domains_source check (source in ('lista', 'equipa', 'filtro')),
  constraint community_blocked_domains_note check (char_length(note) <= 200)
);

-- O domínio entra limpo: sem "https://", caminho, porta nem "www.". A equipa escreve como
-- equipa (não como a lista de origem nem como o filtro).
create or replace function private.community_blocked_domain_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.domain := lower(btrim(coalesce(new.domain, '')));
  new.domain := regexp_replace(new.domain, '^[a-z][a-z0-9+.-]*://', '');
  new.domain := split_part(split_part(split_part(new.domain, '/', 1), '?', 1), '#', 1);
  new.domain := regexp_replace(new.domain, ':[0-9]*$', '');
  new.domain := regexp_replace(rtrim(new.domain, '.'), '^www\.', '');
  new.note := left(btrim(coalesce(new.note, '')), 200);
  if tg_op = 'INSERT' then new.created := now(); end if;
  if auth.uid() is not null and pg_trigger_depth() <= 1 then new.source := 'equipa'; end if;
  return new;
end;
$$;

drop trigger if exists community_blocked_domains_normalize on public.community_blocked_domains;
create trigger community_blocked_domains_normalize
  before insert or update on public.community_blocked_domains
  for each row execute function private.community_blocked_domain_normalize();

-- ── Endereços de uma publicação ─────────────────────────────────────────────

-- Parte "utilizador:senha@site:porta" do endereço, em minúsculas.
create or replace function private.url_authority(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(substring(coalesce(p_url, '') from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'));
$$;

-- Só o nome do site, sem porta nem ponto final.
create or replace function private.url_host(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(rtrim(regexp_replace(private.url_authority(p_url), ':[0-9]*$', ''), '.'), '');
$$;

-- Endereços escritos no texto, como o site os transforma em links (pontuação final de fora).
create or replace function private.community_text_urls(p_text text)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(m[1], '[.,;:!?)\]]+$', '')
  from regexp_matches(coalesce(p_text, ''), '(https?://[^\s<>"'']+)', 'gi') as m;
$$;

-- Todos os endereços de uma publicação: a lista, o texto e a citação, sem repetir.
create or replace function private.community_post_urls(p_links jsonb, p_body text, p_quote text)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select distinct u
  from (
    select jsonb_array_elements_text(case when jsonb_typeof(p_links) = 'array' then p_links else '[]'::jsonb end) as u
    union all select private.community_text_urls(p_body)
    union all select private.community_text_urls(p_quote)
  ) s
  where coalesce(u, '') <> '';
$$;

-- O motivo por que um link não pode ser publicado, ou null se pode.
create or replace function private.community_link_problem(p_url text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_auth text;
  v_host text;
  v_tld text;
  v_rest text;
  v_category text;
  v_token text;
  c_adult constant text := 'Links para conteúdo adulto não são permitidos na comunidade.';
begin
  if char_length(v_url) > 500 or v_url !~* '^https?://[^\s<>"'']+$' then
    return 'Link inválido: só endereços http ou https.';
  end if;
  v_auth := private.url_authority(v_url);
  if v_auth like '%@%' then
    return 'Link inválido: endereços com utilizador ou palavra-passe não são permitidos.';
  end if;
  if v_auth ~ ':[0-9]*$' and v_auth !~ ':(80|443)$' then
    return 'Links com número de porta (como :8080) não são permitidos.';
  end if;
  v_host := private.url_host(v_url);
  if v_host is null or v_host ~ '^\[' or v_host ~ '^[0-9.]+$' then
    return 'Links para endereços IP não são permitidos: use o nome do site.';
  end if;
  if v_host ~ '(^|\.)xn--' then
    return 'Sites com letras disfarçadas (xn--) não são permitidos.';
  end if;
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    return 'Link inválido: o nome do site não é válido.';
  end if;

  v_tld := substring(v_host from '\.([a-z0-9-]+)$');
  if v_tld in ('xxx', 'porn', 'sex', 'adult') then return c_adult; end if;
  if v_tld in ('zip', 'mov') then
    return 'Sites .zip e .mov não são permitidos: confundem-se com ficheiros.';
  end if;

  select d.category into v_category
  from public.community_blocked_domains d
  where v_host = d.domain or v_host like ('%.' || d.domain)
  order by char_length(d.domain) desc
  limit 1;
  if v_category is not null then
    return case v_category
      when 'adulto' then c_adult
      when 'malicioso' then 'Este site foi marcado como perigoso e não pode ser publicado.'
      when 'encurtador' then 'Links encurtados não são permitidos: escreva o endereço completo do site.'
      when 'filtro' then 'Este site foi bloqueado pelo filtro de segurança (malware ou conteúdo adulto).'
      else 'Este site não é permitido na comunidade.'
    end;
  end if;

  -- Palavras de conteúdo adulto no nome do site: em qualquer parte, as que não têm outro
  -- sentido; como palavra inteira (entre pontos e hífenes) as que fazem parte de outras
  -- ("sex" está em "sussex" e "sexta").
  if v_host ~ '(porn|xvideo|xnxx|xhamster|hentai|onlyfans|brazzers|chaturbate|redtube|youporn|spankbang|stripchat|bongacams|livejasmin|camsoda|eporner|tnaflix|rule34|fapello|redgifs|fansly|xxx|nsfw|camgirl|sexcam|livesex|camsex)' then
    return c_adult;
  end if;
  foreach v_token in array regexp_split_to_array(v_host, '[.-]') loop
    if v_token in ('sex', 'sexy', 'sexo', 'porno', 'nude', 'nudes', 'nudez', 'escort', 'escorts', 'milf',
                   'fetish', 'fetiche', 'erotic', 'erotica', 'erotico', 'putaria', 'puta', 'putas', 'safada', 'safadas') then
      return c_adult;
    end if;
  end loop;

  -- Caminho e pesquisa: só palavras inteiras sem outro sentido (um texto sobre "pornografia"
  -- e dependência continua a poder ser partilhado).
  v_rest := lower(coalesce(substring(v_url from '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*(.*)$'), ''));
  if exists (
    select 1 from regexp_split_to_table(v_rest, '[^a-z0-9]+') t
    where t in ('xxx', 'nsfw', 'hentai', 'onlyfans', 'xvideos', 'xnxx', 'pornhub', 'porno')
  ) then
    return c_adult;
  end if;
  if split_part(split_part(v_rest, '?', 1), '#', 1) ~ '\.(exe|msi|bat|cmd|scr|pif|vbs|vbe|jse|wsf|ps1|apk|xapk|dmg|pkg|jar|lnk|hta|cpl|reg)$' then
    return 'Links para programas e ficheiros executáveis (.exe, .apk…) não são permitidos.';
  end if;
  return null;
end;
$$;

revoke all on function private.community_blocked_domain_normalize() from public, anon, authenticated;
revoke all on function private.url_authority(text) from public;
revoke all on function private.url_host(text) from public;
revoke all on function private.community_text_urls(text) from public;
revoke all on function private.community_post_urls(jsonb, text, text) from public;
revoke all on function private.community_link_problem(text) from public;

-- ── Gravação das publicações ────────────────────────────────────────────────

alter table public.community_posts add column if not exists moderation_note text not null default '';

-- A mesma função da migração `comunidade`, com: a nota de moderação protegida (só a equipa e
-- os triggers a escrevem) e todos os endereços verificados (lista, texto e citação), ao criar,
-- ao mudar o conteúdo e ao voltar a mostrar uma publicação oculta.
create or replace function public.community_posts_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.community_posts;
  v_link jsonb;
  v_url text;
  v_problem text;
  v_count int := 0;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
    new.created := now();
    new.likes_count := 0;
    new.reports_count := 0;
    new.hidden := false;
    new.moderation_note := '';
    if auth.uid() is not null
       and not private.check_rate_limit('comunidade', auth.uid()::text, 10, interval '1 hour') then
      raise exception 'Muitas publicações seguidas. Tente daqui a pouco.';
    end if;
  else
    new.user_id := old.user_id;
    new.parent_id := old.parent_id;
    new.created := old.created;
    -- Contadores, ocultação e nota só mudam pelos triggers (profundidade > 1) ou pela equipa.
    if pg_trigger_depth() <= 1 then
      new.likes_count := old.likes_count;
      new.reports_count := old.reports_count;
      if not private.is_staff() then
        new.hidden := old.hidden;
        new.moderation_note := old.moderation_note;
      end if;
    end if;
  end if;

  new.body := btrim(regexp_replace(coalesce(new.body, ''), E'\\n{3,}', E'\n\n', 'g'));
  new.quote := btrim(coalesce(new.quote, ''));
  new.quote_page := btrim(coalesce(new.quote_page, ''));
  new.moderation_note := left(coalesce(new.moderation_note, ''), 200);

  if new.parent_id is not null then
    select * into v_parent from public.community_posts where id = new.parent_id;
    if not found then raise exception 'A publicação que quer responder já não existe.'; end if;
    if v_parent.parent_id is not null then raise exception 'Só se responde a uma publicação, não a uma resposta.'; end if;
  end if;

  if new.links is null or jsonb_typeof(new.links) <> 'array' then new.links := '[]'::jsonb; end if;

  if tg_op = 'INSERT'
     or new.body is distinct from old.body
     or new.quote is distinct from old.quote
     or new.links is distinct from old.links
     or (old.hidden and not new.hidden) then
    for v_link in select * from jsonb_array_elements(new.links) loop
      if jsonb_typeof(v_link) <> 'string' then
        raise exception 'Link inválido: só endereços http ou https.';
      end if;
    end loop;
    for v_url in select * from private.community_post_urls(new.links, new.body, new.quote) loop
      v_count := v_count + 1;
      v_problem := private.community_link_problem(v_url);
      if v_problem is not null then raise exception '%', v_problem; end if;
    end loop;
    if v_count > 5 then raise exception 'No máximo 5 links por publicação.'; end if;
  end if;

  new.updated := now();
  return new;
end;
$$;

revoke all on function public.community_posts_before_save() from public, anon, authenticated;

-- ── Reputação (filtro de família do Cloudflare) ─────────────────────────────

create table if not exists private.community_host_checks (
  host text primary key,
  verdict text not null default 'pending',
  request_id bigint,
  attempts int not null default 0,
  sent_at timestamptz,
  checked_at timestamptz,
  detail text not null default '',
  created timestamptz not null default now(),
  constraint community_host_checks_verdict check (verdict in ('pending', 'ok', 'blocked', 'error'))
);
alter table private.community_host_checks enable row level security;
create index if not exists community_host_checks_pending_idx on private.community_host_checks (verdict, created);

-- Cada site novo de uma publicação fica na fila para ser consultado (ou outra vez, passados
-- 30 dias desde a última resposta).
create or replace function private.community_queue_link_checks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.body is not distinct from old.body
     and new.quote is not distinct from old.quote
     and new.links is not distinct from old.links then
    return null;
  end if;
  insert into private.community_host_checks (host)
  select distinct h
  from (select private.url_host(u) as h from private.community_post_urls(new.links, new.body, new.quote) u) s
  where h is not null
  on conflict (host) do update
    set verdict = 'pending', request_id = null, sent_at = null, attempts = 0, detail = ''
    where private.community_host_checks.verdict in ('ok', 'error')
      and private.community_host_checks.checked_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists community_posts_queue_link_checks on public.community_posts;
create trigger community_posts_queue_link_checks
  after insert or update on public.community_posts
  for each row execute function private.community_queue_link_checks();

-- Um domínio bloqueado oculta logo as publicações visíveis que o têm (na lista, no texto ou na
-- citação), com a nota para a equipa ver no painel.
create or replace function private.community_hide_blocked_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_posts p
  set hidden = true,
      moderation_note = left('Link bloqueado (' || new.category || '): ' || new.domain, 200)
  where not p.hidden
    and exists (
      select 1 from private.community_post_urls(p.links, p.body, p.quote) u
      where private.url_host(u) = new.domain or private.url_host(u) like ('%.' || new.domain)
    );
  return null;
end;
$$;

drop trigger if exists community_blocked_domains_hide on public.community_blocked_domains;
create trigger community_blocked_domains_hide
  after insert on public.community_blocked_domains
  for each row execute function private.community_hide_blocked_domain();

revoke all on function private.community_queue_link_checks() from public, anon, authenticated;
revoke all on function private.community_hide_blocked_domain() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net indisponível (%): a reputação dos links fica desligada.', sqlerrm;
end
$$;

-- O agendador: envia as consultas em espera e lê as respostas. O filtro de família do
-- Cloudflare responde 0.0.0.0 (e "Filtered") aos sites de malware e de conteúdo adulto.
-- `search_path` com os schemas do pg_net e sem plicas (entre plicas seria um só schema chamado
-- "net, extensions": ver a migração corrige_search_path_agendador).
create or replace function private.community_check_hosts()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v record;
  v_status int;
  v_content text;
  v_error text;
  v_json jsonb;
  v_blocked boolean;
begin
  -- 1. Enviar (até 30 por minuto).
  for v in
    select c.host from private.community_host_checks c
    where c.verdict = 'pending' and c.request_id is null
    order by c.created limit 30
  loop
    begin
      update private.community_host_checks
      set request_id = http_get(
            url := 'https://family.cloudflare-dns.com/dns-query?name=' || v.host || '&type=A',
            headers := '{"accept": "application/dns-json"}'::jsonb,
            timeout_milliseconds := 5000
          ),
          sent_at = now(),
          attempts = attempts + 1
      where host = v.host;
    exception when others then
      update private.community_host_checks
      set verdict = 'error', detail = left(sqlerrm, 200), checked_at = now()
      where host = v.host;
    end;
  end loop;

  -- 2. Ler as respostas que já chegaram.
  for v in
    select c.host, c.request_id, c.sent_at from private.community_host_checks c
    where c.verdict = 'pending' and c.request_id is not null
  loop
    v_status := null; v_content := null; v_error := null;
    begin
      select r.status_code, r.content, r.error_msg into v_status, v_content, v_error
      from _http_response r where r.id = v.request_id;
    exception when others then
      v_error := sqlerrm;
    end;
    if v_status is null and v_error is null then
      if v.sent_at < now() - interval '10 minutes' then
        update private.community_host_checks set verdict = 'error', detail = 'sem resposta', checked_at = now() where host = v.host;
      end if;
      continue;
    end if;
    if v_status is distinct from 200 then
      update private.community_host_checks
      set verdict = 'error', detail = left(coalesce(v_error, 'HTTP ' || v_status::text), 200), checked_at = now()
      where host = v.host;
      continue;
    end if;
    begin
      v_json := v_content::jsonb;
    exception when others then
      update private.community_host_checks set verdict = 'error', detail = 'resposta inválida', checked_at = now() where host = v.host;
      continue;
    end;
    v_blocked := exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(v_json -> 'Answer') = 'array' then v_json -> 'Answer' else '[]'::jsonb end) a
        where a ->> 'data' in ('0.0.0.0', '::')
      )
      or coalesce(v_json ->> 'Comment', '') ~* 'filtered';
    update private.community_host_checks
    set verdict = case when v_blocked then 'blocked' else 'ok' end,
        detail = case when v_blocked then 'filtro de família do Cloudflare' else '' end,
        checked_at = now()
    where host = v.host;
    if v_blocked then
      insert into public.community_blocked_domains (domain, category, source, note)
      values (v.host, 'filtro', 'filtro', 'Filtro de família do Cloudflare (malware ou conteúdo adulto)')
      on conflict (domain) do nothing;
    end if;
  end loop;

  -- 3. Os que falharam voltam à fila uma hora depois, até três tentativas.
  update private.community_host_checks
  set verdict = 'pending', request_id = null, sent_at = null
  where verdict = 'error' and attempts < 3 and checked_at < now() - interval '1 hour';
exception when others then
  raise notice 'Reputação dos links: %', sqlerrm;
end;
$$;

revoke all on function private.community_check_hosts() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('comunidade-links');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('comunidade-links', '* * * * *', 'select private.community_check_hosts();');
exception when others then
  raise notice 'Não foi possível agendar a reputação dos links (%): ficam as regras fixas e a lista.', sqlerrm;
end
$$;

-- ── Permissões da lista ─────────────────────────────────────────────────────

alter table public.community_blocked_domains enable row level security;

drop policy if exists "community_blocked_domains: moderação lê" on public.community_blocked_domains;
create policy "community_blocked_domains: moderação lê" on public.community_blocked_domains
  for select to authenticated using ((select private.has_permission('manage_catalog')));
drop policy if exists "community_blocked_domains: moderação junta" on public.community_blocked_domains;
create policy "community_blocked_domains: moderação junta" on public.community_blocked_domains
  for insert to authenticated with check ((select private.has_permission('manage_catalog')));
drop policy if exists "community_blocked_domains: moderação tira" on public.community_blocked_domains;
create policy "community_blocked_domains: moderação tira" on public.community_blocked_domains
  for delete to authenticated using ((select private.has_permission('manage_catalog')));

revoke all on public.community_blocked_domains from anon, authenticated;
grant select, insert, delete on public.community_blocked_domains to authenticated;

-- ── Lista de origem ─────────────────────────────────────────────────────────
-- Os sites que as palavras da camada 1 não apanham. A equipa junta mais no painel.

insert into public.community_blocked_domains (domain, category, source, note)
select d, 'adulto', 'lista', 'Lista de origem'
from unnest(array[
  'tube8.com', 'drtuber.com', 'beeg.com', 'hclips.com', 'nuvid.com', '4tube.com', 'motherless.com',
  'manyvids.com', 'clips4sale.com', 'myfreecams.com', 'cam4.com', 'flirt4free.com', 'imlive.com',
  'streamate.com', 'realitykings.com', 'bangbros.com', 'naughtyamerica.com', 'mofos.com', 'erome.com',
  'thothub.to', 'hanime.tv', 'gelbooru.com', 'danbooru.donmai.us', 'adultfriendfinder.com',
  'ashleymadison.com', 'brasileirinhas.com.br', 'sexlog.com', 'cameraprive.com', 'privacy.com.br',
  'playboy.com', 'fakku.net', 'luscious.net', 'imagefap.com', 'literotica.com', 'sxyprn.com',
  'daftsex.com', 'cumlouder.com', 'dinotube.com', 'tubegalore.com', 'perfectgirls.net', 'youjizz.com',
  'slutload.com', 'keezmovies.com', 'extremetube.com', 'iwank.tv', 'heavy-r.com', 'efukt.com',
  'boyfriendtv.com', 'javhd.com', 'javlibrary.com', 'missav.com', 'thisvid.com', 'f95zone.to'
]) d
on conflict (domain) do nothing;

insert into public.community_blocked_domains (domain, category, source, note)
select d, 'encurtador', 'lista', 'Lista de origem'
from unnest(array[
  'bit.ly', 'bitly.com', 'bit.do', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'v.gd',
  'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 's.id', 't.ly',
  'shorte.st', 'ouo.io', 'bc.vc', 'adf.ly', 'linkvertise.com', 'lnkd.in', 'soo.gd', 'clck.ru',
  'shrtco.de', 'tiny.one', 'short.io', 'encurtador.com.br', 'abre.ai', 'gg.gg', 'u.to', 'x.co',
  'po.st', 'surl.li', 'cutt.us', 'shorturl.com', 'urlz.fr', 'cli.re', 'did.li'
]) d
on conflict (domain) do nothing;

insert into public.community_blocked_domains (domain, category, source, note)
select d, 'malicioso', 'lista', 'Lista de origem: regista o IP de quem abre'
from unnest(array[
  'grabify.link', 'iplogger.org', 'iplogger.com', 'iplogger.ru', 'iplogger.co', 'iplogger.info',
  '2no.co', 'yip.su', 'ipgrabber.ru', 'ipgraber.ru', 'blasze.com', 'ps3cfw.com', 'stopify.co',
  'joinmy.site', 'curiouscat.club', 'catsnthings.fun', 'gamingfun.me', 'headshot.monster',
  'screenshare.host', 'myprivate.pics', 'noodshare.com', 'bmwforum.co', 'quickmessage.us',
  'leancoding.co', 'freegiftcards.co'
]) d
on conflict (domain) do nothing;
