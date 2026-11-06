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
