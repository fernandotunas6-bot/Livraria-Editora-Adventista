#!/usr/bin/env bash
# Publica o site no Cloudflare Pages a partir desta máquina (alternativa ao GitHub Actions).
#
#   npm run deploy:site            → produção (só a partir de um ramo autorizado)
#   npm run deploy:site -- --preview → pré-visualização com o nome do ramo actual
#
# Variáveis para escolher o destino:
#   CLOUDFLARE_PAGES_PROJECT → projecto Pages (por omissão livraria-editora-adventista, na conta
#                              Cloudflare valentinocanguele@gmail.com — é nela que o wrangler
#                              tem de estar autenticado: `npx wrangler@4 whoami`)
#   SITE_URL                 → o endereço público (por omissão https://livrariaadventista.ao).
#                              Não se deriva do nome do projecto: o endereço .pages.dev deste
#                              é livraria-editora-adventista-ben.pages.dev, com um sufixo que o
#                              Cloudflare acrescentou por o nome já existir noutra conta. Vai para o canonical,
#                              as etiquetas de partilha, o sitemap e o robots.txt (ver
#                              scripts/seo-catalogo.mjs), e é o que a verificação final testa.
#
# Garante que se publica exactamente a ponta do ramo remoto: várias sessões trabalham no
# mesmo ramo e um build antigo publicado por cima apaga correcções já em produção.
# Requisitos: `npx wrangler@4 login` feito e app/web/.env com VITE_SUPABASE_URL e
# VITE_SUPABASE_PUBLISHABLE_KEY.
set -euo pipefail

PROJECT="${CLOUDFLARE_PAGES_PROJECT:-livraria-editora-adventista}"
PROD_BRANCHES="${PROD_BRANCHES:-main claude/youthful-heisenberg-rq5gnw}"
SITE_URL="${SITE_URL:-https://livrariaadventista.ao}"

fail() { echo "✘ $*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" \
  || fail "O ramo $branch não segue nenhum ramo remoto."

mode="production"
[ "${1:-}" = "--preview" ] && mode="preview"

if [ "$mode" = "production" ]; then
  allowed=false
  for b in $PROD_BRANCHES; do [ "origin/$b" = "$upstream" ] && allowed=true; done
  $allowed || fail "Produção só a partir de: $PROD_BRANCHES (este ramo segue $upstream). Use --preview."
fi

git fetch -q origin
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "Há alterações por commitar."
head="$(git rev-parse HEAD)"
tip="$(git rev-parse "$upstream")"
[ "$head" = "$tip" ] || fail "HEAD ($(git rev-parse --short HEAD)) não é a ponta de $upstream ($(git rev-parse --short "$tip")). Faça git pull --rebase e push primeiro."

grep -q '^VITE_SUPABASE_URL=.' app/web/.env 2>/dev/null && grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=.' app/web/.env \
  || fail "app/web/.env sem VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY."

echo "→ lint, testes e build de $(git rev-parse --short HEAD) ($branch)"
node scripts/verificar-segredos.mjs
npm run lint --silent
npm test --silent
npm run build --silent

# Pós-build de SEO e partilha (o mesmo passo do deploy-cloudflare.yml): endereços públicos
# trocados para o SITE_URL, livros e colecções no sitemap, e uma página de partilha por livro
# e por colecção, com a capa e o título para o WhatsApp. Ver scripts/seo-catalogo.mjs.
node scripts/seo-catalogo.mjs dist/app/web "$SITE_URL" || fail "O pós-build de SEO falhou (ver acima)."
# As ligações do site abrem no app iOS quando há APPLE_TEAM_ID (docs/APP_IOS.md).
node scripts/apple-app-site-association.mjs dist/app/web || fail "O ficheiro do app iOS falhou (ver acima)."

target="main"
[ "$mode" = "preview" ] && target="${upstream#origin/}"
echo "→ a publicar em $PROJECT (ramo Pages: $target)"
npx --yes wrangler@4 pages deploy dist/app/web \
  --project-name="$PROJECT" --branch="$target" \
  --commit-hash="$head" --commit-message="$(git log -1 --format=%s)" --commit-dirty=false

if [ "$mode" = "production" ]; then
  short="$(git rev-parse --short=7 HEAD)"
  latest="$(npx --yes wrangler@4 pages deployment list --project-name="$PROJECT" --environment=production --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d[0]?.Source||"")})')"
  [ "$latest" = "$short" ] || fail "O último deploy de produção é $latest, não $short. Outra sessão pode ter publicado por cima."
  for path in / /shop /lojas /admin; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL$path")"
    [ "$code" = "200" ] || fail "$SITE_URL$path respondeu $code."
  done
  # A página de um livro tem de ser a de partilha gerada no pós-build (og:type book), e não
  # o index.html genérico: é o que o WhatsApp lê.
  sample="$(ls dist/app/web/product 2>/dev/null | head -1)"
  if [ -n "$sample" ]; then
    curl -s "$SITE_URL/product/${sample%.html}" | grep -q 'property="og:type" content="book"' \
      || fail "$SITE_URL/product/${sample%.html} não serve a página de partilha do livro."
  fi
  echo "✔ Produção em $short: $SITE_URL"
fi
