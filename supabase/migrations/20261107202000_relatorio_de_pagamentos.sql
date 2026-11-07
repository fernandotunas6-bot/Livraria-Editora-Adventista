-- Relatório de pagamentos e caixa, e as regras novas da loja.
--
-- O relatório liga os pagamentos registados (order_payments) aos relatórios do painel:
--   * Recebido: pagamentos confirmados pela data em que o dinheiro entrou, menos os reembolsos
--     pela data em que saiu. É a receita — o que está na conta ou na caixa —, por dia, por método
--     e por canal (site, WhatsApp, colportor).
--   * Vendido: encomendas não canceladas criadas no período, pelo total. Não é receita.
--   * Por receber: encomendas activas com valor em falta, por antiguidade.
--   * O que pede acção: pagamentos indicados por confirmar, entregues sem pagamento, pagas e
--     canceladas por reembolsar, pagas a mais.
--   * Colportagem: dinheiro recebido dos colportores e pago a eles no período (conta corrente).
--   * Movimentos: cada pagamento e reembolso do período, com quem confirmou (para a contabilidade).
-- Lêem-no quem gere encomendas e quem confirma pagamentos (private.can_read_payments).
--
-- Regras novas (Configurações → Regras da loja):
--   * `unpaid_orders_per_contact`: encomendas por pagar ao mesmo tempo com o mesmo telefone ou
--     email (3 por omissão; 0 = sem limite). Sem isto, um programa reservava o stock da loja
--     inteira com encomendas que nunca seriam pagas.
--   * `company_legal_name` e `company_nif`: nome e NIF da empresa no recibo.
--
-- Reverter: drop function public.payments_report(date, date) e das três colunas de site_settings.

alter table public.site_settings
  add column if not exists unpaid_orders_per_contact integer not null default 3,
  add column if not exists company_legal_name text not null default '',
  add column if not exists company_nif text not null default '';
alter table public.site_settings drop constraint if exists site_settings_unpaid_orders_per_contact_check;
alter table public.site_settings add constraint site_settings_unpaid_orders_per_contact_check
  check (unpaid_orders_per_contact between 0 and 20);
alter table public.site_settings drop constraint if exists site_settings_company_nif_check;
alter table public.site_settings add constraint site_settings_company_nif_check
  check (company_nif ~ '^[0-9A-Za-z-]{0,20}$');
alter table public.site_settings drop constraint if exists site_settings_company_legal_name_check;
alter table public.site_settings add constraint site_settings_company_legal_name_check
  check (length(company_legal_name) <= 160);
comment on column public.site_settings.unpaid_orders_per_contact is
  'Encomendas por pagar ao mesmo tempo com o mesmo telefone ou email. 0 = sem limite.';
comment on column public.site_settings.company_nif is 'NIF da empresa, no recibo.';
comment on column public.site_settings.company_legal_name is 'Nome legal da empresa, no recibo (vazio = nome do site).';

