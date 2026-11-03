# Auditoria do sistema — Livraria Adventista

Data: 2026-11-01. Ramo `claude/youthful-heisenberg-rq5gnw` (PR #3), produção em https://livraria-adventista.pages.dev.
Cada ponto foi verificado com comandos (código, API pública, base de dados por leitura, build e ficheiros publicados), não de memória.
Gravidade: **Crítica · Alta · Média · Baixa**. Estado: ✅ corrigido nesta auditoria · ⏳ por fazer.

## Resumo

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 1 | Sanitização de HTML contornável (injecção de código nas descrições e slides) | Crítica | ✅ |
| 2 | Edge Function publicada desactualizada: módulo de utilizadores partido em produção | Alta | ✅ publicada (2026-11-01 23:21) |
| 3 | GitHub Actions bloqueado por pagamento (CI e deploys automáticos não correm) | Alta | ⏳ dono da conta |
| 4 | Service worker serve HTML antigo depois de cada deploy (risco de ecrã branco) | Alta | ✅ |
| 5 | 100 de 102 livros sem descrição; 17 capas em branco; capas trocadas | Alta (negócio) | ⏳ conteúdo |
| 6 | Carregamento inicial pesado (Firebase e Recharts em todas as páginas) | Média | ✅ 580 → 331 KB |
| 7 | Contactos provisórios no site (telefone `+244 923 000 000`, WhatsApp vazio) | Média | ⏳ Configurações |
| 8 | Emails de confirmação de encomenda desligados (sem SMTP) | Média | ⏳ Configurações |
| 9 | Sem `robots.txt`, `sitemap.xml`, `favicon.ico`, etiquetas `og:` | Média | ✅ (falta só o `favicon.ico`) |
| 10 | Sem cabeçalhos de segurança (CSP, X-Frame-Options, HSTS) | Média | ✅ excepto CSP |
| 11 | 11 vulnerabilidades em dependências (10 altas, impacto prático baixo) | Média | ⏳ |
| 12 | Stock: 96 de 102 livros esgotados ou com 1–4 unidades | Média (negócio) | ⏳ conferir |
| 13 | API lenta (0,85–1,5 s por pedido, Supabase em Estocolmo, sem cache) | Média | ⏳ |
| 14 | 53 botões só com ícone sem nome acessível | Baixa | ✅ |
| 15 | Rotas de utilizadores procuram o id antes de verificar a permissão | Baixa | ✅ |
| 16 | Loja Talatona → Huambo e painel por loja (SQL pronto) | — | ⏳ `docs/migracoes-pendentes` |
| 17 | Gate de qualidade inexistente: ESLint com `no-undef`/`no-unused-vars` em `off` e `--quiet`; zero testes | Crítica | ✅ |
| 18 | Três bugs de runtime que o gate desligado escondia (criar livro no painel rebentava) | Alta | ✅ |
| 19 | `/track` devolvia a assinatura manuscrita a quem soubesse nº da encomenda + email | Alta | ✅ |
| 20 | `/admin` descarregava todas as encomendas com `select *`, assinaturas base64 incluídas | Média | ✅ |
| 21 | Limite de pedidos em memória por isolate: na prática não limitava nada | Alta | ⏳ migração por aplicar |

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

### Ordem de publicação (importa)

1. **Site** (`deploy-site.sh` ou Actions): passa a enviar a sessão e o GPS no checkout e lê
   as encomendas por um só critério. Funciona com a função antiga e com a nova.
2. **`4_campos_encomendas.sql`** e **`3_indices_chaves_estrangeiras.sql`**.
3. **Edge Function**: deixa de gravar `payment_method`/`address`, liga a encomenda à conta, e
   traz a cache e o checkout sem esperas. Publicada antes do site, o painel antigo deixava de
   mostrar a morada das encomendas novas.
4. Depois de confirmado: exigir conta no servidor para entrega ao domicílio, e apagar as
   colunas herdadas (ver o README de `docs/migracoes-pendentes`).

## 10. Não verificado nesta auditoria

- **Checkout real:** não foi feita nenhuma encomenda, para não criar dados nem mexer no stock.
- **Erros na consola do navegador:** o Chrome sem interface não terminou nesta máquina.
- **Ecrãs com sessão de equipa:** não há conta de teste disponível.
- **Avisos de segurança e desempenho do Supabase (advisors):** precisam de um token com acesso à base de dados.

## Próximos passos, por ordem

1. Aplicar a migração `limites_pedidos` e o SQL de `docs/migracoes-pendentes/`. (A Edge Function já está publicada e os advisors já correram: ver 9.1.)
2. Desbloquear o GitHub (pagamento) → CI e deploys automáticos.
3. Conteúdo: descrições, capas em branco ou trocadas, stock real, contactos, SMTP.
4. Content-Security-Policy, com o browser aberto para confirmar cada fluxo (ver 9.1).
5. `npm audit fix` e remover as dependências sem uso.
6. Decisões do dono: o scope `https://mail.google.com/` (acesso total ao Gmail) pedido no
   login Google, e o link de recuperação devolvido na resposta de `/admin/users/access-link`
   (quem tem `manage_users` pode ler o link de qualquer cliente).
