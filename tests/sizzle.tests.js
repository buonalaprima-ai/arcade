// Regression suite for Sizzle. Runs the REAL game script (extracted from
// sizzle/index.html) under the jsc stub in env.js. See tests/run.sh.

var PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; print('    ✗ ' + msg); } }
function eq(a, b, msg){ ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n){ print('\n• ' + n); }

var api = (window.__SIZZLE_TEST__ && window.__SIZZLE_TEST__.api) || null;
ok(!!api, 'the game exposes its test seam (window.__SIZZLE_TEST__.api)');
if (!api){ print('\nFATAL: no test seam — aborting'); throw new Error('no test seam'); }

var ts = 0;
function frame(){ var cb = PENDING; PENDING = null; ts += 16; if (cb) cb(ts); }

// ---------------------------------------------------------------------------
section('A. PERFECT sears build the combo multiplier (10 * combo)');
api.start();
api.setArmToFlame(0);           // arm exactly on the flame -> perfect
api.attemptSear();
eq(api.combo(), 1, 'first perfect -> combo 1');
eq(api.score(), 10, 'first perfect -> +10');
api.setArmToFlame(0);
api.attemptSear();
eq(api.combo(), 2, 'second perfect -> combo 2');
eq(api.score(), 30, 'second perfect -> +20 (10*2)');

// ---------------------------------------------------------------------------
section('B. a near-miss (in window, not perfect) scores small and resets combo');
var before = api.score();
api.setArmToFlame(0.2);          // inside WINDOW (0.30) but outside PERFECT (0.11)
api.attemptSear();
eq(api.combo(), 0, 'near-miss resets the combo');
eq(api.score(), before + 3, 'near-miss -> +3');

// ---------------------------------------------------------------------------
section('C. three bad taps end the game');
api.start();
eq(api.strikes(), 0, 'fresh run has 0 strikes');
for (var i = 0; i < 3; i++){
  api.setArmToFlame(1.0);        // way outside the window -> bad tap
  api.attemptSear();
}
eq(api.strikes(), 3, 'three bad taps -> 3 strikes');
eq(api.state(), 'over', 'game over after 3 strikes');

// ---------------------------------------------------------------------------
section('D. letting the piece pass the fire is a strike');
api.start();
api.passFlame();                 // arm just crossed the flame without a tap
frame();                         // one update tick detects the miss
ok(api.strikes() >= 1, 'passing the fire unseared costs a strike (' + api.strikes() + ')');

// ---------------------------------------------------------------------------
section('E. full play: no frame errors, renderer draws');
FRAME_ERRORS.length = 0; DRAW_CALLS = 0;
api.start();
var seed = 13579;
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (var f = 0; f < 300; f++){
  frame();
  if (rnd() < 0.25){ api.setArmToFlame(rnd() < 0.6 ? 0 : 0.5); api.attemptSear(); }
  if (api.state() === 'over'){ ELS.retryBtn._h.click(); }
}
for (var k = 0; k < 40; k++) frame();
ok(FRAME_ERRORS.length === 0, 'no frame errors during play (' + FRAME_ERRORS.length +
   (FRAME_ERRORS.length ? ': ' + FRAME_ERRORS[0] : '') + ')');
ok(DRAW_CALLS > 500, 'the renderer actually drew (' + DRAW_CALLS + ' fill/stroke calls)');

// ---------------------------------------------------------------------------
section('F. drawFlame never throws (narrow / large)');
var flameThrows = 0;
for (var s = 0.5; s <= 40; s += 0.5){
  try { api.drawFlame(100, 100, s); } catch (e){ flameThrows++; }
}
ok(flameThrows === 0, 'drawFlame threw ' + flameThrows + ' times');

// ---------------------------------------------------------------------------
section('G. best score persists to localStorage');
var storedBest = parseInt(localStorage.getItem('sizzleBest'), 10);
ok(!isNaN(storedBest) && storedBest >= 1, 'sizzleBest stored (' + localStorage.getItem('sizzleBest') + ')');

// ---------------------------------------------------------------------------
section('H. a late-but-in-window position never auto-misses (fairness fix)');
api.start();
api.setArmToFlame(-0.2);         // past center, still inside WINDOW (trailing half)
frame();
eq(api.strikes(), 0, 'no premature MISSED while still inside the window');
api.attemptSear();
ok(api.score() >= 3, 'a late-but-in-window tap still scores (' + api.score() + ')');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' sizzle test(s) failed');
