// Regression suite for Torre di Pancake. Runs the REAL game script (extracted from
// pancake-tower/index.html) under the jsc stub in env.js. See tests/run.sh.

var PASS = 0, FAIL = 0, FAILS = [];
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; FAILS.push(msg); print('    ✗ ' + msg); } }
function section(name){ print('\n• ' + name); }

var api = (window.__PANCAKE_TEST__ && window.__PANCAKE_TEST__.api) || null;
ok(!!api, 'the game exposes its test seam (window.__PANCAKE_TEST__.api)');
if (!api){ print('\nFATAL: no test seam — aborting'); throw new Error('no test seam'); }

// deterministic PRNG so runs are reproducible
var seed = 20240630;
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

// manual frame + tap drivers (exercise the real event handlers + rAF loop)
var ts = 0;
function frame(){ var cb = PENDING; PENDING = null; ts += 16; if (cb) cb(ts); }
function tap(){ var h = ELS.game._h.pointerdown; if (h) h({ isPrimary: true, preventDefault: function(){} }); }
function scoreNow(){ return parseInt(ELS.score.textContent, 10) || 0; }

// ---------------------------------------------------------------------------
section('A. drawPancake never throws on narrow / squashed / huge pancakes (the freeze bug)');
// Widths from a 0.5px sliver upward, at full height, squashed height, and slice height,
// with and without the syrup/butter garnish. The old roundRect threw for any w < 6.
var drawThrows = 0, drawCalls = 0;
var heights = [30, 23.4, 15, 8];
for (var w = 0.5; w <= 40; w += 0.5){
  for (var hi = 0; hi < heights.length; hi++){
    for (var t = 0; t < 2; t++){
      drawCalls++;
      try { api.drawPancake(10, 100, w, heights[hi], 1, t === 1); }
      catch (e){ drawThrows++; }
    }
  }
}
ok(drawThrows === 0, 'drawPancake threw ' + drawThrows + '/' + drawCalls + ' times on narrow widths');
// degenerate inputs must be handled gracefully too
var degenerate = 0;
[[0,30],[-5,30],[3,0],[3,-4]].forEach(function(p){
  try { api.drawPancake(10, 100, p[0], p[1], 0, true); } catch (e){ degenerate++; }
});
ok(degenerate === 0, 'drawPancake threw on zero/negative dimensions (' + degenerate + ')');
// roundRect directly, straight at the throwing arcTo
var rrThrows = 0;
for (var rw = -3; rw <= 6; rw++){ try { api.roundRect(0, 0, rw, 21, 12); CTX.fill(); } catch (e){ rrThrows++; } }
ok(rrThrows === 0, 'roundRect fed a negative width still never throws (' + rrThrows + ')');

// ---------------------------------------------------------------------------
section('B. the plate sits at the BOTTOM of the screen at start (no mid-screen regression)');
api.start();
var dims = api.dims();
var plateTop = api.topYFor(-1);   // screen Y of the plate
var baseTop  = api.topYFor(0);    // screen Y of the base pancake
ok(plateTop > dims.H * 0.6 && plateTop <= dims.H * 1.05,
   'plate Y (' + Math.round(plateTop) + ') should be in the bottom part of H=' + dims.H);
ok(baseTop > dims.H * 0.6, 'base pancake starts near the bottom (Y=' + Math.round(baseTop) + ')');

// ---------------------------------------------------------------------------
section('C. full play: no frame errors, score rises, game-over + restart work');
FRAME_ERRORS.length = 0;
DRAW_CALLS = 0;
api.start();
var maxScore = 0, gameOvers = 0, resumedAfterOver = false, widthOverBase = 0;
var baseW = api.baseWidth();
for (var i = 0; i < 200; i++){
  var steps = 1 + Math.floor(rnd() * 26);
  for (var s = 0; s < steps; s++) frame();
  var before = scoreNow();
  tap();
  frame();
  var after = scoreNow();
  if (after > maxScore) maxScore = after;
  // widest block must never exceed the base width (guards the perfect-GROW cap)
  var bl = api.blocks();
  for (var b = 0; b < bl.length; b++){ if (bl[b].width > baseW + 0.5) widthOverBase++; }
  if (after <= before){        // a miss -> game over
    gameOvers++;
    ELS.retryBtn._h.click();   // restart
    frame(); tap(); frame();
    if (scoreNow() >= 1) resumedAfterOver = true;
  }
}
for (var k = 0; k < 200; k++) frame();   // let slices fall off-screen

ok(FRAME_ERRORS.length === 0, 'no frame errors during play (got ' + FRAME_ERRORS.length +
   (FRAME_ERRORS.length ? ': ' + FRAME_ERRORS[0] : '') + ')');
ok(DRAW_CALLS > 1000, 'the renderer actually drew (' + DRAW_CALLS + ' fill/stroke calls)');
ok(maxScore > 0, 'score increased during play (max ' + maxScore + ')');
ok(gameOvers > 0, 'game-over was reached at least once (' + gameOvers + ')');
ok(resumedAfterOver, 'the game restarts and plays again after game-over');
ok(widthOverBase === 0, 'no pancake ever grew wider than the base (' + widthOverBase + ' violations)');

// ---------------------------------------------------------------------------
section('D. best score persists to localStorage');
var storedBest = parseInt(localStorage.getItem('pancakeTowerBest'), 10);
ok(!isNaN(storedBest) && storedBest >= 1, 'pancakeTowerBest stored (' + localStorage.getItem('pancakeTowerBest') + ')');
ok(storedBest <= maxScore, 'stored best (' + storedBest + ') is not greater than the best run (' + maxScore + ')');

// ---------------------------------------------------------------------------
print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' test(s) failed');
