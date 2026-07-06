// Regression suite for "Fork It!" — spin-and-stop table-setting time-attack.
// Runs the REAL game script (extracted from fork-it/index.html) under env.js + shell.

var PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; print('    ✗ ' + msg); } }
function eq(a, b, msg){ ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n){ print('\n• ' + n); }

var api = (window.__FORKIT_TEST__ && window.__FORKIT_TEST__.api) || null;
ok(!!api, 'the game exposes its test seam (window.__FORKIT_TEST__.api)');
if (!api){ print('\nFATAL: no test seam — aborting'); throw new Error('no test seam'); }

var ts = 0;
function frame(){ var cb = PENDING; PENDING = null; ts += 16; if (cb) cb(ts); }
function stopAt(a){ api.setAngle(a); api.tap(); }          // stop the active utensil at angle a
function nextSeat(a){ stopAt(a); stopAt(a); stopAt(a); api.cont(); }   // 3 utensils + continue to the next place

// ---------------------------------------------------------------------------
section('A. stopping dead-straight is a PERFECT and the multiplier climbs');
api.start();
eq(api.activeKind(), 'fork', 'a run starts with the fork spinning');
stopAt(0);
eq(api.lastTier(), 'perfect', 'stopping at vertical = perfect');
eq(api.mult(), 2, 'perfect bumps the multiplier (1 -> 2)');
eq(api.score(), 20, 'score = 10 * mult(2)');
eq(api.activeKind(), 'knife', 'next up is the knife');
stopAt(0);
eq(api.score(), 50, 'second perfect adds 10 * mult(3)');
eq(api.activeKind(), 'spoon', 'then the spoon');
stopAt(0);
eq(api.seatsDone(), 1, 'three utensils finish the seat');
eq(api.state(), 'seatdone', 'the game pauses on the finished place');
api.cont();
eq(api.state(), 'playing', 'a tap continues to the next place');
eq(api.seat(), 1, 'advanced to seat 1');
eq(api.activeKind(), 'fork', 'which starts with the fork again');

// ---------------------------------------------------------------------------
section('B. graded tiers by how straight you stop it (bands are widest at the start)');
api.start();
stopAt(0.05); eq(api.lastTier(), 'perfect', 'err 0.05 -> perfect');
stopAt(0.25); eq(api.lastTier(), 'sharp',   'err 0.25 -> sharp');
stopAt(0.42); eq(api.lastTier(), 'good',    'err 0.42 -> good');
api.cont();
stopAt(0.90); eq(api.lastTier(), 'sloppy',  'err 0.90 -> sloppy');

// ---------------------------------------------------------------------------
section('C. combo: sharp+ builds, good holds, sloppy resets to 1');
api.start();
stopAt(0.25); eq(api.mult(), 2, 'sharp builds the multiplier');
stopAt(0.42); eq(api.mult(), 2, 'a plain good HOLDS the multiplier');
stopAt(0.25); eq(api.mult(), 3, 'another sharp keeps building');
api.cont();
stopAt(0.90); eq(api.mult(), 1, 'a sloppy stop RESETS the multiplier');

// ---------------------------------------------------------------------------
section('C2. a sloppy miss scores ZERO — random mashing cannot out-score careful play');
api.start();
var cs = api.score();
stopAt(0.9);
eq(api.lastTier(), 'sloppy', 'a wild stop is graded sloppy');
eq(api.score(), cs, '...and adds no points at all');
stopAt(0.0);
ok(api.score() > cs, 'a careful perfect does score');

// ---------------------------------------------------------------------------
section('D. the green band tightens with TIME; spin base rises per seat');
api.start();
var pb0 = api.perfectBand();
api.setTime(9);                       // ~90% of the 90s elapsed
ok(api.perfectBand() < pb0 * 0.5, 'perfect band far tighter late (' + pb0.toFixed(3) + ' -> ' + api.perfectBand().toFixed(3) + ')');
ok(api.goodBand() < 0.5, 'even the good band shrinks (' + api.goodBand().toFixed(3) + ')');
api.setTime(90);                      // full time again
var b0 = api.seatBase();
for (var i = 0; i < 4; i++) nextSeat(0);
eq(api.seatsDone(), 4, 'four seats set');
ok(api.seatBase() > b0, 'spin base rose per seat (' + b0.toFixed(2) + ' -> ' + api.seatBase().toFixed(2) + ')');

// ---------------------------------------------------------------------------
section('E. running out of time ends the run (game over)');
api.start();
api.setTime(0.03);
api.tick(0.05);
eq(api.state(), 'over', 'hitting 0:00 ends the run');

// ---------------------------------------------------------------------------
section('F. full play: no frame errors, renderer draws');
FRAME_ERRORS.length = 0; DRAW_CALLS = 0;
api.start();
var seed = 13579;
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (var fr = 0; fr < 700; fr++){
  frame();
  if (api.state() === 'playing' && rnd() < 0.25){ api.setAngle((rnd() * 2 - 1) * 0.9); api.tap(); }
  else if (api.state() === 'seatdone' && rnd() < 0.4){ api.cont(); }
  if (api.state() === 'over'){ ELS.retryBtn._h.click(); }
}
ok(FRAME_ERRORS.length === 0, 'no frame errors during play (' + FRAME_ERRORS.length +
   (FRAME_ERRORS.length ? ': ' + FRAME_ERRORS[0] : '') + ')');
ok(DRAW_CALLS > 500, 'the renderer actually drew (' + DRAW_CALLS + ' fill/stroke calls)');

// ---------------------------------------------------------------------------
section('G. drawing never throws (roundRect degenerate + every utensil)');
var threw = 0;
[[0, 30], [-4, 30], [40, 0], [40, -3], [40, 30]].forEach(function(p){
  try { api.roundRect(10, 10, p[0], p[1], 8); CTX.fill(); } catch (e){ threw++; }
});
['fork', 'knife', 'spoon'].forEach(function(k){
  try { api.drawUtensil(k, 60, '#ccc', '#333'); } catch (e){ threw++; }
});
ok(threw === 0, 'degenerate roundRect + all utensils drew without throwing (' + threw + ')');

// ---------------------------------------------------------------------------
section('H. best score persists to localStorage');
api.start();
nextSeat(0);                          // score a seat
ok(api.score() > 0, 'scored before ending (' + api.score() + ')');
api.setTime(0.02);
for (var k = 0; k < 20 && api.state() === 'playing'; k++) api.tick(0.05);   // let any hitstop freeze expire, then time out
eq(api.state(), 'over', 'run ended in game over');
var b = parseInt(localStorage.getItem('forkItBest'), 10);
ok(!isNaN(b) && b >= 1, 'forkItBest stored (' + localStorage.getItem('forkItBest') + ')');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' fork-it test(s) failed');
