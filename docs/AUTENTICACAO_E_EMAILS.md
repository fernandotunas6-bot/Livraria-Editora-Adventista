# Autenticação e emails

Estado em 2026-11-02. Complementa [ARQUITETURA.md](ARQUITETURA.md) e [HANDOFF.md](HANDOFF.md).

## 00. Como pôr o email a sair (actualizado a 2026-11-07, domínio `.ao`)

**Estado em produção (2026-11-07): nenhum email saiu até hoje.** Em `notification_logs` só há
registos `skipped` ("Servidor SMTP não configurado"): `order_email_enabled` está desligado, o
fornecedor é `smtp` sem servidor e não há chave da Brevo, do Cloudflare nem do SendGrid. Os
emails da conta (Supabase Auth) também não chegam aos clientes — ver mais abaixo.

O domínio oficial é **livrariaadventista.ao**, com o DNS no Cloudflare (zona `cody`/`hadlee`,
conta <conta pessoal do dono>). O `.com` só redirecciona: não se usa para email.

**O SMTP não serve para os emails do site.** As Edge Functions do Supabase não abrem ligações de
saída nas portas 25 e 587 (e a 465 não é garantida), por isso a configuração que quase todos os
fornecedores indicam (porta 587) nunca entregaria nada. O site envia **por API HTTPS**, e o
painel recusa as portas 25 e 587 com uma explicação.

| Fornecedor | Custo | O que é preciso |
|---|---|---|
| **Brevo** (recomendado) | grátis até 300 emails/dia | conta grátis, domínio verificado, chave da API |
| **Cloudflare Email Sending** | plano Workers Paid (5 USD/mês, 3000 emails incluídos) | activar o envio no domínio, token da API. **Só transaccionais**: as campanhas não podem sair por aqui (regras do Cloudflare) |
| SendGrid | sem plano gratuito desde 2025 | chave da API |

### 1. Receber: `contacto@livrariaadventista.ao` (Cloudflare Email Routing)

É o endereço publicado no site, no rodapé dos emails, na política de privacidade e no contacto
das notificações push, e é para lá que vão as respostas dos clientes (o "Responder para" das
mensagens). **Enquanto o Email Routing não estiver activo, esse endereço não recebe nada**: a zona
ainda tem os MX e o SPF da Google, e o domínio não tem conta Google.

Cloudflare → zona `livrariaadventista.ao` → **Email → Email Routing** → regra `contacto` →
destino `<conta pessoal do dono>` (verificar o Gmail) → **"Adicionar registos e activar"**,
aceitando apagar os MX e o SPF da Google. Repetir para `loja@` se for esse o remetente.

### 2. Enviar: Brevo, passo a passo (dono da loja, ~15 minutos)

1. Criar conta em [brevo.com](https://www.brevo.com) com o email da loja.
2. **Senders, domains & dedicated IPs → Domains → Add a domain** → `livrariaadventista.ao`.
   A Brevo mostra os registos (código Brevo em TXT, DKIM, DMARC). No Cloudflare → DNS da zona
   `.ao`, criar cada um exactamente como aparece (**DNS only**, sem proxy). Voltar à Brevo e
   carregar em **Verify**.
3. **SMTP & API → API keys → Generate a new API key**. Copiar (só se vê uma vez).
4. No painel da loja → **Configurações → Comunicações**: fornecedor **Brevo**, colar a chave,
   remetente `loja@livrariaadventista.ao` (ou `contacto@`), nome "Livraria Adventista". Guardar.
5. **Emails → Enviar teste** para um Gmail e um Outlook. Confirmar que chegou à caixa de
   entrada e, em "Mostrar original", `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
6. Ligar "Activar email automático de confirmação".

### 3. Registos DNS da zona `.ao` (cuidados)

| Registo | Valor | Notas |
|---|---|---|
| MX `@` | os três do Email Routing (`route1/2/3.mx.cloudflare.net`) | criados pelo passo 1; tirar os da Google |
| TXT `@` (SPF) | `v=spf1 include:_spf.mx.cloudflare.net ~all` | **um só registo SPF por nome.** Se a Brevo pedir `include:spf.brevo.com`, junta-se ao mesmo: `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`. Dois registos `v=spf1` dão *permerror* e o SPF falha nos dois |
| TXT `brevo-code` / CNAME `brevo1._domainkey`, `brevo2._domainkey` | os que a Brevo mostrar | DKIM: é o que faz o DMARC passar |
| TXT `_dmarc` | `v=DMARC1; p=none; rua=mailto:contacto@livrariaadventista.ao` | um só. Começar em `p=none`; depois de 2–4 semanas de relatórios limpos, `p=quarantine` |

O Cloudflare Email Sending, se for usado, junta os seus registos no subdomínio `cf-bounce` e um
DMARC em `_dmarc`: se já existir um, fica o que existe.

### 4. Emails da conta (registo, recuperar palavra-passe)

Esses não saem pela Edge Function: saem pelo **Supabase Auth**, que precisa do seu próprio SMTP.
Sem ele, o correio do Supabase só entrega a membros da equipa do projecto (2 por hora) e em
inglês: **quem se regista por email nunca recebe a confirmação**. Aqui as portas não estão
bloqueadas, e a Brevo também serve: Supabase → **Authentication → Emails → SMTP Settings** → host
`smtp-relay.brevo.com`, porta `587`, utilizador e chave SMTP que a Brevo mostra em **SMTP & API →
SMTP**, remetente `loja@livrariaadventista.ao`, nome "Livraria Adventista".

Depois, `bash scripts/configurar-auth.sh` põe os modelos em português (`supabase/auth/templates`)
e o **Site URL** em `https://livrariaadventista.ao` (ainda por aplicar no painel: Authentication →
URL Configuration). Sem SMTP próprio o Supabase recusa mudar os modelos no plano gratuito.

