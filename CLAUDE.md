# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Word Well**: a word-tetris browser game. Classic tetrominoes (no plus or pentomino shapes) are made of lettered squares. Spelling an English word across (left→right) or down (top→bottom) clears it, the way a full row clears in Tetris. The art direction is **Downwell**: pure black/white/red, chunky pixel art, cobblestone well walls, a red gem score and "GEM HIGH"-style rule banners. It is a proof of concept the owner is iterating on.

Live: https://mihai-molnar.github.io/word-well/ (GitHub Pages, served from `main` branch root, so pushing to `main` deploys).

## Commands

There is no build, bundler, package.json or lint step.

```sh
open index.html                     # play locally (works over file://)
node tools/check-logic.cjs          # logic assertions (findWords, gravity, rotation, QU) + generator stats
node tools/simulate.cjs             # greedy-bot playability sim: uniform letters vs PieceGenerator
node tools/build-words.mjs [list]   # regenerate js/words.js (downloads the default list if no path given)
```

`check-logic.cjs` uses `assert` and exits non-zero on failure. Run it after touching `js/logic.js`. Run `simulate.cjs` after tuning letter weights or generator rules, and compare words/piece and survival against the baseline (min length 3: generator ≈1.24 words/piece, 0/8 games lost; uniform A–Z ≈0.58, 8/8 lost).

## Hard constraints

- **Must run from `file://` with zero dependencies.** That means no `fetch()` of local files and no ES modules in the browser (both are blocked by CORS on file://). Everything loads through plain `<script>` tags that set globals. This is why the dictionary is a JS file (`window.WORDLIST = "..."`) rather than a .txt.
- **Pixel-perfect rendering.** Everything is drawn on a 320×272 internal canvas, CSS-scaled by an integer factor (`fit()`), with `imageSmoothingEnabled = false`. Keep all draw coordinates integers (`Math.round`/`Math.floor`), or edges blur.
- **Palette.** Stick to `BLACK`/`WHITE`/`RED` plus the existing dim helpers (`GREY`, `DIM`, `DIMRED`). Use dithering rather than new colors.
- `js/words.js` is generated. Change the word list via `tools/build-words.mjs` (its `BLOCKLIST` holds slurs/profanity and obscure 3-letter Scrabble filler), never by hand.

## Architecture

Script load order (index.html) matters, because each file publishes a global the next one uses:

1. `js/words.js` → `window.WORDLIST` (space-separated, about 25k common words, 3+ letters; source: dolph/dictionary `popular.txt`).
2. `js/font.js` → `window.WordWellFont`: a hand-made 5×7 bitmap font (`'#'` = lit pixel), a 3×5 small "u" for the QU tile and the gem sprite.
3. `js/logic.js` → `window.WordWellLogic`: **pure, DOM-free game rules**, also exported via `module.exports` so the Node tools can `require` it. Anything rules-related belongs here so it stays testable.
4. `js/game.js`: one IIFE holding rendering, input, WebAudio sfx, effects and the loop. It exposes `window.wordwell` (state/grid/piece/score/newGame) for console debugging and headless-browser tests.

### Core rules (logic.js)

- Grid is `ROWS=20 × COLS=10` of `null | {ch, dy, vy}`. `ch` is lowercase, and Q only exists as the single tile `'qu'` (words are matched by concatenating tile strings).
- Pieces are `{type, n, x, y, cells:[{x,y,ch}]}` inside an n×n box. Rotation moves letters with their squares, but glyphs stay upright, so rotating changes reading order (90° CW preserves it, 180° reverses it). The O piece rotates too (it cycles its letters). Wall kicks are a simple offset list (`KICKS`), not SRS tables.
- `findWords(grid, dict, minLen)` scans each maximal run in every row and column. Within a run, the longest dictionary words win and must not overlap; an across and a down word may share a tile.
- `applyGravity` is **per-column** (unlike Tetris row shifting): cleared squares leave holes and everything above falls. That is what makes chains possible.
- `scoreWord = Σ letter points × 10 × max(1, len−2) × chain`.

### The "letters must be usable" guarantee: `PieceGenerator`

This was the owner's key requirement (no dead pieces like `TRYX`). Each piece:

- comes from a 7-bag of shapes;
- draws letters from Scrabble-like weights, with J/K/QU/V/X/Z damped;
- gets a vowel quota of about 40%, adjusted against `vowelRatio(grid)` (consonant-heavy board → more vowels);
- has at most one rare letter, and no letter three times;
- must pass a check that every across/down run inside the piece (spawn orientation) is an infix of some dictionary word (the `dict.infixes` set of 2–4-letter chunks);
- must not already spell a word (no free clears).

It retries up to 400 times and falls back to the least-bad draw.

### Game loop / state machine (game.js)

`state`: `title | play | clearing | settling | paused | over`.

Lock → `resolve()`. If words are found: `clearing` (flash for `CLEAR_TIME`) → `finishClear()` (score, particles, gems fly to the score, `applyGravity`, with each moved tile animating via `dy/vy`) → `settling` until all tiles land → `resolve()` again, with `chain++` each pass. When no words remain, `chain=0` and `spawn()` runs. Game over happens when a spawn collides or a cell locks above row 0.

Other mechanics: lock delay of 500ms with up to 15 move resets; DAS/ARR auto-repeat in `updateHeld`; levels every 8 words, with gravity `900·0.86^(lvl−1)` ms (min 70).

The **hint** system (`updateHints`) runs `findWords` on a copy of the grid with the piece at its ghost position after every move. The cells involved pulse red, and the words are listed in the right panel (toggle: H).

Rendering: sprites (glyphs per color, tiles per `style:ch`) are built once into small canvases and cached. Tile styles: `locked`, `active`, `ghost`, `ghostHint`, `hint`, `flash`, `flashRed`, `dead`. The well's layout constants are `WELL_X/WELL_Y/CELL=12/TILE=11`; use `cellPx(x)`/`cellPy(y)` for tile positions. The HUD is drawn after resetting the transform, so it doesn't shake with the screen.

Settings persist in `localStorage` under `wordwell.*` (minLen, hints, muted, best), always wrapped in try/catch.

## Verifying visual changes

Headless Chrome works for screenshots and driving input. Launch `--headless=new --remote-debugging-port=…`, then use the CDP `Input.dispatchKeyEvent` and `Page.captureScreenshot` commands over Node's global `WebSocket`. You can set up board states through `window.wordwell.grid`/`.piece`, but only once `wordwell.state === 'play'`; injecting mid-clear corrupts the clear.

## Ideas not yet built

These were discussed as next steps: a wildcard tile or bomb piece to get rid of stuck letters, an optional full-row-clear fallback, a hold slot, touch controls, and bonuses for crossing words. A minimum length of 3 may be too easy (the bot never dies); 4 is the "hard mode".
