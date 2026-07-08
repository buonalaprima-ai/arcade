// Regression suite for "Pop Shot" — sling-and-pop popcorn game.
// Runs the REAL game script (extracted from pop-shot/index.html) under env.js + shell.

var PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; print('    ✗ ' + msg); } }
function eq(a, b, msg){ ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n){ print('\n• ' + n); }

var api = (window.__POPSHOT_TEST__ && window.__POPSHOT_TEST__.api) || null;
ok(!!api, 'the game exposes its test seam (window.__POPSHOT_TEST__.api)');
if (!api){ print('\nFATAL: no test seam — aborting'); throw new Error('no test seam'); }

var ts = 0;
function frame(){ var cb = PENDING; PENDING = null; ts += 16; if (cb) cb(ts); }
var W = api.W(), H = api.H();

// ---------------------------------------------------------------------------
section('A. a kernel drops from the chute and seats in the scoop with a lit fuse');
api.start();
eq(api.state(), 'playing', 'a run starts playing');
eq(api.kState(), 'drop', 'a kernel is dropping in');
eq(api.lives(), 3, 'three corn lives');
for (var a = 0; a < 40 && api.kState() === 'drop'; a++) api.tick(0.05);
eq(api.kState(), 'seat', 'the kernel seated in the scoop');
ok(api.kFuse() > 0, 'and its fuse is lit (' + api.kFuse().toFixed(2) + 's)');

// ---------------------------------------------------------------------------
section('B. letting a seated fuse burn out pops it on YOU — lose a life');
api.start();
api.seat();
api.setFuse(0.02);
api.tick(0.05);
eq(api.lives(), 2, 'the fuse-out cost a life');
eq(api.kState(), null, 'the kernel is gone (reloading)');

// ---------------------------------------------------------------------------
section('C. slinging a kernel makes it fly, then POP at fuse-end');
api.start();
api.seat();
api.launch(0, -H * 0.4);
eq(api.kState(), 'fly', 'the kernel is airborne');
var r0 = api.resolved();
api.setFuse(0.08);
for (var c = 0; c < 10 && api.kState() === 'fly'; c++) api.tick(0.05);
eq(api.kState(), null, 'it popped at fuse-end');
ok(api.resolved() > r0, 'and counts as resolved');

// ---------------------------------------------------------------------------
section('D. a burst blooms with a radius and scores n^2 (chain)');
api.start();
api.clearTargets();
var cx = W * 0.5, cy = H * 0.4;
api.addTarget(cx, cy); api.addTarget(cx + W * 0.05, cy); api.addTarget(cx - W * 0.05, cy);   // 3 in the bloom
var s0 = api.score();
api.explodeAt(cx, cy);
eq(api.score(), s0 + 900, 'three buckets in one bloom = 100 * 3^2 = 900');
eq(api.targets(), 0, 'the fed buckets are cleared');

// ---------------------------------------------------------------------------
section('D2. a lone bucket scores 100; an empty-air pop scores nothing (no penalty)');
api.start();
api.clearTargets();
var s1 = api.score();
api.addTarget(W * 0.5, H * 0.4);
api.explodeAt(W * 0.5, H * 0.4);
eq(api.score(), s1 + 100, 'one bucket = 100');
var s2 = api.score(), lv = api.lives();
api.explodeAt(W * 0.5, H * 0.4);                     // nothing there
eq(api.score(), s2, 'an empty pop scores nothing');
eq(api.lives(), lv, '...and costs no life (firing is always safe)');

// ---------------------------------------------------------------------------
section('E. three life-losses end the run');
api.start();
for (var g = 0; g < 40 && api.state() === 'playing'; g++){
  if (api.kState() === null) api.tick(1);              // let the reload pass -> a new kernel drops
  if (api.kState() === 'drop') api.seat();
  if (api.kState() === 'seat'){ api.setFuse(0.01); api.tick(0.05); }
}
eq(api.lives(), 0, 'lives ran out');
eq(api.state(), 'over', 'the run ended');

// ---------------------------------------------------------------------------
section('F. full play: no frame errors, renderer draws');
FRAME_ERRORS.length = 0; DRAW_CALLS = 0;
api.start();
var seed = 24601;
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (var fr = 0; fr < 700; fr++){
  frame();
  if (api.state() === 'playing' && api.kState() === 'seat' && rnd() < 0.15) api.launch((rnd() * 2 - 1) * H * 0.3, -H * (0.3 + rnd() * 0.3));
  if (api.state() === 'over'){ ELS.retryBtn._h.click(); }
}
ok(FRAME_ERRORS.length === 0, 'no frame errors during play (' + FRAME_ERRORS.length +
   (FRAME_ERRORS.length ? ': ' + FRAME_ERRORS[0] : '') + ')');
ok(DRAW_CALLS > 500, 'the renderer actually drew (' + DRAW_CALLS + ' fill/stroke calls)');

// ---------------------------------------------------------------------------
section('G. roundRect never throws on degenerate sizes');
var threw = 0;
[[0, 30], [-4, 30], [40, 0], [40, -3], [40, 30]].forEach(function(p){
  try { api.roundRect(10, 10, p[0], p[1], 8); CTX.fill(); } catch (e){ threw++; }
});
ok(threw === 0, 'degenerate roundRect drew without throwing (' + threw + ')');