## 0. Estado em produção (2026-11-02)

| | |
|---|---|
| Migrações | **Aplicadas** (até `20261102170000`), Local = Remote |
| Edge Function `app` | **Publicada**, com `emails.ts` e `emailTemplates.ts` |
| Site (Cloudflare Pages) | **Publicado** no commit `21915fd` |
| Agendador `pg_cron` | **A correr**, `*/5 * * * *`, verificado a receber `200` da função |
| Segredos do agendador | **Criados** (`EMAIL_QUEUE_TOKEN` na função, `email_queue_url`/`email_queue_token` no Vault) |
| `site_url` | **Definido** (`https://livraria-adventista.pages.dev`) — muda para `https://livrariaadventista.ao` quando o domínio estiver activo |
| Categorias de email | **Todas activas** |
| **SMTP / SendGrid** | **Bloqueado** — não há domínio de email (ver secção 0.1) |
| **`order_email_enabled`** | **Desligado** — ligar sem SMTP só gera registos "não enviado" |
| **SPF, DKIM, DMARC** | **Por configurar** no DNS do domínio |

> O que desbloqueia o email é o domínio `livrariaadventista.ao`, ainda por registar: sem
> domínio próprio não há SPF/DKIM nem remetente credível. Passos do registo e da delegação em
> [LANCAMENTO.md](LANCAMENTO.md), secção 7.

**Nenhum email sai enquanto o SMTP ou o SendGrid não estiverem configurados.** Tudo o resto
do caminho está montado e verificado: o agendador chama a função, a função reclama a fila, e
a fila responde. Falta só o fornecedor de correio na ponta.

## 0.1. PENDENTE — não há domínio de email

Verificado no DNS em 2026-11-02:

| Domínio | Nameservers | MX | SPF |
|---------|------------:|----|-----|
| `livrariaadventista.ao` | **0** | nenhum | nenhum |
| `livraria.ao` | **0** | nenhum | nenhum |
| `livraria-adventista.pages.dev` | — | nenhum | é do Cloudflare Pages, não serve email |

O `contact_email` da loja está como `contacto@livrariaadventista.ao`, **um domínio que não
existe**. Isto não é falta de credenciais: não há de onde enviar nem para onde responder.
Nenhum servidor aceita enviar em nome de um domínio não registado, e se aceitasse as
mensagens seriam recusadas na entrega.

### Caminhos possíveis

**(a) SMTP do Google Workspace** — `smtp.gmail.com:587` com palavra-passe de aplicação.
Funciona sem registar nada, porque `fata.adventist.org` já existe e está no Google:

```
MX:  ALT1.ASPMX.L.GOOGLE.COM
SPF: v=spf1 mx a include:spf.host-h.net ?all
```

É o domínio da conta que publica o Cloudflare. O remetente seria algo como
`livraria@fata.adventist.org`. Limite de ~2000 mensagens por dia. **Atenção:** esse SPF
termina em `?all` (neutro) e não inclui o Google — convém acertá-lo com quem gere o DNS.

**(b) SendGrid ou Brevo** — plano gratuito, ~100 mensagens/dia, com autenticação de domínio
própria. Melhor entregabilidade a prazo, mas precisa de um domínio controlado.

**(c) Registar o `.ao`** — o mais correcto para a imagem da loja, o mais demorado.

### O que falta depois de decidir

As credenciais preenchem-se em **Configurações → Comunicações** no painel, que já tem campos
para servidor, porta, utilizador, palavra-passe, remetente e chave do SendGrid. A seguir:
enviar um teste por `/admin/email/test`, confirmar no registo que saiu, ligar
`order_email_enabled` e correr uma encomenda de ponta a ponta.

**`order_email_enabled` fica desligado até lá.** Ligado sem fornecedor, cada encomenda
geraria um registo "não enviado" e daria a impressão de que o sistema funciona quando não
funciona.

## 1. Sessão

A sessão é do Supabase Auth (email e palavra-passe, ou Google). O `dataClient` expõe-na com a
API do antigo PocketBase (`pb.authStore`), e o `useAuth` passa-a ao resto da aplicação.

### O sinal `ready`

O `authStore` só conhece a sessão depois de o supabase-js terminar o arranque: ler o
armazenamento, renovar o token ou consumir o `#access_token=…` que a Google devolve. Até lá,
`isValid` é `false` — **não porque não haja sessão, mas porque ainda não se sabe**.

