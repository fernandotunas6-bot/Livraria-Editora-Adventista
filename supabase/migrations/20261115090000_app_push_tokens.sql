-- Tokens de notificações da app de colportores (2026-11-15).
--
-- A app Flutter «Colportor» (app/colportor) recebe as notificações pelo Firebase Cloud Messaging:
-- uma entrega oferecida tem prazo, e o WhatsApp não chega a toda a gente. Cada aparelho com sessão
-- regista aqui o seu token; a Edge Function manda para eles o que já manda por Web Push
-- (sendUserPush), com a chave da conta de serviço no segredo FCM_SERVICE_ACCOUNT. Sem o segredo,
-- nada é enviado e nada muda.
--
-- A tabela não se lê nem se escreve pela API: só a Edge Function (service role), pelas rotas
-- POST /push/app-token e POST /push/app-token/remover, que exigem sessão. Um token é de um aparelho
-- só: quando outra conta entra no mesmo telemóvel, o token passa para ela.
--
-- Reverter: drop table public.app_push_tokens.

create table if not exists public.app_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) between 20 and 4096 and token !~ '\s'),
  platform text not null default 'android' check (platform in ('android', 'ios')),
  app text not null default 'colportor' check (app ~ '^[a-z]{2,20}$'),
  app_version text not null default '' check (length(app_version) <= 40),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists app_push_tokens_user_idx on public.app_push_tokens (user_id, updated desc);
comment on table public.app_push_tokens is
  'Tokens FCM das apps instaladas (a de colportores). Só a Edge Function lê e escreve (migração app_push_tokens).';

alter table public.app_push_tokens enable row level security;
revoke all on public.app_push_tokens from public, anon, authenticated;
grant all on public.app_push_tokens to service_role;
