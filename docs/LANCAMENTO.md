# Guia de Lançamento — Livraria Adventista

Checklist para pôr a loja em produção com o Supabase (backend) e o Cloudflare Pages (site), com **WhatsApp Business API**, **email automático** e **push PWA**.

---

## 1. Pré-requisitos

| Item | Detalhe |
|------|---------|
| Supabase | Projecto `bggqkjjqbjhbjsckzopj` (já criado, com esquema e dados) |
| Cloudflare | Conta com Pages; o projecto é criado pelo primeiro deploy |
| GitHub | Conta sem bloqueios de pagamento (o Actions tem de correr) |
| Domínio | `livrariaadventista.ao` (principal) e `livrariaadventista.com`, ambos no Cloudflare Pages — ver secção 8.1 |
| Meta Business | Conta verificada + app WhatsApp Cloud API (opcional) |
| Email | Servidor SMTP (Hostinger, Brevo…) ou SendGrid |
| Google Cloud | ID de cliente OAuth para o login com Google |

---

## 2. Segredos e variáveis do GitHub Actions

Em **Settings → Secrets and variables → Actions** do repositório:

| Tipo | Nome | Valor |
|------|------|-------|
| Variável | `VITE_SUPABASE_URL` | `https://bggqkjjqbjhbjsckzopj.supabase.co` |
| Variável | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave *publishable* (Supabase → API Keys) |
| Variável | `CLOUDFLARE_PAGES_PROJECT` | Ex.: `livraria-adventista` |
| Variável | `SUPABASE_PROJECT_REF` | `bggqkjjqbjhbjsckzopj` |
| Secret | `CLOUDFLARE_API_TOKEN` | Token com *Cloudflare Pages: Edit* |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| Secret | `SUPABASE_ACCESS_TOKEN` | Token pessoal do Supabase (Account → Access Tokens) |
| Secret | `SUPABASE_DB_PASSWORD` | Palavra-passe da base de dados |

Se faltar algum, os workflows de deploy param logo no início e dizem qual é.

---

## 3. Supabase → Authentication

1. **Providers → Google:** activar com o Client ID e o Secret da Google Cloud.
   Na Google Cloud (APIs e serviços → Credenciais → ID do cliente OAuth → Aplicação Web), o URI de redireccionamento autorizado é:
   `https://bggqkjjqbjhbjsckzopj.supabase.co/auth/v1/callback`
2. **URL Configuration:** Site URL = domínio do site; Redirect URLs = `https://<domínio>/**`.
3. **Emails → SMTP:** configure um servidor SMTP próprio. O serviço de email incluído no plano grátis só envia para membros da equipa do Supabase, por isso os clientes não recebem a confirmação de registo nem a recuperação de palavra-passe.

---

## 4. WhatsApp Business API (envio automático)

### 4.1 Meta for Developers

