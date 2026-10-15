# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Word Well**: a word-tetris browser game. Classic tetrominoes (no plus or pentomino shapes) are made of lettered squares. Spelling an English word across (left→right) or down (top→bottom) clears it, the way a full row clears in Tetris. Every few pieces the dealer also spells out a **target word** (5–7 letters) for a ×3 bonus. The art direction is **Downwell**: pure black/white/red, chunky pixel art, cobblestone well walls, a red gem score and "GEM HIGH"-style rule banners. It is a proof of concept the owner is iterating on.

Live: https://mihai-molnar.github.io/word-well/ (GitHub Pages, served from `main` branch root, so pushing to `main` deploys).

## Commands

There is no build, bundler, package.json or lint step.

```sh
open index.html                     # play locally (works over file://)
node tools/check-logic.cjs          # logic assertions (findWords, gravity, rotation, QU, targets) + generator stats
node tools/simulate.cjs             # greedy-bot playability sim: uniform letters vs PieceGenerator, with/without targets
node tools/build-words.mjs [list] [freq]  # regenerate js/words.js (downloads both default lists if no paths given)
```

`check-logic.cjs` uses `assert` and exits non-zero on failure. Run it after touching `js/logic.js`. Run `simulate.cjs` after tuning letter weights, generator rules or target constants. Compare against this baseline at min length 3:

| Dealer | words/piece | games lost | 5+ letter words | targets hit |
|---|---|---|---|---|
| Generator | ≈1.24 | 0/8 | 2% | n/a |
| Generator + targets | ≈1.10 | 0/8 | 14% | 334/344 |
| Uniform A–Z | ≈0.6 | 8/8 | n/a | n/a |

The bot searches every placement and looks one piece ahead for a target's first chunk, so humans hit far fewer targets than it does.

## Hard constraints

