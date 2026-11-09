# Auditoria Premium 360° — Livraria Adventista

| | |
|---|---|
| Data | 2026-11-09 |
| Base auditada | `main` em `7a5d6f0` (merge do PR #56) |
| Correcções desta passagem | ramo `claude/auditoria-premium-360` (pull request, **sem merge e sem deploy**) |
| Produção | https://livrariaadventista.ao · Supabase `bggqkjjqbjhbjsckzopj` (Postgres 17, `eu-north-1`, plano Free) · Edge Function `app` v43 |
| Referências | WCAG 2.2 AA · OWASP ASVS 5.0 (nível 2 no comércio e na autenticação) · Core Web Vitals (p75) · Baymard Institute |

**Como ler.** Cada afirmação tem uma marca:
✔ facto confirmado nesta passagem · ⚑ problema reproduzido · ? suspeita a investigar ·
→ recomendação · ∅ sem acesso para verificar.
Gravidade: **P0** bloqueia segurança, dados ou vendas · **P1** afecta muito vendas, confiança ou
uso · **P2** experiência, eficiência ou consistência · **P3** polimento.

Nada em produção foi alterado: a base de dados foi lida (consultas `select`, avisos e registos),
nenhuma compra foi feita, nenhum deploy foi corrido. As correcções vão num pull request, que só
chega à loja quando for integrado no `main`.

---

## A. Diagnóstico geral

A Livraria Adventista tem uma **engenharia acima do nível desta fase de vida**: preços e stock
calculados no servidor, pagamentos num registo só de acrescentar com o estado calculado, RLS em
todas as tabelas, permissões verificadas três vezes (base de dados, Edge Function, interface),
CSP sem scripts embutidos, ~1 500 testes, cenários da base de dados em cada PR e um painel que
cobre do catálogo à produção editorial. Isto é raro numa loja com seis encomendas.

O que a separa de um padrão premium **não é o código, é a operação**: a loja não envia um único
email, não aceita um pagamento electrónico, não mostra um telefone, e o catálogo tem dados por
completar. Um cliente consegue comprar — mas sai do checkout sem confirmação no email, paga por
transferência ou em dinheiro, e não tem para onde ligar.

**Classificação (provisória): 75/100 antes deste PR · 76/100 com ele — "Qualidade intermédia".**
Confiança **média-baixa**: cerca de metade dos critérios tem evidência directa desta passagem; a
parte visual e de desempenho apoia-se em medições anteriores (datadas abaixo) e não foi revista
no navegador. Esta nota não é uma certificação; é um ponto de partida medido.

**Critérios de bloqueio.** Nenhum confirmado no código (sem vulnerabilidade crítica, sem falha de
autorização com exposição de dados, sem perda de encomendas, compra possível). Dois pontos de
produção **aproximam-se** deles e têm de fechar antes de qualquer classificação premium:

1. ⚑ **Email transaccional parado** (A360-01): 106 de 106 envios ficaram por fazer.
2. ⚑ **5 de 6 encomendas entregues com o pagamento por confirmar** (A360-04).

**O que já está excelente** (manter):

- ✔ **Integridade comercial no servidor**: o checkout só recebe `book_id` e quantidade; preço,
  promoção, stock e totais saem do `place_order`; idempotência por chave; limites por IP;
  validação de morada angolana por província → município → localidade.
- ✔ **Pagamentos auditáveis**: `order_payments` só de acrescentar, transições fechadas por
  gatilho, `payment_status` calculado, webhook com HMAC-SHA256 e unicidade por
  `provider + transaction_id`, permissão própria «Confirmar pagamentos».
- ✔ **Segredos fora da API**: `site_settings` sem chaves (gatilho `capture_site_secrets` tira-as
  antes de gravar); leitura de `site_settings` só com `manage_settings`.
- ✔ **Cabeçalhos**: CSP com `script-src` sem `unsafe-inline`, `frame-ancestors 'self'`, HSTS,
  `Permissions-Policy`, `nosniff`.
- ✔ **Continuidade**: backup semanal cifrado (AES-256) a correr — última execução com êxito a
  2026-11-08.
- ✔ **Gate de qualidade**: CI com lint, ~1 500 testes, build, `npm audit`, `deno check`, cenários
  PGlite e migrações aplicadas do zero; os últimos 8 workflows estão verdes.

---

## B. Cobertura e método

| Feito nesta passagem | Como |
|---|---|
| Código | Rotas (29 páginas), componentes partilhados, `/checkout` da Edge Function, pós-build de SEO, `_headers`, workflows |
| Base de dados (só leitura) | Catálogo e encomendas em agregado (sem dados pessoais), bandeiras de configuração (sem ler segredos), políticas RLS e de Storage, privilégios, funções `security definer` |
| Avisos do Supabase | Segurança e desempenho (`get_advisors`) |
| Registos (24 h) | Edge Function (latência por rota), API REST (erros 4xx/5xx), Postgres, Auth |
| CI | Últimas execuções (`gh run list`) |
| Verificação das correcções | Testes dos scripts e do módulo novo (22 + 15), ESLint (regras do gate), esbuild em todos os ficheiros mudados, renderização no servidor do carrossel e do link de salto, pós-build de SEO corrido num build simulado |

| Não feito, e porquê | Consequência |
|---|---|
| ∅ Site publicado no navegador | A rede desta sessão não chega ao domínio, e nem o navegador da app nem o Claude in Chrome estavam disponíveis. Sem capturas novas, sem LCP/CLS/INP medidos hoje |
| ∅ `npm ci` local | Instalações de pacotes bloqueadas nesta sessão. O `npm test`, o lint completo e o build correm no CI do PR |
| ∅ Sessão de equipa | Os fluxos do painel foram lidos no código, não exercidos |
| ∅ Pagamento em sandbox | Não há gateway contratado (A360-03) |
| ∅ Emails nos clientes de email | Nenhum email é enviado (A360-01) |

**Evidência anterior reutilizada**, sempre com data: desempenho em
[DESEMPENHO-BASELINE.md](../DESEMPENHO-BASELINE.md) (2026-11-02/03); axe-core em 7 páginas e 6
larguras (AUDITORIA.md § 9.14, 2026-11-07); réplica Postgres 16 com as migrações (§ 9.16,
2026-11-08); registos e avisos (§ 9.21, 2026-11-08).

**Cobertura estimada**: ~50 % dos critérios com evidência directa desta passagem, ~27 % com
evidência anterior datada, **~23 % por verificar** (sobretudo visual, telemóvel real, INP em campo,
painel com sessão de equipa e pagamento em sandbox).

---

## C. Inventário técnico e funcional (Fase 1)

| Camada | O que é | Estado |
|---|---|---|
| Frontend | React 18.3.1, Vite 7, React Router 7, Tailwind 4, Radix/shadcn, framer-motion 11, react-helmet 6 · 29 páginas, 223 componentes, ~82 mil linhas | ✔ |
| API própria | Edge Function `app` (Deno), 101 rotas, crons (vigilância de encomendas, avisos à equipa, relatório semanal) | ✔ |
| Dados | Postgres 17 com RLS em todas as tabelas · 116 migrações no repositório e 116 aplicadas (última `20261108250000`) | ✔ |
| Autenticação | Supabase Auth: email + Google; verificação em dois passos opcional | ✔ / ⚑ A360-05 |
| Ficheiros | `media` público sem listagem, só imagens, 10 MB · `downloads` privado, só PDF, acesso por função | ✔ |
| Entrega do site | Cloudflare Pages + `_headers` · PWA com service worker *network-first* no HTML | ✔ |
| CI/CD | PR: lint, testes, build, auditoria, `deno check`, cenários, migrações do zero · `main`: deploy Pages e Supabase · backup semanal | ✔ |
| Integrações | Gemini (assistente) · PRO2SMS · WhatsApp Business · email (SMTP/Brevo/Cloudflare/SendGrid) · Google Workspace (painel) · OpenStreetMap · YouTube sem cookies | email ⚑, WhatsApp ⚑ |

**Produção hoje**: 102 produtos activos, 4 colecções, 3 lojas, 6 encomendas, 7 contas (4
administradores, 3 clientes), 0 avaliações, 2 publicações na comunidade, 0 colportores.

| Módulo | Estado |
|---|---|
| Catálogo, pesquisa com sugestões, filtros, ordenação, colecções, relacionados, vistos recentemente | Operacional |
| Ficha de produto (galeria, variantes, amostra de leitura, vídeo, partilha, avaliações) | Operacional |
| Carrinho persistente e sincronizado | Operacional |
| Checkout (entrega, levantamento, digital; convidado ou com conta) | Operacional, só com pagamentos offline |
| Pagamento electrónico (gateway por webhook) | **Não implementado em produção** — pronto no código, sem fornecedor (A360-03) |
| Emails transaccionais | **Com defeito em produção** — configuração (A360-01) |
| Registo por email e recuperação de palavra-passe | **Parcial** — limite do email incluído do Supabase (A360-02) |
| Rastreio, confirmação de entrega, trajecto GPS | Operacional (trajecto por verificar em campo) |
| Conta do cliente, biblioteca digital, notificações, atendimento | Operacional |
| Comunidade, materiais, níveis de leitor | Operacional, pouco uso |
| Painel: encomendas, pagamentos, relatórios, catálogo, utilizadores, CRM, produção, funcionários, finanças, colportagem, igreja, sistema | Operacional (não exercido com sessão de equipa) |
| WhatsApp Business | **Com defeito** — 1 envio, falhado por token inválido (2026-11-07) |
| SEO técnico | Parcial → corrigido neste PR (A360-06, A360-08) |
| Observabilidade de cliente (erros, RUM, funil) | Não implementado (A360-16) |

---

## D. Pontuação por domínio (Fase 14)

| Domínio | Peso | Antes | Com o PR | Confiança | Porquê |
|---|---:|---:|---:|---|---|
| Qualidade visual e design system | 15 % | 78 | 78 | baixa | Tokens, shadcn e padrões consistentes; passagens anteriores a 6 larguras. Não revisto hoje no navegador |
| UX, navegação e acessibilidade | 15 % | 74 | 80 | média | axe 0 violações (§ 9.14); faltavam o salto para o conteúdo e o botão de parar o carrossel (nível A) e havia rótulos em inglês — corrigidos |
| Experiência mobile | 10 % | 82 | 82 | baixa-média | Barra inferior, compra fixa, gestos, cauda infinita com memória de posição, PWA; LCP/CLS do `/shop` em telemóvel dentro dos objectivos a 2026-11-03 |
| Catálogo, pesquisa e descoberta | 10 % | 70 | 70 | alta | Funcionalidade completa; dados fracos: 0 ISBN, 28 % em «Catálogo Geral», 76 % com 1–4 unidades |
| Carrinho, checkout e pagamentos | 15 % | 62 | 62 | média | Engenharia exemplar; sem pagamento electrónico, sem email de confirmação, 5/6 entregues por pagar |
| Administração e operações | 10 % | 85 | 85 | média | Painel muito completo; operação sem contactos nem MFA |
| Desempenho | 10 % | 72 | 73 | baixa | Divisão de código e cache certas; API a 0,4–0,8 s p75 por pedido a partir de Angola; INP nunca medido em campo |
| Segurança e privacidade | 10 % | 84 | 84 | média-alta | RLS, CSP, segredos, auditoria; administradores sem segundo passo |
| SEO, observabilidade e testes | 5 % | 70 | 78 | alta | Canonical e dados estruturados corrigidos; sem E2E, sem RUM, sem monitorização de erros |
| **Total ponderado** | | **74,9** | **76,3** | média-baixa | |

Faixas internas (não são certificação): 95–100 excelência · 90–94 premium avançado · 80–89 bom
nível profissional · **70–79 qualidade intermédia** · 50–69 modernização · 0–49 insuficiente.

O caminho mais curto para **80+** não passa por código: fechar A360-01 a A360-05 e A360-07 vale,
por si, ~4 pontos — o suficiente para passar os 80 (checkout e pagamentos para ~80, segurança
para ~90).

---

## E. Matriz de auditoria

Estado: ✅ corrigido neste PR · 👤 precisa do dono (configuração, contrato, conteúdo ou decisão) ·
📝 recomendado, por fazer.

| ID | Módulo | Problema | Evidência | Grav. | Impacto | Causa | Recomendação | Validação | Estado |
|---|---|---|---|---|---|---|---|---|---|
| A360-01 | Emails | ⚑ **Nenhum email chega aos clientes**: confirmação de encomenda, avisos de entrega, boas-vindas, respostas do atendimento | `notification_logs`: 106 de 106 emails `skipped` (SMTP), o último a 2026-11-09 07:00; `order_email_enabled = false` | **P0** | Cliente, vendas | Fornecedor de email nunca configurado | Brevo (ou outro) com o domínio `.ao` (SPF, DKIM, DMARC); ligar «email automático» — passos em [AUTENTICACAO_E_EMAILS.md § 00](../AUTENTICACAO_E_EMAILS.md) | Encomenda de teste → email recebido num Gmail e num Outlook; `notification_logs` com `sent` | 👤 |
| A360-02 | Conta | ⚑ Registo por email e recuperação de palavra-passe dependem do email incluído do Supabase, que só envia poucos por hora | `POST /auth/v1/signup` → 429 três vezes a 2026-11-08 (§ 9.21) | **P1** | Cliente | Auth sem SMTP próprio | SMTP no Supabase Auth (o mesmo fornecedor de A360-01); depois `scripts/configurar-auth.sh` (modelos em português, Site URL `.ao`) | Registo novo e "esqueci-me da palavra-passe" com um Gmail de teste | 👤 |
| A360-03 | Pagamentos | ⚑ **Nenhum pagamento electrónico activo**: só transferência, entrega e balcão | `payment_methods`: `multicaixa` e `unitel_money` com `enabled = false`; nenhum com `gateway_provider` | **P1** | Vendas | Gateway por contratar | Contratar um agregador autorizado (Multicaixa Express/referências — p. ex. AppyPay); o webhook com HMAC já existe ([PAGAMENTOS.md § 3](../PAGAMENTOS.md)) | Pagamento em sandbox → webhook → encomenda `paid` sem intervenção; reenvio do webhook não duplica | 👤 |
| A360-04 | Encomendas | ⚑ 5 de 6 encomendas `delivered` com `payment_status = pending` | Agregado de `orders` (sem dados pessoais) | **P1** | Operação, finanças | Encomendas de teste, ou dinheiro recebido não registado | Confirmar cada uma: registar o pagamento em «Confirmar pagamentos» ou cancelar/arquivar as de teste | Relatório de pagamentos: nenhuma entregue por pagar sem alerta aberto | 👤 |
| A360-05 | Segurança | ⚑ Os **4 administradores não têm segundo passo**; o MFA é opcional | `auth.mfa_factors` verificados = 0; `MfaGate` só pede o código a quem o activou | **P1** | Segurança | MFA nunca exigido à equipa (ASVS V6, nível 2) | Activar nas 4 contas; depois exigir `aal2` a `admin`/`manager` em `private.has_permission` (com aviso prévio) | Sessão `aal1` de um administrador não consegue escrever | 👤 depois 📝 |
| A360-06 | SEO | ⚑ **As páginas fixas declaravam a página inicial como a oficial**: `/shop`, `/colecoes`, `/lojas`, `/about`, `/contact`, `/faq`, `/materiais`, `/comunidade`, `/shipping-returns`, `/privacidade` estão no sitemap, mas eram servidas pelo `index.html`, com `<link rel="canonical" href="https://livrariaadventista.ao/">` | `public/_redirects` (`/* /index.html 200`), `index.html`, `seo-catalogo.mjs` só gerava livros e colecções | **P1** | Descoberta | SPA com um único HTML | O pós-build escreve `shop.html`, `faq.html`… com o canonical, o título e a descrição de cada página (como já fazia para os livros) | `curl -s https://livrariaadventista.ao/faq \| grep canonical` → `/faq`; Search Console → Inspecção de URL | ✅ |
| A360-07 | Confiança | ⚑ **A loja não tem telefone nem WhatsApp** em lado nenhum; as 3 lojas sem telefone, 2 sem coordenadas; denominação social vazia | `site_settings`: `contact_phone`/`whatsapp` vazios, `company_legal_name` vazio; `physical_stores` | **P1** | Vendas, confiança | Dados por preencher | Configurações → Contacto e Lojas; denominação social e NIF no rodapé e no recibo | Rodapé, página de lojas e recibo com os dados | 👤 |
| A360-08 | SEO | Sem dados estruturados: preço, disponibilidade, autor e caminho nunca chegavam à Google | Nenhum `application/ld+json` no código | P2 | Descoberta | — | `Product`/`Book` + `Offer` (AOA) + `BreadcrumbList` na ficha; `Organization` + `WebSite` no `index.html` | [Rich Results Test](https://search.google.com/test/rich-results) numa ficha | ✅ |
| A360-09 | Acessibilidade | Sem "Saltar para o conteúdo" na loja (WCAG 2.4.1, **nível A**); só o painel o tinha | `components/admin/shell/AdminShell.jsx` | P2 | Cliente | — | Link no início do cabeçalho que foca o `<main>` | Tab na página inicial → link visível → Enter → foco no conteúdo | ✅ |
| A360-10 | Acessibilidade | O carrossel da página inicial **não se podia parar** no telemóvel (só parava com o rato por cima ou com foco) e ignorava "reduzir movimento" (WCAG 2.2.2, **nível A**) | `HeroSlider.jsx` | P2 | Cliente | — | Botão Parar/Retomar junto aos pontos; com "reduzir movimento", começa parado e o vídeo de fundo não arranca | Telemóvel: tocar Parar → não avança; sistema com menos movimento → parado | ✅ |
| A360-11 | Acessibilidade | Rótulos em inglês lidos por voz portuguesa: "Previous image", "Next image" (ficha), "Close" (painéis laterais), "Loading" (arranque da sessão) | `ProductDetailPage.jsx`, `ui/sheet.jsx`, `ui/spinner.jsx`, `ui/pagination.jsx` | P3 | Cliente | Componentes de origem em inglês | Traduzidos; miniaturas com "Ver imagem N de M" e `aria-current` | Leitor de ecrã na galeria | ✅ |
| A360-12 | Conteúdo | "Conheça **o** Livraria Adventista", "Entre em contacto com **o** Livraria Adventista" nas descrições das páginas | `AboutPage.jsx`, `ContactPage.jsx` | P3 | Marca | Texto escrito para outro nome | "a Livraria Adventista" | Descrição nos resultados de pesquisa | ✅ |
| A360-13 | Catálogo | Dados fracos para descoberta e para a Google: **0 de 102 com ISBN**; 29 (28 %) na categoria «Catálogo Geral»; 78 com 1–4 unidades e 5 esgotados; 0 promoções, 0 amostras de leitura, 0 variantes; 101 livros + 1 Bíblia, apesar de a plataforma aceitar 9 tipos de produto | `stock_books` (agregados) | P2 | Vendas | Conteúdo | ISBN-13 (entra no `gtin13`); redistribuir «Catálogo Geral»; conferir o stock real; amostras nos mais vendidos; outros tipos quando houver | Filtros por categoria sem «geral» dominante; Search Console com ISBN | 👤 |
| A360-14 | Legal | Não há página de **Termos e Condições de venda** (há privacidade, envios e devoluções, FAQ) | Rotas em `App.jsx` | P2 | Confiança | — | Redigir com apoio jurídico: identificação da empresa, preços e pagamento, entrega, devolução, garantias, litígios; confirmar outras obrigações locais com um jurista | Página publicada e ligada no rodapé e no checkout | 👤 |
| A360-15 | Facturação | ? O site emite um **recibo HTML, que não é uma factura**. O Decreto Presidencial n.º 71/25 torna a facturação electrónica com software validado pela AGT obrigatória por fases (grandes contribuintes desde 2026-01-01; os restantes dos regimes Geral e Simplificado do IVA a partir de 2027-01-01, segundo a [Cegid](https://www.cegid.com/ao/blog/obrigatoriedade-faturacao-eletronica-angola/)) | `lib/receipt.js`, rota `/whatsapp/receipt` | P2 | Legal, finanças | — | Confirmar com a contabilidade se as vendas do site entram no software certificado; se for preciso, integrar a emissão da factura (não é aconselhamento jurídico nem fiscal) | Cada venda paga com factura emitida no sistema certificado | 👤 |
| A360-16 | Observabilidade | Sem monitorização de erros no navegador nem medição real (RUM): o **INP nunca foi medido em campo**, e um erro de JavaScript em casa de um cliente não chega a ninguém. Sem funil (vista → carrinho → checkout → pago) | Nenhum `onerror`/RUM no código; só o beacon do Cloudflare Web Analytics | P2 | Vendas, operação | — | `web-vitals` (LCP/INP/CLS) + `window.onerror`/`unhandledrejection` para uma rota da Edge Function com amostragem; eventos do funil no mesmo sítio | Painel com p75 por página e erros por versão | 📝 |
| A360-17 | Testes | Sem testes de ponta a ponta no navegador nem regressão visual; os 10 cenários da Fase 12 não estão automatizados | Nenhum `playwright.config` nem `*.spec.*` | P2 | Qualidade | — | Playwright numa pré-visualização do Pages com dados de teste: pesquisa, carrinho, checkout (convidado), rastreio, acesso negado, painel; capturas a 360/768/1280 | Job novo no CI, verde | 📝 |
| A360-18 | Desempenho | Cada visita faz 4 leituras de arranque à Edge Function (`/settings`, `/integrations`, `/chat/config`, `/payment-methods`), a **0,4–0,8 s p75 cada**, a partir de Angola (função em Paris, base em Estocolmo); `/admin/media-config` chamado 145 vezes em 24 h | Registos `function_edge_logs` de 24 h | P2 | Cliente | Uma rota por definição | Uma só rota pública de arranque, com `Cache-Control: s-maxage` e a cópia local com revalidação que já existe para as definições | ≤ 2 pedidos de arranque; p75 < 400 ms | 📝 |
| A360-19 | Sessão | ? 12 pedidos `401` a `staff_notifications` e 1 ao catálogo em 24 h: um token caducado enviado quando a aba volta do segundo plano faz falhar até leituras públicas | Registos `edge_logs` | P3 | Cliente | Provável: pedido antes da renovação do token | Renovar a sessão em `visibilitychange` antes de consultar, ou repetir uma vez depois de `refreshSession()` | 0 `401` em leituras públicas | 📝 |
| A360-20 | Categorias | ✔ Verificado, sem impacto: a navegação usa `/shop?category=…` (11 sítios), que agora herda o canonical da loja — o certo para filtros. `/shop/:category` só é usado pelo redireccionamento antigo de `/catalog/:category` | `App.jsx`, `MegaMenu.jsx` | — | — | — | Se um dia as categorias tiverem páginas próprias (texto, imagem), dar-lhes um slug e gerá-las no pós-build | — | ✔ |
| A360-21 | Segurança | Privilégios por omissão do Supabase: `anon` e `authenticated` com `TRUNCATE`, `TRIGGER` e `REFERENCES` nas tabelas `public` (o PostgREST não os usa e o RLS não cobre o `TRUNCATE`) | `information_schema.role_table_grants` | P3 | Segurança | Padrão da plataforma | Migração que os revoga (defesa em profundidade) | Cenário PGlite: `anon` sem `TRUNCATE` | 📝 |
| A360-22 | Segurança | Protecção contra palavras-passe vazadas desligada | Aviso `auth_leaked_password_protection` | P3 | Segurança | Só no plano Pro | Activar quando houver plano pago | Aviso desaparece | 👤 |
| A360-23 | Continuidade | Plano Free sem recuperação pontual (PITR); o backup semanal cifrado corre (✔ 2026-11-08), mas falta um restauro de ensaio registado | `backup-base-dados.yml`, [BACKUPS.md](../BACKUPS.md) | P3 | Dados | Plano | Restaurar o último backup num projecto à parte, uma vez por trimestre, e anotar o tempo | Registo do ensaio em BACKUPS.md | 👤 |
| A360-24 | Movimento | As animações do framer-motion (entradas da ficha, transições) não respeitam "reduzir movimento"; o CSS já respeita | Nenhum `MotionConfig` | P3 | Cliente | — | `<MotionConfig reducedMotion="user">` — mas no `App.jsx` puxa o bloco `vendor-motion` para o arranque de todas as páginas: medir antes, ou aplicar por página | LCP igual antes/depois | 📝 |
| A360-25 | Catálogo | Pesquisa e filtros correm no navegador sobre o catálogo inteiro: certo com 102 produtos, não com milhares | `useProductFilters.jsx` | P3 | Escala | Desenho inicial | Quando passar de ~1 000 produtos: pesquisa no servidor (`pg_trgm`/FTS) e paginação | — | 📝 |
| A360-26 | WhatsApp | O único envio por WhatsApp falhou (token que não é da Meta, 2026-11-07) | `notification_logs` | P3 | Operação | Token errado | Token permanente de *System User* ou desligar a integração | Envio de teste com `sent` | 👤 |
| A360-27 | Emails | ⚑ No telemóvel, o botão principal dos emails partia-se mal: a seta sozinha na segunda linha, ou "palavra-" / "passe →"; a etapa actual do seguimento usava "•", mais pequeno do que ✓ e ○ | Os 25 modelos desenhados aqui com o Chromium a 320, 360, 375 e 700 px | P3 | Marca | Espaço normal antes da seta | Palavras com hífen sem quebra e a seta colada à última palavra; "●" na etapa actual. Os 25 modelos: sem deslocamento horizontal, todas as imagens com `alt`, nenhum texto abaixo de 12 px | Modelos a 320 px sem quebras partidas | ✅ |

---

## F. Plano de melhoria

| Fase | O quê | Depende de | Risco | Esforço | Impacto | Critério de aceitação |
|---|---|---|---|---|---|---|
| **1. Críticas** (esta semana, dono) | A360-01, A360-02 email; A360-04 reconciliação; A360-05 MFA nas 4 contas; A360-07 contactos | Acesso ao DNS e ao painel do Supabase | Baixo | 1 dia | Muito alto | Encomenda de teste com email recebido; 0 entregues por pagar; 4/4 administradores com segundo passo; telefone no rodapé |
| **2. Comércio** | A360-03 gateway; A360-14 termos; A360-15 facturação | Contrato com o agregador; jurista; contabilidade | Médio | 2–4 semanas | Muito alto | Pagamento em sandbox confirmado por webhook; termos publicados; regra de facturação decidida |
| **3. Usabilidade e dados** | A360-13 catálogo; A360-20 categorias; A360-19 sessão | — | Baixo | 1 semana | Alto | ISBN nos livros que o têm; «Catálogo Geral» < 10 %; 0 `401` em leituras públicas |
| **4. Desempenho e medição** | A360-18 arranque; A360-16 RUM e erros | — | Baixo | 3–5 dias | Médio-alto | p75 de LCP < 2,5 s e INP < 200 ms **medidos em campo**, separados por telemóvel e computador |
| **5. Refinamento e regressão** | A360-17 E2E e capturas; A360-24 movimento; A360-21 privilégios; A360-23 ensaio de restauro; passagem visual no navegador | Fase 4 (para medir) | Baixo | 1 semana | Médio | CI com E2E verde; capturas sem diferenças por explicar |

---

## G. Comparação internacional (Fase 13)

| Referência | Princípio que serve aqui | Na Livraria hoje | O que **não** copiar |
|---|---|---|---|
| Amazon | Descoberta num catálogo grande: pesquisa tolerante, filtros por facetas, "quem viu também viu" | ✔ sugestões, filtros, relacionados, vistos recentemente · ⚑ dados por completar (A360-13) | A densidade de informação: com 102 títulos, menos é mais |
| Stripe | Formulários precisos: erro no campo, estado de cada botão, nada de "deu certo" antes de dar | ✔ validação no servidor com mensagens em português · ⚑ sem pagamento electrónico (A360-03) | Fluxos pensados para cartão: em Angola o essencial é a referência e o Multicaixa |
| Shopify | Operação: encomenda → pagamento → envio → reembolso num só sítio, com histórico | ✔ painel muito completo, pagamentos auditáveis | O excesso de módulos: a equipa é pequena; esconder o que não usa |
| Apple | Hierarquia e acabamento: uma acção principal por ecrã | ✔ tipografia Fraunces + Inter, ficha com acção clara · ∅ não revisto hoje | Imagens enormes que custam LCP em redes móveis |
| Linear | Rapidez percebida e consistência | ✔ cache de definições, cauda infinita com memória · ⚑ 4 leituras de arranque (A360-18) | Atalhos de teclado como funcionalidade principal |
| Vercel | Interfaces técnicas claras (estados, registos) | ✔ registo de segurança, vigilância de encomendas, versões da app | — |

**Contexto angolano.** Rede móvel com latência alta para a Europa (cada pedido conta mais do que
cada kilobyte), telemóveis de gama média (o INP importa), pagamento por referência/Multicaixa e
WhatsApp como canal principal. O que mais mudaria a conversão aqui: pagamento por referência
com confirmação automática (A360-03), um número de WhatsApp visível (A360-07) e a confirmação por
email/SMS (A360-01).

---

## H. O que este PR muda

| Ficheiro | Mudança | Achado |
|---|---|---|
| `scripts/seo-paginas.mjs`, `scripts/seo-catalogo.mjs` | `FIXED_PAGES` e `fixedPageFile()`; o pós-build escreve `shop.html`, `faq.html`… com canonical, título e descrição próprios, mesmo sem catálogo | A360-06 |
| `app/web/index.html` | `Organization` + `WebSite` em JSON-LD (bloco de dados: o CSP não o bloqueia; o pós-build troca os endereços nas pré-visualizações) | A360-08 |
| `app/web/src/lib/structuredData.js` (novo) | `productJsonLd`, `breadcrumbJsonLd`, `jsonLdString` — puras, com ISBN-13 validado, preço em AOA e `<` escapado | A360-08 |
| `app/web/src/pages/ProductDetailPage.jsx` | JSON-LD no `<Helmet>`; galeria em português; miniaturas com nome e `aria-current`; capa com `fetchpriority="high"` | A360-08, A360-11 |
| `app/web/src/components/SkipToContent.jsx` (novo), `Header.jsx`, `index.css` | "Saltar para o conteúdo" em todas as páginas da loja | A360-09 |
| `app/web/src/components/HeroSlider.jsx` | Parar/Retomar; começa parado com "reduzir movimento"; vídeo de fundo sem arranque automático nesse caso; `aria-roledescription`; 1.ª imagem com `fetchpriority="high"` | A360-10 |
| `ui/sheet.jsx`, `ui/spinner.jsx`, `ui/pagination.jsx` | Rótulos em português | A360-11 |
| `AboutPage.jsx`, `ContactPage.jsx` | "a Livraria Adventista" | A360-12 |
| `supabase/functions/app/emails.ts` | Botão principal: palavras com hífen sem quebra e a seta colada à última palavra (`buttonLabelHtml`); "●" na etapa actual | A360-27 |
| `.github/workflows/auditoria-visual.yml`, `scripts/auditoria-visual/capturar.mjs` (novos) | Auditoria visual da loja publicada com o Playwright no GitHub: capturas a 320–1440 px, LCP/CLS com rede e processador de telemóvel, consola, axe-core; resultados no ramo `auditoria-visual` | Fase 2.2 |
| Testes | `structuredData.test.js` (15), `SkipToContent.test.jsx` (4), `seo-paginas.test.mjs` (+6), `emails.test.ts` (+3) | — |

**Ordem de publicação.** Sem migrações. O merge publica o site pelo `deploy-cloudflare.yml` (o
pós-build passa a escrever 10 ficheiros a mais) e volta a publicar a Edge Function pelo
`deploy-supabase.yml`, só com a mudança do botão dos emails. Rollback: reverter o merge.

**Depois do merge, verificar** (2 minutos): `/faq` e `/shop` com o canonical certo (ver o código
da página); uma ficha no Rich Results Test; Tab na página inicial mostra "Saltar para o
conteúdo"; o carrossel pára com o botão no telemóvel.

---

## I. Por verificar na próxima passagem

1. **Passagem visual no navegador** (assim que o navegador da app ou o Claude in Chrome estiver
   ligado): capturas a 320, 360, 390, 768, 1024, 1280 e 1440 px das páginas principais; texto
   cortado, sobreposições, estados de foco; axe-core nas páginas novas.
2. **Core Web Vitals em campo**, a partir de Angola, em rede móvel: LCP, INP e CLS p75 por página.
3. **Painel com uma sessão de equipa** (conta de teste com `manager`): criar e editar produto,
   processar encomenda, confirmar pagamento, reembolso.
4. **Pagamento em sandbox**, quando houver gateway: sucesso, falha, cancelamento, reenvio do webhook.
5. **Emails nos clientes de email** (Gmail, Outlook, Apple Mail, telemóvel), quando A360-01 fechar.

---

*Auditoria feita por um agente de IA sobre o código, a base de dados (só leitura) e os registos.
Não substitui um teste de intrusão nem aconselhamento jurídico ou fiscal.*
