// arcade-leaderboard — a single Cloudflare Worker serving the shared high-score
// board for every game in the collection. Storage: one Workers KV namespace
// (binding: SCORES). Public read, validated write, per-IP rate limit, CORS
// locked to the Pages origin.
//
// Endpoints:
//   GET  /top?game=<id>&limit=<n>     -> { game, top: [{name,score,ts}] }
//   POST /submit  {game,name,score}   -> { ok, rank, top }
//
// Deploy: leaderboard/deploy.sh (Cloudflare REST API, no Node needed).

// >>> TESTABLE (pure helpers — extracted verbatim by tests/leaderboard-worker.test)
var GAMES = {
  'pancake-tower': { maxScore: 100000 }
};
var MAX_ENTRIES = 50;      // how many scores we keep per game
var DEFAULT_TOP = 10;      // how many we return by default
var NAME_MAX = 12;         // max nickname length (public board, not just initials)

function knownGame(game){
  return Object.prototype.hasOwnProperty.call(GAMES, String(game));
}
function sanitizeName(raw){
  var s = String(raw == null ? '' : raw)
    .replace(/[^A-Za-z0-9 _-]/g, '')   // whitelist: letters, digits, space, underscore, hyphen
    .replace(/ {2,}/g, ' ')             // collapse runs of spaces
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s || 'Anonimo';
}
function validScore(raw, maxScore){
  var n = Number(raw);
  if (!isFinite(n)) return null;
  var i = Math.floor(n);
  if (i < 0 || i > maxScore) return null;
  return i;
}
function insertScore(list, entry, maxEntries){
  var next = Array.isArray(list) ? list.slice() : [];
  next.push(entry);
  next.sort(function(a, b){ return (b.score - a.score) || (a.ts - b.ts); });
  return next.slice(0, maxEntries);
}
function rankOf(list, entry){
  for (var i = 0; i < list.length; i++){
    if (list[i].name === entry.name && list[i].score === entry.score && list[i].ts === entry.ts){
      return i + 1;
    }
  }
  return -1;
}
function clampLimit(raw){
  var n = parseInt(raw, 10);
  if (!isFinite(n) || n < 1) return DEFAULT_TOP;
  return Math.min(n, MAX_ENTRIES);
}
// <<< TESTABLE

var ALLOWED_ORIGINS = new Set([
  'https://buonalaprima-ai.github.io'
]);
var RATE = { max: 20, windowSec: 60 };   // submits per IP per minute
var MAX_BODY = 512;                        // bytes

function corsHeaders(origin){
  var allow = ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(data, status, origin){
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
  });
}

async function readList(env, game){
  var raw = await env.SCORES.get('lb:' + game);
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e){
    return [];
  }
}

async function rateLimited(env, ip){
  var key = 'rl:' + ip;
  var cur = parseInt((await env.SCORES.get(key)) || '0', 10) || 0;
  if (cur >= RATE.max) return true;
  await env.SCORES.put(key, String(cur + 1), { expirationTtl: RATE.windowSec });
  return false;
}

export default {
  async fetch(request, env){
    var origin = request.headers.get('Origin') || '';
    var url = new URL(request.url);

    if (request.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ---- GET /top ----
    if (request.method === 'GET' && url.pathname === '/top'){
      var game = url.searchParams.get('game') || '';
      if (!knownGame(game)) return json({ error: 'unknown_game' }, 400, origin);
      var limit = clampLimit(url.searchParams.get('limit'));
      var list = await readList(env, game);
      return json({ game: game, top: list.slice(0, limit) }, 200, origin);
    }

    // ---- POST /submit ----
    if (request.method === 'POST' && url.pathname === '/submit'){
      var body = await request.text();
      if (body.length > MAX_BODY) return json({ error: 'too_large' }, 413, origin);
      var payload;
      try { payload = JSON.parse(body); } catch (e){ return json({ error: 'bad_json' }, 400, origin); }

      var g = String(payload && payload.game);
      if (!knownGame(g)) return json({ error: 'unknown_game' }, 400, origin);

      var score = validScore(payload && payload.score, GAMES[g].maxScore);
      if (score == null) return json({ error: 'bad_score' }, 400, origin);

      var ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (await rateLimited(env, ip)) return json({ error: 'rate_limited' }, 429, origin);

      var entry = { name: sanitizeName(payload && payload.name), score: score, ts: Date.now() };
      var list = await readList(env, g);
      var updated = insertScore(list, entry, MAX_ENTRIES);
      await env.SCORES.put('lb:' + g, JSON.stringify(updated));

      return json({ ok: true, rank: rankOf(updated, entry), top: updated.slice(0, DEFAULT_TOP) }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  }
};