As páginas protegidas decidiam com essa informação incompleta e mandavam para `/login` quem
tinha sessão válida. Acontecia sempre a seguir ao login com a Google, que volta com a sessão
no endereço e não no armazenamento: o utilizador autenticava-se e caía no ecrã de entrada.

Agora:

| Peça | Onde | O que faz |
|------|------|-----------|
| `createReadyGate()` | `lib/authSession.js` | Sinal de uma só passagem, com recurso de 8 s para falhas de rede |
| `pb.authStore.isReady` / `.onReady()` | `lib/dataClient.js` | Resolve no primeiro evento de autenticação — ou logo no arranque, se a sessão e o perfil da mesma conta já estão guardados neste aparelho e o endereço não traz o regresso de uma entrada (`authReturnInUrl`) |
| `ready` | `hooks/useAuth.jsx` | O mesmo sinal, como estado de React |
| `sessionDecision()` | `lib/authSession.js` | `wait` → `login` → `forbidden` → `allow`, por esta ordem |
| `<SessionGate />` | `components/SessionGate.jsx` | Ecrã "A verificar a sua sessão…" enquanto é `wait` |

**Regra:** numa página protegida, nunca decidir antes de `ready`. Use `sessionDecision()` em
vez de testar `isAuthed` à mão — é onde a ordem está garantida, e está coberta por testes.

### Destinos de redireccionamento

`safeInternalPath()` valida tudo o que vai para `navigate()` ou para o `redirectTo` do OAuth.
Aceita só caminhos internos; recusa `https://…`, `//evil.com`, `/\evil.com` e caracteres de
controlo. É usada no `LoginPage`, no `loginWithGoogle` e em quem guarda o caminho de volta.

### Contexto preservado

Quem entra a partir do carrinho, do menu ou de uma ficha de livro volta à página onde estava
(`state.from`, via `currentPathWithQuery()`). O carrinho vive no armazenamento local, por isso
sobrevive à ida à Google e de volta. Quem abre `/login` já com sessão é encaminhado em vez de
ver o formulário outra vez.

### Entrar e criar conta num modal

`AuthDialogProvider` (`hooks/useAuthDialog.jsx`) abre o modal em qualquer página com
`openAuth({ mode, reason, defaultEmail, defaultName })`. O formulário é o mesmo da página
`/login` (`components/auth/AuthForm.jsx`). No fim, a pessoa fica onde estava, com o carrinho e o
que já tinha escrito.

| Onde | Motivo (`reason`) |
|---|---|
| Cabeçalho, menu, ícone no telemóvel, página de sugestões | — |
| Carrinho, entrega ao domicílio sem conta | `delivery`: abre por cima do carrinho; o Esc fecha só o modal |
| Avaliar um livro | `review` |
| Página de sucesso, compra feita sem conta | `order`, com o nome e o email da compra preenchidos |
| Convite automático | `nudge` |

**Convite automático** (regras em `lib/authPrompt.js`, com testes): só a quem não tem sessão,
na terceira ficha de livro vista nesta sessão, quatro segundos depois de a abrir e nunca por
cima de outro painel. Abre uma vez por sessão. Depois de fechado, volta passados 7 dias; depois
de fechado 3 vezes, passados 60. Não abre nas páginas de entrada, recuperação, painel, perfil,
rastreio, sucesso, confirmação da encomenda nem cancelamento de subscrição. Quem já entrou
neste navegador vê "Bem-vindo de volta" e a conta identificada (secção seguinte). Guarda-se o
email, o nome e como entrou, e isso não é sessão.

### No telemóvel: a sessão não cai, a conta é lembrada e a app entra sozinha (2026-11-08)

**A sessão não cai sem rede.** Ao abrir a app mais de uma hora depois, o token de acesso já
expirou e o supabase-js tem de o renovar. Sem rede (ou com rede fraca), a renovação falha e ele
avisa `INITIAL_SESSION` sem sessão — mas guarda-a, para tentar de novo. O `dataClient` tratava
esse aviso como "saiu": a pessoa via o ecrã de entrada e o perfil em cache era apagado. Agora
(`authEventAction` em `lib/authSession.js`):

| Aviso do supabase-js | Sessão guardada | O que a app faz |
|---|---|---|
| com sessão | — | `signed-in`: carrega o perfil |
| `INITIAL_SESSION` sem sessão | ainda lá, com `refresh_token` | `keep`: a conta continua à vista (`pb.authStore.offline`) |
| `SIGNED_OUT` (o servidor recusou a renovação) ou nada guardado | — | `signed-out`: sai |

Com a sessão e o perfil da mesma conta guardados, a conta aparece logo, sem esperar pela rede
(antes, até 8 s em "A verificar a sua sessão…"). Quando a rede volta (`online`) ou a pessoa volta
à app, a renovação é tentada logo: o supabase-js guarda a última falha durante um minuto e
respondia com ela, e o perfil mostrava as encomendas vazias com a rede já de volta.

**A sessão terminou sem a pessoa sair.** Um `SIGNED_OUT` com a conta à vista e sem "Sair" nos
últimos 30 s (marca `livraria_saida`, partilhada pelos separadores) é o servidor a terminá-la:
"Terminar sessão em todos os aparelhos" noutro sítio, palavra-passe mudada, conta suspensa. A
app diz "A sua sessão terminou neste aparelho", com "Entrar" já na conta
(`pb.authStore.onSessionEnded`, no `AuthDialogProvider`).

