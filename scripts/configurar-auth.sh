#!/usr/bin/env bash
# Configuração do Supabase Auth a partir do repositório (supabase/auth/).
#
#   bash scripts/configurar-auth.sh --verificar   → só lê e testa; não muda nada
#   bash scripts/configurar-auth.sh               → mostra a diferença, pede confirmação e aplica
#   bash scripts/configurar-auth.sh --google client_secret_….json
#                                                 → põe no Supabase a chave do cliente Google
#
# Porque existe (auditoria, 9.6): o `site_url` era o projecto antigo e o domínio novo não estava
# na lista de endereços autorizados. O Supabase ignora um destino que não conhece e manda para o
# `site_url` — por isso o regresso do login com a Google, a confirmação de conta e a recuperação
# de palavra-passe levavam todos a https://livraria-adventista.pages.dev. Os emails iam em inglês.
#
# Muda só: site_url, uri_allow_list, e o assunto e o texto de seis emails. Nada de SMTP, Google,
# MFA nem limites. Guarda antes os valores actuais em supabase/auth/.antes-<data>.json (fora do
# git) para reverter com:  bash scripts/configurar-auth.sh --repor supabase/auth/.antes-<data>.json
#
# --google (auditoria, 9.7): a chave secreta do cliente Google guardada no Supabase está errada —
# o regresso do login falha com `invalid_client: The provided client secret is invalid` (visto
# nos registos do Auth a 2026-11-04, 12:03 e 17:44). Lê a chave do JSON que a Google Cloud
# Console descarrega, confirma-a primeiro na própria Google (um código falso tem de dar
# `invalid_grant`; `invalid_client` quer dizer chave errada) e só então a envia. A chave nunca
# aparece no ecrã nem nos argumentos dos comandos.
#
# Token: SUPABASE_ACCESS_TOKEN, ou o do Supabase CLI (~/.supabase/access-token).
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-bggqkjjqbjhbjsckzopj}"
API="https://api.supabase.com/v1/projects/$REF/config/auth"
AUTH="https://$REF.supabase.co/auth/v1"
KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_5i4wd-xT_pdkDzFHNsjzPw_dcRZil_-}"
cd "$(git rev-parse --show-toplevel)"
DIR=supabase/auth

TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat "$HOME/.supabase/access-token" 2>/dev/null || true)}"
[ -n "$TOKEN" ] || { echo "✘ Falta o token: SUPABASE_ACCESS_TOKEN ou 'supabase login'." >&2; exit 1; }

actual() { curl -sf -H "Authorization: Bearer $TOKEN" "$API"; }

# Corpo do PATCH a partir de supabase/auth/ (ou de um ficheiro guardado, em --repor).
desejado() {
  python3 - "$DIR" <<'EOF'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1])
c = json.loads((d / "config.json").read_text())
body = {"site_url": c["site_url"], "uri_allow_list": ",".join(c["uri_allow_list"])}
for name, subject in c["subjects"].items():
    body[f"mailer_subjects_{name}"] = subject
    body[f"mailer_templates_{name}_content"] = (d / "templates" / f"{name}.html").read_text()
print(json.dumps(body, ensure_ascii=False))
EOF
}

diferenca() {  # $1 = corpo desejado; lê a configuração actual do stdin
  python3 -c '
import json, sys
cur = json.load(sys.stdin); want = json.loads(sys.argv[1]); n = 0
short = lambda v: (str(v)[:110] + "…") if len(str(v)) > 110 else str(v)
for k, v in want.items():
    if cur.get(k) != v:
        n += 1
        print("  " + k + ":\n    agora: " + short(cur.get(k)) + "\n    fica:  " + short(v))
print(str(n) + " campo(s) a mudar" if n else "Nada a mudar: a configuração já é a do repositório.")
' "$1"
}

