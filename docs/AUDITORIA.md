# Auditoria do sistema — Livraria Adventista

Data: 2026-11-01. Ramo `claude/youthful-heisenberg-rq5gnw` (PR #3), produção em https://livraria-adventista.pages.dev.
Cada ponto foi verificado com comandos (código, API pública, base de dados por leitura, build e ficheiros publicados), não de memória.
Gravidade: **Crítica · Alta · Média · Baixa**. Estado: ✅ corrigido nesta auditoria · ⏳ por fazer.

## Resumo

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 1 | Sanitização de HTML contornável (injecção de código nas descrições e slides) | Crítica | ✅ |
| 2 | Edge Function publicada desactualizada: módulo de utilizadores partido em produção | Alta | ✅ publicada (2026-11-01 23:21) |
| 3 | GitHub Actions bloqueado por pagamento (CI e deploys automáticos não correm) | Alta | ✅ corre na conta nova; faltam segredos (ver 9.5) |
| 4 | Service worker serve HTML antigo depois de cada deploy (risco de ecrã branco) | Alta | ✅ |
| 5 | 100 de 102 livros sem descrição; 17 capas em branco; capas trocadas | Alta (negócio) | ⏳ conteúdo |
| 6 | Carregamento inicial pesado (Firebase e Recharts em todas as páginas) | Média | ✅ 580 → 331 KB |
| 7 | Contactos provisórios no site (telefone `+244 923 000 000`, WhatsApp vazio) | Média | ⏳ Configurações |
| 8 | Emails de confirmação de encomenda desligados (sem SMTP) | Média | ⏳ Configurações |
| 9 | Sem `robots.txt`, `sitemap.xml`, `favicon.ico`, etiquetas `og:` | Média | ✅ |
| 10 | Sem cabeçalhos de segurança (CSP, X-Frame-Options, HSTS) | Média | ✅ |
| 11 | 11 vulnerabilidades em dependências (10 altas, impacto prático baixo) | Média | ✅ nada vulnerável no site publicado (ver 9.5) |
| 12 | Stock: 96 de 102 livros esgotados ou com 1–4 unidades | Média (negócio) | ⏳ conferir |
| 13 | API lenta (0,85–1,5 s por pedido, Supabase em Estocolmo, sem cache) | Média | ⏳ |
| 14 | 53 botões só com ícone sem nome acessível | Baixa | ✅ |
| 15 | Rotas de utilizadores procuram o id antes de verificar a permissão | Baixa | ✅ |
| 16 | Loja Talatona → Huambo e painel por loja (SQL pronto) | — | ⏳ `docs/migracoes-pendentes` |
| 17 | Gate de qualidade inexistente: ESLint com `no-undef`/`no-unused-vars` em `off` e `--quiet`; zero testes | Crítica | ✅ |
| 18 | Três bugs de runtime que o gate desligado escondia (criar livro no painel rebentava) | Alta | ✅ |
| 19 | `/track` devolvia a assinatura manuscrita a quem soubesse nº da encomenda + email | Alta | ✅ |
| 20 | `/admin` descarregava todas as encomendas com `select *`, assinaturas base64 incluídas | Média | ✅ |
| 21 | Limite de pedidos em memória por isolate: na prática não limitava nada | Alta | ✅ migração aplicada |

## 1. Repositório e deploy

- **PR #3** aberto, sem conflitos, 68 commits à frente do `main`. As verificações estão a vermelho só porque o Actions não arranca (conta GitHub bloqueada por pagamento).
- PRs #1 e #2 continuam abertos e estão contidos no #3. Fechá-los depois do merge do #3.
- Ramo `cursor/fix-pocketbase-payment-hooks`: 6 commits atrás do `main`, da época do PocketBase. Candidato a fechar.
- **Produção (Cloudflare Pages)** = ponta do ramo (`774a5cb`), confirmada pelo `npm run deploy:site`.
- **Edge Function `app`**: a versão publicada é antiga. Testado em produção: `/admin/users`, `/admin/users/orders`, `/create`, `/update`, `/status` e `/access-link` respondem "Rota não encontrada", e `/contacts/*` exige admin em vez de `manage_marketing`. A CLI do Supabase nesta máquina recebe 401 em funções e na base de dados. **Precisa de um token pessoal da conta dona do projecto.**
- **Migrações**: todas as do repositório estão aplicadas (colunas e tabelas novas confirmadas pela API). SQL por aplicar em `docs/migracoes-pendentes/`.

## 2. Segurança

**Corrigido**
- **Injecção de código (XSS armazenado)**. O `sanitizeHtml` usava expressões regulares, e passavam `<img/src=x/onerror=…>`, `<svg/onload=…>` e `java&#115;cript:`. Um gestor com permissão de catálogo podia pôr código numa descrição, no texto de um slide ou na biografia do autor. Esse código corria para todos os visitantes e administradores, o que permitia roubar a sessão e escalar para admin. Agora usa-se o **DOMPurify**, testado contra os mesmos ataques.

**Verificado sem problemas**
- Nenhum segredo versionado nem no histórico (chaves Stripe, Supabase, GitHub, Meta, SendGrid, chaves privadas).
- A chave da API Firebase no código é pública por natureza. Está repetida em três sítios (`firebase-applet-config.json` ×2, `lib/googleAuth.js`) e convém restringi-la por domínio na Google Cloud.
- O `client_secret_*.json` na pasta local está ignorado pelo git.
- **RLS activo nas 24 tabelas.** As escritas exigem a permissão certa (`manage_catalog`, `manage_orders`, `manage_settings`, `manage_payments`; admin para integrações, registo e vendas). O Storage exige a permissão da área de cada pasta.
- Funções SQL sensíveis (`place_order`, `admin_users_list`, `increment_book_views`) revogadas para anónimos e autenticados, e só chamadas pelo service role. `is_admin` e `is_staff` são chamáveis por anónimos, mas só dizem algo sobre quem as chama.
- Edge Function: todas as rotas de admin, contactos e utilizadores têm guarda (`requirePermission`, `requireCrm`, `isStaff`, `assertCanManage`). As rotas públicas de escrita têm limite de pedidos.
- Login: Google e email activos no Supabase; o registo exige confirmação de email.

**Por fazer**
- Cabeçalhos HTTP: falta `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (o admin pode ser embutido noutro site) e `Strict-Transport-Security`. Resolve-se com um ficheiro `app/web/public/_headers`.
- `/admin/users/update`, `/status`, `/access-link` e `/delete`: `loadTarget()` corre antes da verificação de permissão, por isso sem sessão dá para distinguir se um id existe (404 vs 403). Os ids são UUID e o risco é baixo, mas a ordem deve trocar.
- O limite de pedidos da Edge Function é guardado em memória por instância: abranda abusos, mas não é um limite global.
- CORS `*` na Edge Function: aceitável porque a autenticação é por token e não por cookie.
- `/catalog/summary` é público e mostra vendas e stock por livro. Decidir se é informação a esconder.

## 3. Dependências

- `npm audit` em produção: 11 vulnerabilidades (10 altas, 1 moderada), todas com correcção disponível: `react-router` (modo RSC, que o site não usa), Firebase e gRPC (lado do servidor), `postcss` (só no build), `nanoid`. Correr `npm audit fix` e testar.
- Declaradas sem uso no código: `@hookform/resolvers`, `date-fns`, `esbuild`, `next-themes`, `zod`.

## 4. Desempenho

- **Corrigido:** o carregamento inicial desceu de **573 KB para 338 KB** comprimidos.
  - O `useAuth` importava o Firebase em todas as páginas; passou a import dinâmico.
  - O `clsx` estava dentro do bloco do Recharts e arrastava-o para a página inicial; ganhou bloco próprio.
- A API (Edge Function e REST) demora 0,85 a 1,5 s por pedido, e `/settings` é chamado em todas as páginas sem cache (`cf-cache-status: DYNAMIC`).
  - Sugestões: `Cache-Control: public, s-maxage=60` em `/settings`, `/stores`, `/book-collections` e `/payment-methods`, ou guardar em `localStorage` com revalidação.
  - O Supabase não tem região em África; Paris ou Frankfurt podem reduzir a latência.
- Capas: as 102 carregam, todas em JPEG 340×510, com mediana de 25 KB e máximo de 63 KB. Estão bem.
- Páginas publicadas: tempo até ao primeiro byte de cerca de 0,7 s; o HTML tem `max-age=0, must-revalidate`, o que está certo.

## 5. PWA e service worker

- **Problema:** o `sw.js` faz stale-while-revalidate também ao HTML e ao JavaScript. Depois de um deploy, quem já visitou recebe o `index.html` antigo, que aponta para ficheiros de versões anteriores. As páginas carregadas a pedido (por exemplo o admin) podem falhar até um segundo recarregamento: é o "ecrã branco depois de actualizar".
  - **Correcção sugerida:** HTML sempre pela rede (network-first, com a cache só para quando não há internet); ficheiros em `/assets/`, que têm hash no nome, de cache permanente; mudar a versão da cache em cada deploy.
- A cache de imagens cresce sem limite: acrescentar um número máximo de entradas.
- O manifest está correcto (`standalone`, `lang: pt`, ícones de 192 e 512).

## 6. SEO e partilha

- `robots.txt`, `sitemap.xml` e `favicon.ico` não existem: as três rotas devolvem a página da aplicação.
- Sem `og:title`, `og:image` nem `og:description`: partilhar um livro no WhatsApp ou no Facebook não mostra capa nem título.
- Sem `<link rel="canonical">`.
- O site é uma SPA: os títulos por página são postos pelo JavaScript e os motores de busca vêem pouco conteúdo. Para melhorar, gerar um `sitemap.xml` com os 102 livros e pré-renderizar as páginas de produto.

## 7. Dados do catálogo e da loja

- 102 livros, sem preços a zero, sem stock negativo, sem códigos, SKUs ou títulos repetidos, e sem coleções inexistentes.
- **100 livros sem descrição.**
- **102 sem ISBN.**
- 2 sem autor.
- Só 2 livros em destaque.
- **17 capas totalmente em branco** e 8 quase brancas, a confirmar à vista. Lista em `capas_brancas` desta auditoria; a outra sessão encontrou também capas trocadas (ex.: "Daniel Verso por Verso" com a capa de "Curiosidades e Testes Bíblicos").
- **Stock: 12 esgotados e 84 com 1–4 unidades.** Confirmar se são valores reais ou provisórios. O aviso de stock baixo fica activo em quase todo o catálogo.
- `sales_count` está a 0 em todos: ainda não houve vendas pelo site. As visualizações começaram a contar no deploy de hoje.
- Configurações:
  - telefone de contacto provisório e WhatsApp da loja vazio;
  - `order_email_enabled = false` e sem SMTP;
  - push desligado;
  - envio expresso a 0 Kz, que o sistema trata como "2× o normal" (3 000 Kz), de forma coerente.
- Lojas: Talatona (Luanda) e Benguela, com telefones provisórios. A mudança Talatona → Huambo está em `docs/migracoes-pendentes/`.
- Métodos de pagamento activos: entrega, transferência, Multicaixa Express e balcão, todos com instruções. Há 3 linhas `unitel_money` repetidas e desactivadas, a limpar.
- Painel de vendas: o total de 2025 calculado pelos meses (11 959 074,65 Kz) difere do relatório (11 716 684,65 Kz). O painel mostra a diferença na secção "Conferência"; confirmar no documento de origem.

## 8. Painel admin

- Corrigido hoje:
  - guardar livro falhava por campos inexistentes;
  - upload de imagens perdido em livros, slider e configurações;
  - stock devolvido em dobro ao cancelar;
  - rastreio não gravava sem data prevista;
  - escurecimento 0 trocado por 0,55;
  - visualizações nunca contadas;
  - formulário SMTP decorativo.
- Verificado:
  - todas as chamadas à base de dados usam tabelas, colunas, ordenações e filtros existentes;
  - os separadores aparecem com a mesma permissão que a base de dados exige;
  - os atalhos `/admin?tab=…` são válidos.
- Por fazer (precisa da base de dados): ocultar livros (coluna `active`) e promoções com o preço calculado no servidor. Plano em `docs/PROMPT_REFINAMENTO.md`.

## 9. Acessibilidade

- Todas as imagens têm `alt`.
- 53 botões só com ícone não têm `aria-label` nem `title`, por exemplo em `Header.jsx` (132, 139), `ContactsManager.jsx` (769, 770, 826, 827, 855) e `LivrariaAssistant.jsx` (196).

## 9.1 Segunda passagem (2026-11-01, sessão da análise crítica)

### Corrigido

- **O gate de qualidade não existia** (achado 17). O `eslint.config.js` tinha `no-undef` e
  `no-unused-vars` em `off`, e o script corria com `--quiet`: a única regra a nível de erro
  era `rules-of-hooks`. O CI verificava, na prática, só se o projecto compilava. Ligadas as
  regras a erro e acrescentados **14 testes** (vitest + jsdom) sobre a sanitização de HTML e
  o escape de filtros. Correm no `ci.yml` e no `scripts/deploy-site.sh` — este último é hoje
  o único gate real, com o Actions bloqueado.

- **Três bugs de runtime que o gate desligado escondia** (achado 18), todos restos de
  remoções anteriores:
  - `BookFormModal`: `autoCode` nunca foi definido. Todo livro novo ou duplicado começa com
    `book_code: ''`, logo o `||` avaliava a variável e rebentava o render — **criar um livro
    no painel estava quebrado em produção**. Passou a uma constante `AUTO_CODE`.
  - `GoogleWorkspaceHub`: `setIsArchivedMode` não existe desde que o arquivo no Firestore
    saiu; desligar a conta Google falhava a meio, em silêncio (o `catch` engolia).
  - `googleAuth`: chamada a `syncGoogleWorkspaceToFirestore`, apagada com o Firestore.

- **Sanitização mais fechada** (achado 1). O DOMPurify entrou com `USE_PROFILES`; passou a
  lista branca explícita das tags que o editor do painel produz, com `ALLOWED_URI_REGEXP`
  (só `http(s)`, `mailto`, `tel` e imagens embutidas), `FORBID_ATTR` para `srcdoc`,
  `formaction` e `xlink:href`, e `rel="noopener noreferrer nofollow"` em todas as ligações.
  Os testes cobrem cada bypass do sanitizador antigo — verificou-se que os seis payloads
  passavam intactos, e que com um `<script>` partido ao meio o antigo **construía** uma tag
  limpa.

- **Assinatura manuscrita fora do `/track`** (achado 19). A rota devolvia nome, telefone,
  telefone do parente, morada completa e a imagem da assinatura a quem apresentasse número
  da encomenda + email — e o número é curto (prefixo + base36 do tempo + 3 caracteres).
  Passa a devolver só `delivery_signature_present`. Quem confirma a recepção continua a ver
  a sua assinatura na resposta do `/confirm-delivery`.

- **Carga do painel** (achado 20). O `/admin` fazia `getFullList` das encomendas com
  `select *`, incluindo `checkout_signature_data` e `delivery_signature_data` (até 200 KB e
  600 KB por encomenda) e a linha temporal. Passa a pedir uma lista explícita de colunas
  (`ORDER_LIST_FIELDS`); a assinatura é lida só da encomenda cujo recibo se emite. Hoje são
  4 encomendas e as assinaturas estão vazias: era um problema latente, que morde por volta
  da centena de encomendas.

- **Carregamento inicial de 580 para 331 KB gzip** (achado 6). A causa era o próprio
  `manualChunks`: agrupava por substring (`id.includes('react')` apanhava o `react-smooth`,
  do recharts), partia pacotes por vários chunks, o Rollup religava-os com imports
  estáticos e o `index.html` pré-carregava o firebase (154 KB) e o recharts (97 KB). Medido
  com um build sem `manualChunks`: o Vite já punha o recharts dentro do chunk do AdminPage e
  o Firebase num chunk próprio. Ficou só `vendor-react` fixo (estável entre deploys). O
  Firebase passou a import dinâmico no logout e na página do livro, e perdeu o SDK do
  Firestore — que estava a ser carregado em cada visita e a fazer no arranque um pedido a
  `test/connection` que as regras do Firestore negam.

- **Edge Function publicada** (achado 2). A CLI nesta máquina **está** autenticada
  (`~/.supabase/access-token`); o 401 da primeira passagem estava desactualizado.
  Publicada com `--no-verify-jwt`. Verificado em produção: `/admin/users` e
  `/contacts/stats` respondem 403 ("Sem permissão") em vez de 404 ("Rota não encontrada"),
  ou seja **o módulo de utilizadores deixou de estar partido**.

### Terceira leva (achados 4, 9, 10 e 15), verificada em produção

- **Service worker** (achado 4). A navegação passa a rede primeiro, com a cache só quando
  não há rede; os ficheiros com hash no nome passam a cache primeiro. `CACHE_NAME` subiu
  para `livraria-v5`, por isso o `activate` apaga o HTML velho já guardado nos browsers.
  Confirmado em produção: `sw.js` servido com `no-cache` e já na v5.

- **Cabeçalhos** (achado 10). Novo `app/web/public/_headers`. Confirmado em produção:
  `x-frame-options: SAMEORIGIN`, `strict-transport-security: max-age=15552000`,
  `cross-origin-opener-policy: same-origin-allow-popups`,
  `permissions-policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`,
  `/assets/*` com `immutable` e o `index.html` com `must-revalidate`.
  **O CSP continua em falta por opção:** tem de cobrir o `<script>` inline do `index.html`,
  os pop-ups do Google, os embeds do Maps e `img-src https:` para as capas em URLs externos.
  Um CSP errado parte a loja em silêncio, e isso precisa de uma passagem com o browser.

- **SEO** (achado 9). `robots.txt` e `sitemap.xml` (ambos 200 em produção), `canonical` e
  etiquetas `og:`/`twitter:` no `index.html`. Os caminhos do sitemap foram conferidos contra
  as rotas do `App.jsx` — três dos que tinha escrito não existiam (`/sobre`, `/contacto`,
  `/envios-devolucoes`; são `/about`, `/contact`, `/shipping-returns`). Falta o
  `favicon.ico` (há `logo-icon.svg`, que cobre os browsers actuais).

- **Permissão antes da consulta** (achado 15). As rotas `/admin/users/*` iam à base de dados
  antes de verificar a permissão, logo respondiam 404 para um id inexistente e 403 para um
  existente — um oráculo de ids de conta. Confirmado em produção: agora ambos os casos dão
  403.

### Por fazer

- **Limite de pedidos partilhado** (achado 21). O limite vivia num objecto em memória de
  cada isolate: as Edge Functions escalam e reciclam, por isso perdia-se a cada arranque a
  frio — e é o que protege o `/chat` (gasto directo na chave de IA), o `/checkout` e o
  `/track`. A migração `20261102013223_limites_pedidos` (aplicada a 2026-11-02) cria `private.rate_limits` e
  `check_rate_limit`, e a função já a usa, **mas a migração ainda não foi aplicada**: a
  ferramenta de aplicar migrações foi recusada nesta sessão. Enquanto não for, a função
  detecta a falta e recua para o limite local (comportamento anterior, sem regressão).
  Aplicar com `supabase db push` ou pelo painel.

## 9.2 Passagem de produção (2026-11-03)

Feita a partir da ponta `cc57236`, depois da migração para o repositório novo. Gate:
lint limpo, **250 testes** (eram 244), build e `deno check` da Edge Function.

### Corrigido

- **Capas das colecções em branco.** As quatro capas estão em `images.unsplash.com`, e o
  `img-src` do CSP só aceitava Supabase e Google: o navegador bloqueava-as. O próprio painel
  diz para colar "um link directo (CDN, Unsplash)". O `img-src` passou a `https:` — uma
  imagem não executa código; os scripts continuam fechados.
- **Slides presos ao projecto antigo.** A galeria do painel gravava
  `window.location.origin + caminho`, por isso os quatro slides têm
  `https://livraria-adventista.pages.dev/images/…`. No projecto novo ou no domínio `.ao`
  isso é outra origem (bloqueada pelo CSP) e desaparece quando o projecto antigo for
  desligado. Agora a galeria grava o caminho relativo, `normalizeImageUrl` converte
  endereços do próprio site em caminhos (`toSiteRelativeUrl`), e os slides já gravados são
  convertidos na leitura — sem mexer nos dados.
- **`canonical`, `og:`, sitemap e robots com o endereço antigo.** O `deploy-site.sh`
  reescreve-os no build para o `SITE_URL` de destino; o mesmo commit serve para qualquer
  projecto ou domínio.
- **`favicon.ico`** criado (antes devolvia a página HTML).
- **Edge Function não passava no `deno check`** (`headers` do `List-Unsubscribe` sem tipo).
  O CI teria ficado vermelho no primeiro PR.
- **Rotas públicas sem cache.** `/settings`, `/stores`, `/book-collections`,
  `/payment-methods` e `/geo/*` (≈1 s cada, em todas as páginas) passam a
  `Cache-Control: public, max-age=30, stale-while-revalidate=300`. O painel, ao gravar,
  pede com `no-cache`, para ver logo o que gravou. **Só tem efeito depois de publicar a
  Edge Function.**

### Verificado sem problemas

- As 13 funções `SECURITY DEFINER` que o advisor aponta como chamáveis por utilizadores com
  sessão verificam todas a permissão no início (`has_permission`, `assert_can_manage_user`,
  `is_admin`, `auth.uid()`). `book_review_helpfulness` é pública de propósito (contagem de
  votos). `private.admin_emails` sem políticas é intencional: só o service role lê.
- Migrações: as 33 do repositório coincidem com as da base de dados.
- Segredos locais (`api-keys-*.csv`, `client_secret_*.json`, `.env`) estão no `.gitignore`.
- `npm audit`: as 4 altas são do gRPC, que o Firebase só usa no servidor; não entra no site.

### Segunda leva (2026-11-03, noite)

- **O checkout nunca enviava a sessão.** O `initializeCheckout` fazia o `fetch` sem
  `Authorization`, por isso o servidor tratava toda a encomenda como anónima: o
  `customer_id` do `075bfa3` ficava sempre vazio, **mesmo depois de publicar a função**.
  Agora envia o token quando há sessão (sem sessão segue como antes).
- **O GPS da entrega nunca chegava.** O carrinho passava `deliveryGpsLat/Lng`, mas a função
  só reenviava os campos que nomeia. As 6 encomendas na base de dados têm 0/0. Corrigido;
  4 testes novos (`checkoutRequest.test.js`) falham com o código antigo.
- **Testes no CI.** Sem o `.env` (que não está no git) quatro ficheiros de teste nem
  carregavam. O `vitest.config.js` fixa um projecto fictício: 254 testes passam com e sem
  `.env`.
- **Sitemap com livros e colecções.** `scripts/seo-catalogo.mjs` (antes `gerar-sitemap.mjs`) corre no deploy e junta
  as 102 páginas de livro e as 4 de colecção às 8 fixas (lê só o que é público). Se a base
  de dados não responder, publica com as fixas.

Fica por decidir: o servidor ainda aceita entrega ao domicílio sem conta (a regra só está
no carrinho). **Só se pode exigir depois de o site novo estar publicado** — antes disso, o
site antigo não envia a sessão e todas as entregas seriam recusadas.

### Por fazer (precisa de autorização ou do dono)

- **Publicar a Edge Function.** A publicada é de 2026-11-02 13:59 e não tem o
  `customer_id` no checkout (commit `075bfa3`): as encomendas novas de clientes com sessão
  ficam sem conta e **não geram as notificações do centro de atendimento**. Leva também a
  cache e a correcção de tipos acima.
- **Índices das 11 chaves estrangeiras** sem índice:
  `docs/migracoes-pendentes/3_indices_chaves_estrangeiras.sql` (só acrescenta índices).
- **Primeiro deploy no projecto novo** `livraria-editora-adventista` (hoje responde 522).
- ~~IBAN de exemplo~~: corrigido a 2026-11-03 para o IBAN real da Livraria e Editora Adventista (BAI), confirmado na rota pública `/payment-methods`.
- Conteúdo: telefone `+244 923 000 000` e das lojas
  provisórios, emails de encomenda desligados (sem SMTP), 100 de 102 livros sem descrição,
  12 esgotados, 3 linhas em `site_settings` e 3 `unitel_money` repetidas, e o nome da loja
  "LIvraria Adventista - Huambo" com gralha e sem telefone.
- Protecção contra palavras-passe vazadas: exige o plano Pro do Supabase.

## 9.3 Backend mais leve, encomendas e partilha (2026-11-03, noite)

Medido a partir de Angola: a Edge Function corre em Paris (`eu-west-3`) e a base de dados em
Estocolmo; um pedido sem base de dados leva ~0,36 s (rede) e cada consulta em série
acrescenta 0,1–0,2 s. Fixar a função na região da base de dados não mudou nada mensurável. A
alavanca é fazer menos consultas em série:

- **Cache curta por instância** (`runtime.ts`, 11 testes): definições e integrações 15 s,
  dono do CRM 5 min; pedidos simultâneos partilham a leitura; o painel lê fresco onde testa
  o que acabou de gravar. `/messaging/status` e `/chat` fazem as leituras em paralelo.
- **Checkout sem esperar** pelo email (SMTP, 1–3 s quando ligado) nem pelo CRM: vão depois
  da resposta (`EdgeRuntime.waitUntil`). O WhatsApp fica antes, porque o carrinho usa
  `whatsapp_sent`.
- **`/catalog/summary`** passa a exigir `manage_catalog` (mostrava stock e vendas a todos).
- **Campos repetidos das encomendas**: um só critério de leitura no site (`orderUtils.js`) e
  na função (`orderFields.ts`), com um teste que confirma que dizem o mesmo. Corrige o
  painel, que repetia a loja dos levantamentos, e a exportação, que mostrava o código do
  método em vez do nome. O checkout deixa de gravar `payment_method` e `address`.
  SQL por aplicar: `docs/migracoes-pendentes/4_campos_encomendas.sql` (testado num bloco
  anulado).
- **Partilha dos livros no WhatsApp**: `scripts/seo-catalogo.mjs` gera no deploy uma página
  estática por livro (`product/<id>.html`) e por colecção, com o título, a capa e a
  descrição. Escolheu-se ficheiro estático em vez de Pages Function: não custa nada por
  visita e mantém os cabeçalhos do `_headers` — as respostas de uma Function não os levam
  (documentação do Cloudflare). O mesmo passo troca os endereços públicos e põe o catálogo
  no sitemap, e corre agora **também no deploy pelo Actions**, que antes o saltava.
- **`security_spec.md`** reescrito para o Supabase (era do Firestore), com os casos de ataque
  à lista de desejos e o teste em `docs/testes/seguranca_wishlists.sql`.

- **Página inicial 309 → 241 KB comprimidos (−22 %)**, e o JavaScript a executar de ~916 para
  ~695 KB. O `vite.config.js` voltara a ter uma regra geral (`return 'vendor-core'`) que
  metia na página inicial as dependências do Recharts (`lodash`, `react-smooth`,
  `decimal.js-light`… ~80 KB): a regra apanhava-as antes de o Rollup as juntar ao bloco dos
  gráficos. Ficam fixos só os blocos que todas as páginas usam (React com o router, Supabase,
  animações). Medido pelo source map; confirmado num Chrome sem interface que a página
  inicial, a loja e a página de partilha de um livro arrancam e mostram o conteúdo.

- **Fontes sem cadeia de pedidos**: o `@import` do Google Fonts estava dentro do CSS, e o
  browser só o descobria depois de descarregar o CSS da loja (mais dois pedidos em série).
  Passou para o `<head>` com `preconnect`. Saíram também cinco dependências que nada
  importava (`@hookform/resolvers`, `date-fns`, `esbuild`, `next-themes`, `zod`).
- **Por fazer:** versões mais pequenas das imagens do slider para telemóvel (hoje 1920×1080,
  42–149 KB); esta máquina não tem ferramenta para gravar WebP.

### Ordem de publicação (importa)

1. **Site** (`deploy-site.sh` ou Actions): passa a enviar a sessão e o GPS no checkout e lê
   as encomendas por um só critério. Funciona com a função antiga e com a nova.
2. **`4_campos_encomendas.sql`** e **`3_indices_chaves_estrangeiras.sql`**.
3. **Edge Function**: deixa de gravar `payment_method`/`address`, liga a encomenda à conta, e
   traz a cache e o checkout sem esperas. Publicada antes do site, o painel antigo deixava de
   mostrar a morada das encomendas novas.
4. Depois de confirmado: exigir conta no servidor para entrega ao domicílio, e apagar as
   colunas herdadas (ver o README de `docs/migracoes-pendentes`).

## 9.4 Segurança, rede e continuidade (2026-11-04)

Feita a partir da ponta `1ea225e` do ramo. Tudo o que está marcado como validado foi visto a
funcionar (consulta à base de dados de produção só de leitura, pedido HTTP real, ou teste
automático), e não apenas lido no código.

### Arquitectura encontrada

- **Site**: SPA React/Vite no Cloudflare Pages (`livrariaadventista.com` e `www`, projecto
  `livraria-editora-adventista` com sufixo `-ben` no `pages.dev`). O projecto antigo
  `livraria-adventista.pages.dev` **continua no ar com um build antigo**.
- **API**: uma Edge Function do Supabase (`app`, `verify_jwt = false`, autenticação feita na
  função) e o PostgREST com RLS. Base de dados Postgres 17 em `eu-north-1`.
- **Autenticação**: Supabase Auth (email + palavra-passe com confirmação, Google OAuth). A
  Firebase só serve o login Google Workspace do painel.
- **Sem servidores próprios**: não há origem a esconder, nem balanceador a configurar. A
  distribuição e o failover são os do Cloudflare e do Supabase.
- **Pagamentos**: sem gateway. O cliente indica a referência e a equipa confirma no painel.

### Estado de cada controlo

| Controlo | Estado | Evidência |
|---|---|---|
| SQL sem concatenação de valores | Existente e validado | `place_order` monta colunas com `quote_ident` a partir do catálogo e passa os valores em `$1`; filtros PostgREST escapados (`likeExact`, `JSON.stringify` no `.or`) |
| RLS nas tabelas expostas | Existente e validado | As 33 tabelas de `public` e o `storage.objects` com RLS; `private.rate_limits` sem RLS mas fora da API e sem grants |
| Funções `SECURITY DEFINER` | Existente e validado | Todas com `search_path = ''`; li as 6 novas do atendimento: verificam `auth.uid()` e a permissão antes de escrever |
| Privilégios no próprio perfil | Existente e validado | Trigger `protect_profile_privileges` repõe `role`, `permissions` e `email` |
| Isolamento entre clientes | Existente; refinado | Encomendas, desejos, avaliações e notificações por `auth.uid()`. As conversas seguras deixavam o cliente reabrir e alterar a conversa (corrigido abaixo) |
| Validação no servidor | Existente; refinado | Checkout com lista explícita de campos, tamanhos e preço calculado na base de dados; faltava validar a forma do email |
| XSS | Existente; refinado | DOMPurify na loja, CSP sem `unsafe-inline` nos scripts; o editor do painel não sanitizava (corrigido) |
| Segredos no repositório | Existente e validado | Histórico completo: só a configuração Web da Firebase (pública por desenho). CSV de chaves e `client_secret` locais nunca foram commitados |
| Segredos na base de dados | Refinado (por publicar) | Estavam em colunas de `site_settings` legíveis por quem tem "Configurações" (hoje vazias). Passam para `private.site_secrets`, fora da API; o painel só vê "definida / não definida" |
| Palavras-passe | Existente e validado | Só o Supabase Auth (bcrypt); não há hashing próprio |
| Palavras-passe vazadas (HIBP) | Ausente | Advisor de segurança |
| MFA | Implementado (por publicar) | TOTP: activação no perfil e código pedido à entrada. Exigido na base de dados e na Edge Function para contas com factor; 3 admins, 0 factores hoje |
| Confirmação de email | Existente e validado | 0 contas por confirmar com sessão iniciada (a política de encomendas confia no email do JWT) |
| Limites de pedidos | Existente e validado; refinado | Contador partilhado na base de dados. **IP fiável testado:** um `X-Forwarded-For` forjado ficou registado com o IP real. Respondia 400; passa a 429 com `Retry-After` |
| Enumeração no `/track` | Existente e validado | O número leva os últimos 6 dígitos base36 do tempo **em milissegundos** (repetem só a cada ~25 dias) mais 3 aleatórios: adivinhar exige o milissegundo da compra |
| Pagamento marcado só pelo servidor | Existente e validado | Checkout grava sempre `pending`/`awaiting_confirmation`; só `manage_orders` marca `paid` |
| Idempotência do checkout | Implementado (por publicar) | Botão trancado (`a40fbfc`) e chave por tentativa no servidor, com índice único para pedidos simultâneos |
| Crons (`/cron/*`) | Existente e validado | Segredo comparado em tempo constante e limite por IP |
| Fuga de erros internos | Necessitava de refinamento | Erros não previstos (Postgres incluído) iam para o browser com estado 400 (corrigido) |
| Cabeçalhos HTTP e TLS | Existente e validado | HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` nos dois hostnames; TLS 1.3, TLS 1.1 recusado; certificado até Fev. 2027; HTTP → HTTPS 301 |
| SPF, DKIM, DMARC, MX | Ausente | `livrariaadventista.com` sem MX, SPF nem DMARC: qualquer pessoa pode enviar email em nome do domínio |
| DNSSEC | Ausente | `DNSSEC: unsigned` no registo (Hostinger) |
| WAF e regras do Cloudflare | Não foi possível verificar | O conector do Cloudflare precisa de autorização nesta sessão |
| API do Supabase fora do WAF | Por desenho | O `*.supabase.co` não passa pelo Cloudflare do domínio; a protecção é o RLS e os limites da função |
| Backups e PITR | Implementado (falta um segredo) | Plano **Free**: sem backups do Supabase nem PITR. Novo backup semanal cifrado pelo Actions (`docs/BACKUPS.md`); corre quando existir `BACKUP_PASSPHRASE` |
| Observabilidade | Parcialmente implementado | Web Analytics do Cloudflare e registos do Supabase (latência por rota em `function_edge_logs`, usada abaixo); id de correlação acrescentado; sem alertas |
| CI | Existente; refinado | Lint, 341 testes, build e `deno check`; acrescentadas a detecção de segredos e a auditoria de dependências críticas |
| Tamanho dos pedidos | Refinado | O corpo era lido inteiro, sem tecto; passa a 1 MB (413) |
| Balanceamento de carga | Não aplicável | Pages e Edge Functions são geridos; não há origens próprias |

### Corrigido nesta passagem

- **Erros internos fora do browser** (`index.ts`, despachante). Um erro não previsto devolvia a
  mensagem interna, com nomes de colunas e restrições, e estado 400. Passa a 500 com uma frase
  e o id do pedido; a equipa continua a ver o detalhe no painel. No checkout só as mensagens
  escritas para o comprador (`raise exception`, código P0001, como "Stock insuficiente") saem
  tal como estão.
- **Id de correlação**: `X-Request-Id` em todas as respostas e em cada registo de erro, exposto
  ao browser pelo CORS.
- **429 com `Retry-After`** nos 12 limites de pedidos. O site lê só a mensagem, qualquer que seja
  o estado, por isso nada muda para quem compra.
- **Forma do email** validada no servidor no checkout (quando há email), na newsletter e no
  formulário de contacto, que também passou a ter tamanhos máximos. Função `isEmail` em
  `emails.ts`, com testes. As rotas do painel mantêm a validação que já tinham.
- **Segredos de email fora da tabela**: `SMTP_PASSWORD` e `SENDGRID_API_KEY` como segredos da
  Edge Function ganham ao valor do painel, como já acontecia com as chaves de IA. Sem segredo
  definido, tudo funciona como antes.
- **Editor do painel** (`RichTextEditor.jsx`): o HTML da base de dados ia para `innerHTML` sem
  sanitizar. Quem tem permissão de catálogo escreve pela API sem passar pelo editor, por isso um
  `<img onerror>` corria na sessão do admin que abrisse o livro. O CSP já o travava; passa a
  haver também o sanitizador. 3 testes, dois dos quais falham com o código antigo.
- **Migração `20261104090000_indices_chaves_estrangeiras`**: o SQL de índices que estava em
  `docs/migracoes-pendentes/` passou a migração, para o Actions a aplicar no merge.
- **Migração `20261104091000_conversas_seguras_cliente_so_fecha`**: o cliente só pode fechar a
  sua conversa segura; já não a reabre nem lhe muda o grupo, o livro ou a avaliação. O site
  nunca actualiza esta tabela e ela tem 0 linhas.

### Segunda ronda (mesmo dia)

- **Checkout idempotente** (`20261104092000_idempotencia_checkout`, `lib/checkoutIdempotency.js`).
  Se a rede cai depois de o servidor gravar a encomenda, o cliente vê erro e carrega outra vez:
  ficavam duas encomendas e o stock descontado duas vezes. O site manda uma chave por tentativa
  (a mesma enquanto o pedido não mudar; nova se mudar o carrinho, a morada ou o pagamento), e a
  função devolve a encomenda que a chave já criou, sem stock nem avisos repetidos. Dois pedidos
  simultâneos: o índice único deixa passar um, e o outro recebe a mesma encomenda. Sem a
  migração a função ignora a chave.
- **Verificação em dois passos** (`20261104093000_verificacao_dois_passos_equipa`, `mfa.ts`,
  `MfaGate`, `MfaSettings`). Activação no perfil → Segurança (QR e chave escrita), código pedido
  depois de entrar. **A exigência está no servidor:** numa conta com factor verificado,
  `is_admin`, `is_staff` e `has_permission` (e com elas todas as políticas RLS, o Storage e as
  funções de utilizadores) e a Edge Function só reconhecem a equipa numa sessão `aal2`. Sem
  isto a palavra-passe chegava para chamar a API REST e saltar o ecrã. Contas sem factor não
  mudam. O diálogo vai num bloco à parte: a página inicial passou de 241,9 para 243,0 KB gzip
  (medido no build; numa primeira versão eram +9,7 KB, por isso foi separado).
  **Recuperação** se um admin perder o telemóvel: outro admin, ou Supabase → Authentication →
  Users → remover o factor.
- **Segredos fora da API** (`20261104094000_segredos_fora_da_api`, `lib/siteSecrets.js`). Ver a
  tabela acima. Um trigger apanha o valor quando o painel o grava, por isso um painel antigo
  continua a funcionar; a Edge Function junta-os às definições ao lê-las.
- **Corpo dos pedidos limitado a 1 MB** e **referência curta** (`ref. 1a2b3c4d`) na mensagem de
  erro inesperado, para o cliente a passar à loja.
- **Detecção de segredos** (`scripts/verificar-segredos.mjs`) no CI e no `deploy-site.sh`: chaves
  com prefixo próprio e JWT `service_role`; a chave Web da Firebase fica de fora (é pública).

### Terceira ronda (mesmo dia): evidências, desempenho e continuidade

**Isolamento, testado em produção como visitante anónimo** (só leituras, com a chave pública que
vai no site):

- As 24 tabelas privadas devolvem **0 linhas** ou **401**: `orders`, `profiles`, `site_settings`,
  `app_integrations`, as 4 do CRM, `newsletter`, `notification_logs`, `email_queue`, o painel de
  vendas, `stock_movements`, `push_subscriptions`, as 6 do atendimento e das conversas,
  `wishlists`, `book_review_helpful_votes`, `e2ee_device_keys`.
- As públicas por desenho devolvem o esperado: 102 livros, 4 métodos de pagamento activos, 3
  lojas, 4 slides, 4 colecções.
- As funções sensíveis recusam o anónimo com 401, **mesmo com argumentos válidos**:
  `place_order`, `check_rate_limit`, `users_admin_list`, `admin_users_list`, `claim_email_jobs`,
  `email_queue_scheduler_status`, `e2ee_admin_key_packages`, `current_role_name`.
- Entre clientes com sessão (cliente A a ler dados do cliente B) **ainda não foi corrido**. O teste
  está escrito em `docs/testes/isolamento_clientes_e_equipa.sql`, com 21 casos e o resultado
  esperado de cada um. Cobre encomendas, notificações, atendimento, perfis, configurações e
  funções do painel, e também as migrações novas (MFA em aal1/aal2, segredos, conversas
  seguras, chave repetida). Não grava nada: termina num erro que anula a transacção. Corre-se no
  SQL Editor de um projecto de testes, ou em produção depois de aplicar as migrações.

**Paginação das encomendas no painel: deixada de fora de propósito.** O painel carrega a lista
inteira (só com as colunas da lista) porque os relatórios de vendas somam todas as encomendas.
Paginar obrigava a passar esses relatórios para agregações na base de dados, uma mudança grande
sem ganho com 6 encomendas. Rever quando passar das ~2 000 encomendas ou o separador demorar
mais de 2 s a abrir.

**Linha de base da API** (`function_edge_logs`, 24 h até 2026-11-04, sem um único 5xx):

| Rota | Pedidos | p50 | p95 | p99 |
|---|---|---|---|---|
| `GET /payment-methods` | 326 | 334 ms | 958 ms | 1 437 ms |
| `POST /cron/email-queue` | 287 | 1 968 ms | 2 878 ms | 3 514 ms |
| `GET /integrations` | 237 | 665 ms | 1 398 ms | 2 723 ms |
| `GET /chat/config` | 230 | 330 ms | 1 105 ms | 2 181 ms |
| `GET /settings` | 225 | 542 ms | 1 205 ms | 2 376 ms |

O que mudou a partir daqui (efeito por medir depois de publicar, com a mesma consulta):

- **Agendadores só com trabalho** (`20261104095000`, e a migração das campanhas ainda por
  aplicar). O `/cron/email-queue` arrancava a função 287 vezes por dia, ~2 s cada, com a fila
  vazia. Agora a base de dados confirma primeiro se há trabalho, com o mesmo critério do
  `claim_email_jobs`. Esperado: 0 chamadas enquanto não houver emails.
- **`/integrations` e `/chat/config` com a cache curta** de `/settings` (30 s, e até 5 min em
  segundo plano). São iguais para todos os visitantes; o painel pede com `no-cache` depois de
  gravar.
- **`/admin/media-config` só para a equipa.** Era pedido em cada página por qualquer cliente
  com sessão, e sempre recusado.

**Autenticação, revista nesta ronda:** o registo e a recuperação de palavra-passe não revelam
se uma conta existe (o Supabase devolve o mesmo com e sem conta, e o site mostra "Email
enviado" nos dois casos); as três entradas de palavra-passe exigem 8 caracteres no site. O
mínimo do Supabase Auth continua nos 6 por omissão: subir para 8 em Authentication → Policies.

**CSP restrito ao projecto** (`scripts/csp-supabase.mjs`, plugin no `vite.config.js`). O
`connect-src` e o `media-src` aceitavam `*.supabase.co`, ou seja qualquer projecto Supabase:
um script injectado podia mandar dados para um projecto do atacante. No build passam a ser a
origem de `VITE_SUPABASE_URL`; sem a variável o ficheiro fica como estava. Confirmado que
nenhum conteúdo da base de dados aponta para outro projecto Supabase.

**Respostas da API com dados pessoais** passam a `Cache-Control: no-store` e `nosniff`; as
públicas mantêm a cache curta.

**Continuidade:** organização no plano **Free**. Não há backups do Supabase nem PITR, e um
projecto Free pode ser pausado por inactividade. Backup semanal cifrado pelo Actions, com RPO de
7 dias e RTO de ~1 h, e o restauro descrito em `docs/BACKUPS.md`. O restauro **nunca foi
testado**: precisa do segredo `BACKUP_PASSPHRASE` e de um projecto à parte.

**Ordem de publicação:** as migrações primeiro (seis desta auditoria, mais as duas do CRM) (o Actions fá-lo no merge), depois a Edge
Function, depois o site. Qualquer outra ordem funciona sem erros — cada parte detecta a falta
da outra —, mas só com as três a protecção fica completa.

**As migrações não foram corridas contra um Postgres.** Esta máquina não tem Postgres, e
o teste dentro de uma transacção anulada na base de dados de produção foi recusado nesta
sessão. A primeira só cria índices com `if not exists`.

### Por fazer (precisa do dono ou de autorização)

1. **Email do domínio** (Cloudflare → DNS). Enquanto o domínio não envia nem recebe email:
   `MX 0 .`, `TXT "v=spf1 -all"` e `_dmarc TXT "v=DMARC1; p=reject; rua=mailto:<caixa>"`.
   Quando se ligar o SMTP ou o Email Routing, trocar o SPF pelo do fornecedor **antes** de
   enviar o primeiro email. Para reverter, basta apagar os registos.
2. **`site_settings` com três linhas**, todas com `site_url = https://livraria-adventista.pages.dev`.
   A função lê a mais antiga; os links dos emails (incluindo o de cancelar a subscrição) vão
   para o projecto antigo. Corrigir o URL em Configurações e apagar as duas linhas a mais
   depois de confirmar qual é a activa.
3. **Projecto antigo `livraria-adventista.pages.dev`**: serve um build antigo ligado à mesma
   base de dados. Redireccionar para o domínio novo ou desligar.
4. **Activar o MFA nas três contas de admin**, depois de publicado (perfil → Segurança). Antes,
   confirmar no Supabase → Authentication → Multi-Factor que o TOTP está ligado (é o padrão).
5. **Protecção de palavras-passe vazadas**: Supabase → Authentication → Policies. Disponível
   a partir do plano Pro.
6. **Segredos**: com a migração aplicada, o painel já não os expõe. Mais tarde, apagar as
   cinco colunas de `site_settings` (ficam sempre vazias): primeiro o painel tem de deixar de
   as enviar, senão o PostgREST recusa a gravação.
7. **DNSSEC**: activar no Cloudflare e colar o registo DS no painel da Hostinger. Por esta
   ordem, nunca ao contrário.
8. **WAF, regras de rate limiting e alertas do Cloudflare**: verificar com o conector
   autorizado. Para alertas sem custo: notificação de picos de tráfego e de erros 5xx no
   Cloudflare, e um alerta no Supabase para falhas da função.
9. **Backups**: criar o segredo `BACKUP_PASSPHRASE` (comando em `docs/BACKUPS.md`), correr o
   workflow à mão uma vez e fazer o primeiro teste de restauro num projecto à parte. Quando
   houver vendas reais, decidir se 7 dias de RPO chegam (backup diário sem custo, ou plano Pro).
10. **`site_url` nas configurações** — a correcção foi recusada nesta sessão (alteração a dados
    de produção). Em Configurações → endereço do site, ou no SQL Editor:
    `update public.site_settings set site_url = 'https://livrariaadventista.com' where site_url = 'https://livraria-adventista.pages.dev';`
    Para reverter, o mesmo com os endereços trocados.

### Rollback

- Edge Function: voltar a publicar a versão anterior (`git checkout 1ea225e -- supabase/functions/app`
  e `supabase functions deploy app --no-verify-jwt`). Não há migração de que dependa.
- Site: o painel do Cloudflare Pages permite promover o deploy anterior.
- Migrações: `drop index if exists …` para cada um dos 11 índices;
  `drop trigger secure_support_threads_guard on public.secure_support_threads` e
  `drop function private.secure_support_threads_guard()`.
- Idempotência: `drop index orders_idempotency_key_key` e `alter table orders drop column idempotency_key`
  (a função passa a ignorar a chave sozinha).
- MFA: recriar `is_admin`, `is_staff` e `has_permission` sem `and private.mfa_satisfied()`
  (definições em `20261101131748_funcoes_privadas.sql` / `20261101131516_base_perfis.sql`).
- Segredos: `drop trigger site_settings_capture_secrets on public.site_settings`; os valores
  ficam em `private.site_secrets` para repor nas colunas.

### Custos

Nenhum serviço novo nem dependência nova. Os pontos 5 e 9 dependem do plano do Supabase.

### Estado de publicação (actualizado a 2026-11-04, 13h)

- **Base de dados:** as migrações até `20261104095000` estão aplicadas em produção (pela outra
  sessão, com as versões dos ficheiros). Confirmado por consulta: MFA nas três funções de
  permissão, triggers dos segredos e das conversas, índice de idempotência, índices das
  chaves estrangeiras, agendadores só com trabalho. A `20261104120000` (índice em
  `contact_group_members.added_by`) também já está aplicada (confirmado a 2026-11-04, ver 9.5).
- **Edge Function:** a versão publicada é a final (verificado pelos cabeçalhos `X-Request-Id`,
  `Cache-Control: no-store` e a cache de `/integrations`).
- **Site:** publicado em produção a partir de `6361ec1` (`deploy-site.sh`), verificado em
  `https://livrariaadventista.com`. O CSP já só aceita o projecto Supabase da loja, e a loja
  carrega os 102 livros e as capas com ele. A barra inferior e a lista contínua estão activas
  no telemóvel.
- **Advisors depois do deploy:** nada novo de gravidade; `private.site_secrets` sem políticas é
  intencional (só a service role lhe chega).

## 9.5 Correcção auditada (2026-11-04, tarde)

Releitura de cada ponto ⏳ contra o estado real, com comandos. Vários estavam já resolvidos e
a tabela não tinha sido actualizada.

### Verificado

| Ponto | Evidência |
|---|---|
| 21 e a `20261104120000` | `list_migrations` no projecto `bggqkjjqbjhbjsckzopj`: as 42 migrações de `supabase/migrations` estão todas aplicadas, de `20261101131516` a `20261104120000`, incluindo `20261102013223_limites_pedidos`. |
| 3 | `gh run list`: a verificação dos PRs corre (última a 2026-11-04 13:32, com sucesso). Só existe o segredo `SUPABASE_DB_PASSWORD`; os outros quatro continuam por criar. |
| 9 | `https://livrariaadventista.com/favicon.ico` responde 200 `image/vnd.microsoft.icon`. |
| 10 | A resposta da página inicial traz `content-security-policy`, `strict-transport-security` e `x-frame-options: SAMEORIGIN`. |
| Próximo passo 6 | Scope do Gmail: `googleAuth.js` pede só `gmail.readonly` e `gmail.send` (já não `mail.google.com`). `access-link`: o link só volta a um administrador e só quando o email não seguiu. |

### Corrigido

- **Dependências (achado 11).** `npm audit fix` sem `--force`: só subidas dentro das versões
  pedidas no `package.json` (`vite` 7.3.6 → 7.3.7, `eslint` 9.39.4 → 9.39.5, `browserslist`,
  `js-yaml`, `brace-expansion`, `baseline-browser-mapping`, entre outras). Antes 16 avisos
  (8 altos), agora 11 (4 altos). Lint limpo, 48/48 ficheiros e 416/416 testes, build sem erros.
- **O que fica, e porquê:**
  - `@grpc/grpc-js` (os 4 altos) chega pelo `firebase` → `@firebase/firestore`. O site não
    importa o Firestore (só o Auth, em `firebaseClient.js` e `googleAuth.js`), e o gRPC só
    corre em Node: `grep -i grpc` no `dist/` dá zero ficheiros. A versão mais recente do
    Firebase (13.2.0) continua presa a `~1.9`, por isso subir não resolve; o `--force`
    trocaria o Firebase por uma versão maior sem ganho.
  - `minimatch` (moderados) vem do ESLint e dos plugins: só na máquina de quem desenvolve,
    nunca no site. O `--force` exige versões maiores dos plugins.

### Segunda ronda (mesmo dia): resolver o que estava parado

Decisões do dono nesta ronda: tirar os telefones provisórios, tirar o mapa às lojas com
coordenadas da cidade errada, gerar a frase dos backups, e criar à mão os tokens das contas.

**Dados de produção, em três migrações novas** (testadas de ponta a ponta num Postgres em
memória com os dados de produção: 25 verificações, incluindo repetir cada uma sem efeito):

- `20261105045627_limpeza_dados_provisorios`:
  - `site_settings` fica com uma linha só: a `et8zevy21sypp73`, que é a que a função lê e a
    única configurada. As outras duas eram restos quase vazios. Um índice único impede que
    volte a haver duas. O painel lê a mesma linha (o cliente de dados ordena por omissão
    como a função), por isso nunca gravou na linha errada.
  - `site_url` passa a `https://livrariaadventista.com` (os links dos emails, incluindo o
    de cancelar a subscrição, iam para o projecto antigo).
  - Telefones provisórios (`+244 923 000 000/001/002`) saem das configurações e das lojas.
    O botão de WhatsApp do rodapé usava o geral como recurso: apontava para um número que
    não existe.
  - Coordenadas trocadas: "Catumbela" estava em Luanda (−8,91; 13,18) e "Lubango" em
    Benguela (−12,58; 13,41). Ficam em `NULL` (não `0`, que a localização trataria como um
    ponto no Golfo da Guiné). O link do mapa passa a procurar pela morada escrita.
  - "LIvraria Adventista - Huambo" → "Livraria Adventista — Huambo".
  - Três `unitel_money` iguais e desligados → um, e o código passa a ser único.
  - Tudo o que muda ou sai fica antes em `private.correcoes_dados`. O fim do ficheiro diz
    como reverter.
- `20261105045510_campos_encomendas` (antes em `docs/migracoes-pendentes/`): o site
  publicado já tem o código de que depende, e a definição do trigger em produção era igual
  à do ficheiro, tirando as duas mudanças pretendidas.
- `20261105045517_capas_das_colecoes`: as quatro capas das colecções eram fotos genéricas do
  Unsplash. Passam às imagens feitas com as capas reais (já publicadas no domínio novo; o
  SQL antigo apontava para o projecto antigo). Só troca as que ainda são do Unsplash.
- `1_loja_talatona_para_huambo.sql` retirado: transformaria Catumbela numa segunda loja do
  Huambo.

**A aplicação directa em produção foi recusada pelas permissões desta sessão.** As três
entram com o `supabase db push` do workflow no merge para o `main`, que só corre quando
existir o segredo `SUPABASE_ACCESS_TOKEN`. Também se podem colar no SQL Editor, por ordem
de versão.

**Painel:**
- Livros: indicador e filtro "Sem descrição" (100 de 102 livros, confirmado por consulta).
  "Sem capa" passa a contar da mesma maneira no indicador e no filtro (antes o indicador
  ignorava `cover_image`). Carregar num indicador abre a lista correspondente.
  Critério único em `lib/bookContent.js`, com testes.
- Lojas: etiqueta "Sem telefone" ao lado da "Sem GPS".
- Configurações → Contacto: aviso quando não há telefone nem WhatsApp.

**GitHub Actions:** criados `BACKUP_PASSPHRASE` (frase de 64 caracteres, cópia em
`~/Documents/livraria-BACKUP_PASSPHRASE.txt`, só com permissões do dono) e
`CLOUDFLARE_ACCOUNT_ID`.

**Advisors (2026-11-04, 18h):** as 16 funções `SECURITY DEFINER` que um utilizador com sessão
pode chamar verificam todas a permissão lá dentro; `book_review_helpfulness` (pública) só
devolve contagens, e `e2ee_admin_key_packages` só chaves públicas. Os 34 índices "sem uso"
são os das chaves estrangeiras numa base com poucos dias: ficam.

**Segredos locais:** `api-keys-*.csv` e `client_secret_*.json` na raiz estão no
`.gitignore` e nunca entraram no histórico. O `firebase-applet-config.json` é a configuração
web do Firebase, pública por natureza.

**Ficou de fora, de propósito:** trocar o Firebase Auth pelo Google Identity Services
tiraria os últimos avisos do `npm audit`, mas o código vulnerável não chega ao site, e o
login Google do separador Workspace não se pode testar sem uma conta e um navegador.

### Continua por fazer (dono)

| O quê | Onde |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → criar "github-actions-livraria"; `gh secret set SUPABASE_ACCESS_TOKEN --repo fernandotunas6-bot/Livraria-Editora-Adventista` |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → modelo "Edit Cloudflare Workers", com *Cloudflare Pages: Edit* na conta valentinocanguele@gmail.com; mesmo comando |
| Frase dos backups | passar `~/Documents/livraria-BACKUP_PASSPHRASE.txt` para um gestor de palavras-passe e apagar o ficheiro |
| Telefones e WhatsApp verdadeiros | Configurações → Contacto, e Lojas |
| Coordenadas de Catumbela e Lubango | Lojas → colar o link do Google Maps de cada loja |
| Descrições, stock real | Livros → filtro "Sem descrição" |
| SMTP / emails de encomenda | Configurações → Email |
| Projecto antigo `livraria-adventista.pages.dev` | está noutra conta Cloudflare: redireccionar ou apagar |
| Email do domínio, DNSSEC, alertas | 9.4, pontos 1, 7 e 8 (o wrangler desta máquina só lê zonas) |
| MFA nas contas de admin | perfil → Segurança |
| Palavras-passe vazadas | plano Pro do Supabase |

## 9.6 Login, links e navegador real (2026-11-04, noite)

Pedido: verificar o login com a Google, os links e o resto, num navegador a sério. Feito com
o Chrome desta máquina (puppeteer-core no scratchpad): 13 páginas, em computador e telemóvel,
com a consola, os pedidos falhados e a consola do próprio service worker.

### Achados

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 22 | **Todos os links de autenticação levavam ao site antigo.** O `site_url` do Supabase Auth era `https://livraria-adventista.pages.dev/` e a lista de destinos autorizados só tinha o `localhost` e endereços do Lovable. O Supabase ignora um destino que não conhece e manda para o `site_url`: o regresso do login com a Google, a confirmação de conta e a recuperação de palavra-passe, pedidos em `livrariaadventista.com`, acabavam todos no projecto antigo. Provado com `/auth/v1/verify` e um token inválido (o Supabase redirecciona o erro para o destino que aceita): os três endereços da loja → `livraria-adventista.pages.dev`. | Crítica | ✅ 2026-11-05: `site_url` e destinos aplicados; os 5 testes do script passam |
| 23 | **As fontes deixavam de carregar a partir da segunda página.** O service worker refazia com `fetch()` os pedidos a outros domínios; dentro dele vale o `connect-src` do CSP, que não inclui `fonts.gstatic.com`, `static.cloudflareinsights.com` nem `images.unsplash.com`. A consola do SW: *"Refused to connect because it violates the document's Content Security Policy"*. Inter e Fraunces ficavam `error` e o site caía para as fontes do sistema, para quem voltasse. | Alta | ✅ (no próximo deploy) |
| 24 | Link de email expirado ou entrada com a Google cancelada: o Supabase volta com `#error=…&error_code=otp_expired` e o site não dizia nada (o `/login` mostrava o formulário; o `/reset-password` só "Link inválido."). | Média | ✅ (no próximo deploy) |
| 25 | `www.livrariaadventista.com` e `livraria-editora-adventista-ben.pages.dev` serviam a loja inteira: sessão, carrinho e favoritos à parte por domínio (o canonical estava certo, o SEO não sofria). | Média | ✅ (no próximo deploy) |
| 26 | Emails do Auth (confirmar conta, nova palavra-passe, convite…) em inglês. O Supabase só deixa mudar os modelos com SMTP próprio ou plano pago (HTTP 400 *"Email template modification is not available for free tier projects using the default email provider"*). | Média | ⏳ depois do SMTP (achado 27): o script envia-os sozinho quando houver |
| 27 | **Sem SMTP no Supabase Auth**: o serviço por omissão só entrega a membros da equipa do projecto, e no máximo 2 por hora. Um cliente que se registe com email não recebe a confirmação e não consegue entrar. Hoje há só 3 contas (a equipa), por isso ainda ninguém foi afectado. | Alta | ⏳ dono (Supabase → Authentication → SMTP) |

### Verificado sem problemas

- **Google:** o pedido chega a `accounts.google.com` com o `redirect_uri` do projecto
  (`…supabase.co/auth/v1/callback`) e a Google mostra o ecrã de entrada, sem
  `redirect_uri_mismatch`. O botão "Continuar com Google" aparece no `/login` (computador e
  telemóvel) e leva lá. Âmbito pedido: só `email profile`.
- Um destino estranho (`https://evil.example.com`) é recusado pelo Supabase.
- Os 114 endereços do sitemap respondem 200. Os 53 links internos das páginas apontam todos
  para rotas que existem. `http://` → `https://` com 301.
- A Edge Function monta os links de convite e recuperação com o mesmo critério (lista do Auth).

### Corrigido no código

- `public/sw.js`: não toca em pedidos a outros domínios, excepto as imagens públicas do
  Storage do Supabase (as capas, que o CSP autoriza). Um pedido que falha sem cópia em cache
  devolve `Response.error()` em vez de `undefined` (era o *"Failed to convert value to
  'Response'"*). Testado com um controlo: com o SW antigo, num servidor local com os
  cabeçalhos do `_headers`, as 7 variantes de fonte falham na segunda página; com o novo,
  carregam as 7. Teste novo: `lib/serviceWorker.test.js` (os dois casos externos falham com o
  SW antigo).
- `lib/authRedirectError.js` + `AuthRedirectNotice` no `App.jsx`: lê o erro, mostra-o em
  português (link expirado, entrada cancelada, conta suspensa…) e tira-o do endereço. O
  `/reset-password` diz a razão na página. Verificado no Chrome.
- `lib/canonicalHost.js`, o primeiro módulo a correr: o `www` e o `pages.dev` de produção vão
  para `https://livrariaadventista.com`, com caminho, pesquisa e `#` (onde a Google devolve a
  sessão). As pré-visualizações e o `localhost` ficam como estão. Confirmado no bundle que
  corre antes de o cliente Supabase ler o endereço.

### Para aplicar (dono)

```sh
bash scripts/configurar-auth.sh --verificar   # mostra o que muda e testa os destinos; não mexe
bash scripts/configurar-auth.sh               # guarda os valores actuais, pede confirmação, aplica e testa
```

Muda só o `site_url`, a lista de destinos (a loja, o `www`, o `pages.dev` e as
pré-visualizações, e o `localhost:3000`; saem os endereços do Lovable) e seis emails, que passam
para português (`supabase/auth/`). Para reverter: `--repor supabase/auth/.antes-<data>.json`.
Pelo painel é o mesmo: Authentication → URL Configuration, e → Email Templates.

Depois, o SMTP do Auth (achado 27): Authentication → SMTP Settings, com o mesmo fornecedor que
for usado em Configurações → Email. Até lá, a alternativa é desligar a confirmação de email
(Authentication → Providers → Email), aceitando contas com emails que ninguém confirmou.

## 9.7 Erros reais dos registos (2026-11-05)

Leitura dos registos das últimas 24 horas do Supabase (API, base de dados, Auth, Edge Function e
Storage), agrupados por erro. Os 401 e 404 das 08:35 de 2026-11-04 são o teste de isolamento da
auditoria (pedidos anónimos que têm de ser recusados). Os `/track` 404/400 são encomendas que
não existem, e o 400 de `/auth/v1/token` é uma palavra-passe errada: tudo comportamento certo.
O Storage teve 3 175 pedidos de capas, nenhum 4xx.

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 28 | **Login com a Google partido no Supabase.** Duas pessoas tentaram entrar (2026-11-04, 12:03 e 17:44) e o regresso falhou com `oauth2: "invalid_client" "The provided client secret is invalid."`. O ID do cliente está certo; a chave guardada no Supabase não. A chave do JSON descarregado da Google Cloud (na raiz, fora do git) foi confirmada na própria Google: um código falso dá `invalid_grant`, ou seja, a chave é aceite. | Crítica | ✅ 2026-11-05: o teste das 05:06 dá `invalid_grant` (chave aceite) |
| 29 | **Separador Atendimento da equipa inteiro em erro.** O painel pedia `href` a `staff_notifications`, que não tem essa coluna (400 nos registos, 10:49). As três consultas do atendimento correm num `Promise.all`, por isso a equipa não via nem as notificações nem as conversas. | Alta | ✅ (no próximo deploy) |
| 30 | **Ligação do painel ao Google Workspace recusada no domínio novo.** O Firebase (projecto `skilful-form-c5jvd`) só tem autorizados o projecto antigo e endereços do AI Studio. Provado no Chrome com o SDK do Firebase: em `livrariaadventista.com` dá `auth/unauthorized-domain`. O painel mostrava a mensagem crua em inglês. | Alta | ✅ domínio autorizado (2026-11-05) |

### Corrigido no código

- `supportApi.js`: campos próprios para as notificações do cliente e da equipa.
- `lib/queryFields.test.js`, teste novo: encontra no código todas as consultas
  `.from('tabela').select('campos')` com campos escritos à mão (24) e confirma, pelas
  migrações, que cada coluna existe. Com o `supportApi.js` antigo falha e aponta
  `staff_notifications.href`.
- `lib/googleWorkspaceErrors.js`: mensagens em português para as falhas da ligação ao Google
  Workspace; no domínio não autorizado, diz qual e onde se autoriza.
- `scripts/configurar-auth.sh --google <json>`: confirma a chave na Google, pede confirmação e
  põe-na no Supabase. A chave nunca aparece no ecrã nem nos argumentos.

## 9.8 Revisão crítica de rotas, segurança e lógica (2026-11-06)

Passagem pedida sobre o sistema todo: encaminhamento, autorização e regras de negócio.
Cada ponto foi verificado no código, não de memória. `npm test` (551 testes), `npm run lint`,
`npm run build` e `scripts/verificar-segredos.mjs` passam.

### Verificado sem problemas

- **As 69 rotas da Edge Function têm guarda.** Mapeadas uma a uma: `/admin/*` com
  `requirePermission` na chave certa, `/contacts/*` com `requireCrm`, `/cron/*` com token em
  comparação de tempo constante (`secretsMatch`) e 404 quando o token não está configurado.
  As de gestão de contas passam por `loadTarget` + `assertCanManage`, e o `loadTarget` verifica
  a permissão **antes** de ir à base (o achado 15 continua fechado).
- **MFA a valer nos dois lados.** `mfaPending()` na função e `private.mfa_satisfied()` dentro de
  `is_admin`, `is_staff` **e** `has_permission`. Uma sessão `aal1` de uma conta com factor
  verificado vale como cliente, pela REST API ou pela função.
- **Escalada por `profiles` fechada** pelo trigger `profiles_protect_privileges`: quem não é
  admin não muda `role`, `permissions` nem `email`, e um INSERT nasce sempre `member`.
- **`place_order` não aceita preços do cliente.** O carrinho envia `book_id`, `quantity` e
  `variant`; o preço vem de `effective_price`. Usa `for update`, relê o stock em cada iteração
  (o mesmo livro duas vezes no carrinho não passa) e a idempotência trata o `23505` devolvendo
  a encomenda original.
- **As 77 funções `security definer` têm `set search_path = ''`.** Conferidas todas.
- **Rotas públicas de encomendas** identificam por nº + email/telefone e dão **o mesmo erro**
  para encomenda inexistente e contacto errado (não dizem que números existem). O
  `receipt_token` está revogado a `anon, authenticated` ao nível da coluna.
- **Isolamento por RLS** em encomendas, perfis, listas de desejos, avaliações e inbox seguro.
- **XSS**: todos os `dangerouslySetInnerHTML` passam pelo `sanitizeHtml` (DOMPurify com lista
  branca). A excepção, `ui/chart.jsx`, gera CSS a partir de configuração do próprio código.
- **CSP real e sem `unsafe-inline` em scripts**; `frame-ancestors`, HSTS e `Permissions-Policy`
  presentes. Firestore fechado a leitura e escrita.
- **CI** corre em `pull_request` (não `pull_request_target`), com permissões mínimas, scanner de
  segredos e `npm audit`. O painel de vendas antigo é importado como módulo dentro do separador
  com guarda, não servido como página.
- Portes e promoções do produto: `lib/shipping.js` e `lib/pricing.js` espelham as contas do
  `place_order`.

### Corrigido nesta passagem

| # | Achado | Gravidade | Onde |
|---|---|---|---|
| 28 | Bucket público `media` aceitava SVG, e qualquer cliente registado podia enviar | Média | migração `svg_fora_do_bucket_publico`, `lib/imageTypes.js` |
| 29 | Promoções das variantes sem janela de datas e sem exigir desconto | Baixa/Média | migração `promocoes_das_variantes`, `lib/pricing.js` |
| 30 | `private.has_permission` aceitava a string `"true"`; `can()` não | Baixa | migração `permissoes_so_booleanos` |
| 31 | `folder_id` interpolado na consulta ao Google Drive sem validação | Baixa | `index.ts` (`DRIVE_FOLDER_ID`) |
| 32 | `_headers` dizia "Em falta: Content-Security-Policy" debaixo do CSP já definido | Trivial | `app/web/public/_headers` |

**28 — SVG num bucket público.** O `allowed_mime_types` do `media` incluía `image/svg+xml`, o
`private.can_write_media` deixa qualquer conta escrever em `users/<o-seu-id>/` (é por onde passa
a foto de perfil) e o site só validava o **tamanho** da foto — o `accept` de um
`<input type="file">` é uma sugestão da janela de ficheiros, não um controlo. Um cliente comum
conseguia pôr um SVG com `<script>` em
`<projecto>.supabase.co/storage/v1/object/public/media/users/<id>/x.svg`, servido como
`image/svg+xml`, que o browser executa quando o endereço é aberto directamente (num `<img>` não
executa). Não alcança a origem da loja, onde vive a sessão, mas é execução de código na origem
`*.supabase.co` — a mesma de `/auth/v1/*` — e phishing num domínio do próprio projecto, a partir
de uma conta sem permissões. Era também incoerente com as duas decisões já tomadas sobre SVG: o
`sanitizeHtml` põe `svg` em `FORBID_TAGS` e as assinaturas só aceitam PNG (`isPngSignature`).
O bucket passa a recusar SVG (é o controlo que manda) e o site valida o tipo em
`lib/imageTypes.js`, com testes. Ficheiros já enviados não são tocados: `allowed_mime_types` é
verificado no envio. Para substituir um logótipo SVG, usar PNG ou WebP.

**29 — promoções das variantes.** `effective_price` exige que o promocional seja menor que o
preço de tabela **e** que a janela `sale_starts_at`/`sale_ends_at` esteja aberta. O caminho das
variantes não exigia nenhuma das duas, nos dois lados: uma promoção agendada para a semana
seguinte já descontava, e um `sale_price` acima do preço da variante era cobrado como se fosse
desconto (com o preço verdadeiro riscado por baixo). O site e o servidor concordavam entre si,
por isso não havia diferença entre o preço mostrado e o cobrado — a regra de negócio é que
estava inconsistente. A regra passou a ser a mesma nos dois (`variantPrices`, com testes).
Ao escrever a migração apareceu um segundo problema no mesmo bloco: as variáveis do plpgsql
sobrevivem ao ciclo, e o preço de tabela da variante de um item ia para o `list_price` do item
seguinte. Passam a ser reiniciadas em cada volta, e o `list_price` é o da variante da linha (é o
valor que o recibo e o painel riscam).

**30 — `has_permission`.** Estava `permissions ->> chave = 'true'`, e o `->>` devolve o texto
`'true'` tanto para o booleano `true` como para a string `"true"`: `{"manage_users": "true"}`
dava a permissão. O `can()` da função sempre foi estrito (`=== true`, com teste), portanto o
desacordo estava no lado que manda de facto, o RLS, e abria em vez de fechar. Não era
explorável — só admin e o service role escrevem `permissions`, e `cleanPermissions` força
booleanos — mas as duas declaram ser cópia fiel uma da outra. Passa a `permissions -> chave =
'true'::jsonb`.

**31 — `folder_id` do Drive.** O id ia dentro de apóstrofes na consulta (`'<id>' in parents`) e
vinha da query string. Uma apóstrofe fechava a string e acrescentava condições — com sessão de
equipa, mas a listar pastas que a chave alcança e que não foram pedidas. Valida-se o conjunto de
caracteres (o comprimento é largo de propósito, para aceitar os aliases curtos do Drive).

Verificação na base, depois de aplicar as migrações: `docs/testes/permissoes_e_svg.sql`.

### Publicação e verificação (mesmo dia)

- Integrado no `main` (PR #14, `463f177`). O deploy aplicou as três migrações em produção — o
  `supabase db push` listou e aplicou `20261106120000`, `20261106121000` e `20261106122000` —,
  publicou a Edge Function `app` e o site no Cloudflare Pages (que tinha falhado nos dois merges
  anteriores e desta vez passou).
- **A primeira versão do `permissoes_e_svg.sql` dava falsos negativos.** Definia a sessão
  (`request.jwt.claims`) antes das actualizações de preparação, e os dois triggers de `profiles`
  (`profiles_codigos_pessoa`, `profiles_protect_privileges`) repõem o papel e as permissões quando
  `auth.uid()` não é nulo e a pessoa da sessão não é admin. Mal o utilizador do teste passava a
  gestor, as actualizações seguintes eram revertidas em silêncio: com a migração correcta, A2 e A4
  saíam como falhas. Corrigido — cada caso prepara sem sessão, confirma que a preparação ficou
  gravada (senão pára com "PREPARAÇÃO FALHOU") e só depois verifica com sessão.
- Verificado num Postgres 16 local, com as funções e os triggers extraídos tal e qual das
  migrações: o script antigo contra a base nova dá A2 e A4 falsos; o novo contra a base nova passa
  em tudo; o novo contra a base antiga apanha os dois bugs (A1 e B); um trigger que reverte o papel
  faz disparar a guarda. Em todos, perfis e contadores iguais antes e depois.
- O `place_order` foi verificado no mesmo Postgres, com o texto exacto da migração, contra a versão
  anterior e contra a nova sem o reinício das variáveis por item. A anterior cobrava 3000 Kz por
  uma variante de 2500 com `sale_price` 3000 e antecipava a promoção agendada; a nova cobra 2500 nos
  dois casos; sem o reinício, o 2.º item de um carrinho herdava o `list_price` da variante do 1.º
  (um desconto falso no recibo — o valor cobrado não mudava). Não há teste deste para correr em
  produção, de propósito: inserir livros de teste dispara `nextval('private.book_code_seq')`, que o
  rollback não desfaz, e deixava um buraco permanente nos códigos dos livros.
- O `permissoes_e_svg.sql` não deixa rasto em produção: os únicos triggers de `profiles` são os dois
  acima, ambos `before` e só sobre a própria linha, e o contador de códigos é uma tabela (desfeita
  pelo rollback). O teste escolhe um admin que já tem `staff_code`, para nem lhe tocar.
- **Por correr em produção:** o `permissoes_e_svg.sql`. O conector do Supabase da sessão estava
  ligado a outra conta (via os projectos "Sga" e um inactivo, não o `bggqkjjqbjhbjsckzopj`).

### Observações de desenho (não são falhas, decisão do dono)

- O separador **"Vendas por loja"** é visível a qualquer gestor com uma permissão qualquer
  (`canAccessAdmin` na UI, `is_staff()` no RLS — coerentes entre si). Um gestor só com
  `manage_catalog` vê a facturação.
- Um gestor com `manage_users` pode mudar o email de um cliente e pedir um link de acesso — na
  prática, assumir a conta. O código já mitiga (o link só volta a um admin e só quando o email
  falhou) e é inerente à permissão, mas vale a pena ficar escrito.
- O carrinho só actualiza o preço das variantes `-default` quando revalida
  (`useCart.jsx`): uma variante com nome guarda o preço de quando foi posta no carrinho. Não há
  risco de cobrar a mais (o servidor recalcula no checkout), só de mostrar um preço velho.
- CORS `*` na Edge Function: aceitável, a autenticação é por token e não por cookie.

## 9.9 Segunda passagem: lógica de funcionamento e pormenores (2026-11-06)

Passagem mais funda nas zonas que a 9.8 viu por cima: links de acesso, rotas públicas que
devolvem configuração ou enviam mensagens, HTML dos emails, transições de estado das encomendas
e textos do painel. `npm test` (560), `npm run lint`, `npm run build`, `deno check` e
`scripts/verificar-segredos.mjs` passam.

### Verificado sem problemas

- **Links de acesso** (`/admin/users/access-link`, `/admin/users/create`): o `origin` vem do
  corpo do pedido, mas o `redirectTo` fica limitado pela lista do Supabase Auth
  (`supabase/auth/config.json`), que só tem os domínios da loja, o projecto Pages e o
  `localhost:3000` — um gestor não consegue desviar um link de recuperação para fora.
- **Rotas públicas de configuração**: `/integrations` filtra por lista branca
  (`sanitizeIntegrationConfig`: código desconhecido dá `{}`, e das chaves só diz se existem);
  `/settings` só expõe a chave pública VAPID; `/messaging/status` e `/chat/config` só booleanos.
- **`/whatsapp/receipt`**: só para o telefone da própria encomenda, texto montado no servidor,
  limite por IP e por encomenda.
- **HTML dos emails**: os modelos produzem dados (`EmailDoc`) e só o `emailDocument()` gera HTML,
  com `esc()` e `safeUrl()` — seguro por construção, com os testes do `emails.test.ts`.
- **Push**: só vai para as subscrições do `customer_id` da encomenda; as anónimas nunca recebem.
- **`/unsubscribe`**, **avisos de conta** (`/account/*`): token de 64 hex com a mesma resposta
  para válido e inválido; avisos sempre para o email da sessão, com deduplicação e limites.
- **Destino depois do login**: `safeInternalPath` recusa `//host` e `/\host`, com testes.
- **Cancelamento automático** (`unpaidOrdersToCancel`): só encomendas pendentes, sem referência,
  não enviadas e com pagamento antecipado.

### Corrigido

| # | Achado | Gravidade |
|---|---|---|
| 33 | Email de **reembolso** a quem nunca pagou | Média (cliente) |
| 34 | "**Pagamento confirmado — vamos preparar a sua encomenda**" numa encomenda cancelada | Média (cliente) |
| 35 | Respostas ao email de agradecimento sem tecto por encomenda | Baixa |
| 36 | `successPath` deixava passar `//host` | Baixa |
| 37 | Textos do painel a pedir SVG depois de o bucket o recusar (achado 28) | Baixa (equipa) |

**33 — reembolso sem pagamento.** `/admin/orders/payment-status` aceitava qualquer transição, e
`sendRefundEmail` envia "Devolvemos o valor da sua encomenda", com o total, em qualquer passagem
para `refunded` — também a partir de `pending` ou `failed`. Passa a recusar o reembolso de uma
encomenda que não está paga ("se o dinheiro chegou, marque-a primeiro como paga").

**34 — pago numa encomenda cancelada.** O email de pago diz "Vamos preparar a sua encomenda", e
uma encomenda cancelada não pode ser reaberta (o trigger `orders_before_update` não deixa). O
caso é real: o cancelamento automático das encomendas por pagar e um pagamento que chega depois.
O pagamento continua a gravar-se (é preciso para o reembolso), mas sem o email, e o painel
mostra à equipa "o cliente não foi avisado do pagamento. Falta reembolsá-lo."

As duas regras estão em `checkoutRules.ts` (`paymentStatusChange`), com testes. Desfazer um
reembolso marcado por engano continua possível: o email e o WhatsApp de pago têm deduplicação.

**35 — respostas ao agradecimento.** Responder outra vez é de propósito (o cliente pode mudar de
ideias), mas cada resposta avisa cada pessoa da equipa e acrescenta um evento à linha do tempo,
que o `/track` devolve inteira. O limite era só por IP. Passa a haver um tecto de 5 por
encomenda e por dia (`check_rate_limit_daily`), verificado depois do token.

**36 — `successPath`.** O `pathname` de `https://x.ao//evil.com` é `//evil.com`, um URL relativo
ao protocolo. Não era explorável — o carrinho não usa o `url` da resposta e quem o envia é o
próprio comprador —, mas a função prometia "nunca outro domínio". As barras do início colapsam
numa só, como no `safeInternalPath`; a função passou para `checkoutRules.ts`, com testes.

**37 — textos do painel.** O logótipo dizia "PNG/SVG com fundo transparente", e o fundo da loja e
o texto por omissão do `ImageField` também ofereciam SVG — quem seguisse a indicação batia num
erro de envio. A foto de perfil dizia só PNG/JPG. Os textos usam agora `ALLOWED_IMAGE_LABEL`.

### Por decidir (dono)

- `http://localhost:3000/**` na lista de redirecionamentos do Auth de produção serve o
  desenvolvimento local. O risco é baixo — um link desviado para lá só chega ao computador da
  própria vítima —, mas sai se ninguém desenvolver contra a base de produção.

## 9.10 Pendentes fechados (2026-11-06)

O que as secções 9.8 e 9.9 deixaram como observação ou decisão do dono, fechado a pedido.

| # | O quê | Onde |
|---|---|---|
| 38 | Um gestor com `manage_users` mudava o email de um cliente e pedia um link de acesso, que ia para o email novo: entrava na conta | `/admin/users/update` recusa a troca de email a quem não é admin; o formulário bloqueia o campo |
| 39 | "Vendas por loja" (facturação, metas, notas) visível a qualquer gestor com uma permissão qualquer | migração `vendas_so_com_encomendas` (leitura com `manage_orders`) e o separador com `canManageOrders` |
| 40 | O carrinho só revalidava o preço da edição normal: um tamanho ou edição extra guardava o preço de quando entrou, e o cliente via um preço e pagava outro | `refreshCart` usa `variantPrices` e o stock da edição; uma edição que deixou de existir sai do carrinho |
| 41 | Um gestor sem nenhuma das quatro permissões principais abria o painel em Pagamentos, mesmo sem acesso | o separador por omissão é o primeiro permitido |
| 42 | `http://localhost:3000/**` na lista de redirecionamentos do Auth de produção | retirado de `supabase/auth/config.json` |

A migração foi verificada num Postgres local: substitui as duas políticas, e quem só tem
`manage_catalog` deixa de ler as vendas.

**Para aplicar à mão:** o `supabase/auth/config.json` não vai pelo deploy — aplica-se com
`bash scripts/configurar-auth.sh` (mostra a diferença e pede confirmação). Para voltar a
desenvolver contra a base de produção, repor `http://localhost:3000/**` nesse ficheiro.

## 9.11 Produtos que não são livros, e a amostra de leitura (2026-11-06)

Passagem pela compra de produtos com variantes (uniformes, t-shirts, edições) e pelos botões
da ficha. Nenhum produto em produção tem variantes ainda (os 102 são livros sem `versions`), por
isso o caso foi simulado: no navegador, alterando só a resposta da API, e na base de dados numa
transacção anulada.

| # | Achado | Gravidade |
|---|---|---|
| 43 | "Comprar" no cartão, na vista rápida e nos destaques punha um produto com tamanhos no carrinho **sem tamanho**, e o `place_order` aceitava: encomenda sem tamanho, ao preço base | Alta (vendas) |
| 44 | "Ler Amostra Grátis" abria, em **todos** os produtos, páginas inventadas: um prefácio que dizia que o autor "é reconhecido internacionalmente" e um "Capítulo 1: O Poder dos Pequenos Passos", iguais para qualquer livro (e para um uniforme) | Alta (confiança) |
| 45 | Stock de uma variante maior que o do produto: a ficha dizia "9 em stock" e o servidor recusava a 5.ª unidade | Média |
| 46 | Os destaques da semana diziam "Adicionado ao carrinho!" mesmo quando o stock não chegava (o erro ficava por tratar), abriam o carrinho a cada clique e mostravam o preço de tabela durante uma promoção | Média |
| 47 | Variantes chamadas "Edição" numa t-shirt; "disponíveleis" na mensagem de stock (ficha e carrinho) | Baixa |

**43.** Migração `20261106170000_variante_obrigatoria`: o `place_order` recusa um produto com
`versions` sem variante ("Escolha o tamanho ou a edição de: …"). No site, `needsVariantChoice`
muda o botão para "Escolher" e leva à ficha; o `addToCart` recusa a variante base desses
produtos, e o carrinho tira-a ao revalidar. Teste em transacção anulada: sem variante → recusa;
M → aceite com `variant_label` "M"; L esgotado → "Stock insuficiente (L)"; livro sem variantes
→ aceite. Confirmado depois que a função em produção ficou igual.

**44.** O `BookPreviewModal` foi apagado. O botão só aparece com `preview_enabled` e páginas
carregadas no painel (`hasReadingSample`), e abre as páginas reais (`SampleReaderModal`). Hoje
nenhum produto tem amostra, por isso o botão desaparece até a equipa carregar páginas.

**45.** `variantStock` (`api/EcommerceApi.js`): o menor entre o da variante e o do produto, como o
carrinho já fazia ao revalidar. A ficha abre na primeira variante com stock; uma esgotada aparece
riscada e diz "Este tamanho esgotou. Escolha outro.".

**46–47.** Os destaques seguem os cartões (aviso com "Ver", erro mostrado, preço em vigor).
`variantNames` dá Tamanho, Edição ou Opção conforme o tipo.

## 9.12 Análise crítica do sistema todo: segurança, lógica, visual e pormenores (2026-11-06)

Passagem sobre o ramo `claude/quirky-hypatia-wnid2g` (com as Fases 1 a 3), feita num **Supabase
local completo** (`supabase start`: Postgres com as 72 migrações, API, Auth e Storage) e com a
**Edge Function a correr em Deno** contra ele. Isto permitiu o que as passagens anteriores não
conseguiam: checkout real, ecrãs da equipa com sessão e os advisors do Supabase. O site de
produção e a base de produção não foram tocados (a rede da sessão não chega lá).

### Achados

| # | Achado | Gravidade | Estado |
|---|--------|-----------|--------|
| 48 | **Comunidade: endereços escritos no texto e na citação viravam links clicáveis sem validação no servidor.** A base só verificava a lista `links`; o site (`linkifySegments`) transforma qualquer `https://…` do texto em link. Uma publicação enviada pela API com o endereço só no texto passava. | Alta | ✅ migração `comunidade_links_seguros` |
| 49 | **Links maliciosos e pornográficos** (pedido do dono): regras fixas na gravação (IP, porta, `xn--`, domínios de topo de adultos, palavras no nome do site, programas), lista `community_blocked_domains` gerida no painel e reputação pelo filtro de família do Cloudflare (`pg_net` + agendador). | Alta | ✅ (filtro do Cloudflare por confirmar em produção) |
| 50 | Advisors: 9 regras RLS da comunidade avaliavam `auth.uid()` linha a linha (`auth_rls_initplan`). | Baixa (desempenho) | ✅ |
| 51 | Advisors: `community_posts_public` e `downloads_public` eram vistas `SECURITY DEFINER` (nível ERROR). | Média (advisors) | ✅ migração `leituras_publicas_por_funcoes`: funções `community_feed`, `community_replies`, `community_post` e `downloads_list`, com os filtros como parâmetros; os advisors de segurança ficam sem avisos |
| 52 | "**Tenho um problema**" (resposta ao email de agradecimento) gravava `customer_confirmed_at`, que conta como compra feita (compra verificada, PDFs pagos). | Baixa | ✅ `index.ts` (falta publicar a Edge Function) |
| 53 | **Página de sucesso:** nos botões do recibo, o ícone e a descrição saíam do botão. O `h-auto` não vencia o `sm:h-9` do tamanho por omissão do `Button`. | Média (visual) | ✅ |
| 54 | Cerca de 30 títulos `h2/h3/h4` sem tamanho herdavam `text-2xl`–`text-5xl` dos estilos base: no Contacto, "Email/Telefone/Morada" ficavam maiores do que o título da secção; "Acompanhe esta encomenda" ocupava meio ecrã. | Baixa (visual) | ✅ nas páginas de cliente e no painel |
| 55 | Título da loja: "Todos os Livros — Livraria Adventista — Livraria Adventista". | Baixa (SEO) | ✅ |
| 56 | Topo com banner (loja, lojas, contacto, rastreio): no telemóvel o texto ficava por baixo do logótipo da barra fina. | Média (visual) | ✅ |
| 57 | Acessibilidade (axe-core, WCAG A/AA): pesquisa do cabeçalho fechada mas focável (em todas as páginas); botões −/+ da quantidade sem nome; seletores e preço dos filtros sem rótulo; ordenação sem nome; `aria-label` em `div` sem papel; contraste da nota do rodapé. | Média | ✅ 0 violações nas páginas verificadas |
| 58 | Carrinho: "2 items" → "2 itens". | Trivial | ✅ |
| 59 | Painel de filtros montado duas vezes (barra lateral e telemóvel) com os mesmos `id`. | Baixa | ✅ `useId` |
| 60 | Painel → Comunidade: a lista de sites bloqueados esticava a página ~5000px (textos `sr-only` absolutos fora da lista com scroll). Introduzido e corrigido nesta passagem. | Baixa | ✅ |
| 61 | `sales_count` e `views_count` de cada produto legíveis por qualquer visitante (vendas por livro). | Baixa (negócio) | Aceite: o catálogo é lido com `select *` por visitantes e pela equipa (o mesmo papel `authenticated`), por isso tirar as colunas por permissão parte a loja; mudá-las de tabela obriga a reescrever o `place_order` e a reposição de stock. Fica para quando houver razão de negócio |
| 62 | As avaliações expõem o `user_id` de quem escreve (a comunidade esconde-o). | Baixa (privacidade) | Aceite: o id está também no endereço da foto (`users/<id>/…`); escondê-lo obriga a tirar as fotos das avaliações ou a mudar onde ficam os avatares. Saber o id não dá acesso a nada (RLS) |
| 63 | `start_download` sem limite: o contador de downloads podia ser inflacionado. | Baixa | ✅ 30 por hora por conta ou, sem sessão, por IP (`private.request_ip`) |
| 64 | Painel de vendas: a "senha de administrador" é um cadeado de interface (o hash PBKDF2 fica legível a quem tem `manage_orders`); a escrita está protegida pelo RLS (só admin). | Informativo | — |
| 65 | Textos: "senha" no painel de vendas e "palavra-passe" no resto; "checkout" em mensagens ao cliente e no painel. | Trivial | ✅ |

### Verificado sem problemas

- **RLS:** todas as tabelas de `public` têm RLS; nenhuma regra de escrita aberta (`true`) nem para
  anónimos. Das funções que um cliente pode chamar pela API, as 24 foram lidas: todas verificam a
  permissão por dentro (`assert_can_manage_user`, `has_permission`, dono da linha). O `place_order`
  não está exposto: só a Edge Function o chama.
- **Storage:** `media` só tem imagens públicas (capas, slides, logótipo, avatares); `downloads` é
  privado e só passa links temporários a quem `can_download` deixa.
- **Checkout real**, ponta a ponta no browser (local): visitante sem conta, 2 livros, levantamento
  e "Pagar no balcão" → encomenda `ENC-…` com total e portes calculados no servidor, stock 40 → 38,
  código `CLI-` atribuído, página de sucesso com o número.
- **16 páginas × computador e telemóvel:** 0 erros na consola, 0 pedidos falhados, sem scroll
  horizontal, um `h1` por página, títulos certos.
- **14 separadores do painel** abertos com sessão de admin, sem erros.
- `deno check` da Edge Function, `npm test` (631), lint, build e o scanner de segredos.

### Não verificado

- Produção (site e base): a rede desta sessão não chega a `livrariaadventista.com` nem ao projecto.
- A resposta real do filtro do Cloudflare (bloqueado na rede da sessão; testado com respostas simuladas).
- Emails e WhatsApp reais (sem SMTP nem API do WhatsApp na base local).

Verificado depois, na mesma passagem: **entrega ao domicílio** (cliente com conta, edição "Capa
dura" a 7 500 Kz + 1 500 de portes = 9 000 Kz, município e rua gravados, stock da edição 2 → 1) e
**transferência com referência** (`/order/payment-reference`: com outro email, a mesma resposta de
"não encontrada"; com o certo, a encomenda passa a "a aguardar confirmação"). A página de sucesso
diz "Encomenda Registada! … Falta o pagamento" a quem ainda tem de pagar.

## 10. Não verificado nesta auditoria

- **Checkout real:** não foi feita nenhuma encomenda, para não criar dados nem mexer no stock.
- ~~Erros na consola do navegador~~: verificado em 9.6 (Chrome com puppeteer-core).
- **Ecrãs com sessão de equipa:** não há conta de teste disponível.
- **Avisos de segurança e desempenho do Supabase (advisors):** precisam de um token com acesso à base de dados.

## Próximos passos, por ordem

Estado a 2026-11-05, 06h: login com a Google a funcionar, links de autenticação no domínio
novo, Firebase autorizado, as três migrações aplicadas, PR #1 integrado no `main`.

1. **Tokens do Actions com o formato errado.** Os deploys do merge falharam:
   `SUPABASE_ACCESS_TOKEN` → *"Invalid access token format. Must be like `sbp_…`"* (foi colada
   outra chave, não um token pessoal); `CLOUDFLARE_API_TOKEN` → *"Authentication failed
   (status: 400) [code: 9106]"*. Até serem corrigidos, a Edge Function do `main` (`d1c9c89`) não
   está publicada.
2. SMTP do Supabase Auth (achado 27). Depois, `bash scripts/configurar-auth.sh` põe os emails em
   português (achado 26).
3. Telefones, coordenadas das lojas, descrições e stock real.
4. MFA nas contas de admin, DNSSEC, email do domínio e alertas (ver 9.4). Projecto antigo no `pages.dev`.