**A conta lembrada** (`livraria_teve_conta`, `readHadAccount`/`hadAccountValue` em
`lib/authPrompt.js`): o email, o nome e como entrou da última vez (`email` ou `google`, lido do
`amr` do token por `sessionMethod`). Nada disto dá acesso. O formulário (`AuthForm`) mostra
"Bem-vindo de volta, Maria" com o email em vez do campo, e:
- conta de palavra-passe: o cursor vai para a palavra-passe na página `/login` (no modal não, que
  também abre sozinho), e o email segue num campo `autocomplete="username"` escondido — é por ele
  que o gestor de palavras-passe do Chrome, do iCloud ou da Samsung sabe que conta preencher;
- conta da Google: "Continuar com Google" dentro do cartão, com `login_hint` (a Google abre já
  nessa conta, em vez da lista de contas do telemóvel); a palavra-passe fica atrás de "Entrar com
  a palavra-passe";
- "Não é Maria? Usar outra conta" esquece a conta neste aparelho (num telemóvel partilhado, o
  próximo não vê o nome de quem entrou antes).

Fora do cartão, o campo do email é `autocomplete="username"` a entrar e `email` no registo, e os
campos têm `name`. Uma palavra-passe errada com a Google ligada acrescenta "Se criou a conta com a
Google, use «Continuar com Google»".

**Registo com um email que já tem conta.** Com a confirmação de email activa, o Supabase não dá
erro (para não revelar quem tem conta) e devolve um utilizador sem identidades, sem enviar email.
A app dizia "Enviámos um link de confirmação" e a pessoa esperava por um email que não vinha.
Agora (`createUser` → `alreadyRegistered`) o formulário passa a "Entrar", com "maria@… já tem
conta" e a palavra-passe escrita (muitas vezes é a mesma). Já antes, com a confirmação desligada,
o erro "Já existe uma conta com este email" dizia o mesmo: não se revela nada de novo.

**Entrada automática** (`lib/savedCredentials.js`, Credential Management API — Chrome, Edge,
Samsung Internet e a app instalada no Android):
- depois de entrar, criar conta, mudar ou recuperar a palavra-passe, a app pede ao navegador que
  guarde a conta (`navigator.credentials.store`): é o "Guardar palavra-passe?", que numa página que
  não muda de endereço nem sempre aparecia;
- ao abrir a app sem sessão, uma vez por arranque, pede em silêncio a conta guardada
  (`mediation: 'silent'`) e entra com ela: "Bem-vindo de volta, Maria — entrou automaticamente com
  a conta guardada neste aparelho". O navegador só a entrega se houver uma só conta guardada para
  o site e a pessoa não tiver saído;
- nunca depois de "Sair" nem depois de o servidor terminar a sessão (a marca `livraria_saida` só se
  apaga quando a pessoa volta a entrar), nem na recuperação de palavra-passe ou no regresso de uma
  entrada falhada; e nesses casos a app pede também ao navegador que não volte a entrar sozinho
  (`preventSilentAccess`). Sem isto, "Terminar sessão em todos os aparelhos" para um telemóvel
  perdido não serviria de nada, se lá estivesse a palavra-passe guardada;
- palavra-passe guardada já errada: o navegador deixa de a oferecer; sem rede: tenta-se no próximo
  arranque.

Safari (iPhone) e Firefox não têm esta API: lá fica a sessão guardada (que não cai, como acima) e
o teclado preenche a palavra-passe. Na app instalada, os dados do site (e a sessão) pedem para
não ser apagados quando o telemóvel fica sem espaço (`navigator.storage.persist`, sem pergunta
no Chrome e no Safari; num separador normal não se pede).

**Limites:** no iPhone, a app instalada no ecrã inicial tem armazenamento próprio, separado do
Safari — na primeira vez que se abre a app instalada, entra-se uma vez. Quem entra com a Google não
tem entrada silenciosa (seria um redireccionamento para a Google ao abrir a app): fica a sessão
guardada e o `login_hint`. `lastRefreshFailure` é um campo interno do auth-js 2.11x; se mudar de
nome numa versão futura, fica a tentativa normal do supabase-js, de minuto a minuto.

**A confirmação por email não chega aos clientes (verificado a 2026-11-05).** No Auth,
`mailer_autoconfirm` está `false` e não há SMTP próprio. O correio do Supabase só entrega a
membros da equipa do projecto, até 2 por hora. Quem se regista por email fica à espera de um
link que não vem. O modal põe o Google em primeiro lugar e, depois do registo, sugere-o se o
email não chegar. A correcção é configurar SMTP no Auth ou ligar a confirmação automática:
decisão do dono, e o modo automático recusa mudar a configuração do Auth.

## 2. Emails

### Onde está o quê

