# Domínio — passagem de livrariaadventista.com para livrariaadventista.ao

Objectivo: **https://livrariaadventista.ao** (sem `www`) passa a ser o endereço oficial e o
`livrariaadventista.com` redirecciona para ele.

## Estado (verificado em 2026-11-05)

| O quê | Estado |
|-------|--------|
| Projecto Cloudflare Pages | `livraria-editora-adventista` (`livraria-editora-adventista-ben.pages.dev`) |
| `livrariaadventista.com` e `www` no Pages | **Active**, é o endereço oficial hoje (`app/web/src/lib/canonicalHost.js`) |
| Zona `livrariaadventista.ao` no Cloudflare | **Pending**: os nameservers no registador ainda não são os do Cloudflare |
| `livrariaadventista.ao` e `www` no Pages | Adicionados, **pending** (só ficam activos com a zona activa) |
| DNS da zona `.ao` no Cloudflare | Já pronto: `CNAME @` e `CNAME www` → `livraria-editora-adventista-ben.pages.dev` (proxied), MX e SPF do Google |
| O `.ao` hoje, na internet | Responde o servidor da AngoWeb (certificado `ns1.angoweb.net`, 404) |
| Supabase Auth, Redirect URLs | `.ao` e `www.ao` já juntados (também em `supabase/auth/config.json`); Site URL continua `.com` |
| Firebase, Authorized domains | `.ao` e `www.ao` juntados |
| Google OAuth e Search Console | Feitos pelo dono |

### Verificação de 2026-11-06

A AngoWeb já não serve o `.ao`, mas os nameservers foram trocados para **`randy` e `riya`**.
Estes pertencem a uma **segunda zona `livrariaadventista.ao`, criada noutra conta Cloudflare**,
vazia. A conta do projecto (`Valentinocanguele@gmail.com's Account`, a do Pages e do token)
continua com a zona `.ao` **pending** em `cody`/`hadlee`, com os registos todos. Não se recriam os
registos na outra conta: o Pages está nesta conta e um domínio de outra conta não activa nele
(o apex nem chega a validar). A correcção é pôr `cody`/`hadlee` na AngoWeb e apagar a zona
duplicada da outra conta.

**Ponto da situação (2026-11-06, 04:52 UTC):**

- AngoWeb: nameservers alterados pelo dono para `cody`/`hadlee` (Meus Domínios → Gerir domínio →
  Servidores de Nome → personalizados) por volta das 04:37 UTC. Nos `.ao` o painel pode mostrar os
  campos vazios depois de gravar; se não propagar, abrir ticket. O "Gerir DNS" da AngoWeb é outra
  coisa (zona antiga deles, sem efeito) e não se mexe.
- DNS.AO: publica a zona `.ao` de ~5 em 5 h (serial = hora Unix; 23:45 e 04:45 UTC). Às 04:52 o
  `.ao` ainda delegava em `randy`/`riya` e a zona continuava **pending**.
- Email: o dono **não usa** email `@livrariaadventista.ao` (nem Google, nem a AngoWeb `ws100`).
  Decidido: **Cloudflare Email Routing**, `contacto@livrariaadventista.ao` →
  `valentinocanguele@gmail.com`. Ainda **não ficou activo** nesta zona (regra inexistente; MX e SPF
  do Google ainda lá). Fazer pelo painel, nesta conta: Email → Email Routing → regra `contacto` →
  verificar o Gmail → "Adicionar registos e ativar", aceitando apagar o MX/SPF do Google.
  O token do repositório não tem permissão para os endereços de destino.
- Falta ainda: remover a zona `.ao` duplicada da outra conta (`randy`/`riya`).

## 1. Bloqueio: nameservers do `.ao` (só o dono, no painel da AngoWeb)

No painel do registador do `.ao` (AngoWeb), trocar os nameservers do domínio para:

```
cody.ns.cloudflare.com
hadlee.ns.cloudflare.com
```

e retirar todos os outros. A propagação do `.ao` pode levar de minutos a 48 h. O Cloudflare
envia um email quando a zona ficar **Active**; o Pages emite o certificado logo a seguir.

## 2. Depois de a zona ficar Active (não antes: partiria a loja)

1. Confirmar que `https://livrariaadventista.ao/` serve a loja com certificado válido.
2. Código (`main`):
   - `app/web/src/lib/canonicalHost.js`: `CANONICAL_ORIGIN = 'https://livrariaadventista.ao'` e juntar
     `www.livrariaadventista.ao`, `livrariaadventista.com` e `www.livrariaadventista.com` a `REDIRECT_HOSTS`;
     actualizar `canonicalHost.test.js`.
   - `app/web/index.html`, `public/sitemap.xml`, `public/robots.txt`: endereços para o `.ao`.
   - `.github/workflows/deploy-cloudflare.yml`: `SITE_URL` por omissão para o `.ao` (ou a variável `SITE_URL` do repositório).
   - `ContactsManager.jsx`, testes de `authRedirectError` e `googleWorkspaceErrors`: trocar o `.com`.
   - `supabase/auth/config.json`: `site_url` para o `.ao`.
3. Supabase Auth: **Site URL** = `https://livrariaadventista.ao` (manter o `.com` nos Redirect URLs por uns meses).
4. Base de dados: `update site_settings set site_url = 'https://livrariaadventista.ao'` (é o link dos botões dos emails).
5. Zona `.com`: Redirect Rule 301 de `*livrariaadventista.com/*` para `https://livrariaadventista.ao/${2}`,
   mantendo a query string. Isto substitui o redireccionamento por JavaScript e cobre também quem não corre JS.
6. Search Console: *Alteração de endereço* do `.com` para o `.ao`.
7. Manter o `.com` registado e a redireccionar pelo menos um ano.

## Verificação

```bash
curl -sI https://livrariaadventista.ao/ | head -1                 # HTTP/2 200
curl -sI https://www.livrariaadventista.ao/ | grep -i location     # → https://livrariaadventista.ao/ (depois do passo 2)
curl -sI https://livrariaadventista.com/shop | grep -i location    # → https://livrariaadventista.ao/shop (depois do passo 2.5)
```
