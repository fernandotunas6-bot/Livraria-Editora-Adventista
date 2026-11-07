# Especificação de segurança — Livraria Adventista

Estado em 2026-11-03, com a verificação em produção de 2026-11-07 (secção 5). Substitui a versão anterior deste ficheiro, que descrevia regras do
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

- **Link de acesso** (`/admin/users/access-link`): deixou de ser devolvido a quem o pede. Só
  volta quando o email não saiu e quem pede é administrador; um gestor com `manage_users` já
  não consegue entrar na conta de um cliente. Na criação de contas o link continua a voltar
  (conta nova, sem histórico).
- **Google Workspace da equipa**: permissões à medida do que o painel faz — `gmail.readonly`
  + `gmail.send` em vez de `mail.google.com` (que permitia apagar mensagens),
  `calendar.events` e `contacts.readonly`. Se o ecrã de consentimento da Google Cloud
  listar as permissões antigas, acrescentar estas.

## 4. Por resolver

Pelo dono (actualizado a 2026-11-07; o detalhe e o porquê estão na secção 5):

| # | O quê | Onde | Porquê |
|---|---|---|---|
| 1 | **Verificação em dois passos nas 4 contas da equipa** (3 admins e 1 gestor; nenhuma a tem) | Perfil → Segurança, em cada conta | Com a palavra-passe de uma conta da equipa roubada, entra-se no painel e troca-se o IBAN. É a protecção que mais falta |
| 2 | **Apagar o projecto antigo `livraria-adventista.pages.dev`** | Cloudflare da conta antiga → Workers & Pages | Continua no ar, ligado à base de produção, com um build sem o DOMPurify (o sanitizador antigo deixava passar `<img onerror>`) |
| 3 | **Ligar o envio de email** (SMTP ou API) e **activar o push** no telemóvel de cada admin | Configurações → Email; painel → sino → activar avisos | Sem isto, os avisos de segurança ficam só no sino do painel: os 13 emails da última semana ficaram por enviar (`skipped`) e nenhum aparelho da equipa tem push |
| 4 | Email do `livrariaadventista.com`: `MX 0 .`, `TXT "v=spf1 -all"`, `_dmarc TXT "v=DMARC1; p=reject"` | Cloudflare → `livrariaadventista.com` → DNS | Sem SPF nem DMARC, qualquer pessoa manda email "da loja" a pedir transferências. O domínio não envia email (o da loja é o `.ao`), por isso fecha-se tudo. O token desta sessão não chega a essa zona |
| 5 | DNSSEC do `.com` | Cloudflare → DNS → DNSSEC, e o registo DS na Hostinger, por esta ordem | O `.ao` não tem DNSSEC (o TLD `ao.` não está assinado) |
| 6 | DKIM do Google Workspace no `.ao` | Google Admin → Gmail → Autenticar email → gerar; o TXT no Cloudflare | O DMARC do `.ao` está em `p=none` até haver DKIM |
| 7 | Dependabot | GitHub → Settings → Code security → Dependabot alerts e security updates | Estão desligados; o proxy desta sessão não deixa ligá-los |
| 8 | Restringir a chave do Google Maps por referenciador HTTP | Google Cloud → APIs → Credenciais | Vai na resposta pública `/settings` (achado 83 do PR #22) |
| 9 | Palavras-passe vazadas (HaveIBeenPwned) | Supabase → Authentication → Policies | Exige o plano Pro |

## 5. Verificação em produção (2026-11-07)

As passagens anteriores (AUDITORIA.md, 9.x) trabalharam sobre o código e uma base local: a rede
dessas sessões não chegava à produção. Esta chegou (conector do Supabase, token do Cloudflare,
`gh`), e o que está abaixo foi visto em produção, não lido no código.

### Verificado sem problemas

- **As 79 migrações do `main` estão aplicadas**; a Edge Function `app` (v26) foi publicada
  pelo Actions.
- **Advisors de segurança do Supabase**: só avisos de desenho conhecidos. As 13 funções
  `security definer` que um anónimo pode chamar são leituras públicas de propósito
  (comunidade, materiais, votos úteis). As 35 que exigem sessão foram lidas uma a uma, incluindo
  as novas (`support_*`, `order_alert_acknowledge`, `customer_mark_*`): todas verificam
  `auth.uid()` ou a permissão logo no início e têm `search_path = ''`.
- **Ataque de fora, só com a chave pública** (o que qualquer visitante tem; para repetir,
  ver a secção 5.1):
  - nenhuma das 39 tabelas com dados de clientes ou da equipa devolve linhas a um anónimo (16
    nem deixam pedir, 401; as outras devolvem 0 linhas);
  - escrever em `orders`, `profiles` e `stock_books`: recusado ou 0 linhas;
  - `private` não está exposto pela API (`PGRST106`); o GraphQL não está instalado;
  - funções de administração (`users_admin_list`, `site_secrets_status`,
    `e2ee_admin_key_packages`, `admin_users_list`) e o `place_order`: recusadas;
  - enviar ficheiros para o Storage: recusado.
- **Cabeçalhos em `livrariaadventista.com`**: CSP, HSTS, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`; HTTP → HTTPS com 301.
- **Cloudflare**: as duas zonas têm o WAF gerido gratuito, a normalização de pedidos e a
  protecção DDoS L7 do Cloudflare.

### Corrigido nesta passagem

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| S1 | **Mudanças a IBAN, referências e links de pagamento, contactos da loja, permissões da equipa e segredos não deixavam rasto** (o `updated` diz quando, não quem nem o que estava antes). É o golpe mais rentável contra uma loja que recebe por transferência: com uma conta da equipa roubada, troca-se o IBAN e os clientes pagam a outra pessoa. | Alta | ✅ migração `registo_de_seguranca`: registo só de acrescentar (nem a service role altera ou apaga), aviso crítico aos admins, separador "Registo de segurança" no painel |
| S2 | Acções sobre contas na Edge Function (suspender, apagar, terminar sessões, link de acesso, email mudado por um admin) sem registo de quem as fez. | Média | ✅ `recordSecurity` em `index.ts` |
| S3 | Qualquer pessoa listava o bucket público `media` pela API, incluindo as pastas `users/<id>/` (os ids das contas). | Baixa | ✅ migração `imagens_sem_listagem_publica`: as imagens continuam a abrir pelo endereço público; só a equipa (na sua área) e cada pessoa (no próprio avatar) lêem pela API |
| S4 | 4 vulnerabilidades altas em produção no `npm audit` (`@grpc/grpc-js` < 1.13.6, puxado pelo Firestore, que o site nem importa). | Baixa (não chega ao browser) | ✅ `overrides` no `package.json`: `npm audit --omit=dev` = 0 |
| S5 | GitHub Actions com acesso aos tokens de deploy presas a etiquetas (`@v3`) que o dono do repositório da action pode mover. | Média (cadeia de fornecimento) | ✅ fixadas por SHA; `dependabot.yml` mantém-nas; `deploy-supabase.yml` com `permissions: contents: read` e sem deploys em paralelo |
| S6 | Zona `livrariaadventista.ao` (ainda pendente): SSL "Full", TLS 1.0 aceite, HTTP sem redireccionamento. | Média (quando activar) | ✅ aplicado no Cloudflare: SSL "Full (strict)", TLS mínimo 1.2, "Always Use HTTPS" |
| S7 | `.ao` sem DMARC. | Média | ✅ `_dmarc TXT "v=DMARC1; p=none; rua=mailto:contacto@livrariaadventista.ao"` |
| S8 | `docs/testes/isolamento_clientes_e_equipa.sql` deixara de correr (tipos de aviso e autor da mensagem passaram a ser obrigatórios) e os casos 15, 16 e 18 mediam um cliente em vez de um admin. | Baixa (teste) | ✅ os 21 casos dão o esperado |

### Como funciona o registo de segurança (S1, S2)

- **O que fica registado**: métodos de pagamento (tudo o que o cliente vê para pagar);
  configurações (cada campo, com os segredos só como "alterado"); papel e permissões de cada
  conta; telefone, WhatsApp e email das lojas; segredos (só o nome da chave); integrações (sem
  a configuração, que pode ter credenciais); pagamento, estado, total e portes das encomendas;
  preços; acesso e ficheiro dos PDFs pagos.
- **Quem**: a conta da sessão; com a Edge Function, o cabeçalho `x-actor-id` (só aceite com a
  service role — um cliente não o consegue forjar); "sistema de login", "tarefa automática"
  ou "acesso directo à base de dados" quando não há sessão.
- **Avisos**: dados de pagamento, permissões, contactos da loja e do site, segredos e
  integrações avisam todos os admins (crítico: email e push, a qualquer hora) — **também quem
  fez a mudança**, porque se a conta foi roubada é o dono verdadeiro que lê o email. No máximo
  um aviso por linha a cada 10 minutos. Encomendas, preços e PDFs ficam só registados.
- **Garantias**: só os admins lêem (RLS); ninguém escreve directamente; um gatilho recusa
  `UPDATE`, `DELETE` e `TRUNCATE` a todos, incluindo a service role. As linhas com mais de
  dois anos saem uma vez por mês (`limpeza-registo-seguranca`).
- **Nunca impede a gravação que observa**: se o registo falhar, a alteração passa e o erro
  fica nos registos do Postgres.
- **Testes**: `docs/testes/registo_de_seguranca.sql` (21 casos, anula tudo no fim). Inclui:
  admin troca o IBAN → registo com autor e aviso; cliente e anónimo não lêem nem escrevem;
  ninguém altera, apaga ou esvazia o registo; cabeçalho forjado por um cliente é ignorado;
  segredos nunca aparecem; pagamento marcado pela Edge Function fica com o autor.

### 5.1 Repetir os testes de fora

Com a chave pública do site (a mesma que está no JavaScript), cada um destes pedidos tem de
devolver `[]`, `401` ou `403`:

```bash
U=https://bggqkjjqbjhbjsckzopj.supabase.co; K=<chave publicável>
curl -s "$U/rest/v1/orders?select=*&limit=1" -H "apikey: $K"
curl -s "$U/rest/v1/profiles?select=*&limit=1" -H "apikey: $K"
curl -s "$U/rest/v1/security_audit_log?select=*&limit=1" -H "apikey: $K"
curl -s -X POST "$U/storage/v1/object/list/media" -H "apikey: $K" -H "Authorization: Bearer $K" -H "content-type: application/json" -d '{"prefix":""}'
curl -s -X POST "$U/rest/v1/rpc/users_admin_list" -H "apikey: $K" -H "content-type: application/json" -d '{}'
```