| Ficheiro | O quê |
|----------|-------|
| `supabase/functions/app/emails.ts` | Moldura: cabeçalho, emblema, blocos, botões, rodapé; gera HTML **e** texto simples |
| `supabase/functions/app/emailTemplates.ts` | Um modelo por acontecimento real da loja |
| `supabase/functions/app/emails.test.ts` | 48 testes, incluídos no `npm test` |
| `index.ts` → `sendLetter()` | Envia um modelo e regista o resultado em `notification_logs` |

### Regras da moldura

Tabelas e CSS em linha (o Outlook usa o motor do Word; o Gmail descarta `<style>`). Nada de
SVG, JavaScript nem animações. **A mensagem tem de se ler sem imagens** — o emblema de cada
tipo é um caracter numa célula de tabela, não uma imagem.

Os símbolos vêm de `SAFE_SYMBOLS`, verificados no ecrã. Não acrescentar nenhum sem o ver
desenhado: a primeira versão usava `⚿` (U+26BF) na recuperação de palavra-passe e saía um
bloco de riscas, porque esse caracter não tem glifo em Arial, Helvetica nem Segoe UI.

**Ilustrações próprias** entram por `heroImageUrl` (imagem estática, WebP ou PNG, servida por
`https:`), com o emblema como recuo. O ponto de extensão está pronto; as imagens em si ainda
não existem.

`formatKz()` escreve os valores à mão (`13.000,00 Kz`). O `toLocaleString("pt-AO")` que estava
antes devolvia o separador de milhares do ICU daquele runtime — no Node dá espaço fino — e o
total de uma compra não pode mudar de formato com a máquina que gerou a mensagem.

### Modelos e quando saem

| Modelo | Disparado por |
|--------|---------------|
| Boas-vindas | `POST /account/welcome`, pedido pelo cliente no primeiro acesso |
| Conta criada (convite) · Recuperar palavra-passe | `sendAccessLink()`, pelo painel de utilizadores |
| Encomenda recebida / confirmada | `POST /checkout` |
| Pagamento confirmado · Reembolso | `POST /admin/orders/payment-status` (`paid` / `refunded`) |
| Palavra-passe alterada | `POST /account/password-changed-notice`, pedido pelo site depois de a mudar |
| Email da conta alterado | `POST /account/email-change-notice` (cliente) e `POST /admin/users/update` (equipa); vai para o endereço **antigo** |
| Novo acesso | `POST /account/session-notice`, pedido pelo site ao abrir sessão (ver abaixo) |
| Actividade suspeita | `POST /admin/users/end-sessions` com `suspicious: true` |
| Conta suspensa · Conta reactivada | `POST /admin/users/status` |
| Conta encerrada | `POST /admin/users/delete`, depois de a conta ser apagada |
| A preparar · Expedida · Em trânsito · Saiu para entrega · Entregue · Cancelada | `POST /delivery-event` |
| Entregue (confirmação do comprador) | `POST /confirm-delivery` |
| Campanhas e avisos | `notifyContact()` |
| Teste | `POST /admin/email/test` |

Nos levantamentos na loja ("expedida" → "Pronta para levantamento") o texto e a linha de
progresso mudam: falar de trânsito a quem vai ao balcão não diz nada.

### Novo acesso

O aparelho é o navegador e o sistema ("Chrome em Android"), lido do `User-Agent` do pedido,
guardado em hash em `account_devices`. A versão e o IP ficam de fora: mudam a cada
actualização e a cada troca de rede, e o aviso passava a sair todas as semanas para o mesmo
telemóvel. A primeira vez que uma conta usa isto só regista o aparelho, sem email.

A loja **não decide sozinha** o que é actividade suspeita. O aviso sai quando alguém da
equipa termina as sessões da conta no painel e marca "por actividade suspeita".

### Textos editáveis e versões

No painel dos modelos de email, por baixo da pré-visualização, edita-se o assunto, o título,
o subtítulo e os parágrafos de cada modelo (menos campanhas e teste). Os detalhes, totais,
etapas e botões continuam a vir dos dados. Os marcadores são `{nome}`, `{loja}`,
`{encomenda}`, `{total}`, `{email_novo}` e `{detalhe}`.

Cada gravação é uma linha nova em `email_template_versions`. Está em vigor a de versão mais
alta. "Voltar a esta" e "Repor texto de origem" gravam também uma versão nova, por isso
nada se perde e tudo se pode desfazer. `content` nulo quer dizer texto de origem. Os textos
entram em `sendLetter`, o único sítio por onde todos os modelos saem. Se a tabela não
existir ainda, os emails saem com o texto de origem.

### Terminar sessão em todos os aparelhos

- **O cliente**, em Perfil → Segurança: `supabase.auth.signOut({ scope: 'global' })`.
- **A equipa**, no painel de utilizadores: `POST /admin/users/end-sessions`, que chama
  `admin_end_user_sessions()` (apaga `auth.sessions` e `auth.refresh_tokens` da conta).
  Suspender uma conta também termina as sessões.

Nos dois casos, os tokens de acesso já emitidos só deixam de servir quando expiram (uma hora,
por omissão).

### Idempotência

Cada envio leva uma `dedupe_key` (`order:created:<id>`, `order:status:<id>:<estado>`,
`account:welcome:<id>`). O índice único em `notification_logs` cobre só os envios com
`status = 'sent'`: um falhado pode ser repetido, um entregue não. É o que impede duas
confirmações da mesma encomenda quando um pedido é repetido ou a função reinicia a meio.

