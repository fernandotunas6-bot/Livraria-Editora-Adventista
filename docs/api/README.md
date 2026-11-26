# KanGest Core API v1

É a API do ecossistema KANGEST ONE (fase C do plano de 26/11). Vive na Edge Function `app` do Supabase:

    https://<projecto>.supabase.co/functions/v1/app/api/v1/...

O contrato está em [`openapi.json`](openapi.json) (OpenAPI 3.1). O teste `supabase/functions/app/apiV1.test.ts` confere-o
contra o código em cada PR:
- cada rota `/api/v1` está no contrato, e cada rota do contrato está no código, **com o mesmo acesso** (`x-acesso`);
- as rotas que reutilizam uma rota antiga dizem qual (`x-reutiliza`) e têm o acesso dela;
- as escritas levam `Idempotency-Key`;
- a porta de cada rota recusa quem não tem sessão e quem não tem a permissão, e deixa passar quem a tem.

## Regras

- **A sessão** é a da pessoa no Supabase Auth: a mesma do site e do KanGest (`Authorization: Bearer <token>`). A equipa
  precisa dos dois passos. Nunca a `service_role`, que só existe no servidor.
- **As respostas** vêm em `{ "data": … }`. As listas trazem `next_cursor` (e `total`, quando se sabe). A página seguinte
  pede-se com `?cursor=<next_cursor>`.
- **Os erros** vêm sempre em `{ "error": { "status": 403, "message": "…" }, "ref": "<id do pedido>" }`. A `ref` é o que
  se procura nos registos da função.
- **As escritas** (POST) levam `Idempotency-Key` (8 a 100 letras, algarismos ou `_ . : -`):
  - o mesmo valor, da mesma pessoa e na mesma rota, nas 24 horas seguintes, devolve a primeira resposta, com
    `Idempotent-Replayed: true`, sem repetir a operação;
  - as respostas guardam-se em `public.api_idempotencia`, que só o servidor lê.
- **Nenhuma regra é nova.** Cada rota reutiliza as funções da base e as permissões que já existem:
  - `rotaV1(...)` serve a mesma rota antiga, com o mesmo handler e o mesmo acesso;
  - as outras chamam as mesmas funções, com o acesso das rotas antigas equivalentes.
- **As rotas antigas ficam como estão.** O site e o KanGest continuam a usá-las.

## As famílias

| Fase | Famílias | Estado |
|---|---|---|
| C1 | `auth`, `users`, `permissions`, `system`, `integrations`, `synchronization` | este PR |
| C2 | `products`, `categories`, `pricing`, `inventory`, `stock-movements`, `orders` | a seguir |
| C3 | `sales`, `invoices`, `payments`, `customers`, `suppliers`, `documents`, `reports` | a seguir |

## Variáveis

`KANGEST_MIN_VERSION` (segredo da Edge Function, opcional) é a versão mínima do KanGest que o site aceita. Aparece em
`GET /api/v1/system/info`. Sem ela, vem `null`. A fase E vai usá-la para avisar os KanGest antigos.
