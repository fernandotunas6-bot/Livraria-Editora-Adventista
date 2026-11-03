# Especificação de segurança — Livraria Adventista

Estado em 2026-11-03. Substitui a versão anterior deste ficheiro, que descrevia regras do
**Firestore** para a lista de desejos: o Firestore foi desligado (`firestore.rules` fecha
tudo) e a lista de desejos vive hoje na tabela `public.wishlists` do Supabase. O detalhe de
cada achado está em [docs/AUDITORIA.md](docs/AUDITORIA.md).

## 1. Onde está cada garantia

| Camada | O que garante | Onde |
|---|---|---|
| RLS do Postgres | Quem lê e escreve cada linha. Activo em todas as tabelas de `public`. | `supabase/migrations/*` |
| Funções `SECURITY DEFINER` | Verificam a permissão logo no início (`has_permission`, `assert_can_manage_user`, `is_admin`, `auth.uid()`); as sensíveis (`place_order`, `admin_users_list`) só correm com a service role. | idem |
| Edge Function `app` | Rotas de equipa com `requirePermission`; rotas públicas com limite de pedidos partilhado (`check_rate_limit`); textos com tamanho máximo. | `supabase/functions/app/index.ts` |
| Checkout | Preço, stock, portes e total calculados na base de dados (`place_order`), com o livro bloqueado (`for update`); livros ocultos recusados. O browser só diz *que* livros e quantos. | `place_order` |
| Site | HTML das descrições e slides passa pelo DOMPurify com lista branca; CSP sem `unsafe-inline` em scripts; `frame-ancestors 'self'`. | `lib/sanitizeHtml.js`, `public/_headers` |

## 2. Lista de desejos (`public.wishlists`)

Uma linha é só `(user_id, book_id, created)`: o título, a capa e o preço são lidos do livro na
hora, não copiados. Isto elimina à partida a maior parte dos ataques de "dados envenenados"
que o desenho do Firestore tinha de travar campo a campo.

Regras (lidas de `pg_policies` e `pg_constraint` a 2026-11-03):

- `INSERT`, `SELECT` e `DELETE` só para `authenticated` e só com `user_id = auth.uid()`;
- **não há política de `UPDATE`**: nenhuma linha pode ser alterada, só apagada e criada de novo;
- nenhuma política para `anon`: um visitante sem sessão não lê nem escreve (a lista dele fica
  no browser e passa para a conta ao iniciar sessão);
- chave primária `(user_id, book_id)`; `book_id` é chave estrangeira para `stock_books` e
  `user_id` para `auth.users`, ambas com `on delete cascade`.

| # | Tentativa | Resultado esperado | Porquê |
|---|---|---|---|
| 01 | Cliente A guarda um livro na sua lista | permitido | política de `INSERT` |
| 02 | A escreve na lista de B (`user_id` = B) | recusado (`42501`) | `with check (user_id = auth.uid())` |
| 03 | A lê a lista de B | 0 linhas | `using (user_id = auth.uid())` |
| 04 | A lê a tabela toda, sem filtro | só as suas | idem |
| 05 | `book_id` inexistente ou com `../` | recusado (`23503`) | chave estrangeira |
| 06 | `book_id` com 1 MB | recusado | não existe livro com esse id (chave estrangeira); um valor deste tamanho nem cabe no índice da chave primária |
| 07 | Linha sem livro | recusado (`23502`) | `not null` |
| 08 | A altera uma linha sua | 0 linhas | sem política de `UPDATE` |
| 09 | A passa para si as linhas de B | 0 linhas | idem |
| 10 | A apaga a lista de B | 0 linhas | `using (user_id = auth.uid())` |
| 11 | Visitante anónimo escreve | recusado (`42501`) | sem política para `anon` |
| 12 | Visitante anónimo lê | 0 linhas | idem |
| 13 | Campo extra no pedido (`is_admin: true`) | recusado pelo PostgREST | coluna inexistente |

Estado da verificação: o `HANDOFF.md` regista estas regras como testadas a 2026-11-01 ("cada
cliente só vê e altera os seus desejos e avaliações; os visitantes lêem avaliações mas não
escrevem"). O bloco [docs/testes/seguranca_wishlists.sql](docs/testes/seguranca_wishlists.sql)
repete os casos 01–12 contra a base de dados real e anula tudo no fim (termina com
`raise exception 'RESULTADO …'`); corre-se no SQL Editor.

Riscos aceites:

- O cliente pode escolher o `created` das suas próprias linhas. Só muda a ordem da sua lista.
- `anon` e `authenticated` têm `TRUNCATE` na tabela (concessão por omissão do Supabase). O
  `TRUNCATE` não respeita a RLS, mas não é alcançável pela API: o PostgREST não o expõe e
  nenhuma função o executa.

## 3. Outras garantias verificadas a 2026-11-03

- **Encomendas:** o `/track` devolve só o necessário para seguir a encomenda (sem a imagem
  da assinatura); o checkout liga a encomenda à conta pela sessão (`customer_id`), validada
  no servidor — um token inválido conta como anónimo, nunca como outra pessoa.
- **`/catalog/summary`** passou a exigir `manage_catalog`: era público e mostrava o stock e
  as vendas de cada livro.
- **Funções `SECURITY DEFINER` chamáveis com sessão** (13, apontadas pelo advisor do
  Supabase): todas verificam a permissão no início; `book_review_helpfulness` é pública de
  propósito (contagem de votos).
- **Imagens:** o CSP aceita `img-src https:` (o painel permite colar links de CDN). Uma
  imagem não executa código; os scripts continuam limitados à própria origem e ao Google.

## 4. Por resolver

- Protecção contra palavras-passe vazadas (HaveIBeenPwned): exige o plano Pro do Supabase.
- O link de recuperação devolvido em `/admin/users/access-link` a quem tem `manage_users`, e
  o scope `https://mail.google.com/` pedido no login Google: decisões do dono, ver
  `docs/AUDITORIA.md`.
