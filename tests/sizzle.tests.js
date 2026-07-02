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

// ---------------------------------------------------------------------------
section('I. the miss detector keeps running while the input cooldown is active');
api.start();
api.setArmToFlame(0);            // land a sear -> relocateFlame sets cooldown = COOLDOWN
api.attemptSear();
var sI = api.strikes();
api.passFlameDuringCooldown();   // piece flies past the fire while input is still gated
frame();
eq(api.strikes(), sI + 1, 'pass during cooldown still counted as MISSED');

// ---------------------------------------------------------------------------
section('J. at high speed the fresh fire is always reachable (entry lands after cooldown+reaction)');
Math.random = function(){ return 0; };   // deterministic min gap from here on
api.start();
for (var q = 0; q < 20; q++){ api.setArmToFlame(0.2); api.attemptSear(); }   // ok-sears push omega up
ok(api.omega() > 4.5, 'omega raised by ok-sears (' + api.omega().toFixed(2) + ')');
var gapNow = Math.abs(api.err());
var minNeeded = api.omega() * (0.22 + 0.18) + 0.30;   // omega*(COOLDOWN+REACT)+WINDOW
ok(gapNow >= minNeeded - 1e-6, 'fire placed at reachable distance (' + gapNow.toFixed(2) + ' >= ' + minNeeded.toFixed(2) + ')');
var sJ = api.strikes();
var hitAt = -1;
for (var fj = 1; fj <= 300; fj++){
  frame();
  if (api.strikes() > sJ){ hitAt = fj; break; }
}
ok(hitAt > 0, 'untapped pass at high speed is counted as MISSED (frame ' + hitAt + ')');
eq(api.strikes(), sJ + 1, 'exactly one strike for one pass');

// ---------------------------------------------------------------------------
section('K. every sear speeds the spin up — PERFECTs included (no cooling reward), capped at max');
api.start();
var w0 = api.omega();
api.setArmToFlame(0); api.attemptSear();                                     // perfect
ok(api.omega() > w0, 'a perfect also speeds up (' + w0.toFixed(2) + ' -> ' + api.omega().toFixed(2) + ')');
var w1 = api.omega();
api.setArmToFlame(0.2); api.attemptSear();                                   // ok sear
ok(api.omega() > w1, 'an ok sear speeds up (' + w1.toFixed(2) + ' -> ' + api.omega().toFixed(2) + ')');
for (var k2 = 0; k2 < 60; k2++){ api.setArmToFlame(0); api.attemptSear(); }  // spam sears
ok(api.omega() <= 6.6 + 1e-9, 'omega capped at max (' + api.omega().toFixed(2) + ')');

// ---------------------------------------------------------------------------
section('L. gaps are capped so the fire stays reachable even across a reversal');
Math.random = function(){ return 0.9999; };   // worst case: gaps at the cap, omega at max
api.start();
for (var l = 0; l < 40; l++){ api.setArmToFlame(0.2); api.attemptSear(); }
ok(api.omega() >= 6.6 - 1e-9, 'omega at max (' + api.omega().toFixed(2) + ')');
var freshGap = Math.abs(api.err());
ok(freshGap <= 3.35, 'gap capped (' + freshGap.toFixed(2) + ' <= 3.35)');
// invariant: after a flip (fire stays put) the long way round still gives
// the full COOLDOWN+REACT margin before the window entry
var entryAfterFlip = (Math.PI * 2 - freshGap - 0.30) / api.omega();
ok(entryAfterFlip >= 0.40 - 1e-6, 'post-reversal entry time >= COOLDOWN+REACT (' + entryAfterFlip.toFixed(3) + 's)');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' sizzle test(s) failed');
