// Unit tests for the leaderboard Worker's pure helpers. run.sh extracts the
// ">>> TESTABLE ... <<< TESTABLE" block from leaderboard/worker.js and prepends
// it, so these assertions run against the REAL shipped code.

var PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; } else { FAIL++; print('    ✗ ' + msg); } }
function eq(a, b, msg){ ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n){ print('\n• ' + n); }

section('sanitizeName: nickname up to 12 chars, whitelist, case preserved');
eq(sanitizeName('Mario'), 'Mario', 'keeps a normal name, preserves case');
eq(sanitizeName('abc'), 'abc', 'no forced uppercase anymore');
eq(sanitizeName('MiXeD'), 'MiXeD', 'preserves mixed case');
eq(sanitizeName(''), 'Anonimo', 'empty -> Anonimo');
eq(sanitizeName(null), 'Anonimo', 'null -> Anonimo');
eq(sanitizeName('   '), 'Anonimo', 'whitespace only -> Anonimo');
eq(sanitizeName('Supercalifragilistic'), 'Supercalifra', 'truncates to 12');
ok(sanitizeName('Supercalifragilistic').length === 12, 'never longer than 12');
eq(sanitizeName('José!'), 'Jos', 'drops accents/punctuation');
eq(sanitizeName('🔥Ninja🔥'), 'Ninja', 'drops emoji');
eq(sanitizeName('hi   there'), 'hi there', 'collapses internal spaces');
eq(sanitizeName('  spaced  '), 'spaced', 'trims the ends');
eq(sanitizeName('x_y-z'), 'x_y-z', 'allows underscore and hyphen');
eq(sanitizeName('a@b.c'), 'abc', 'drops symbols, keeps letters');

section('validScore: integer within [0, maxScore] or null');
eq(validScore(42, 100000), 42, 'plain int');
eq(validScore('37', 100000), 37, 'numeric string');
eq(validScore(3.9, 100000), 3, 'floors floats');
eq(validScore(-1, 100000), null, 'rejects negative');
eq(validScore(100001, 100000), null, 'rejects over the cap (anti-cheat)');
eq(validScore('nope', 100000), null, 'rejects non-numeric');
eq(validScore(Infinity, 100000), null, 'rejects Infinity');
eq(validScore(0, 100000), 0, 'zero is valid');

section('insertScore: sorted desc, ties by earliest ts, trimmed');
var base = [
  { name: 'AAA', score: 10, ts: 1 },
  { name: 'BBB', score: 5,  ts: 2 }
];
var r1 = insertScore(base, { name: 'CCC', score: 7, ts: 3 }, 50);
eq(r1.length, 3, 'grows the list');
eq(r1[0].name, 'AAA', 'top stays top');
eq(r1[1].name, 'CCC', 'new score slots in the middle');
eq(r1[2].name, 'BBB', 'lowest last');
var tie = insertScore([{ name: 'OLD', score: 9, ts: 1 }], { name: 'NEW', score: 9, ts: 2 }, 50);
eq(tie[0].name, 'OLD', 'ties: earlier ts ranks higher');
var big = [];
for (var i = 0; i < 60; i++) big.push({ name: 'AAA', score: i, ts: i });
var trimmed = insertScore(big, { name: 'ZZZ', score: 999, ts: 999 }, 50);
eq(trimmed.length, 50, 'trims to MAX_ENTRIES');
eq(trimmed[0].name, 'ZZZ', 'best kept after trim');
ok(insertScore(undefined, { name: 'AAA', score: 1, ts: 1 }, 50).length === 1, 'tolerates a missing list');

section('rankOf / clampLimit / knownGame');
var lst = insertScore(base, { name: 'CCC', score: 7, ts: 3 }, 50);
eq(rankOf(lst, { name: 'CCC', score: 7, ts: 3 }), 2, 'reports 1-based rank');
eq(rankOf(lst, { name: 'ZZZ', score: 1, ts: 9 }), -1, 'absent -> -1');
eq(clampLimit('5'), 5, 'honors a valid limit');
eq(clampLimit('0'), 10, 'floors to default');
eq(clampLimit('999'), 50, 'caps at MAX_ENTRIES');
eq(clampLimit(null), 10, 'null -> default');
ok(knownGame('pancake-tower'), 'known game recognised');
ok(knownGame('sizzle'), 'second game (sizzle) recognised');
ok(!knownGame('doom'), 'unknown game rejected');

print('\n' + (FAIL === 0 ? '✅ ' : '❌ ') + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) throw new Error(FAIL + ' leaderboard test(s) failed');
