-- Encomendas com pagamento no fim (na entrega, no balcão) que ninguém da equipa confirmou.
--
-- Achado da análise crítica de 2026-11-20: cada encomenda reserva o stock ao ser feita, e as de
-- pagamento na entrega nunca se cancelavam sozinhas (o cancelamento automático, unpaid_cancel_days,
-- só cobre transferências e Multicaixa). Encomendas feitas por um programa, ou por alguém que nunca
-- mais atende, tiravam livros da loja até alguém dar por elas.
--
-- `unconfirmed_cancel_days` (Configurações → Regras da loja): passados estes dias, a vigilância das
-- encomendas cancela as de pagamento no fim que ninguém da equipa viu (`acknowledged_at` vazio), ainda
-- por preparar e sem nada pago. O stock volta ao catálogo e o cliente e a equipa são avisados.
-- 0 (o valor por omissão) = nunca, como a regra das transferências: a loja decide se e quando.
-- A regra está em supabase/functions/app/checkoutRules.ts (`unconfirmedOrdersToCancel`).
--
-- Reverter: alter table public.site_settings drop column unconfirmed_cancel_days.

alter table public.site_settings
  add column if not exists unconfirmed_cancel_days integer not null default 0;
alter table public.site_settings drop constraint if exists site_settings_unconfirmed_cancel_days_check;
alter table public.site_settings add constraint site_settings_unconfirmed_cancel_days_check
  check (unconfirmed_cancel_days between 0 and 60);
comment on column public.site_settings.unconfirmed_cancel_days is
  'Dias até cancelar uma encomenda de pagamento no fim que ninguém da equipa confirmou (0 = nunca).';