A recuperação de palavra-passe **não** leva chave: cada pedido novo gera um link novo, e o
anterior deixa de servir.

### O que é preciso configurar para isto sair

Nada disto envia nada enquanto, em **Configurações**:

1. `order_email_enabled` estiver desligado;
2. não houver servidor SMTP nem chave SendGrid;
3. `site_url` estiver vazio — sem ele os botões dos emails não têm destino (também se pode
   definir a variável de ambiente `SITE_URL` na Edge Function).

Falta ainda, do lado do domínio, **SPF, DKIM e DMARC**: sem eles as mensagens vão para o lixo.

## 3. O que não existe neste sistema

O esquema tem `orders`, `stock_books`, `physical_stores` e `payment_methods`, e PDFs para
descarregar (`downloads`, sem email próprio: o PDF pago aparece no perfil quando a encomenda
fica paga). **Não há** licenças, vendedores nem comissões — não há modelos de email
para isso porque não haveria nada que os chamasse. Se essas áreas forem criadas, os modelos
seguem o mesmo padrão: uma função em `emailTemplates.ts` e o disparo na rota que muda o estado.

## 4. Painel de comunicações

**Integrações → Modelos de email** (`components/admin/EmailTemplatesPanel.jsx`). Exige
`manage_settings`.

- Lista dos modelos por área (Conta, Encomenda, Entrega, Outros).
- Pré-visualização em computador e telemóvel, e a versão em texto simples.
- Envio de teste para um endereço à escolha.
- Aviso em destaque com o que falta para as mensagens saírem de facto.

O HTML vem de `GET /admin/email/preview`, que o compõe com as **mesmas funções que enviam de
verdade** (`PREVIEW_TEMPLATES` em `emailTemplates.ts`). Montar um exemplo no frontend daria
dois sítios a divergir, e o gestor veria algo que o cliente nunca recebe. A pré-visualização
corre num `<iframe sandbox="">`, sem scripts.

**Integrações → Registo de envios** ganhou o botão **Reenviar**, que repete a mensagem tal
como foi composta (`POST /admin/email/resend`). Reenvia o conteúdo guardado e não o volta a
compor: a encomenda pode ter mudado entretanto, e o que se quer é repetir a mensagem que
falhou, não enviar outra diferente. As campanhas ficam de fora — repetir um envio em massa à
mão passaria por cima da verificação do consentimento.

## 5. Site novo com função antiga

O site e a Edge Function são publicados por caminhos diferentes — Cloudflare Pages e
Supabase —, por isso há sempre uma janela em que o site novo fala com a função antiga. Hoje
essa janela está aberta: o Actions está bloqueado por facturação e a função publicada é
anterior às rotas deste trabalho (confirmado: `/health` responde 200,
`/admin/orders/payment-status` responde 404).

`lib/apiCompat.js` → `isMissingRoute(err)` distingue "esta rota ainda não existe" de "correu
mal". Testa a **mensagem** e não só o código 404: as rotas devolvem 404 também quando o
registo não existe ("Encomenda não encontrada."), e confundir os dois esconderia um erro
verdadeiro.

Quem depende de uma rota nova trata o caso:

- **Estado do pagamento**: grava na tabela como antes e avisa que o cliente não foi
  notificado. Uma funcionalidade a menos seria pior do que um aviso a mais.
- **Modelos de email**: mostra o que é preciso fazer ("Publique a Edge Function") em vez de
  um "Rota não encontrada" seco.
- **Boas-vindas**: deixa de insistir nessa sessão — a resposta será a mesma até haver deploy.

O teste `lib/apiRoutes.test.js` compara as rotas que o frontend chama com as que o
`index.ts` regista. Não substitui o deploy, mas apanha um nome trocado ou um caminho
renomeado só de um lado.

## 6. Categorias e cancelamento de subscrição

### Categorias opcionais

`OPTIONAL_CATEGORIES` (em `emails.ts`) tem as **únicas** que a loja pode desligar:

| Chave | O quê |
|-------|-------|
| `welcome` | Boas-vindas a quem cria conta |
| `order_progress` | A preparar, expedida, em trânsito, saiu para entrega |
| `campaign` | Campanhas e novidades |

Tudo o resto sai sempre: a confirmação da encomenda, o pagamento, a **entrega**, o
**cancelamento** e as mensagens de conta. São a prova de uma compra e o acesso a uma conta.

A regra vive em `isCategoryEnabled()` e é verificada em `sendLetter()` — num só sítio, e não
em cada ponto de envio, onde uma categoria esquecida seria uma mensagem a sair depois de a
loja a ter desligado. Entre as opcionais, **só `false` explícito desliga**: configuração em
falta, nula ou mal formada deixa tudo a funcionar. Um envio travado por categoria fica em
`notification_logs` com `status = 'skipped'` e o motivo.

O painel liga e desliga em **Integrações → Modelos de email**
(`GET`/`POST /admin/email/categories`). A rota só aceita as chaves conhecidas: um valor
qualquer vindo do pedido não fica guardado a fingir-se de categoria.

