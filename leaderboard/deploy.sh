#!/usr/bin/env bash
# Deploy the arcade-leaderboard Cloudflare Worker + its KV namespace using the
# Cloudflare REST API (no Node / wrangler needed).
#
# Prereqs:
#   - an API token (template "Edit Cloudflare Workers") stored in the keychain:
#       security add-generic-password -s cloudflare-arcade -a token -w
#   - your Cloudflare Account ID
#
# Usage:
#   leaderboard/deploy.sh <ACCOUNT_ID>
#   (or set CF_ACCOUNT_ID)   (or CF_API_TOKEN to skip the keychain lookup)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="arcade-leaderboard"
KV_TITLE="arcade-scores"
API="https://api.cloudflare.com/client/v4"

ACCOUNT_ID="${1:-${CF_ACCOUNT_ID:-}}"
TOKEN="${CF_API_TOKEN:-$(security find-generic-password -s cloudflare-arcade -a token -w 2>/dev/null)}"
red(){ sed -E 's#(Bearer )?[A-Za-z0-9_-]{40,}#\1***#g'; }

if [ -z "$ACCOUNT_ID" ]; then echo "manca l'Account ID (arg 1 o CF_ACCOUNT_ID)"; exit 2; fi
if [ -z "$TOKEN" ];      then echo "token non trovato (keychain 'cloudflare-arcade' o CF_API_TOKEN)"; exit 2; fi

auth=(-H "Authorization: Bearer $TOKEN")

api_ok(){ python3 -c 'import sys,json;print("1" if json.load(sys.stdin).get("success") else "0")' 2>/dev/null; }
api_get(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

echo "== 1. verifica token =="
vt=$(curl -s "${auth[@]}" "$API/user/tokens/verify")
[ "$(printf '%s' "$vt" | api_ok)" = "1" ] || { echo "token non valido:"; printf '%s\n' "$vt" | red; exit 1; }
echo "token ok"

echo "== 2. KV namespace ($KV_TITLE) =="
list=$(curl -s "${auth[@]}" "$API/accounts/$ACCOUNT_ID/storage/kv/namespaces?per_page=100")
KV_ID=$(printf '%s' "$list" | python3 -c "import sys,json;ns=json.load(sys.stdin).get('result') or [];print(next((n['id'] for n in ns if n['title']=='$KV_TITLE'),''))" 2>/dev/null)
if [ -z "$KV_ID" ]; then
  created=$(curl -s "${auth[@]}" -X POST "$API/accounts/$ACCOUNT_ID/storage/kv/namespaces" \
    -H "Content-Type: application/json" -d "{\"title\":\"$KV_TITLE\"}")
  KV_ID=$(printf '%s' "$created" | api_get "['result']['id']")
  [ -n "$KV_ID" ] || { echo "creazione KV fallita:"; printf '%s\n' "$created" | red; exit 1; }
  echo "KV creata: $KV_ID"
else
  echo "KV esistente: $KV_ID"
fi

echo "== 3. upload Worker (module + binding SCORES) =="
META="$(mktemp)"
cat > "$META" <<EOF
{"main_module":"worker.js","compatibility_date":"2024-11-01","bindings":[{"type":"kv_namespace","name":"SCORES","namespace_id":"$KV_ID"}]}
EOF
up=$(curl -s "${auth[@]}" -X PUT "$API/accounts/$ACCOUNT_ID/workers/scripts/$SCRIPT_NAME" \
  -F "metadata=@$META;type=application/json" \
  -F "worker.js=@$DIR/worker.js;type=application/javascript+module")
rm -f "$META"
[ "$(printf '%s' "$up" | api_ok)" = "1" ] || { echo "upload fallito:"; printf '%s\n' "$up" | red; exit 1; }
echo "worker caricato"

echo "== 4. abilita subdomain workers.dev =="
curl -s "${auth[@]}" -X POST "$API/accounts/$ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/subdomain" \
  -H "Content-Type: application/json" -d '{"enabled":true}' >/dev/null
sub=$(curl -s "${auth[@]}" "$API/accounts/$ACCOUNT_ID/workers/subdomain" | api_get "['result']['subdomain']")
[ -n "$sub" ] || { echo "subdomain non recuperato"; exit 1; }
URL="https://$SCRIPT_NAME.$sub.workers.dev"
echo "Worker URL: $URL"

echo "== 5. scrivo l'URL in shared/leaderboard.js =="
LB="$DIR/../shared/leaderboard.js"
sed -i '' -E "s#^  var WORKER_URL = .*#  var WORKER_URL = '$URL';#" "$LB"
grep -n "var WORKER_URL" "$LB"

echo "== 6. smoke test =="
echo "GET /top  -> $(curl -s -o /dev/null -w '%{http_code}' "$URL/top?game=pancake-tower")"
echo ""
echo "FATTO. URL del leaderboard: $URL"