1. Crie uma app em [developers.facebook.com](https://developers.facebook.com)
2. Adicione o produto **WhatsApp** → **Cloud API**
3. Obtenha:
   - **Phone Number ID** (WhatsApp → API Setup)
   - **Access Token permanente** (System User + token sem expiração)
4. (Recomendado) Crie um **template** aprovado, ex. `order_confirmation`:
   - Corpo: `Olá {{1}}, a sua encomenda {{2}} foi confirmada. Total: {{3}}. Obrigado!`
   - Idioma: `Portuguese (Portugal)` → código `pt_PT`

### 4.2 Configurar na loja

1. Entre como administrador → **Admin → Sistema → Integrações**
2. Active **WhatsApp Business API**
3. Preencha Phone Number ID + Access Token
4. Active **Envio automático (checkout + CRM)**
5. (Opcional) Active **Usar template Meta** + nome/idioma do template
6. Clique **Enviar mensagem de teste** com o seu número

O token fica no servidor: só administradores o vêem, e a loja nunca o envia para o browser.

### 4.3 O que passa a ser automático

- Confirmação de encomenda no checkout (para o telefone do cliente)
- Recibo por WhatsApp na página de sucesso
- Notificações de contactos e campanhas
- Cada envio fica em **Integrações → Logs** (enviado, falhou ou não enviado)

---

## 5. Email automático

1. **Admin → Sistema → Configurações → Email de confirmação de encomenda**
2. Active o envio e escolha o provedor:
   - **SMTP:** host, porta, utilizador, palavra-passe, email e nome do remetente
   - **SendGrid:** API Key (`SG....`), email e nome do remetente
3. Em **Integrações → Logs**, use **Testar Email** para confirmar.

Este email é o da loja (confirmações, recibos, links de acesso criados no painel). O email de registo e de recuperação de palavra-passe é o do Supabase Auth (ponto 3).

---

## 6. Push PWA

1. Gere um par de chaves VAPID em [vapidkeys.com](https://vapidkeys.com)
2. **Admin → Sistema → Configurações → Notificações Push (PWA)**
3. Active push + cole a chave pública e a privada
4. Os clientes activam em **Perfil → Notificações Push**

---

## 7. Deploy

Tudo é automático a partir do GitHub:

| Quando | O que acontece |
|--------|----------------|
| Pull request para `main` | `ci.yml`: lint, build e `deno check` da Edge Function |
| Push para `main` | `deploy-cloudflare.yml`: build e publicação no Cloudflare Pages (cria o projecto na primeira vez) |
| Push para `main` com mudanças em `supabase/` | `deploy-supabase.yml`: `supabase db push` e publicação da Edge Function `app` |

Para publicar a Edge Function à mão (com um token do Supabase):

```bash
npx supabase functions deploy app --project-ref bggqkjjqbjhbjsckzopj --no-verify-jwt
```

---

## 8. Verificação final

| Teste | Como verificar |
|-------|----------------|
| Checkout | Compra teste → o cliente recebe WhatsApp e email; o envio aparece em Integrações → Logs |
| API | `GET https://bggqkjjqbjhbjsckzopj.supabase.co/functions/v1/app/health` |
| Login | Registo com email (chega a confirmação) e login com Google |
| Utilizadores | Admin → Utilizadores e Clientes: criar conta, link de acesso, suspender |
| Gestor | Criar um gestor só com "Encomendas" e confirmar que não vê o resto |
| Recibo | Página `/success` → "Recibo enviado para o seu WhatsApp" |
| Push | Perfil → activar notificações → compra teste |
| Rastreio | `/track` com o número da encomenda |

---

## 8.1 Domínio `livrariaadventista.ao`

Estado em 2026-11-05 (nameservers trocados no registador; o `.ao` ainda responde NXDOMAIN — a zona `.ao` foi publicada pela última vez às 01:00 UTC):

| Peça | Estado |
|------|--------|
| Zona Cloudflare `livrariaadventista.ao` | Criada, **pendente** (`unresolvable`): o registo .ao ainda não conhece o domínio |
| DNS na zona | `CNAME @` e `CNAME www` → `livraria-editora-adventista-ben.pages.dev`, com proxy |
| Projecto Pages `livraria-editora-adventista` | `livrariaadventista.ao` e `www.livrariaadventista.ao` adicionados (ficam a validar até a zona activar) |
| `livrariaadventista.com` | Activo, a servir o mesmo projecto Pages |
| Supabase Auth | Redirect URLs já incluem `.ao`, `.com` (com e sem `www`) e os dois `pages.dev`; o Site URL continua `https://livraria-adventista.pages.dev/` até o `.ao` abrir |
| Site no código | `canonical`, `og:*`, `robots.txt` e `sitemap.xml` já apontam para `https://livrariaadventista.ao` |

Falta, por esta ordem:

1. **No registador .ao (DNS.AO / revendedor):** confirmar que o registo do domínio está concluído e pôr os nameservers `cody.ns.cloudflare.com` e `hadlee.ns.cloudflare.com`. Hoje o `.ao` responde NXDOMAIN para `livrariaadventista.ao`.
2. **Cloudflare:** a zona passa a *Active* sozinha (ou carregar em "Check nameservers"); os dois domínios no Pages passam a *Active* com certificado.
3. **Supabase → Authentication → URL Configuration:** os Redirect URLs já estão feitos; falta trocar o Site URL para `https://livrariaadventista.ao` quando o domínio abrir.
4. **Google Cloud:** acrescentar `https://livrariaadventista.ao` às origens JavaScript autorizadas do cliente OAuth e às restrições da chave Firebase; no Firebase Auth, acrescentar o domínio em *Authorized domains*.
5. **Redireccionar** `www.livrariaadventista.ao` e `livrariaadventista.com` (+ `www`) para `https://livrariaadventista.ao` com uma *Redirect Rule* (301) em cada zona. Só depois do passo 2, senão o `.com` deixa de abrir a loja.
6. Email: se o endereço `contacto@livrariaadventista.ao` for usado, criar os registos MX/SPF/DKIM do fornecedor de email na zona.

## 8.2 Emails com o layout da loja

- **Layout:** `supabase/functions/app/emailLayout.ts` (cabeçalho escuro com o logótipo branco, imagem de livros da galeria, corpo marfim, botão azul-petróleo, detalhes dourados). Usado pela confirmação de encomenda, pelo email de teste, pelos convites e recuperação de palavra-passe do painel, e pelas mensagens a contactos e campanhas.
- **Imagens do topo:** recortes dos banners da galeria (`images/site/opcoes/loja-*.webp`): `hero-encomenda.jpg` (leque), `hero-conta.jpg` (Ellen G. White) e `hero-mensagem.jpg` (doutrina), mais `logo-light.png`, no bucket público `media`, em `email/`. Para trocar: mudar a lista em `scripts/email/render-heroes.cjs`, correr `node scripts/email/render-heroes.cjs <pasta>` e enviar os JPEG para o mesmo caminho.
- **Supabase Auth** (confirmação de conta, recuperação, convite, link de entrada, troca de email, código): `node --experimental-strip-types scripts/email/auth-templates.ts > auth-templates.json` e `PATCH /v1/projects/<ref>/config/auth` com esse JSON (comando no topo do script). **O Supabase só aceita templates próprios depois de configurar um SMTP próprio** (Authentication → Emails → SMTP).
- **Falta:** não há SMTP configurado (nem na loja, em Admin → Sistema → Integrações, nem no Supabase Auth), por isso nenhum email sai ainda; e a Edge Function `app` tem de ser publicada para usar o layout novo.

## 9. Segurança antes do go-live

- [ ] Nenhuma credencial real no repositório (é público)
- [ ] Supabase → Advisors (Security e Performance) sem avisos novos
- [ ] SMTP próprio configurado no Supabase Auth
- [ ] Domínio com HTTPS (automático no Cloudflare)
- [ ] Rever quem tem papel `admin` e `manager` em Admin → Utilizadores e Clientes

---

## Suporte técnico

- Supabase: https://supabase.com/docs
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
