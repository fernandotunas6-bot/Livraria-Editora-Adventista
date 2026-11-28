-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Criar lojas novas sem riscos de colisão, no site e no KanGest (pedido do dono a 28/11: «ter módulos bem organizados
-- funcionais de criar outras lojas sem riscos de colisão tanto no KanGest como na livraria»). docs/LOJAS.md.
--
-- Os riscos que isto fecha:
-- 1. **As séries dos documentos:** cada KanGest numera «prefixo do posto + ano» (FR 2026/1, ou FR N2026/1 depois de
--    importar o KIGEST). Duas lojas com o mesmo NIF e o mesmo prefixo emitiam os mesmos números, e para a AGT eram
--    documentos repetidos. Agora cada posto tem um prefixo único em toda a rede (HUA, LUB, HUA2…), que o KanGest
--    recebe e usa (sinc/series.rs), e um detector avisa se dois postos emitirem a mesma série.
-- 2. **Duas lojas com o mesmo nome:** uma loja nova com o nome de outra é recusada.
-- 3. **Apagar uma loja com dados:** deixava os documentos, os fechos, as encomendas e os funcionários sem loja. Agora
--    recusa-se: desactiva-se.
--
-- Automático por omissão, com o manual ao lado: o código da loja e o prefixo do posto saem sozinhos e podem mudar-se à
-- mão no painel (sempre únicos).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. O código de cada loja
-- ---------------------------------------------------------------------------------------------------------------
alter table public.physical_stores add column if not exists codigo text not null default '';
alter table public.physical_stores drop constraint if exists physical_stores_codigo_check;
alter table public.physical_stores add constraint physical_stores_codigo_check check (codigo = '' or codigo ~ '^[A-Z][A-Z0-9]{1,5}$');
comment on column public.physical_stores.codigo is
  'O código curto e único da loja (HUA, LUB…): a base do prefixo das séries dos postos do KanGest dela. Sai sozinho do nome ou da província; muda-se à mão no painel.';