guardar() {  # $1 = corpo desejado, $2 = ficheiro; lê a configuração actual do stdin
  python3 -c '
import json, sys
cur = json.load(sys.stdin); want = json.loads(sys.argv[1])
json.dump({k: cur.get(k) for k in want}, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
' "$1" "$2"
}

# Teste real, sem conta: um token inválido faz o Supabase redireccionar com o erro para o destino
# que considera válido. Um destino autorizado tem de voltar a ele; um estranho, ao site_url.
verificar() {
  local falhas=0 destino volta
  for destino in https://livrariaadventista.com/reset-password https://www.livrariaadventista.com/login \
                 https://livraria-editora-adventista-ben.pages.dev/login https://evil.example.com/x; do
    volta=$(curl -s -o /dev/null -w "%{redirect_url}" -H "apikey: $KEY" \
      "$AUTH/verify?token=invalido&type=recovery&redirect_to=$destino" | cut -d'#' -f1)
    case "$destino" in
      https://evil.*) esperado="https://livrariaadventista.com" ;;
      *) esperado="$destino" ;;
    esac
    if [ "${volta%/}" = "${esperado%/}" ]; then echo "  ✓ $destino → $volta"
    else echo "  ✘ $destino → $volta (esperado $esperado)"; falhas=$((falhas + 1)); fi
  done
  local google
  google=$(curl -s -o /dev/null -w "%{redirect_url}" -H "apikey: $KEY" \
    "$AUTH/authorize?provider=google&redirect_to=https://livrariaadventista.com/profile")
  case "$google" in
    https://accounts.google.com/*redirect_uri=https%3A%2F%2F$REF.supabase.co%2Fauth%2Fv1%2Fcallback*) echo "  ✓ login Google vai para accounts.google.com com o callback do projecto" ;;
    *) echo "  ✘ login Google: $google"; falhas=$((falhas + 1)) ;;
  esac
  return $falhas
}

# Corpo do formulário do teste da Google, a partir do JSON (vai pela entrada padrão do curl).
google_form() {
  python3 -c '
import json, sys, urllib.parse
c = json.load(open(sys.argv[1]))["web"]
sys.stdout.write(urllib.parse.urlencode({"code": "4/codigo-falso", "client_id": c["client_id"],
  "client_secret": c["client_secret"], "grant_type": "authorization_code",
  "redirect_uri": sys.argv[2] + "/callback"}))' "$1" "$AUTH"
}

google_body() {
  python3 -c '
import json, sys
c = json.load(open(sys.argv[1]))["web"]
uris = c.get("redirect_uris") or []
if sys.argv[2] + "/callback" not in uris:
    sys.exit("✘ O cliente Google não tem " + sys.argv[2] + "/callback nos URIs de redireccionamento.")
sys.stdout.write(json.dumps({"external_google_enabled": True, "external_google_client_id": c["client_id"],
  "external_google_secret": c["client_secret"]}))' "$1" "$AUTH"
}

case "${1:-}" in
  --google)
    f="${2:-}"; [ -f "$f" ] || { echo "✘ Indique o JSON do cliente Google (client_secret_….json)." >&2; exit 1; }
    resposta=$(google_form "$f" | curl -s --data @- https://oauth2.googleapis.com/token \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",""))')
    case "$resposta" in
      invalid_grant) echo "✓ A Google aceita esta chave." ;;
      invalid_client) echo "✘ A Google recusa esta chave (invalid_client): descarregue o JSON de novo." >&2; exit 1 ;;
      *) echo "✘ Resposta inesperada da Google: $resposta" >&2; exit 1 ;;
    esac
    body=$(google_body "$f")
    read -r -p "Pôr esta chave no Supabase (Authentication → Providers → Google)? [s/N] " r
    [ "$r" = "s" ] || { echo "Nada mudado."; exit 0; }
    printf '%s' "$body" | curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @- "$API" >/dev/null
    echo "Feito. Teste: entrar com a Google em https://livrariaadventista.com/login."
    ;;
  --verificar)
    echo "Configuração actual vs repositório:"; actual | diferenca "$(desejado)"
    echo "Destinos dos links:"; verificar && echo "Tudo certo." || { echo "Há destinos errados."; exit 1; }
    ;;
  --repor)
    [ -f "${2:-}" ] || { echo "✘ Indique o ficheiro guardado." >&2; exit 1; }
    curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @"$2" "$API" >/dev/null
    echo "Reposto a partir de $2."
    ;;
  "")
    body="$(desejado)"; cur="$(actual)"
    echo "$cur" | diferenca "$body"
    copia="$DIR/.antes-$(date +%Y%m%d-%H%M%S).json"
    echo "$cur" | guardar "$body" "$copia"; echo "Valores actuais guardados em $copia"
    read -r -p "Aplicar? [s/N] " r; [ "$r" = "s" ] || { echo "Nada mudado."; exit 0; }
    curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data "$body" "$API" >/dev/null
    echo "Aplicado. A verificar (o Auth pode levar alguns segundos a recarregar)…"; sleep 8
    verificar && echo "Tudo certo." || { echo "Há destinos errados: ver acima."; exit 1; }
    ;;
  *) echo "Uso: $0 [--verificar | --repor <ficheiro> | --google <client_secret.json>]" >&2; exit 2 ;;
esac
