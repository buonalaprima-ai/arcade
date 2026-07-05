// Regression suite for "Nine Bars" (the redesigned espresso game — a hold-to-build
// pressure-gauge game). Runs the REAL game script (extracted from espresso/index.html)
// under the jsc stub in env.js + the shared shell.

var PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; print('    ✗ ' + msg); } }
function eq(a, b, msg){ ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n){ print('\n• ' + n); }
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

var api = (window.__ESPRESSO_TEST__ && window.__ESPRESSO_TEST__.api) || null;
ok(!!api, 'the game exposes its test seam (window.__ESPRESSO_TEST__.api)');
if (!api){ print('\nFATAL: no test seam — aborting'); throw new Error('no test seam'); }

var ts = 0;
function frame(){ var cb = PENDING; PENDING = null; ts += 16; if (cb) cb(ts); }
function stayIn(steps){ for (var i = 0; i < steps; i++){ api.setNeedle(api.targetNow()); api.tick(0.05); } }
function stayOut(steps){ for (var i = 0; i < steps && api.state() === 'playing'; i++){ api.setNeedle(clamp(api.targetNow() + 0.6, 0, 1)); api.tick(0.05); } }

// ---------------------------------------------------------------------------
section('A. physics — holding builds pressure, releasing bleeds it');
api.start();
api.pin(false);
api.setNeedle(0.3);
api.begin();                                    // arm the run + start holding
for (var a = 0; a < 20; a++) api.tick(0.05);   // ~1s of holding
ok(api.needle() > 0.35, 'holding raised the needle (' + api.needle().toFixed(2) + ')');
var top = api.needle();
api.hold(false);
for (var a2 = 0; a2 < 20; a2++) api.tick(0.05);
ok(api.needle() < top, 'releasing let the needle bleed down (' + api.needle().toFixed(2) + ' < ' + top.toFixed(2) + ')');

// ---------------------------------------------------------------------------
section('B. flow — staying in the green extracts, scores, and completes cups');
api.start();
api.begin();
api.pin(true);
var completed = false;
for (var b = 0; b < 120 && !completed; b++){ api.setNeedle(api.targetNow()); api.tick(0.05); if (api.served() >= 1) completed = true; }
ok(completed, 'staying in the green completes a cup');
ok(api.combo() >= 2, 'a completed cup bumps the combo (' + api.combo() + ')');
ok(api.score() > 0, 'extracting scores points (' + api.score() + ')');
ok(api.served() >= 1, 'a completed cup is counted (' + api.served() + ')');

// ---------------------------------------------------------------------------
section('C. THE FIX — you cannot farm: out of the green scores nothing and strikes');
api.start();
api.begin();
api.pin(true);
var s0 = api.score(), struck = false;
for (var c = 0; c < 60 && !struck; c++){ api.setNeedle(clamp(api.targetNow() + 0.6, 0, 1)); api.tick(0.05); if (api.strikes() > 0) struck = true; }
ok(struck, 'sitting outside the green -> strike (no risk-free safe zone)');
eq(api.score(), s0, 'no points accrue while out of the green');

// ---------------------------------------------------------------------------
section('C2. the combo resets the instant you leave the green (no lazy streaks)');
api.start();
api.begin();
api.pin(true);
stayIn(120);                                   // build a streak by staying in
ok(api.combo() >= 2, 'combo built while in the green (' + api.combo() + ')');
api.setNeedle(clamp(api.targetNow() + 0.5, 0, 1));   // step out of the green
api.tick(0.05);
eq(api.combo(), 1, 'combo dropped to 1 immediately on leaving the green');

// ---------------------------------------------------------------------------
section('D. three strikes end the game');
api.start();
api.begin();
api.pin(true);
for (var d = 0; d < 3000 && api.state() === 'playing'; d++){ api.setNeedle(clamp(api.targetNow() + 0.7, 0, 1)); api.tick(0.05); }
eq(api.strikes(), 3, 'game ends at 3 strikes');
eq(api.state(), 'over', 'state is over');

// ---------------------------------------------------------------------------
section('E. difficulty ramps — the channel narrows and grace tightens with progress');
api.start();
api.begin();
api.pin(true);
var h0 = api.chanHalf(), g0 = api.grace();
stayIn(160);
ok(api.served() >= 2, 'several cups served (' + api.served() + ')');
ok(api.chanHalf() < h0, 'channel narrowed (' + h0.toFixed(3) + ' -> ' + api.chanHalf().toFixed(3) + ')');
ok(api.grace() <= g0, 'grace tightened (' + g0.toFixed(3) + ' -> ' + api.grace().toFixed(3) + ')');