-- O texto em maiúsculas, sem acentos nem espaços (só A–Z e 0–9).
create or replace function private.so_letras(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(translate(upper(coalesce(p, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z0-9]', '', 'g');
$$;

-- Um código livre a partir de um texto: as 3 primeiras letras («Huambo» → HUA); se já houver, HUA2, HUA3…
create or replace function private.loja_codigo_livre(p_texto text, p_excepto text default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := left(regexp_replace(private.so_letras(p_texto), '^[0-9]+', ''), 3);
  v text;
  n int := 1;
begin
  if length(v_base) < 2 then v_base := 'LJ'; end if;
  v := v_base;
  while exists (select 1 from public.physical_stores s where s.codigo = v and s.id is distinct from p_excepto) loop
    n := n + 1;
    v := v_base || n::text;
  end loop;
  return v;
end;
$$;

-- os que já existem: pela ordem das lojas, da província (ou do nome), sem repetir
do $$
declare
  s record;
begin
  for s in select id, province, name from public.physical_stores where codigo = '' order by sort_order, name, id loop
    update public.physical_stores
       set codigo = private.loja_codigo_livre(coalesce(nullif(btrim(s.province), ''), s.name), s.id)
     where id = s.id;
  end loop;
end;
$$;

create unique index if not exists physical_stores_codigo_unico on public.physical_stores (codigo) where codigo <> '';

-- Ao criar ou mudar uma loja: o código em maiúsculas, ou um livre; e nenhuma loja nova com o nome de outra.
create or replace function private.loja_antes_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.codigo := private.so_letras(new.codigo);
  if new.codigo = '' then
    new.codigo := private.loja_codigo_livre(coalesce(nullif(btrim(new.province), ''), new.name), new.id);
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    if exists (select 1 from public.physical_stores s
                where s.id is distinct from new.id and lower(private.so_letras(s.name)) = lower(private.so_letras(new.name))) then
      raise exception 'Já existe uma loja com o nome «%». Dê outro nome à loja nova.', new.name using errcode = '23505';
    end if;
  end if;
  if exists (select 1 from public.physical_stores s where s.id is distinct from new.id and s.codigo = new.codigo) then
    raise exception 'O código % já é de outra loja. Escolha outro (2 a 6 letras ou algarismos, a começar por uma letra).', new.codigo using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists physical_stores_antes_de_gravar on public.physical_stores;
create trigger physical_stores_antes_de_gravar
  before insert or update of codigo, name on public.physical_stores
  for each row execute function private.loja_antes_de_gravar();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Uma loja com dados não se apaga: desactiva-se
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.loja_com_dados_nao_se_apaga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text[] := '{}';
begin
  if exists (select 1 from public.kangest_postos where store_id = old.id) then v := array_append(v, 'postos do KanGest'); end if;
  if exists (select 1 from public.kangest_documentos where store_id = old.id) then v := array_append(v, 'documentos do KanGest'); end if;
  if exists (select 1 from public.kangest_fechos where store_id = old.id) then v := array_append(v, 'fechos de caixa'); end if;
  if exists (select 1 from public.kangest_movimentos where store_id = old.id) then v := array_append(v, 'movimentos de dinheiro'); end if;
  if exists (select 1 from public.orders where store_id = old.id) then v := array_append(v, 'encomendas'); end if;
  if exists (select 1 from public.staff_members where store_id = old.id) then v := array_append(v, 'funcionários'); end if;
  if exists (select 1 from public.stock_movimentos where store_id = old.id) then v := array_append(v, 'movimentos de stock'); end if;
  if cardinality(v) > 0 then
    raise exception 'A loja «%» tem %: não se apaga, para não os deixar sem loja. Desactive-a em vez de a apagar.',
      old.name, array_to_string(v, ', ') using errcode = '23503';
  end if;
  return old;
end;
$$;
drop trigger if exists physical_stores_com_dados on public.physical_stores;
create trigger physical_stores_com_dados
  before delete on public.physical_stores
  for each row execute function private.loja_com_dados_nao_se_apaga();

-- ---------------------------------------------------------------------------------------------------------------
-- 3. O prefixo das séries de cada posto do KanGest, único em toda a rede
-- ---------------------------------------------------------------------------------------------------------------
alter table public.kangest_postos add column if not exists serie_prefixo text not null default '';
alter table public.kangest_postos drop constraint if exists kangest_postos_serie_prefixo_check;
alter table public.kangest_postos add constraint kangest_postos_serie_prefixo_check check (serie_prefixo ~ '^[A-Z0-9]{0,8}$');
comment on column public.kangest_postos.serie_prefixo is
  'O prefixo das séries automáticas do KanGest deste posto (HUA → FR HUA2026/1), único em toda a rede, para duas lojas nunca emitirem os mesmos números. Nunca se reutiliza, nem de um posto revogado.';

-- Um prefixo livre para um posto da loja: o código dela (HUA), depois HUA2, HUA3…; sem loja, PST.
create or replace function private.posto_prefixo_livre(p_store text, p_excepto uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif((select s.codigo from public.physical_stores s where s.id = p_store), ''), 'PST');
  v text := v_base;
  n int := 1;
begin
  while exists (select 1 from public.kangest_postos p where p.serie_prefixo = v and p.id is distinct from p_excepto) loop
    n := n + 1;
    v := left(v_base, 6) || n::text;
  end loop;
  return v;
end;
$$;

-- os postos que já existem, pela ordem em que foram criados
do $$
declare
  p record;
begin
  for p in select id, store_id from public.kangest_postos where serie_prefixo = '' order by criado_em, id loop
    update public.kangest_postos set serie_prefixo = private.posto_prefixo_livre(p.store_id, p.id) where id = p.id;
  end loop;
end;
$$;

create unique index if not exists kangest_postos_serie_prefixo_unico on public.kangest_postos (serie_prefixo) where serie_prefixo <> '';

-- Um posto novo recebe um prefixo livre; um prefixo mudado à mão fica em maiúsculas e tem de estar livre.
create or replace function private.posto_antes_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.serie_prefixo := upper(btrim(coalesce(new.serie_prefixo, '')));
  if new.serie_prefixo = '' then
    new.serie_prefixo := private.posto_prefixo_livre(new.store_id, new.id);
  end if;
  if exists (select 1 from public.kangest_postos p where p.id is distinct from new.id and p.serie_prefixo = new.serie_prefixo) then
    raise exception 'O prefixo % já é de outro posto (as séries repetiam-se). Escolha outro.', new.serie_prefixo using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists kangest_postos_antes_de_gravar on public.kangest_postos;
create trigger kangest_postos_antes_de_gravar
  before insert or update of serie_prefixo on public.kangest_postos
  for each row execute function private.posto_antes_de_gravar();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. O detector das séries repetidas
-- ---------------------------------------------------------------------------------------------------------------
-- A mesma série (o tipo e a série) emitida por mais de um posto: os números repetem-se entre lojas. O histórico
-- importado do KIGEST fica de fora (cada loja tinha o seu KIGEST). Para o painel (quem gere as configurações).
create or replace function public.kangest_series_em_colisao()
returns table (tipo_codigo text, serie text, postos text[], documentos bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or private.has_permission('manage_settings')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
    select d.tipo_codigo, d.serie, array_agg(distinct p.nome order by p.nome), count(*)
      from public.kangest_documentos d join public.kangest_postos p on p.id = d.posto_id
     where not d.importado
     group by d.tipo_codigo, d.serie
    having count(distinct d.posto_id) > 1
     order by d.serie, d.tipo_codigo;
end;
$$;
comment on function public.kangest_series_em_colisao() is
  'As séries emitidas por mais de um posto do KanGest (os números repetem-se entre lojas), sem o histórico do KIGEST. Para o painel.';
revoke all on function public.kangest_series_em_colisao() from public, anon;
grant execute on function public.kangest_series_em_colisao() to authenticated, service_role;

revoke all on function private.so_letras(text), private.loja_codigo_livre(text, text), private.posto_prefixo_livre(text, uuid)
  from public, anon, authenticated;
revoke all on function private.loja_antes_de_gravar(), private.loja_com_dados_nao_se_apaga(), private.posto_antes_de_gravar()
  from public, anon, authenticated;
