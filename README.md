# 🎮 Buonalaprima Arcade

A little collection of "tram" web games: one hand, quick runs, no account, offline-friendly, with a shared worldwide leaderboard. Every game is a single self-contained `index.html` — no build, no external libraries, all sound synthesized with the Web Audio API.

## Games

| Game | Status | How to play |
|------|--------|-------------|
| 🥞 [Pancake Tower](pancake-tower/) | ✅ live | Tap in time to stack the pancakes; nail PERFECTs for combos |
| 🍢 [Sizzle](sizzle/) | ✅ live | Tap the instant the piece passes over the fire; chain PERFECTs |
| 🍳 Kitchen Merge | 🔜 soon | Merge ingredients up a recipe |
| 🍣 Sushi Match | 🔜 soon | Match 3+ bites |

## Structure

```
arcade/
├── index.html            # hub / launcher
├── pancake-tower/        # game: canvas + game logic + palette + song data only
├── sizzle/               # game: canvas + game logic + palette + song data only
├── shared/
│   ├── arcade.js         # the shell (single source of truth): HUD (back pill,
│   │                     #   independent music/SFX toggles, score column),
│   │                     #   start/game-over cards, leaderboard panel,
│   │                     #   WebAudio SFX + music engine, lifecycle wiring
│   ├── arcade.css        # shared shell styles (each game sets its palette via CSS vars)
│   └── leaderboard.js    # leaderboard API client (one line: the Worker URL)
├── leaderboard/
│   ├── worker.js         # Cloudflare Worker: one leaderboard for all games, keyed by `game`
│   ├── deploy.sh         # deploy Worker + KV via the Cloudflare REST API (no Node)
│   └── admin.sh          # moderation: list / remove / clear entries directly in KV
└── tests/
    └── run.sh            # jsc regression suites, run against the REAL shipped code
```

A game file contains only what makes it unique: its palette (CSS custom
properties), its canvas rendering + game logic, its SFX map and its chiptune
song data. Everything else comes from `shared/arcade.js` via
`Arcade.init({...})` — adding a UI feature to every game is a one-file change.

## Leaderboard

One Cloudflare Worker (`arcade-leaderboard`) serves every game, keyed by a `game` id, backed by a single Workers KV namespace. Scores are validated server-side (name up to 12 chars, per-game score cap), rate-limited per IP, and CORS is locked to the Pages origin. The client (`shared/leaderboard.js`) fails soft: offline or unreachable, the game keeps working with the local best.

Adding a game to the board = one line in `worker.js` (`GAMES`) + re-deploy.

## Tests

```
tests/run.sh
```

Runs three jsc suites (macOS ships JavaScriptCore) against the real code extracted from the game HTML and the Worker source — no build, no duplicated logic to drift: Pancake Tower, Sizzle, and the leaderboard Worker logic.

## Publishing

Served from GitHub Pages: the hub is the root, each game lives in its own subfolder.
