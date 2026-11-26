-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As igrejas do registo da Igreja nas novidades dos postos do KanGest (parte J1 do plano; docs/KANGEST-SINCRONIZACAO.md
-- §7). A loja vê-as em Livraria → Loja online → Igrejas e cria o cliente para facturar à igreja. Seguem o número (cn), o
-- nome, o tipo, o distrito, o campo, a província, o município, a morada, o delegado e se está activa: o que a loja
-- precisa para facturar. Não seguem os pastores, os telefones nem as notas. A paginação é a das encomendas e do
-- catálogo: o cursor (updated, id) da última enviada.

create or replace function public.kangest_novidades(p_posto uuid, p_cursores jsonb, p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store text;
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 500);
  v_enc_em timestamptz := nullif(p_cursores #>> '{encomendas,em}', '')::timestamptz;
  v_enc_id text := coalesce(p_cursores #>> '{encomendas,id}', '');
  v_prod_em timestamptz := nullif(p_cursores #>> '{produtos,em}', '')::timestamptz;
  v_prod_id text := coalesce(p_cursores #>> '{produtos,id}', '');
  v_encomendas jsonb;
  v_produtos jsonb;
  v_ultima_enc jsonb;
  v_ultimo_prod jsonb;
  v_igr_em timestamptz := nullif(p_cursores #>> '{igrejas,em}', '')::timestamptz;
  v_igr_id text := coalesce(p_cursores #>> '{igrejas,id}', '');
  v_igrejas jsonb;
  v_ultima_igr jsonb;
begin
  select store_id into v_store from public.kangest_postos where id = p_posto and estado = 'activo';
  if not found then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;

  -- as encomendas da loja do posto (um posto sem loja não recebe nenhuma)
  with e as (
    select o.*
      from public.orders o
     where v_store is not null and o.store_id = v_store
       and (v_enc_em is null or (o.updated, o.id) > (v_enc_em, v_enc_id))
     order by o.updated, o.id
     limit v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'numero', e.order_number, 'criada_em', e.created, 'actualizada_em', e.updated,
           'estado', e.status, 'pagamento', e.payment_status, 'entrega', e.delivery_status,
           'total', e.total, 'portes', e.shipping_cost, 'pago', e.amount_paid, 'reembolsado', e.amount_refunded,
           'pago_em', e.paid_at, 'metodo_pagamento', e.payment_method_name,
           'levantamento', e.shipping_method = 'pickup',
           'cliente', e.customer_name, 'telefone', e.phone,
           'morada', coalesce(nullif(e.delivery_address_full, ''),
                              concat_ws(', ', nullif(e.delivery_street, ''), nullif(e.delivery_locality, ''),
                                        nullif(e.delivery_municipality, ''), nullif(e.delivery_province, ''))),
           'notas', e.notes, 'canal', e.sale_channel,
           'itens', coalesce(e.items, '[]'::jsonb)
         ) order by e.updated, e.id), '[]'::jsonb),
         (array_agg(jsonb_build_object('em', e.updated, 'id', e.id) order by e.updated desc, e.id desc))[1]
    into v_encomendas, v_ultima_enc
    from e;

  -- o catálogo todo (também os ocultos: os rascunhos e os que estão por rever)
  with b as (
    select s.*
      from public.stock_books s
     where v_prod_em is null or (s.updated, s.id) > (v_prod_em, v_prod_id)
     order by s.updated, s.id
     limit v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'titulo', b.title, 'referencia', b.kigest_ref, 'isbn', b.isbn, 'codigo', b.book_code,
           'preco', b.price, 'preco_promocao', b.sale_price, 'promocao_inicio', b.sale_starts_at, 'promocao_fim', b.sale_ends_at,
           'stock', b.stock, 'activo', b.active, 'destaque', b.featured, 'capa', b.cover, 'genero', b.genre,
           'tipo', b.product_type, 'actualizado_em', b.updated
         ) order by b.updated, b.id), '[]'::jsonb),
         (array_agg(jsonb_build_object('em', b.updated, 'id', b.id) order by b.updated desc, b.id desc))[1]
    into v_produtos, v_ultimo_prod
    from b;

  -- as igrejas, os grupos e as companhias do registo da Igreja (todas: uma loja vende a igrejas de qualquer distrito)
  with c as (
    select ch.*
      from public.churches ch
     where v_igr_em is null or (ch.updated, ch.id::text) > (v_igr_em, v_igr_id)
     order by ch.updated, ch.id::text
     limit v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'cn', c.cn, 'nome', c.name, 'tipo', c.kind,
           'distrito', d.name, 'campo', f.name, 'provincia', pr.name, 'municipio', m.name,
           'morada', c.address, 'delegado', c.delegate_name, 'activa', c.active, 'actualizada_em', c.updated
         ) order by c.updated, c.id::text), '[]'::jsonb),
         (array_agg(jsonb_build_object('em', c.updated, 'id', c.id::text) order by c.updated desc, c.id::text desc))[1]
    into v_igrejas, v_ultima_igr
    from c
    left join public.church_districts d on d.id = c.district_id
    left join public.church_fields f on f.id = c.field_id
    left join public.angola_provinces pr on pr.id = c.province_id
    left join public.angola_municipalities m on m.id = c.municipality_id;

  return jsonb_build_object(
    'encomendas', v_encomendas,
    'produtos', v_produtos,
    'igrejas', v_igrejas,
    'cursores', jsonb_build_object(
      'encomendas', coalesce(v_ultima_enc, p_cursores -> 'encomendas', '{}'::jsonb),
      'produtos', coalesce(v_ultimo_prod, p_cursores -> 'produtos', '{}'::jsonb),
      'igrejas', coalesce(v_ultima_igr, p_cursores -> 'igrejas', '{}'::jsonb)),
    'mais', jsonb_build_object(
      'encomendas', jsonb_array_length(v_encomendas) = v_limite,
      'produtos', jsonb_array_length(v_produtos) = v_limite,
      'igrejas', jsonb_array_length(v_igrejas) = v_limite));
end;
$$;
revoke all on function public.kangest_novidades(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.kangest_novidades(uuid, jsonb, integer) to service_role;
