-- KANGEST ONE, fase C: a API v1 (`/api/v1/...` na Edge Function `app`; contrato em docs/api/openapi.json).
--
-- Cada escrita da API leva um `Idempotency-Key`: o mesmo pedido repetido (a rede caiu antes da resposta, o cliente
-- tentou outra vez) devolve a primeira resposta, sem fazer a operação duas vezes. As respostas guardam-se 24 horas, por
-- pessoa e por rota. Só o servidor lê e escreve.
create table if not exists public.api_idempotencia (
  utilizador uuid not null references auth.users (id) on delete cascade,
  rota text not null check (char_length(rota) between 1 and 120),
  chave text not null check (chave ~ '^[A-Za-z0-9_.:-]{8,100}$'),
  estado integer not null check (estado between 100 and 599),
  resposta jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (utilizador, rota, chave)
);
comment on table public.api_idempotencia is
  'As respostas das escritas da API v1 por Idempotency-Key (24 horas). Só o servidor (a Edge Function) lê e escreve.';
create index if not exists api_idempotencia_criado_idx on public.api_idempotencia (criado_em);
alter table public.api_idempotencia enable row level security;
revoke all on public.api_idempotencia from public, anon, authenticated;
grant all on public.api_idempotencia to service_role;