- **Must run from `file://` with zero dependencies.** That means no `fetch()` of local files and no ES modules in the browser (both are blocked by CORS on file://). Everything loads through plain `<script>` tags that set globals. This is why the dictionary is a JS file (`window.WORDLIST = "..."`) rather than a .txt.
- **Pixel-perfect rendering.** Everything is drawn on a 320×272 internal canvas, CSS-scaled by an integer factor (`fit()`), with `imageSmoothingEnabled = false`. Keep all draw coordinates integers (`Math.round`/`Math.floor`), or edges blur.
- **Palette.** Stick to `BLACK`/`WHITE`/`RED` plus the existing dim helpers (`GREY`, `DIM`, `DIMRED`). Use dithering rather than new colors.
- `js/words.js` is generated. Change the word list via `tools/build-words.mjs` (its `BLOCKLIST` holds slurs/profanity and obscure 3-letter Scrabble filler), never by hand. That script also writes `window.TARGETS`, built from the 6000 most frequent words of first20hours/google-10000-english that are also in the dictionary. Targets are 5–7 letters, have no J/K/Q/V/X/Z, and don't end in S.

## Architecture

Script load order (index.html) matters, because each file publishes a global the next one uses:

1. `js/words.js` → `window.WORDLIST` (space-separated, about 25k common words, 3+ letters; source: dolph/dictionary `popular.txt`) and `window.TARGETS` (about 1.5k well-known words the dealer can ask for).
2. `js/font.js` → `window.WordWellFont`: a hand-made 5×7 bitmap font (`'#'` = lit pixel), a 3×5 small "u" for the QU tile and the gem sprite.
3. `js/logic.js` → `window.WordWellLogic`: **pure, DOM-free game rules**, also exported via `module.exports` so the Node tools can `require` it. Anything rules-related belongs here so it stays testable.
4. `js/game.js`: one IIFE holding rendering, input, WebAudio sfx, effects and the loop. It exposes `window.wordwell` (state/grid/piece/score/newGame) for console debugging and headless-browser tests.

### Core rules (logic.js)

- Grid is `ROWS=20 × COLS=10` of `null | {ch, dy, vy, tgt?}`. `ch` is lowercase, and Q only exists as the single tile `'qu'` (words are matched by concatenating tile strings). `tgt` is set on tiles reserved for the live target word.
- Pieces are `{type, n, x, y, cells:[{x,y,ch,tgt?}], target?}` inside an n×n box. Rotation moves letters with their squares, but glyphs stay upright, so rotating changes reading order (90° CW preserves it, 180° reverses it). The O piece rotates too (it cycles its letters). Wall kicks are a simple offset list (`KICKS`), not SRS tables.
- `findWords(grid, dict, minLen)` scans each maximal run in every row and column. Within a run, the longest dictionary words win and must not overlap; an across and a down word may share a tile. A word that touches a reserved tile only counts if it contains that tile's target word.
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

### Target words (`PieceGenerator` with `opts.targets`, `TargetTracker`)

These exist because random letters almost never form long words: before targets, about 75% of words were 3 letters and 2% were 5+.

**Dealing.** After `FIRST_TARGET` plain pieces, and then every `2 + TARGET_WINDOW + TARGET_GAP` pieces (7), `planTarget` picks a word and splits it over two consecutive pieces:
- The word's **end comes first** (`target.last=false`), then its start (`last=true`).
- Each chunk sits in the shape's bottom row (`BOTTOM_ROW`). The end chunk is flush left and the start chunk is flush right, so filler letters never land between the two halves.
- **Across:** the player puts the start left of the end.
- **Down:** one clockwise turn makes the row a column with the same reading order, then the start drops on top of the end.
- Target pieces choose their own shape and don't consume the 7-bag. Filler cells get the usual checks; `runsOf` skips runs that touch reserved cells.

**Reserved tiles.** Chunk cells carry `tgt: word` and only clear as part of a word containing the target. Without this, a 3-letter word would grab half a target before the other half arrives.

**Lifecycle (`TargetTracker`).**
- `placed(piece.target)` runs on every lock.
- `hit(grid, found)` runs on every resolve pass. A hit scores `TARGET_BONUS` (×3) and ends the target.
- `endTurn(grid)` runs once the board is still. It counts the pieces left after the last chunk (`TARGET_WINDOW`, 3). When they run out the target expires, `tgt` is stripped from its tiles, and `resolve()` looks again, so the freed letters can clear.
- Only one target is live at a time; the schedule guarantees it.

### Game loop / state machine (game.js)

`state`: `title | play | clearing | settling | paused | over`.

Lock → `resolve()`. If words are found: `clearing` (flash for `CLEAR_TIME`) → `finishClear()` (score, particles, gems fly to the score, `applyGravity`, with each moved tile animating via `dy/vy`) → `settling` until all tiles land → `resolve()` again, with `chain++` each pass. When no words remain, `tracker.endTurn()` runs first: if the target expired, it shows a MISSED banner and calls `resolve()` once more. After that, `chain=0` and `spawn()` runs. Game over happens when a spawn collides or a cell locks above row 0.

Other mechanics: lock delay of 500ms with up to 15 move resets; DAS/ARR auto-repeat in `updateHeld`; levels every 8 words, with gravity `900·0.86^(lvl−1)` ms (min 70).

The **hint** system (`updateHints`) runs `findWords` on a copy of the grid with the piece at its ghost position after every move. The cells involved pulse red, and the words are listed in the right panel (toggle: H).

Rendering: sprites (glyphs per color, tiles per `style:ch`) are built once into small canvases and cached. Tile styles: `locked`, `active`, `ghost`, `ghostHint`, `hint`, `flash`, `flashRed`, `dead`, plus three for target letters, which are always red: `target`, `targetHint`, and `activeTarget` (a white square while falling).

The right panel shows a TARGET panel: the live or upcoming word, ×3, and pips for the pieces left. LONGEST, CHAIN and TARGETS hit/seen appear on the game-over screen. The well's layout constants are `WELL_X/WELL_Y/CELL=12/TILE=11`; use `cellPx(x)`/`cellPy(y)` for tile positions. The HUD is drawn after resetting the transform, so it doesn't shake with the screen.

Settings persist in `localStorage` under `wordwell.*` (minLen, hints, muted, best), always wrapped in try/catch.

## Verifying visual changes

Headless Chrome works for screenshots and driving input. Launch `--headless=new --remote-debugging-port=…`, then use the CDP `Input.dispatchKeyEvent` and `Page.captureScreenshot` commands over Node's global `WebSocket`. You can set up board states through `window.wordwell.grid`/`.piece`, but only once `wordwell.state === 'play'`; injecting mid-clear corrupts the clear.

## Ideas not yet built

**Next up: the upgrades system** (perk families, a level-up shop that spends gems on items, rising hazards). Decisions, draft content, data and open questions are in `docs/upgrades-notes.md`; start there.

Other ideas: an optional full-row-clear fallback, touch controls, and bonuses for crossing words. A minimum length of 3 may be too easy (the bot never dies); 4 is the "hard mode".