-- Canal da venda, para os relatórios.
create or replace function private.order_channel(p_order public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_order.colporteur_id is not null then 'colportor'
    when p_order.sale_channel = 'whatsapp' or p_order.order_type = 'whatsapp_order' then 'whatsapp'
    else 'site'
  end;
$$;
revoke all on function private.order_channel(public.orders) from public, anon, authenticated;

create or replace function public.payments_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- O dia conta pela hora de Luanda.
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.can_read_payments() then
    raise exception 'Sem acesso aos relatórios de pagamentos.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido.'; end if;
  if p_to - p_from > 400 then raise exception 'Período demasiado longo (máximo 400 dias).'; end if;
  v_from := (p_from::timestamp) at time zone 'Africa/Luanda';
  v_to := ((p_to + 1)::timestamp) at time zone 'Africa/Luanda';

  return (
    with mov as (
      select p.*, o.order_number, o.customer_name, private.order_channel(o) as channel,
             (p.received_at at time zone 'Africa/Luanda')::date as day
      from public.order_payments p join public.orders o on o.id = p.order_id
      where p.status = 'confirmed' and p.received_at >= v_from and p.received_at < v_to
    ),
    active as (
      select o.*, greatest(o.total - o.amount_paid, 0) as outstanding,
             (now() at time zone 'Africa/Luanda')::date - (o.created at time zone 'Africa/Luanda')::date as age_days
      from public.orders o
      where coalesce(o.status, '') <> 'cancelled' and coalesce(o.delivery_status, '') <> 'cancelled'
    )
    select jsonb_build_object(
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'received', jsonb_build_object(
        'payments', coalesce((select sum(amount) from mov where kind = 'payment'), 0),
        'refunds', coalesce((select sum(amount) from mov where kind = 'refund'), 0),
        'net', coalesce((select sum(case when kind = 'payment' then amount else -amount end) from mov), 0),
        'count', (select count(*) from mov where kind = 'payment'),
        -- Confirmado pelo gateway (automático) e pela equipa (à mão): a regra do dono é que tudo
        -- passe pelo gateway, excepto o que um funcionário com a permissão processa.
        'automatic', coalesce((select sum(amount) from mov where kind = 'payment' and source = 'gateway'), 0),
        'manual', coalesce((select sum(amount) from mov where kind = 'payment' and source <> 'gateway'), 0)),
      -- Chamadas do webhook no período: gravadas, repetidas, sem encomenda, ignoradas, recusadas.
      'gateway', (select jsonb_build_object(
                    'recorded', count(*) filter (where e.outcome = 'recorded'),
                    'duplicate', count(*) filter (where e.outcome = 'duplicate'),
                    'orphan', count(*) filter (where e.outcome = 'orphan'),
                    'ignored', count(*) filter (where e.outcome = 'ignored'),
                    'rejected', count(*) filter (where e.outcome = 'rejected'),
                    'last_at', max(e.received_at))
                  from public.payment_gateway_events e
                  where e.received_at >= v_from and e.received_at < v_to),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'received', d.received, 'refunded', d.refunded) order by d.day)
                          from (select day, sum(amount) filter (where kind = 'payment') as received,
                                       coalesce(sum(amount) filter (where kind = 'refund'), 0) as refunded
                                from mov group by day) d), '[]'::jsonb),
      'by_method', coalesce((select jsonb_agg(jsonb_build_object('method_code', m.method_code, 'method_name', m.method_name,
                                                                 'received', m.received, 'refunded', m.refunded, 'count', m.n)
                                              order by m.received desc nulls last)
                             from (select method_code, max(method_name) as method_name,
                                          coalesce(sum(amount) filter (where kind = 'payment'), 0) as received,
                                          coalesce(sum(amount) filter (where kind = 'refund'), 0) as refunded,
                                          count(*) filter (where kind = 'payment') as n
                                   from mov group by method_code) m), '[]'::jsonb),
      'by_channel', coalesce((select jsonb_agg(jsonb_build_object('channel', c.channel, 'net', c.net, 'count', c.n) order by c.net desc)
                              from (select channel, sum(case when kind = 'payment' then amount else -amount end) as net,
                                           count(*) filter (where kind = 'payment') as n
                                    from mov group by channel) c), '[]'::jsonb),
      'sold', (select jsonb_build_object('orders', count(*), 'value', coalesce(sum(o.total), 0))
               from public.orders o
               where o.created >= v_from and o.created < v_to
                 and coalesce(o.status, '') <> 'cancelled' and coalesce(o.delivery_status, '') <> 'cancelled'),
      'receivable', jsonb_build_object(
        'amount', coalesce((select sum(outstanding) from active where outstanding > 0), 0),
        'count', (select count(*) from active where outstanding > 0),
        'aging', (select jsonb_agg(jsonb_build_object('bucket', b.bucket, 'count', coalesce(x.n, 0), 'amount', coalesce(x.amount, 0)) order by b.ord)
                  from (values (1, '0-2'), (2, '3-7'), (3, '8-30'), (4, '30+')) as b(ord, bucket)
                  left join (select case when age_days <= 2 then '0-2' when age_days <= 7 then '3-7'
                                         when age_days <= 30 then '8-30' else '30+' end as bucket,
                                    count(*) as n, sum(outstanding) as amount
                             from active where outstanding > 0 group by 1) x on x.bucket = b.bucket)),
      -- O que a caixa tem para verificar: indicado pelo cliente (transferência, Multicaixa) ou por
      -- quem entregou (dinheiro na mão). Os 50 mais antigos, para o painel os decidir ali.
      'to_confirm', jsonb_build_object(
        'count', (select count(*) from public.order_payments p where p.kind = 'payment' and p.status = 'reported'),
        'amount', coalesce((select sum(p.amount) from public.order_payments p where p.kind = 'payment' and p.status = 'reported'), 0),
        'cash', (select count(*) from public.order_payments p where p.kind = 'payment' and p.status = 'reported' and p.source = 'staff'),
        'items', coalesce((select jsonb_agg(jsonb_build_object(
                             'payment_id', x.id, 'order_id', x.order_id, 'order_number', x.order_number, 'customer_name', x.customer_name,
                             'amount', x.amount, 'reference', x.reference, 'source', x.source, 'collected_by', x.collected_by,
                             'method_name', x.method_name, 'created', x.created) order by x.created)
                           from (select p.*, o.order_number, o.customer_name
                                 from public.order_payments p join public.orders o on o.id = p.order_id
                                 where p.kind = 'payment' and p.status = 'reported'
                                 order by p.created limit 50) x), '[]'::jsonb)),
      'delivered_unpaid', jsonb_build_object(
        'count', (select count(*) from active where delivery_status = 'delivered' and outstanding > 0),
        'amount', coalesce((select sum(outstanding) from active where delivery_status = 'delivered' and outstanding > 0), 0),
        'orders', coalesce((select jsonb_agg(jsonb_build_object('order_id', a.id, 'order_number', a.order_number, 'total', a.total,
                                                                'outstanding', a.outstanding, 'method', a.payment_method_name,
                                                                'payment_status', a.payment_status) order by a.outstanding desc)
                            from (select * from active where delivery_status = 'delivered' and outstanding > 0
                                  order by outstanding desc limit 20) a), '[]'::jsonb)),
      'refund_due', (select jsonb_build_object(
                       'count', count(*), 'amount', coalesce(sum(o.amount_paid - o.amount_refunded), 0),
                       'orders', coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
                                                                       'due', o.amount_paid - o.amount_refunded, 'method', o.payment_method_name)
                                                    order by o.updated desc), '[]'::jsonb))
                     from public.orders o
                     where (coalesce(o.status, '') = 'cancelled' or coalesce(o.delivery_status, '') = 'cancelled')
                       and o.amount_paid - o.amount_refunded > 0),
      'overpaid', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(o.amount_paid - o.amount_refunded - o.total), 0))
                   from active o where o.amount_paid - o.amount_refunded - o.total > 0),
      'colportagem', (select jsonb_build_object(
                        'received', coalesce(-sum(l.amount) filter (where l.kind = 'pagamento_recebido'), 0),
                        'paid', coalesce(sum(l.amount) filter (where l.kind = 'pagamento_feito'), 0),
                        'site_commissions', coalesce(-sum(l.amount) filter (where l.order_id is not null and l.kind in ('comissao', 'ajuste')), 0))
                      from public.colporteur_ledger l
                      where l.entry_date >= p_from and l.entry_date <= p_to),
      'movements', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', m.id, 'order_id', m.order_id, 'order_number', m.order_number, 'customer_name', m.customer_name,
                               'kind', m.kind, 'amount', m.amount, 'method_code', m.method_code, 'method_name', m.method_name,
                               'reference', m.reference, 'account', m.account, 'collected_by', m.collected_by,
                               'received_at', m.received_at, 'channel', m.channel, 'source', m.source,
                               'decided_by_name', (select coalesce(nullif(pr.name, ''), pr.email) from public.profiles pr where pr.id = m.decided_by)
                             ) order by m.received_at)
                             from (select * from mov order by received_at limit 1000) m), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.payments_report(date, date) from public, anon;
grant execute on function public.payments_report(date, date) to authenticated, service_role;
