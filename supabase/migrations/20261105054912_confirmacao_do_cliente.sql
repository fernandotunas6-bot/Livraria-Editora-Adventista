-- Depois da entrega, o cliente confirma com um clique que recebeu tudo bem, ou diz que houve um
-- problema. O link vai no email de agradecimento e leva um segredo por encomenda (receipt_token),
-- para ninguém confirmar a encomenda de outra pessoa só por saber o número.
alter table public.orders
  add column if not exists receipt_token uuid not null default gen_random_uuid(),
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_feedback jsonb;

comment on column public.orders.receipt_token is 'Segredo do link "Recebi tudo bem / Tenho um problema" do email de agradecimento. Nunca sai para o browser fora desse link.';
comment on column public.orders.customer_feedback is '{outcome: ok|problem, message, at} da confirmação do cliente depois da entrega.';

create index if not exists orders_feedback_problem_idx on public.orders ((customer_feedback ->> 'outcome'))
  where customer_feedback is not null;

-- O token não pode ser lido pelo cliente nem pela equipa através da API: só a Edge Function o usa.
revoke select (receipt_token) on public.orders from anon, authenticated;
