# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Word Well**: a word-tetris browser game. Classic tetrominoes (no plus or pentomino shapes) are made of lettered squares. Spelling an English word across (left→right) or down (top→bottom) clears it, the way a full row clears in Tetris. The dealer reads the board: most pieces are lettered to turn letters already there into a hidden 4–7 letter word (a **hook**). Every few pieces it also announces a **target word** (5–7 letters) that grows out of board letters; spelling it scores ×3 and blasts its whole row or column. The art direction is **Downwell**: pure black/white/red, chunky pixel art, cobblestone well walls, a red gem score and "GEM HIGH"-style rule banners. It is a proof of concept the owner is iterating on.

Live: https://mihai-molnar.github.io/word-well/ (GitHub Pages, served from `main` branch root, so pushing to `main` deploys).

## Commands

There is no build, bundler, package.json or lint step.

```sh
open index.html                     # play locally (works over file://)
node tools/check-logic.cjs          # logic assertions (findWords, gravity, rotation, QU, hooks, targets) + generator stats
node tools/simulate.cjs             # greedy-bot playability sim: uniform letters vs PieceGenerator, with/without hooks and targets
node tools/build-words.mjs [list] [freq]  # regenerate js/words.js (downloads both default lists if no paths given)
```

`check-logic.cjs` uses `assert` and exits non-zero on failure. Run it after touching `js/logic.js`. Run `simulate.cjs` after tuning letter weights, generator rules, hook or target constants. Compare against this baseline at min length 3 (8 games × 300 pieces):

| Dealer (sim row) | words/piece | games lost | 3-letter | 5+ letter words | hooks spelled | targets hit |
|---|---|---|---|---|---|---|
| `generator` | ≈1.23 | 0/8 | 76% | 1% | n/a | n/a |
| `gen+targets` | ≈1.09 | 0/8 | 66% | 15% | n/a | 350/359 |
| `gen+hooks` | ≈1.01 | 0/8 | 34% | 28% | 1493/1665 | n/a |
| `gen+hooks+tgts` (the game) | ≈0.94 | 0/8 | 29% | 39% | 1127/1281 | 347/351 |
| `uniform A-Z` | ≈0.6 | 8/8 | 85% | 0% | n/a | n/a |

At min 4, `gen+hooks+tgts` also loses 0/8 (the plain generator loses 8/8). Target blasts average under 1 extra tile at min 3, because the bot keeps the board almost empty. The bot searches every placement, finds every hook, and for a two-piece target sees the planned second chunk, so humans spell far fewer hooks and targets than it does.

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
4. `js/game.js`: one IIFE holding rendering, input, WebAudio sfx, effects and the loop. It exposes `window.wordwell` (state/grid/piece/score/gen/tracker/newGame) for console debugging and headless-browser tests.

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

**Dealing at spawn.** `peekType()` is the shape the NEXT box shows (blank cells). `next(grid)` letters that piece the moment it spawns, from the live board, so whatever it aims at is still there. When pieces were lettered one turn early, about 45% of their hooks were gone by the time they arrived.

**Hooks.** With probability `HOOK_RATE` (0.9), a plain piece is a hook (`hookPiece`, `findHooks`):
- `landings` tries every spot where the shape can land, in rotation 0 or 1 only. Those two keep reading order, so a piece's left-to-right letters work across as they are, or down after one clockwise turn.
- `segments` lists, for each row and column the piece touches, its straight run of cells and the unreserved board letters directly before and after it. Those form patterns like `ST??`, `??ATE` or `PL??ET`.
- `wordsMatching` looks up 4–7 letter words in the `byPrefix`/`bySuffix` index from `buildDictionary`. Words with Q are skipped, because Q only exists as the QU tile.
- If any 5+ letter hook exists, only those are used. Within that set, the pick is weighted by length, by board letters used, and against spots that bury empty cells.
- The other cells get the usual filler checks (`fillAround`), and `spells` confirms the word really fires at the spot. Nothing tells the player; the H hint lights it up when the ghost is in place.

### Target words (`PieceGenerator` with `opts.targets`, `TargetTracker`)

Targets are the announced long word: they depend on the board and pay off by clearing it. (The first version split a free-floating word over two pieces; it was nearly always "rotate, drop on top", and it never cleaned the board.)

**Dealing.** After `FIRST_TARGET` plain pieces, and then `TARGET_WINDOW + TARGET_GAP` (5) plain pieces after each target, `planTarget` looks for an **anchor**: 1–3 unreserved board letters with an open side. If none fits the shape about to spawn, it tries again on the next piece.
- **Across:** the anchor is the word's start (new letters go to its right) or its end (new letters go to its left).
- **Down:** new letters can only land on top of a column, so the anchor is the column top, which is the word's end.
- The word comes from `TARGETS`. The new letters arrive in 1 or 2 pieces, each holding a straight segment of 2–4 letters:
  - the first piece uses the peeked shape and touches the anchor;
  - a second piece (`plan`) picks its own shape and continues the word on the far side.