// ---------------------------------------------------------------------------
section('H. best score persists to localStorage');
api.start();
api.clearTargets();
api.addTarget(W * 0.5, H * 0.4); api.addTarget(W * 0.54, H * 0.4); api.addTarget(W * 0.46, H * 0.4);
api.explodeAt(W * 0.5, H * 0.4);                     // 900
ok(api.score() >= 900, 'scored before ending (' + api.score() + ')');
for (var g2 = 0; g2 < 40 && api.state() === 'playing'; g2++){
  if (api.kState() === null) api.tick(1);
  if (api.kState() === 'drop') api.seat();
  if (api.kState() === 'seat'){ api.setFuse(0.01); api.tick(0.05); }
}
eq(api.state(), 'over', 'run ended');
var bb = parseInt(localStorage.getItem('popShotBest'), 10);
ok(!isNaN(bb) && bb >= 900, 'popShotBest stored (' + localStorage.getItem('popShotBest') + ')');

// ---------------------------------------------------------------------------
section('I. the POP-HERE predictor obeys the walls AND matches the real pop point');
var STEP = 1 / 60;
api.start();
api.seat();
var F = 0.9, vx = H * 1.2, vy = -H * 0.5;                    // a hard, shallow side shot that WILL hit a wall
var pred = api.predictEnd(vx, vy, F);
ok(pred.x >= 0 && pred.x <= W, 'the predicted pop stays on-screen — it reflects off the wall (x=' + Math.round(pred.x) + ' of ' + Math.round(W) + ')');
api.setFuse(F);
api.launch(vx, vy);
for (var i = 0; i < 400 && api.kState() === 'fly'; i++) api.tick(STEP);
var burst = api.lastBurst();
ok(!!burst, 'the kernel actually popped mid-air');
var derr = burst ? Math.hypot(burst.x - pred.x, burst.y - pred.y) : 999;
ok(derr < 3, 'predictor matches the real bounced pop within 3px (Δ=' + derr.toFixed(2) + 'px)');

// ---------------------------------------------------------------------------
section('I2. predictor still matches the real pop at a COARSE frame rate (fixed-timestep accumulator)');
api.start();
api.seat();
var F2 = 1.1, vx2 = H * 0.9, vy2 = -H * 0.7;
var pred2 = api.predictEnd(vx2, vy2, F2);
api.setFuse(F2);
api.launch(vx2, vy2);
for (var j = 0; j < 200 && api.kState() === 'fly'; j++) api.tick(0.05);    // chunky ~20fps ticks
var b2 = api.lastBurst();
var derr2 = b2 ? Math.hypot(b2.x - pred2.x, b2.y - pred2.y) : 999;
ok(derr2 < 3, 'the flight integrates in fixed steps, so a coarse frame rate still lands where the marker promised (Δ=' + derr2.toFixed(2) + 'px)');

// ---------------------------------------------------------------------------
section('J. a fuse-out while still aiming clears the aim (no stale auto-shot on the next kernel)');
api.start();
api.seat();
api.aimDrag(W * 0.5, H * 0.9, W * 0.42, H * 0.98);
ok(api.isAiming(), 'aiming engaged (finger down)');
api.setFuse(0.01);
api.tick(0.05);                                             // seated fuse burns out -> splat
ok(!api.isAiming(), 'the splat cleared the stranded aim');
eq(api.lives(), 2, 'and it still cost a life');

// ---------------------------------------------------------------------------
section('K. the aiming overlay (arc, sling, bloom, slow-mo vignette) renders cleanly');
FRAME_ERRORS.length = 0;
api.start();
api.seat();
api.aimDrag(W * 0.5, H * 0.9, W * 0.4, H * 0.99);          // a real pull -> full overlay
frame();
ok(FRAME_ERRORS.length === 0, 'aiming frame drew without error (' + (FRAME_ERRORS[0] || 'clean') + ')');

// ---------------------------------------------------------------------------
section('L. a launched kernel popping in your face costs a life (no free straight-up lob)');
api.start();
api.clearTargets();
var sc = api.scoop(), dz = api.danger();
var s0L = api.score(), lv0L = api.lives();
api.forceBurst(sc.x, sc.y - dz * 0.5);                      // pop well inside the danger dome
eq(api.lives(), lv0L - 1, 'the self-blast took a life');
eq(api.score(), s0L, 'and scored nothing');

// a pop OUTSIDE the dome (up in the air) is still safe
api.start();
api.clearTargets();
var sc2 = api.scoop(), dz2 = api.danger(), lvSafe = api.lives();
api.forceBurst(sc2.x, sc2.y - dz2 * 1.8);                   // high above the dome
eq(api.lives(), lvSafe, 'a high pop is life-safe');

// ---------------------------------------------------------------------------
section('M. popping a chili pepper burns you — costs a life instead of scoring');
api.start();
api.clearTargets();
var py = H * 0.3;                                           // up in the air, above the danger dome
api.addTarget(W * 0.5, py, 'bad');
var s0M = api.score(), lv0M = api.lives();
api.explodeAt(W * 0.5, py);
eq(api.lives(), lv0M - 1, 'the spicy pop cost a life');
eq(api.score(), s0M, 'and scored nothing');
eq(api.targets(), 0, 'the pepper detonated (removed)');

// ---------------------------------------------------------------------------
section('M2. a pepper caught alongside good corn still burns you (bad dominates the bloom)');
api.start();
api.clearTargets();
var yy = H * 0.3;
api.addTarget(W * 0.5, yy, 'good');
api.addTarget(W * 0.52, yy, 'bad');
var s0M2 = api.score(), lv0M2 = api.lives();
api.explodeAt(W * 0.5, yy);
eq(api.lives(), lv0M2 - 1, 'the pepper in the blast still burned you');
eq(api.score(), s0M2, 'no points when a pepper is in the bloom');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' pop-shot test(s) failed');
