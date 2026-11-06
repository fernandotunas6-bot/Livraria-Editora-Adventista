-- Pagamentos por tipo de envio, e pagamento depois de encomendar.
-- Aplica-se no merge (supabase db push), ao mesmo tempo que a Edge Function e o site que a usam.
--
-- 1. Cada método de pagamento pode limitar-se a certos envios. Vazio (null) = todos.
--    "Pagar no Balcão" só faz sentido no levantamento na loja.
-- 2. As instruções da transferência e do Multicaixa deixam de mandar o comprovativo para um email
--    (o do domínio .ao não tem MX) e de pedir a referência antes da encomenda: o cliente paga
--    depois de encomendar e indica a referência na página da encomenda.
-- 3. Novo aviso à equipa: "payment_reported".
-- 4. As funções dos triggers de códigos (20261106033302) só são chamadas pelos triggers.
-- 5. Regras novas da loja: cancelar encomendas por pagar ao fim de N dias (0 = nunca, o valor por
--    omissão) e teto diário de respostas do assistente com IA (custo; acima dele responde sem IA).
-- 6. Limitador de pedidos: janelas de um dia, e a limpeza preguiçosa passa a apagar só as linhas
--    do próprio tipo. Antes, a limpeza de um limite por minuto apagava tudo com mais de 10 minutos
--    e reporia a zero, ao acaso, qualquer contador de janela maior.

alter table public.payment_methods
  add column if not exists shipping_methods text[];

alter table public.payment_methods
  drop constraint if exists payment_methods_shipping_methods_check;
alter table public.payment_methods
  add constraint payment_methods_shipping_methods_check
  check (shipping_methods is null or shipping_methods <@ array['delivery', 'express', 'pickup']::text[]);

comment on column public.payment_methods.shipping_methods is
  'Envios em que o método aparece (delivery, express, pickup). Vazio = todos.';

update public.payment_methods
set shipping_methods = array['pickup']
where code = 'balcao' and shipping_methods is null;

update public.payment_methods
set instructions = 'Depois de confirmar a encomenda, transfira o total com o número da encomenda no descritivo e indique a referência da transferência na página da encomenda (Rastrear encomenda).'
where code = 'transferencia' and instructions ilike '%@livrariaadventista.ao%';

update public.payment_methods
set instructions = 'Depois de confirmar a encomenda, pague o total pelo Multicaixa Express e indique a referência na página da encomenda (Rastrear encomenda).'
where code = 'multicaixa' and instructions = 'Transfira para o número indicado e insira a referência no checkout.';

-- Aviso à equipa quando o cliente indica a referência do pagamento (/order/payment-reference).
alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind in ('new_order', 'support', 'order_stuck', 'order_problem', 'order_confirmed', 'payment_reported'));

-- Faixa do topo: comprar não exige conta (o registo por email depende do SMTP do Auth). Só muda o
-- texto por omissão; um texto escrito pela equipa no painel fica.
update public.site_settings
set header_welcome_guest = 'Envio em todo o país · Compre sem conta'
where header_welcome_guest = 'Envio em todo o país · Crie a sua conta para acompanhar encomendas';

revoke all on function public.profiles_codigos_pessoa() from public, anon, authenticated;
revoke all on function public.orders_codigo_cliente() from public, anon, authenticated;

-- 5. Regras novas da loja -------------------------------------------------------------
alter table public.site_settings
  add column if not exists unpaid_cancel_days integer not null default 0,
  add column if not exists chat_ai_daily_limit integer not null default 500;
alter table public.site_settings drop constraint if exists site_settings_unpaid_cancel_days_check;
alter table public.site_settings add constraint site_settings_unpaid_cancel_days_check
  check (unpaid_cancel_days between 0 and 60);
alter table public.site_settings drop constraint if exists site_settings_chat_ai_daily_limit_check;
alter table public.site_settings add constraint site_settings_chat_ai_daily_limit_check
  check (chat_ai_daily_limit between 0 and 100000);
comment on column public.site_settings.unpaid_cancel_days is
  'Dias até cancelar uma encomenda paga antes do envio (transferência, Multicaixa) sem pagamento nem referência. 0 = nunca.';
comment on column public.site_settings.chat_ai_daily_limit is
  'Respostas do assistente com IA por dia, na loja toda. Acima disto responde sem IA. 0 = nunca usa IA.';

-- 6. Limitador de pedidos ------------------------------------------------------------------
create or replace function private.check_rate_limit(p_bucket text, p_client text, p_max integer, p_window interval default '00:01:00'::interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_bin(p_window, now(), timestamptz 'epoch');
  v_bucket text := left(coalesce(p_bucket, ''), 40);
  v_hits int;
begin
  insert into private.rate_limits (bucket, client, window_start, hits)
  values (v_bucket, left(coalesce(p_client, 'anon'), 80), v_start, 1)
  on conflict (bucket, client, window_start)
    do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;

  -- Limpeza preguiçosa das janelas antigas deste tipo, sem precisar de cron.
  if v_hits = 1 and random() < 0.01 then
    delete from private.rate_limits where bucket = v_bucket and window_start < now() - (p_window * 10);
  end if;

  return v_hits <= greatest(p_max, 1);
end;
$$;

create or replace function public.check_rate_limit_daily(p_bucket text, p_client text, p_max integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.check_rate_limit(p_bucket, p_client, p_max, interval '1 day');
$$;

revoke all on function public.check_rate_limit_daily(text, text, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit_daily(text, text, integer) to service_role;
