# Domínio oficial — livrariaadventista.ao

O endereço oficial da loja é **https://livrariaadventista.ao** (sem `www`).
O `livrariaadventista.com`, o `www` e o `livraria-adventista.pages.dev` passam a redireccionar para ele.

O código já usa o domínio novo (canonical, Open Graph, sitemap, robots, `site_settings.site_url`).
O que falta é configuração nos painéis, que o repositório não controla.

## 1. Cloudflare Pages → projecto `livraria-adventista` → Custom domains

- [ ] `livrariaadventista.ao` adicionado e com estado **Active** (SSL emitido).
- [ ] `www.livrariaadventista.ao` adicionado também (para o certificado cobrir o `www`).

## 2. Cloudflare → zona `livrariaadventista.ao`

- [ ] Nameservers do `.ao` apontam para os do Cloudflare (estado da zona: **Active**).
- [ ] DNS: `CNAME @ → livraria-adventista.pages.dev` (proxied) e `CNAME www → livraria-adventista.pages.dev` (proxied).
      O Pages cria estes registos sozinho ao adicionar o domínio, se a zona estiver na mesma conta.
- [ ] SSL/TLS → modo **Full (strict)**; *Always Use HTTPS* ligado.
- [ ] Rules → Redirect Rules: `www.livrariaadventista.ao/*` → `https://livrariaadventista.ao/${1}`, 301, mantendo a query string.
- [ ] Registos de email (MX/SPF/DKIM/DMARC) para `contacto@livrariaadventista.ao`, se o email for por este domínio.

## 3. Cloudflare → zona `livrariaadventista.com` (substituída)

- [ ] Rules → Redirect Rules: todo o tráfego (`livrariaadventista.com/*` e `www.livrariaadventista.com/*`)
      → `https://livrariaadventista.ao/${1}`, **301**, mantendo a query string.
- [ ] DNS: um registo proxied em `@` e em `www` (ex.: `AAAA 100::`) para o pedido chegar à regra.
- [ ] Remover o `.com` dos Custom domains do Pages, se lá estiver.
- [ ] Manter o `.com` registado e a redireccionar durante pelo menos um ano (links antigos, Google).

## 4. Supabase → Authentication → URL Configuration

- [ ] **Site URL:** `https://livrariaadventista.ao`
- [ ] **Redirect URLs:** `https://livrariaadventista.ao/**` (manter `https://*.livraria-adventista.pages.dev/**` para as pré-visualizações; retirar o `.com`).

Sem isto, os emails de confirmação e de recuperação de palavra-passe e o login com Google voltam para o domínio antigo.

## 5. Firebase (só as ferramentas Google Workspace do painel)

O login dos clientes (email e Google) é do Supabase (passo 4). O Firebase, projecto
`skilful-form-c5jvd`, só abre o pop-up do Google para o Drive, Gmail, Contactos e Calendar no
painel (`app/web/src/lib/googleAuth.js`), e recusa domínios que não estejam autorizados.

- [x] https://console.firebase.google.com/project/skilful-form-c5jvd/authentication/settings
      → **Authorized domains** → **Add domain**: `livrariaadventista.ao` e `www.livrariaadventista.ao`.
      Manter `livraria-adventista.pages.dev`; retirar o `.com`, se lá estiver.

## 6. Google

- [ ] Google Cloud → Credenciais → ID do cliente OAuth: juntar `https://livrariaadventista.ao` às *Origens JavaScript autorizadas* (o URI de redireccionamento continua o do Supabase).
- [ ] Search Console: adicionar a propriedade de domínio `livrariaadventista.ao`, enviar `https://livrariaadventista.ao/sitemap.xml`
      e usar *Alteração de endereço* na propriedade do `.com`.

## Verificação

```bash
curl -sI https://livrariaadventista.ao/ | head -1          # HTTP/2 200
curl -sI https://www.livrariaadventista.ao/ | grep -i location   # → https://livrariaadventista.ao/
curl -sI https://livrariaadventista.com/shop | grep -i location  # → https://livrariaadventista.ao/shop
curl -s https://livrariaadventista.ao/ | grep canonical    # https://livrariaadventista.ao/
```
