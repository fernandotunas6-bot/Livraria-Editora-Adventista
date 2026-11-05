# Guia de Lançamento — Livraria Adventista

Checklist para pôr a loja em produção com o Supabase (backend) e o Cloudflare Pages (site), com **WhatsApp Business API**, **email automático** e **push PWA**.

---

## 1. Pré-requisitos

| Item | Detalhe |
|------|---------|
| Supabase | Projecto `bggqkjjqbjhbjsckzopj` (já criado, com esquema e dados) |
| Cloudflare | Conta `valentinocanguele@gmail.com` (`701800d01d428c5141fa1fdb60ee01ae`); projecto Pages `livraria-editora-adventista`, servido em `livraria-editora-adventista-ben.pages.dev` |
| GitHub | Conta sem bloqueios de pagamento (o Actions tem de correr) |
| Domínio | `livrariaadventista.com` — **no ar** (registado na Hostinger, zona no Cloudflare). O `.ao` continua por registar (ver secção 7) |
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
| Variável | `CLOUDFLARE_PAGES_PROJECT` | `livraria-editora-adventista` |
| Variável | `SUPABASE_PROJECT_REF` | `bggqkjjqbjhbjsckzopj` |
| Variável (opcional) | `SITE_URL` | Por omissão `https://livrariaadventista.com` |
| Secret | `CLOUDFLARE_API_TOKEN` | Token da conta gmail com *Cloudflare Pages: Edit* (um da conta antiga publica no sítio errado) |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | `701800d01d428c5141fa1fdb60ee01ae` |
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

### DNS do email (`contacto@livrariaadventista.ao`, Google Workspace)

Zona `livrariaadventista.ao` no Cloudflare:

| Tipo | Nome | Valor | Estado |
|---|---|---|---|
| MX | `@` | `smtp.google.com` (prioridade 1) | ✅ criado |
| TXT (SPF) | `@` | `v=spf1 include:_spf.google.com ~all` | ✅ criado |
| TXT (DKIM) | `google._domainkey` | `v=DKIM1; k=rsa; p=…` gerado na consola Google | ⏳ falta a chave |
| TXT | `@` | `google-site-verification=…` da consola Google | ⏳ se a Google pedir |

- **DKIM:** Admin da Google → Apps → Google Workspace → Gmail → Autenticar email → domínio `livrariaadventista.ao` → Gerar novo registo (2048 bits, prefixo `google`). Criar o TXT no Cloudflare e depois carregar em **Iniciar autenticação**.
- **SMTP da loja:** `smtp.gmail.com`, porta 465, utilizador `contacto@livrariaadventista.ao` e uma palavra-passe de aplicação (exige verificação em dois passos na conta).
- A zona ainda está *pending*: o domínio `.ao` só resolve quando o registo do domínio apontar para `cody.ns.cloudflare.com` e `hadlee.ns.cloudflare.com`.

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
| Push para `main` | `deploy-cloudflare.yml`: build e publicação no Cloudflare Pages |
| Push para `main` com mudanças em `supabase/` | `deploy-supabase.yml`: `supabase db push` e publicação da Edge Function `app` |

Enquanto o Actions não correr, publicar à mão (faz lint, testes e build antes):

```bash
npx wrangler@4 whoami      # tem de ser a conta valentinocanguele@gmail.com
npm run deploy:site        # projecto livraria-editora-adventista, em https://livrariaadventista.com
```

Para publicar a Edge Function à mão (com um token do Supabase):

```bash
npx supabase functions deploy app --project-ref bggqkjjqbjhbjsckzopj --no-verify-jwt
```

### Ligar um domínio ao Pages

Foi assim que o `livrariaadventista.com` ficou no ar, e é o mesmo para o `.ao`:

1. **A zona tem de estar na mesma conta Cloudflare que o projecto Pages.** Um CNAME *proxied*
   para um `.pages.dev` de outra conta é recusado (Error 1014, *CNAME Cross-User Banned*).
2. **Ligar o domínio ao projecto** pela API — o `wrangler` 4 não tem `pages domain add`:

   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/accounts/<conta>/pages/projects/livraria-editora-adventista/domains" \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" --data '{"name":"livrariaadventista.com"}'
   ```

3. **Criar à mão os registos DNS** — a API do Pages não os cria, e sem eles o domínio fica em
   `pending` para sempre. Os dois *proxied*: `CNAME @ → livraria-editora-adventista-ben.pages.dev`
   e `CNAME www → livraria-editora-adventista-ben.pages.dev`. O token OAuth do `wrangler` não
   escreve DNS: é no painel, ou com um token próprio com *Zone → DNS → Edit*.
4. **Revalidar** com `PATCH` no mesmo caminho do passo 2 (`.../domains/<domínio>`). Com os
   registos no sítio, fica `active` em menos de um minuto e o certificado sai sozinho.

### Domínio `livrariaadventista.ao`

**O Cloudflare não vende domínios `.ao`.** Desde Julho de 2023 o registo é feito só por
revendedores autorizados do [DNS.ao](https://www.dns.ao) (loja oficial:
[dominios.ao](https://www.dominios.ao)). É preciso entidade registada em Angola, empresário
individual, cidadão angolano ou estrangeiro com NIF/representação legal. A activação demora
24 a 72 horas úteis.

Ordem dos passos:

1. **Registar `livrariaadventista.ao`** num revendedor autorizado do DNS.ao.
2. **Adicionar o domínio como zona no Cloudflare** (Add a site), que devolve dois nameservers.
3. **Delegar os nameservers** no painel do revendedor. Em alguns é preciso abrir um pedido de
   suporte a indicar os nameservers; a propagação leva até 24 horas.
4. **Ligar ao Pages**, com a zona já activa no Cloudflare, como em *Ligar um domínio ao Pages*
   acima (para `livrariaadventista.ao` e `www.livrariaadventista.ao`).
5. **Actualizar o Supabase → Authentication** (Site URL e Redirect URLs) e o
   **Google Cloud OAuth** (origens e URIs de redireccionamento autorizados) para o domínio
   novo. Sem isto o login com Google falha no domínio próprio.
6. Só depois de o domínio responder é que se decide desligar o projecto antigo
   `livraria-adventista`.

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

## 9. Segurança antes do go-live

- [ ] Nenhuma credencial real no repositório (é privado, mas o histórico do git é permanente)
- [ ] Supabase → Advisors (Security e Performance) sem avisos novos
- [ ] SMTP próprio configurado no Supabase Auth
- [ ] Domínio com HTTPS (automático no Cloudflare)
- [ ] Rever quem tem papel `admin` e `manager` em Admin → Utilizadores e Clientes

---

## Suporte técnico

- Supabase: https://supabase.com/docs
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
