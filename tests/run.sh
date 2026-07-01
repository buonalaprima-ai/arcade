#!/usr/bin/env bash
# Regression tests for the Arcade games. Runs the REAL shipped game code
# (extracted from each game's index.html) under JavaScriptCore (jsc), so there
# is no build step and no separate copy of the logic to drift out of sync.
#
# Usage:  tests/run.sh          (or:  JSC=/path/to/jsc tests/run.sh)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
GAME="$DIR/../pancake-tower/index.html"
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc}"

if [ ! -x "$JSC" ]; then
  echo "jsc not found at: $JSC"
  echo "On macOS it ships with the system; or set JSC=/path/to/jsc"
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# pull the inline <script> out of the game's single HTML file
awk 'f && /<\/script>/{f=0} f; /<script>/{f=1}' "$GAME" > "$TMP/game.js"

if [ ! -s "$TMP/game.js" ]; then
  echo "could not extract <script> from $GAME"
  exit 2
fi

echo "Torre di Pancake — regression suite"
if "$JSC" "$DIR/env.js" "$TMP/game.js" "$DIR/tests.js"; then
  exit 0
else
  code=$?
  echo ""
  echo "TESTS FAILED (exit $code)"
  exit 1
fi
