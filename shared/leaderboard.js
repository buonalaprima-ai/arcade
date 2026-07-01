// Shared leaderboard client for every Buonalaprima Arcade game.
// Talks to the arcade-leaderboard Cloudflare Worker. Fails soft: any network
// error just resolves to null so a game keeps working (local best) offline.
//
// Usage:
//   await window.Leaderboard.top('pancake-tower', 10)      -> [{name,score,ts}] | null
//   await window.Leaderboard.submit('pancake-tower', 'ABC', 42)  -> {ok,rank,top} | null
(function(){
  "use strict";

  // set by leaderboard/deploy.sh after the Worker is deployed
  var WORKER_URL = 'https://arcade-leaderboard.buonalaprima.workers.dev';

  var configured = WORKER_URL.indexOf('http') === 0;

  function sanitizeName(raw){
    var s = String(raw == null ? '' : raw)
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, 12)
      .trim();
    return s || 'Anonimo';
  }

  async function top(game, limit){
    if (!configured) return null;
    try {
      var u = WORKER_URL + '/top?game=' + encodeURIComponent(game) + '&limit=' + (limit || 10);
      var r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) return null;
      var d = await r.json();
      return Array.isArray(d.top) ? d.top : null;
    } catch (e){
      return null;
    }
  }

  async function submit(game, name, score){
    if (!configured) return null;
    try {
      var r = await fetch(WORKER_URL + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: game, name: sanitizeName(name), score: score })
      });
      if (!r.ok) return null;
      return await r.json();   // { ok, rank, top }
    } catch (e){
      return null;
    }
  }

  window.Leaderboard = {
    top: top,
    submit: submit,
    sanitizeName: sanitizeName,
    isConfigured: function(){ return configured; },
    url: WORKER_URL
  };
})();
