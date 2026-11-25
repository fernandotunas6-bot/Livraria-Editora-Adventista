-- Os mais vendidos, os menos vendidos, os sem vendas e as dívidas por loja, com o balcão dos postos e o site juntos
-- (docs/KANGEST.md §5.2; parte I do plano do KanGest Livraria).
--
--   * public.produtos_vendidos(de, até, loja): cada produto vendido no período, com as unidades do site (encomendas
--     pagas) e do balcão (as facturas dos postos, as NC a abater, sem as da loja online), e o valor. O painel ordena-os
--     para os mais vendidos e para os menos vendidos.
--   * public.produtos_sem_vendas(de, até, loja): os produtos activos com stock (na loja, ou no site) que não venderam
--     nada no período.
--   * public.dividas_por_loja(loja): o que falta receber, por loja — as facturas a crédito do balcão (o pendente que
--     vem do KanGest) e as encomendas do site entregues ou pagas em parte. Só a Edge Function a chama (decifra os
--     nomes dos clientes do balcão, que vêm cifrados, e só para quem vê os relatórios).
--
-- Quem vê: quem vê os relatórios (view_reports, edit_reports), todas as lojas; o gerente de loja, só a sua
-- (private.painel_pode_ver), como no Painel de Gestão.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Quem pode ver uma loja (ou todas, com p_loja vazia)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.require_relatorio_loja(p_loja text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.can_read_sales_reports() then
    return;
  end if;
  if coalesce(p_loja, '') = '' then
    raise exception 'Escolha a sua loja: só quem vê os relatórios vê todas.' using errcode = '42501';
  end if;
  if not private.painel_pode_ver(p_loja) then
    raise exception 'Sem permissão para ver esta loja.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_relatorio_loja(text) from public, anon;
grant execute on function private.require_relatorio_loja(text) to authenticated, service_role;

create or replace function private.relatorio_periodo_valido(p_de date, p_ate date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_ate - p_de > 1100 then
    raise exception 'O período vai até três anos.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.relatorio_periodo_valido(date, date) from public, anon;
grant execute on function private.relatorio_periodo_valido(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Os produtos vendidos (o site e o balcão juntos)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.produtos_vendidos(p_de date, p_ate date, p_loja text default null)
returns table (chave text, book_id text, titulo text, codigo text, capa text, capa_ficheiro text,
               unidades numeric, unidades_site numeric, unidades_balcao numeric, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_relatorio_loja(p_loja);
  perform private.relatorio_periodo_valido(p_de, p_ate);
  return query
  with site as (
    -- as encomendas pagas no período (hora de Luanda), sem as canceladas
    select nullif(btrim(coalesce(it ->> 'book_id', '')), '') as book_id,
           nullif(btrim(coalesce(it ->> 'title', '')), '') as titulo,
           '' as referencia,
           greatest(private.num_ou_zero(it ->> 'quantity'), 0) as qtd,
           round(private.num_ou_zero(it ->> 'price') * greatest(private.num_ou_zero(it ->> 'quantity'), 0), 2) as valor,
           'site' as origem
      from public.orders o,
           jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
     where o.payment_status = 'paid'
       -- a hora do pagamento; uma encomenda paga sem ela conta pela data em que foi feita
       and coalesce(o.paid_at, o.created) >= private.de_luanda(p_de::timestamp)
       and coalesce(o.paid_at, o.created) < private.de_luanda((p_ate + 1)::timestamp)
       and coalesce(o.status, '') <> 'cancelled' and coalesce(o.delivery_status, '') <> 'cancelled'
       and (coalesce(p_loja, '') = '' or o.store_id = p_loja)
       and jsonb_typeof(it) = 'object'
  ),
  balcao as (
    -- as facturas dos postos (o balcão): as NC abatem; as da loja online ficam de fora (já estão no site)
    select l.book_id, nullif(btrim(l.descricao), '') as titulo, l.referencia,
           case when upper(d.tipo_codigo) = 'NC' then -abs(l.quantidade) else abs(l.quantidade) end as qtd,
           case when upper(d.tipo_codigo) = 'NC' then -abs(l.total) else abs(l.total) end / 100.0 as valor,
           'balcao' as origem
      from public.kangest_documentos d
      join public.kangest_documento_linhas l on l.documento = d.id
     where d.estado <> 'A' and d.data_emissao between p_de and p_ate
       and private.kangest_documento_e_balcao(d.tipo_codigo, d.canal, d.referencia)
       and (coalesce(p_loja, '') = '' or d.store_id = p_loja)
  ),
  tudo as (
    select x.*,
           -- o mesmo livro do site e do balcão junta-se pelo produto; sem ele, pela referência do KanGest ou pelo nome
           coalesce('livro:' || x.book_id, 'ref:' || nullif(x.referencia, ''), 'titulo:' || lower(coalesce(x.titulo, ''))) as k
      from (select * from site union all select * from balcao) x
     where x.book_id is not null or coalesce(x.referencia, '') <> '' or x.titulo is not null
  )
  select t.k, max(t.book_id), coalesce(nullif(max(b.title), ''), max(t.titulo), 'Produto'),
         coalesce(nullif(max(b.book_code), ''), nullif(max(t.referencia), ''), ''),
         coalesce(max(b.cover), ''), coalesce(max(b.cover_image), ''),
         sum(t.qtd), coalesce(sum(t.qtd) filter (where t.origem = 'site'), 0), coalesce(sum(t.qtd) filter (where t.origem = 'balcao'), 0),
         round(sum(t.valor), 2)
    from tudo t
    left join public.stock_books b on b.id = t.book_id
   group by t.k
   order by sum(t.qtd) desc, sum(t.valor) desc;
end;
$$;
comment on function public.produtos_vendidos(date, date, text) is
  'Os produtos vendidos no período, o site e o balcão dos postos juntos (as NC abatem); sem dados pessoais.';
revoke all on function public.produtos_vendidos(date, date, text) from public, anon;
grant execute on function public.produtos_vendidos(date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Os produtos com stock e sem vendas no período
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.produtos_sem_vendas(p_de date, p_ate date, p_loja text default null)
returns table (book_id text, titulo text, codigo text, capa text, capa_ficheiro text, stock numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_relatorio_loja(p_loja);
  perform private.relatorio_periodo_valido(p_de, p_ate);
  return query
  with vendidos as (
    select v.book_id from public.produtos_vendidos(p_de, p_ate, p_loja) v where v.book_id is not null and v.unidades > 0
  ),
  com_stock as (
    select b.id,
           case when coalesce(p_loja, '') = '' then coalesce(b.stock, 0)::numeric
                else coalesce((select sum(s.disponivel) from public.kangest_stock s
                                where s.store_id = p_loja and b.kigest_ref <> '' and s.referencia = b.kigest_ref), 0) end as stock
      from public.stock_books b
     where b.active
       and (case when coalesce(p_loja, '') = '' then coalesce(b.stock, 0) > 0
                 else exists (select 1 from public.store_stock ss where ss.store_id = p_loja and ss.book_id = b.id and ss.available)
                      or exists (select 1 from public.kangest_stock s
                                  where s.store_id = p_loja and b.kigest_ref <> '' and s.referencia = b.kigest_ref and s.disponivel > 0) end)
  )
  select b.id, b.title, coalesce(b.book_code, ''), coalesce(b.cover, ''), coalesce(b.cover_image, ''), c.stock
    from com_stock c
    join public.stock_books b on b.id = c.id
   where not exists (select 1 from vendidos v where v.book_id = c.id)
   order by c.stock desc, b.title;
end;
$$;
comment on function public.produtos_sem_vendas(date, date, text) is
  'Os produtos activos com stock (na loja ou no site) que não venderam nada no período.';
revoke all on function public.produtos_sem_vendas(date, date, text) from public, anon;
grant execute on function public.produtos_sem_vendas(date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. As dívidas por loja (só a Edge Function, depois de conferir quem pede)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.dividas_por_loja(p_loja text default null)
returns table (store_id text, origem text, numero text, data date, vencimento date, total numeric, pendente numeric,
               cliente text, cliente_cifrado text)
language sql
stable
security definer
set search_path = ''
as $$
  -- o balcão: o que falta pagar das facturas dos postos (o pendente que o KanGest manda; os postos antigos não o
  -- mandam e ficam de fora)
  select d.store_id, 'balcao', d.numero_doc, d.data_emissao, d.vencimento, d.total / 100.0, d.valor_pendente / 100.0,
         '', d.entidade_nome_cifrado
    from public.kangest_documentos d
   where d.estado <> 'A' and coalesce(d.valor_pendente, 0) > 0
     and (coalesce(p_loja, '') = '' or d.store_id = p_loja)
  union all
  -- o site: as encomendas entregues ou pagas em parte, com o total por pagar
  select o.store_id, 'site', coalesce(o.order_number, ''), (private.hora_luanda(o.created))::date, null::date,
         coalesce(o.total, 0)::numeric, greatest(coalesce(o.total, 0) - coalesce(o.amount_paid, 0), 0)::numeric,
         coalesce(o.customer_name, ''), ''
    from public.orders o
   where coalesce(o.status, '') <> 'cancelled' and coalesce(o.delivery_status, '') <> 'cancelled'
     and coalesce(o.payment_status, '') not in ('paid', 'refunded')
     and coalesce(o.total, 0) - coalesce(o.amount_paid, 0) > 0
     and (o.payment_status = 'partially_paid' or o.delivery_status in ('delivered', 'received'))
     and (coalesce(p_loja, '') = '' or o.store_id = p_loja);
$$;
comment on function public.dividas_por_loja(text) is
  'O que falta receber, por loja: as facturas a crédito do balcão e as encomendas entregues ou pagas em parte. Só a Edge Function (GET /admin/relatorios/dividas).';
revoke all on function public.dividas_por_loja(text) from public, anon, authenticated;
grant execute on function public.dividas_por_loja(text) to service_role;
