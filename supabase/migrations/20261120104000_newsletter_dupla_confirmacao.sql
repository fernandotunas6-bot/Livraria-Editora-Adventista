-- Newsletter com dupla confirmação.
--
-- Achado da análise crítica de 2026-11-20: qualquer pessoa inscrevia o email de outra na newsletter
-- (sem confirmação), e a resposta «Já subscrito.» dizia a quem perguntasse que um endereço estava na
-- lista. A Lei n.º 22/11 (protecção de dados) pede o consentimento do próprio; e emails para quem não
-- os pediu acabam em queixas de spam, que estragam a entrega das confirmações de encomenda.
--
-- Agora a Edge Function (POST /newsletter) grava o pedido com um token e manda um email com o link de
-- confirmação; só POST /newsletter/confirm, com esse token, marca `confirmed_at`. A resposta é sempre a
-- mesma, esteja o endereço na lista ou não. Só os confirmados passam para os contactos do CRM (e daí
-- para as campanhas). Um pedido por endereço e por hora, no máximo, para ninguém encher a caixa de
-- outra pessoa com confirmações.
--
-- As subscrições de antes ficam confirmadas (`confirmed_at = created`): foram feitas pelo próprio
-- formulário do site. Quem quiser pedir-lhes nova confirmação apaga-lhes o `confirmed_at`.
--
-- Reverter: alter table public.newsletter drop column confirmed_at, drop column confirm_token,
-- drop column confirm_sent_at.

alter table public.newsletter add column if not exists confirmed_at timestamptz;
alter table public.newsletter add column if not exists confirm_token text;
alter table public.newsletter add column if not exists confirm_sent_at timestamptz;

comment on column public.newsletter.confirmed_at is 'Quando o próprio confirmou pelo link do email. Vazio: por confirmar (não recebe nada).';
comment on column public.newsletter.confirm_token is 'Token do link de confirmação (64 hexadecimais).';
comment on column public.newsletter.confirm_sent_at is 'Último email de confirmação: um por hora, no máximo; o link expira em 7 dias.';

alter table public.newsletter drop constraint if exists newsletter_confirm_token_check;
alter table public.newsletter add constraint newsletter_confirm_token_check
  check (confirm_token is null or confirm_token ~ '^[0-9a-f]{64}$');
create unique index if not exists newsletter_confirm_token_key on public.newsletter (confirm_token) where confirm_token is not null;

update public.newsletter set confirmed_at = created where confirmed_at is null and confirm_token is null;
