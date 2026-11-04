# Guia de Lançamento — Livraria Adventista

Checklist para pôr a loja em produção com o Supabase (backend) e o Cloudflare Pages (site), com **WhatsApp Business API**, **email automático** e **push PWA**.

---

## 1. Pré-requisitos

| Item | Detalhe |
|------|---------|
| Supabase | Projecto `bggqkjjqbjhbjsckzopj` (já criado, com esquema e dados) |
| Cloudflare | Conta `valentinocanguele@gmail.com` (`701800d01d428c5141fa1fdb60ee01ae`); projecto Pages `livraria-editora-adventista`, servido em `livraria-editora-adventista-ben.pages.dev` |
| GitHub | Conta sem bloqueios de pagamento (o Actions tem de correr) |
| Domínio | **`livrariaadventista.ao` — principal** (registado a 2026-11-04; falta ligá-lo no Cloudflare, ver secção 7). `livrariaadventista.com` no ar (Hostinger, zona no Cloudflare), a redireccionar para o `.ao` quando este responder |
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
| Variável (opcional) | `SITE_URL` | Por omissão `https://livrariaadventista.ao` |
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
npm run deploy:site        # projecto livraria-editora-adventista, em https://livrariaadventista.ao
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

**Registado** (2026-11-04) e escolhido como domínio principal. O `.com` fica no ar e passa a
redireccionar para o `.ao`.

O Cloudflare não vende domínios `.ao`: o registo é feito por revendedores autorizados do
[DNS.ao](https://www.dns.ao) (loja oficial: [dominios.ao](https://www.dominios.ao)).

Ordem dos passos (todos na conta Cloudflare do projecto Pages `livraria-editora-adventista`):

1. **Adicionar o domínio como zona** (Add a site → `livrariaadventista.ao`, plano Free). O
   Cloudflare devolve dois nameservers (`<nome>.ns.cloudflare.com`).
2. **Delegar os nameservers** no painel do revendedor `.ao`, trocando os que lá estão pelos
   dois do Cloudflare. Em alguns revendedores é preciso abrir um pedido de suporte. A zona
   passa a *Active* quando a delegação propagar (minutos a 24 horas).
3. **Ligar ao Pages**: Workers & Pages → `livraria-editora-adventista` → Custom domains →
   adicionar `livrariaadventista.ao` e depois `www.livrariaadventista.ao`. Com a zona na mesma
   conta, o Cloudflare cria os CNAME sozinho; se não criar, ver *Ligar um domínio ao Pages*
   acima (CNAME *proxied* para `livraria-editora-adventista-ben.pages.dev`).
4. **`www` → raiz**: Rules → Redirect Rules na zona `.ao`, `www.livrariaadventista.ao/*` →
   `https://livrariaadventista.ao/${1}`, 301, a manter a query string.
5. **Supabase → Authentication → URL Configuration**: Site URL `https://livrariaadventista.ao`;
   nos Redirect URLs juntar `https://livrariaadventista.ao/**` e
   `https://www.livrariaadventista.ao/**` (manter os do `.com` até ao passo 7).
6. **Google Cloud → OAuth client**: juntar `https://livrariaadventista.ao` e
   `https://www.livrariaadventista.ao` às origens JavaScript autorizadas. O URI de
   redireccionamento (`https://bggqkjjqbjhbjsckzopj.supabase.co/auth/v1/callback`) não muda.
7. **Só com o `.ao` a responder**: publicar (`npm run deploy:site`, que já usa o `.ao` por
   omissão e confirma que responde 200) e pôr o `.com` a redireccionar: Redirect Rule na zona
   `livrariaadventista.com`, `*livrariaadventista.com/*` → `https://livrariaadventista.ao/${2}`,
   301. Se a variável `SITE_URL` existir no Actions, mudá-la para `https://livrariaadventista.ao`.
8. **Email**: o domínio não tem MX, SPF nem DMARC. Quando o SMTP for configurado, o remetente
   deve ser do `.ao` e os registos DNS criados nesta zona.

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
