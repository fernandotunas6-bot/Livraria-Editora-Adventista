#!/usr/bin/env bash
# Publica o site no Cloudflare Pages a partir desta máquina (alternativa ao GitHub Actions).
#
#   npm run deploy:site            → produção (só a partir de um ramo autorizado)
#   npm run deploy:site -- --preview → pré-visualização com o nome do ramo actual
#
# Variáveis para escolher o destino:
#   CLOUDFLARE_PAGES_PROJECT → projecto Pages (por omissão livraria-adventista, o que serve
#                              produção hoje; o novo é livraria-editora-adventista)
#   SITE_URL                 → o que a verificação final testa (por omissão <projecto>.pages.dev;
#                              com domínio próprio, ex. https://livrariaadventista.ao)
#
# Garante que se publica exactamente a ponta do ramo remoto: várias sessões trabalham no
# mesmo ramo e um build antigo publicado por cima apaga correcções já em produção.
# Requisitos: `npx wrangler@4 login` feito e app/web/.env com VITE_SUPABASE_URL e
# VITE_SUPABASE_PUBLISHABLE_KEY.
set -euo pipefail

PROJECT="${CLOUDFLARE_PAGES_PROJECT:-livraria-adventista}"
PROD_BRANCHES="${PROD_BRANCHES:-main claude/youthful-heisenberg-rq5gnw}"
SITE_URL="${SITE_URL:-https://${PROJECT}.pages.dev}"

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
npm run lint --silent
npm test --silent
npm run build --silent

# O `canonical`, as etiquetas `og:`/`twitter:`, o sitemap e o robots.txt têm o endereço do
# projecto que serviu produção primeiro. Publicado noutro sítio (o projecto novo, o domínio
# .ao), o site dizia aos motores de busca e às partilhas no WhatsApp que a página "a sério"
# é a do endereço antigo. Reescreve-se no build, não no código-fonte, para o mesmo commit
# poder ir para qualquer destino.
SOURCE_URL="https://livraria-adventista.pages.dev"
# Livros e colecções no sitemap. Gerado com o endereço de origem, para a reescrita a seguir
# o trocar junto com o resto.
if [ "$mode" = "production" ]; then
  node scripts/gerar-sitemap.mjs dist/app/web/sitemap.xml "$SOURCE_URL"
fi
if [ "$mode" = "production" ] && [ "$SITE_URL" != "$SOURCE_URL" ]; then
  for f in index.html sitemap.xml robots.txt; do
    file="dist/app/web/$f"
    grep -q "$SOURCE_URL" "$file" || fail "$f não tem $SOURCE_URL: o build mudou e este passo tem de ser revisto."
    sed -i.orig "s#$SOURCE_URL#${SITE_URL%/}#g" "$file" && rm "$file.orig"
  done
  echo "→ endereços públicos reescritos para $SITE_URL"
fi

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
  echo "✔ Produção em $short: $SITE_URL"
fi