// ---------------------------------------------------------------------------
section('F. full play: no frame errors, renderer draws');
FRAME_ERRORS.length = 0; DRAW_CALLS = 0;
api.start();
api.begin();
api.pin(false);
var seed = 24680;
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (var fr = 0; fr < 700; fr++){
  frame();
  if (api.state() === 'playing'){
    if (rnd() < 0.35) api.hold(true);
    else if (rnd() < 0.4) api.hold(false);
  }
  if (api.state() === 'over'){ ELS.retryBtn._h.click(); api.begin(); }
}
ok(FRAME_ERRORS.length === 0, 'no frame errors during play (' + FRAME_ERRORS.length +
   (FRAME_ERRORS.length ? ': ' + FRAME_ERRORS[0] : '') + ')');
ok(DRAW_CALLS > 500, 'the renderer actually drew (' + DRAW_CALLS + ' fill/stroke calls)');

// ---------------------------------------------------------------------------
section('G. roundRect never throws on degenerate sizes');
var threw = 0;
[[0, 30], [-5, 30], [40, 0], [40, -3], [40, 30]].forEach(function(p){
  try { api.roundRect(10, 10, p[0], p[1], 8); CTX.fill(); } catch (e){ threw++; }
});
ok(threw === 0, 'roundRect degenerate inputs (' + threw + ')');

// ---------------------------------------------------------------------------
section('H. best score persists to localStorage');
api.start();
api.begin();
api.pin(true);
stayIn(80);
ok(api.score() > 0, 'scored before dying (' + api.score() + ')');
stayOut(3000);
eq(api.state(), 'over', 'run ended in game over');
var storedBest = parseInt(localStorage.getItem('espressoBest'), 10);
ok(!isNaN(storedBest) && storedBest >= 1, 'espressoBest stored (' + localStorage.getItem('espressoBest') + ')');

// ---------------------------------------------------------------------------
section('K. wave shape — steep sweeps kept, yet smooth (never clamps) and reachable');
api.start();
api.begin();
api.pin(true);
var prevT = api.targetNow(), prevSlope = 0;
var maxSlope = 0, maxStep = 0, maxCurv = 0, loT = 1, hiT = 0, clamps = false;
var wdt = 0.05;
var slopeEarly = 0, slopeLate = 0;
for (var wi = 0; wi < 2400 && api.state() === 'playing'; wi++){  // ~120s across the difficulty ramp
  api.setNeedle(api.targetNow());                                // stay in the green so the run doesn't end
  api.tick(wdt);
  var t = api.targetNow(), ch = api.chanHalf();
  var slope = Math.abs(t - prevT) / wdt;
  maxStep = Math.max(maxStep, Math.abs(t - prevT));
  maxSlope = Math.max(maxSlope, slope);
  maxCurv = Math.max(maxCurv, Math.abs(slope - prevSlope));
  loT = Math.min(loT, t); hiT = Math.max(hiT, t);
  if (t + ch > 1.0001 || t - ch < -0.0001 || t < 0.02 || t > 0.98) clamps = true;
  if (wi < 300) slopeEarly = Math.max(slopeEarly, slope);        // first ~15s
  if (wi >= 1800) slopeLate = Math.max(slopeLate, slope);        // after ~90s
  prevT = t; prevSlope = slope;
}
eq(api.state(), 'playing', 'wave run stayed alive (in the green throughout)');
ok(maxSlope >= 0.45, 'steep sweeps are present (max slope ' + maxSlope.toFixed(3) + ' u/s)');
ok(slopeLate > slopeEarly * 1.8, 'difficulty ramps: late sweeps far steeper than early (' +
   slopeEarly.toFixed(3) + ' -> ' + slopeLate.toFixed(3) + ')');
ok(hiT - loT >= 0.45, 'sweeps cover a wide vertical range (' + (hiT - loT).toFixed(2) + ')');
ok(!clamps, 'the wave never clamps or pins the band (no hard corners)');
ok(maxStep <= 0.06, 'continuous — no per-frame jump (max step ' + maxStep.toFixed(4) + ')');
ok(maxCurv <= 0.20, 'smooth — slope never jumps sharply (max ' + maxCurv.toFixed(4) + ')');
ok(maxSlope <= 1.15, 'wave stays reachable by the needle (VMAX 1.15)');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' espresso test(s) failed');