### Cancelamento de subscrição

Só nas mensagens de marketing. Pôr o link numa confirmação de encomenda convidaria a
cancelar o que não se pode cancelar, e ensinaria o cliente a ignorá-lo onde ele conta.

- `contacts.unsubscribe_token`: 64 caracteres, opaco, por contacto, revogável, criado por
  um trigger. Dois UUID v4 em vez do `random()` que o `gen_record_id` usa — `random()` é
  previsível a partir do estado do gerador, e com isso alguém poderia cancelar a subscrição
  de outra pessoa.
- O link é `/unsubscribe?t=<token>`. **O email não vai no endereço**: ficaria exposto nos
  registos do servidor, no histórico do navegador e em quem recebesse a mensagem
  reencaminhada.
- `POST /unsubscribe` é pública e limitada por IP — quem quer sair de uma lista não deve ter
  de criar conta. Responde sempre o mesmo com um token inválido: dizer "não existe"
  transformaria a rota num meio de confirmar se um token é de alguém.
- A página confirma com um **POST**, e não ao abrir o link: alguns servidores de correio
  seguem os endereços das mensagens para os analisar, e com um GET a cancelar, uma dessas
  visitas dava baixa de quem nunca carregou em nada.
- `notifyContact()` verifica `marketing_opt_out_at` **no envio**, e não só em quem escolhe
  os destinatários: uma lista montada antes do cancelamento voltaria a apanhá-lo.
- As campanhas levam `List-Unsubscribe` e `List-Unsubscribe-Post: One-Click`, que os clientes
  de email usam para mostrar o botão próprio de cancelamento, e que o Gmail e o Yahoo exigem a
  quem envia em volume. **O cabeçalho aponta para a API** (`<função>/unsubscribe?t=<token>`), e
  não para a página: o botão do Gmail faz um POST com o corpo `List-Unsubscribe=One-Click`
  (RFC 8058), sem correr JavaScript, e a página do site é estática — até 2026-11-07 o POST não
  chegava a código nenhum e o cliente continuava inscrito. A rota `POST /unsubscribe` aceita o
  token no corpo (página) ou no endereço (um clique), com um limite à parte para os servidores
  do correio; `GET /unsubscribe?t=…` só redirecciona para a página de confirmação. Ver
  `listUnsubscribeHeaders()` em `emailTemplates.ts`, com testes.

## 7. Fila de recuperação

O envio continua **imediato**: o checkout tenta mandar a confirmação na hora, e a resposta
diz se saiu. A fila (`email_queue`) é a rede por baixo — quando o SMTP está em baixo ou o
fornecedor responde 429, a mensagem fica guardada para ser repetida, em vez de se perder num
registo `failed` que ninguém voltava a olhar.

### O que entra e o que não entra

`isRetriableFailure(source, status, message)` decide. **A origem é passada e não adivinhada**,
porque o mesmo número significa o oposto conforme o lado:

| | HTTP | SMTP |
|---|---|---|
| `429`, `408`, `4xx` | repete (ritmo) / não repete (pedido inválido) | repete — "tente mais tarde" |
| `5xx` | repete — servidor em baixo | **não repete** — `550` é "essa caixa não existe" |
| sem resposta | repete — falha de ligação | repete |

Insistir num endereço que não existe não o faz aparecer, e prejudica a reputação do domínio
junto dos fornecedores de correio.

Espera entre tentativas: 1 min → 5 min → 15 min → 1 h → 3 h, até 5 tentativas.

### Concorrência

`claim_email_jobs()` reclama um lote com `for update skip locked`. É isso que impede duas
instâncias da Edge Function, a correr ao mesmo tempo, de enviarem a mesma mensagem duas vezes
ao mesmo cliente. A função devolve também o que ficou preso em `sending` há mais de 5
minutos — uma função que morreu a meio do envio.

### Quem a faz correr

Esta Edge Function não tem processo entre pedidos, por isso alguém tem de a chamar. Há dois
caminhos:

- **À mão**, no painel: botão **Tentar agora** → `POST /admin/email/queue/run`.
- **Sozinha**, pelo `pg_cron`, de 5 em 5 minutos → `POST /cron/email-queue`.

O agendador usa uma rota própria, e não a do painel, porque o `pg_cron` não tem sessão nem
token do Supabase Auth. Autentica-se com um segredo partilhado que não abre mais nada da API.
Sem esse segredo definido, a rota responde 404 como qualquer caminho desconhecido — responder
"falta configurar" anunciava a quem passasse que existe ali algo por fechar.

A comparação do segredo é feita em tempo constante (`secretsMatch`): um `===` sai no primeiro
caracter diferente, e essa diferença de tempo permite descobrir o segredo caracter a caracter.

#### Pôr o agendador a funcionar

A migração cria a extensão, a função e o agendamento, mas **não traz segredos** — não se
escrevem segredos no repositório. Faltam três passos, uma vez:

**1. Gerar um token** (qualquer valor longo e aleatório):

```bash
openssl rand -hex 32
```

**2. Dá-lo à Edge Function.** No painel do Supabase → Edge Functions → `app` → Secrets:

```
EMAIL_QUEUE_TOKEN = <o valor gerado>
```

**3. Guardar o endereço e o mesmo token no Vault**, no SQL Editor do Supabase:

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/app/cron/email-queue',
  'email_queue_url'
);
select vault.create_secret('<o valor gerado>', 'email_queue_token');
```

O painel diz em que estado está — sem agendador, agendado mas sem segredos, ou a correr —
na secção **Fila de recuperação**. Para ver pelo SQL:

```sql
select jobname, schedule, active from cron.job where jobname = 'fila-de-emails';
select status, return_message from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'fila-de-emails')
 order by start_time desc limit 5;
```

#### A migração não bloqueia deploys

Cada passo de `20261102140000_agendador_fila_emails.sql` está envolvido em tratamento de
erro. Se o `pg_cron` ou o `pg_net` não estiverem disponíveis, fica um aviso no registo e as
migrações seguintes continuam. Uma migração que rebenta bloqueia todas as outras, e o preço
de a fila ficar manual é muito menor do que o de o `db push` parar.

## 7.1. Visual da loja e sugestões de livros

**Moldura** (`emails.ts`): cabeçalho no azul-escuro do site com o logótipo branco, faixa de livros a toda a largura, corpo marfim com títulos em serifa (Source Serif 4 onde estiver instalada, senão Georgia) e um filete dourado, botão azul-petróleo e rodapé escuro. As regras de compatibilidade de cima mantêm-se (tabelas, CSS em linha, legível sem imagens).

**Faixas de livros** (`doc.banner`): recortes dos banners da galeria da loja, no bucket público `media`, em `email/`: `hero-encomenda.jpg` (encomendas, pagamento, entrega), `hero-conta.jpg` (boas-vindas e conta) e `hero-mensagem.jpg` (campanhas, contactos, teste). O logótipo do cabeçalho é `email/logo-light.png` quando o painel não tem outro. Para trocar as faixas: mudar a lista em `scripts/email/render-heroes.cjs`, correr `node scripts/email/render-heroes.cjs <pasta>` e enviar os JPEG para o mesmo caminho.

**Sugestões de livros** (`doc.suggestions`): quatro livros no fim da mensagem, com capa, autor, preço e link para `/product/:id`, mais "Ver todas as sugestões" para `/sugestoes`. O `sendLetter` acrescenta-as (e a faixa) em `decorateLetter`, conforme o contexto:

| Com sugestões | Sem sugestões |
|---|---|
| encomenda, estado da encomenda, pagamento, recibo, boas-vindas, campanhas, contactos, teste | convite e recuperação de palavra-passe (são de segurança) |

A ordem vem de `suggestions.ts` (`rankSuggestions`, com testes):

1. Lista de desejos e livros vistos, ainda não comprados (no máximo metade do bloco).
2. Livros dos géneros do que comprou, guardou e viu.
3. Novidades.

Nunca sugere o que o cliente já comprou. Prefere livros com capa a sério: `suggestable_books()` devolve o tamanho do ficheiro da capa, e capas com menos de 10 KB (vazias, há dezenas no catálogo) ficam para o fim. Sem `site_url`, sem histórico ou se a leitura falhar, o email sai na mesma, sem o bloco.

**Livros vistos:** `POST /catalog/view` com sessão grava em `book_views` (`record_book_view`, só service role). Sem sessão, contam os vistos que a loja já guarda no browser (`lib/recentlyViewed`), que só saem para `POST /recommendations`.

**Página `/sugestoes`** (`SuggestionsPage.jsx`, no menu da conta como "Sugestões para si"): "Escolhidos para si", "Vistos recentemente" e "Novidades", a partir de `POST /recommendations`, que devolve ids; a página lê os livros com as regras de visibilidade de sempre.

Migrações: `20261105052817_livros_vistos`, `20261105053543_livros_para_sugestoes` (aplicadas).

## 8. Por fazer

- **Verificar o agendador num projecto a sério.** O `pg_cron` e o `pg_net` estão agendados
  pela migração, mas isto nunca correu contra uma base de dados: a migração foi escrita para
  não falhar se as extensões não existirem, e só o `db push` dirá qual dos casos se aplica a
  este projecto.
- **Webhooks do fornecedor** (entregue, devolvido, marcado como spam): o estado de entrega
  real não é conhecido.
- **Aplicar a migração `20261105064252_textos_emails_aparelhos_sessoes.sql` e publicar a
  Edge Function.** Sem a migração, os emails saem com o texto de origem, não há aviso de
  novo acesso e "terminar sessões" pela equipa responde com erro.
- **O painel novo não foi verificado a funcionar.** Passa lint, build e testes, mas as rotas
  `/admin/email/templates`, `/preview` e `/resend` só respondem depois de a Edge Function ser
  publicada, e esta máquina não tem credenciais do Supabase nem um `app/web/.env`.
- **Preferências por canal e por tipo de mensagem** para o próprio cliente gerir no perfil:
  hoje o cancelamento é tudo-ou-nada para as campanhas.
- **Verificação em Gmail, Outlook e Apple Mail**: a moldura segue as regras conhecidas e está
  coberta por testes, mas não foi aberta nesses clientes.
