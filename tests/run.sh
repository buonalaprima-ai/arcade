#!/usr/bin/env bash
# Regression tests for Buonalaprima Arcade. Everything runs against the REAL
# shipped code (extracted from the game HTML / the Worker source) under
# JavaScriptCore (jsc) — no build step, no duplicated logic to drift.
#
# Usage:  tests/run.sh          (or:  JSC=/path/to/jsc tests/run.sh)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$DIR/.."
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc}"

if [ ! -x "$JSC" ]; then
  echo "jsc not found at: $JSC"
  echo "On macOS it ships with the system; or set JSC=/path/to/jsc"
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rc=0

echo "=== Pancake Tower — game regression suite ==="
awk 'f && /<\/script>/{f=0} f; /<script>/{f=1}' "$ROOT/pancake-tower/index.html" > "$TMP/pancake.js"
if [ ! -s "$TMP/pancake.js" ]; then echo "could not extract pancake <script>"; exit 2; fi
if "$JSC" "$DIR/env.js" "$TMP/pancake.js" "$DIR/tests.js"; then :; else rc=1; fi

echo ""
echo "=== Sizzle — game regression suite ==="
awk 'f && /<\/script>/{f=0} f; /<script>/{f=1}' "$ROOT/sizzle/index.html" > "$TMP/sizzle.js"
if [ ! -s "$TMP/sizzle.js" ]; then echo "could not extract sizzle <script>"; exit 2; fi
if "$JSC" "$DIR/env.js" "$TMP/sizzle.js" "$DIR/sizzle.tests.js"; then :; else rc=1; fi

echo ""
echo "=== Leaderboard Worker — logic suite ==="
awk '/>>> TESTABLE/{f=1;next} /<<< TESTABLE/{f=0} f' "$ROOT/leaderboard/worker.js" > "$TMP/helpers.js"
if [ ! -s "$TMP/helpers.js" ]; then echo "could not extract Worker helpers"; exit 2; fi
if "$JSC" "$TMP/helpers.js" "$DIR/leaderboard.tests.js"; then :; else rc=1; fi

echo ""
if [ "$rc" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "SOME TESTS FAILED"; fi
exit "$rc"