- `buildTarget` checks on a copy of the board that every chunk lands where planned and that the word fires.
- **Across candidates are tried first, and within each direction one-piece targets come before two-piece ones.** Stacking down is almost always possible, so down targets would otherwise crowd across ones out (84% down before this rule, about a third after). A second piece is more of a chore, so it's only used when no one-piece target fits (about 40% of targets are one piece).
- If the target is spelled before its second piece spawns, `game.js` calls `gen.targetEnded()`, and that piece arrives as plain letters.
- Each chunk records its `spot`, and the first one carries `anchor`. Filler cells get the usual checks; `runsOf` skips runs that touch reserved cells.

**Announcing.** When the first chunk spawns, `game.js` calls `tracker.announce(grid, target)`. The word goes live and the anchor tiles get `tgt`, so they turn red.

**Payoff.** A hit scores `TARGET_BONUS` (×3) and clears every tile in the word's row (across) or column (down). `lineCells` gives those cells; gravity and chains follow as usual.

**Reserved tiles.** Anchor and chunk tiles carry `tgt: word` and only clear as part of a word containing the target. Without this, a 3-letter word would grab half a target before the other half arrives.

**Lifecycle (`TargetTracker`).**
- `announce(grid, target)` makes the word live and reserves the anchor.
- `placed(piece.target)` runs on every lock. It only records the turn; a chunk landing after its target already ended is freed in `endTurn`.
- `hit(grid, found)` runs on every resolve pass. A hit scores `TARGET_BONUS` (×3) and ends the target.
- `endTurn(grid)` runs once the board is still. It counts the pieces left after the last chunk (`TARGET_WINDOW`, 3). When they run out the target expires, `tgt` is stripped from its tiles (anchor included), and `resolve()` looks again, so the freed letters can clear.
- Only one target is live at a time; the schedule guarantees it.

### Game loop / state machine (game.js)

`state`: `title | play | clearing | settling | paused | over`.

Lock → `resolve()`. If words are found: `clearing` (flash for `CLEAR_TIME`) → `finishClear()` (score, particles, gems fly to the score, `applyGravity`, with each moved tile animating via `dy/vy`) → `settling` until all tiles land → `resolve()` again, with `chain++` each pass. When no words remain, `tracker.endTurn()` runs first: if the target expired, it shows a MISSED banner and calls `resolve()` once more. After that, `chain=0` and `spawn()` runs. `spawn()` deals with `gen.next(grid)`, and if the deal starts a target it calls `tracker.announce` and shows the TARGET banner. Game over happens when a spawn collides or a cell locks above row 0.

Other mechanics: lock delay of 500ms with up to 15 move resets; DAS/ARR auto-repeat in `updateHeld`; levels every 8 words, with gravity `900·0.86^(lvl−1)` ms (min 70).

The **hint** system (`updateHints`) runs `findWords` on a copy of the grid with the piece at its ghost position after every move. The cells involved pulse red, and the words are listed in the right panel (toggle: H).

Rendering: sprites (glyphs per color, tiles per `style:ch`) are built once into small canvases and cached. Tile styles: `locked`, `active`, `ghost`, `ghostHint`, `hint`, `flash`, `flashRed`, `dead`, plus three for target letters, which are always red: `target`, `targetHint`, and `activeTarget` (a white square while falling).

The right panel's NEXT box shows only the next shape: `gen.plan[0]` (a target's second chunk, with its reserved cells in the target style) or `gen.peekType()`. The TARGET panel shows the live word, ×3, and pips for the pieces left. LONGEST, CHAIN and TARGETS hit/seen appear on the game-over screen. The well's layout constants are `WELL_X/WELL_Y/CELL=12/TILE=11`; use `cellPx(x)`/`cellPy(y)` for tile positions. The HUD is drawn after resetting the transform, so it doesn't shake with the screen.

Settings persist in `localStorage` under `wordwell.*` (minLen, hints, muted, best), always wrapped in try/catch.

## Verifying visual changes

Headless Chrome works for screenshots and driving input. Launch `--headless=new --remote-debugging-port=…`, then use the CDP `Input.dispatchKeyEvent` and `Page.captureScreenshot` commands over Node's global `WebSocket`. You can set up board states through `window.wordwell.grid`/`.piece`, but only once `wordwell.state === 'play'`; injecting mid-clear corrupts the clear.

## Ideas not yet built

**Next up: the upgrades system** (perk families, a level-up shop that spends gems on items, rising hazards). Decisions, draft content, data and open questions are in `docs/upgrades-notes.md`; start there.

Other ideas: touch controls and bonuses for crossing words. A minimum length of 3 may be too easy (the bot never dies). With hooks, the bot survives MIN 4 too (0/8 lost, against 8/8 before), so 4 could become the default or the "hard mode". The long-words perk family in the upgrades notes is now realistic.
