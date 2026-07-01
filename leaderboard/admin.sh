#!/usr/bin/env bash
# Moderation tool for the arcade leaderboard. Reads/edits the board directly in
# Workers KV via the Cloudflare API — there is NO public admin endpoint on the
# Worker, so this can only be run by you (with the token in the keychain).
#
# Usage:
#   leaderboard/admin.sh <ACCOUNT_ID> list   <game>
#   leaderboard/admin.sh <ACCOUNT_ID> remove <game> <index>
#   leaderboard/admin.sh <ACCOUNT_ID> clear  <game>
#
# Token: keychain entry 'cloudflare-arcade' (or env CF_API_TOKEN).
# Example:
#   leaderboard/admin.sh 1a2b3c list pancake-tower
#   leaderboard/admin.sh 1a2b3c remove pancake-tower 4
set -uo pipefail

API="https://api.cloudflare.com/client/v4"
KV_TITLE="arcade-scores"

usage(){ sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

ACCOUNT_ID="${1:-}"; CMD="${2:-}"; GAME="${3:-}"; IDX="${4:-}"
if [ -z "$ACCOUNT_ID" ] || [ -z "$CMD" ] || [ -z "$GAME" ]; then usage; exit 2; fi

TOKEN="${CF_API_TOKEN:-$(security find-generic-password -s cloudflare-arcade -a token -w 2>/dev/null)}"
if [ -z "$TOKEN" ]; then echo "token non trovato (keychain 'cloudflare-arcade' o CF_API_TOKEN)"; exit 2; fi
auth=(-H "Authorization: Bearer $TOKEN")
KEY="lb:$GAME"

KV_ID=$(curl -s "${auth[@]}" "$API/accounts/$ACCOUNT_ID/storage/kv/namespaces?per_page=100" \
  | python3 -c "import sys,json;ns=json.load(sys.stdin).get('result') or [];print(next((n['id'] for n in ns if n['title']=='$KV_TITLE'),''))" 2>/dev/null)
if [ -z "$KV_ID" ]; then echo "KV namespace '$KV_TITLE' non trovata (deploy fatto?)"; exit 1; fi

base="$API/accounts/$ACCOUNT_ID/storage/kv/namespaces/$KV_ID/values/$KEY"
kv_get(){ curl -s "${auth[@]}" "$base"; }
kv_put(){ curl -s "${auth[@]}" -X PUT "$base" --data-binary "$1" >/dev/null; }
kv_del(){ curl -s "${auth[@]}" -X DELETE "$base" >/dev/null; }

case "$CMD" in
  list)
    kv_get | python3 -c "
import sys,json,datetime
try:
  data=json.loads(sys.stdin.read() or '[]')
  if not isinstance(data,list): data=[]
except Exception:
  data=[]
if not data:
  print('(classifica vuota)'); sys.exit(0)
print('  #  nome           score   data')
for i,e in enumerate(data):
  ts=e.get('ts',0) or 0
  d=datetime.datetime.utcfromtimestamp(ts/1000).strftime('%Y-%m-%d') if ts else '?'
  print('%3d  %-13s %6s   %s' % (i, str(e.get('name','?'))[:13], str(e.get('score','?')), d))
"
    ;;
  remove)
    if [ -z "$IDX" ]; then echo "serve <index> (vedi 'list')"; exit 2; fi
    new=$(kv_get | python3 -c "
import sys,json
try:
  data=json.loads(sys.stdin.read() or '[]')
  if not isinstance(data,list): data=[]
except Exception:
  data=[]
i=int('$IDX')
if 0<=i<len(data):
  r=data.pop(i)
  sys.stderr.write('rimosso: %s (%s)\n'%(r.get('name'),r.get('score')))
else:
  sys.stderr.write('indice fuori range (0..%d)\n'%(len(data)-1)); sys.exit(3)
print(json.dumps(data))
") || { echo "niente da fare."; exit 1; }
    kv_put "$new"
    echo "fatto."
    ;;
  clear)
    kv_del
    echo "classifica '$GAME' azzerata."
    ;;
  *)
    usage; exit 2;;
esac
