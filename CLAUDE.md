# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Word Well**: a word-tetris browser game. Classic tetrominoes (no plus or pentomino shapes) are made of lettered squares. Spelling an English word across (left→right) or down (top→bottom) clears it, the way a full row clears in Tetris. The dealer reads the board: most pieces are lettered to turn letters already there into a hidden 4–7 letter word (a **hook**). Every few pieces it also announces a **target word** (5–7 letters) that grows out of board letters; spelling it scores ×3 and blasts its whole row or column. Right after the first level-up, rows of stone with a few letters start rising from the floor, every few pieces and then after every piece, and the dealer deals fewer hooks as levels go up. It plays as a roguelike in short runs: dying is part of the loop. Every cleared tile is a gem; gems are banked at game over, and a **shop between runs** sells new perks and items for the level-up deck plus a small kit of head starts. The art direction is **Downwell**: pure black/white/red, chunky pixel art, cobblestone well walls, a red gem score and "GEM HIGH"-style rule banners. It is a proof of concept the owner is iterating on.

Live: https://mihai-molnar.github.io/word-well/ (GitHub Pages, served from `main` branch root, so pushing to `main` deploys).

## Commands

There is no build, bundler, package.json or lint step.

```sh
open index.html                     # play locally (works over file://)
node tools/check-logic.cjs          # logic assertions (findWords, gravity, rotation, QU, hooks, targets) + generator stats
node tools/check-upgrades.cjs       # perk/item/dealer/word-rule checks (tools/checks/*.cjs); prints `all upgrade checks passed`
node tools/shot.mjs out.png [--query=fast] [--title] [key:Code | wait:ms | js:expr ...]  # headless Chrome: start a game (or stay on the title), run steps, save a 320x272 PNG
open "index.html?fast"              # levels every 3 words instead of 8, for trying perks
open "index.html?level=15"          # start a run at level N (no perks), for trying late stone rows; combines with ?fast; banks no gems
open "index.html?gems=2000"         # shop sandbox: start with N gems and nothing bought; the real save is never touched
sh tools/checks-browser/gems.sh     # scripted headless checks (also shop.sh, kit.sh): print values to compare with the plan's Expected lines
node tools/simulate.cjs [hazards]   # greedy-bot playability sim: uniform letters vs PieceGenerator, with/without hooks and targets, then the full game with hazards (`hazards`: only that)
node tools/build-words.mjs [list] [freq]  # regenerate js/words.js (downloads both default lists if no paths given)
```

`check-logic.cjs` uses `assert` and exits non-zero on failure. Run it after touching `js/logic.js`. Run `simulate.cjs` after tuning letter weights, generator rules, hook, target or hazard constants. Compare against this baseline at min length 3 (8 games × 300 pieces; `game+hazards` up to 1000):

| Dealer (sim row) | words/piece | games lost | 3-letter | 5+ letter words | hooks spelled | targets hit |
|---|---|---|---|---|---|---|
| `generator` | ≈1.23 | 0/8 | 76% | 1% | n/a | n/a |
| `gen+targets` | ≈1.09 | 0/8 | 66% | 15% | n/a | 350/359 |
| `gen+hooks` | ≈1.01 | 0/8 | 34% | 28% | 1493/1665 | n/a |
| `gen+hooks+tgts` (the game) | ≈0.94 | 0/8 | 29% | 39% | 1127/1281 | 347/351 |
| `uniform A-Z` | ≈0.6 | 8/8 | 85% | 0% | n/a | n/a |
| `game+hazards` (the game, with stone rows) | ≈1.14 | 8/8 | 47% | 33% | not tracked | not tracked |

The first five rows play with hazards off: hook rate fixed at 0.9, no levels, no stone rows. The `=== hazards` rows play the whole game for up to 1000 pieces: a level every 8 words, `hookRateFor`, the rise schedule and the stone rules. There the bot also digs (each stone its words would break counts like a letter), and it should lose eventually. The sim doesn't end a game when a spawn collides (the bot drops pieces straight from any x), so its death levels are about one level optimistic. At MIN 3 it dies at median level 10 (lowest 9), about 66 pieces in; its well is 5% full at level 3, 12% at 5 and 19% at 7, and about 3 stones break per row risen. At MIN 4 it dies at median level 8.5 (lowest 8), about 80 pieces in. It banks about 390 gems a run at MIN 3 (73 by level 3, 154 by 5, 237 by 7) and about 360 at MIN 4 before the ×1.5. A person is far weaker than the bot and dies sooner. Runs are meant to be short bursts (a roguelike), so the bot dying around level 10 is the target, not a problem.

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
3. `js/icons.js` → `window.WordWellIcons`: only pixel bitmaps (strings over `.`/`w`/`r`): `card` 16×16 and `hud` 9×9 icons per perk and item, and `tile` 7×7 marks for special tiles. The drawing code, including the level-up cards, lives in game.js.
4. `js/logic.js` → `window.WordWellLogic`: **pure, DOM-free game rules**, also exported via `module.exports` so the Node tools can `require` it. Anything rules-related belongs here so it stays testable.
5. `js/upgrades.js` → `window.WordWellUpgrades` (`U`): perk and item data, offers, the run, and the numbers perks change. Pure and DOM-free like logic.js, and also `module.exports`.
6. `js/game.js`: one IIFE holding rendering, input, WebAudio sfx, effects and the loop. It exposes `window.wordwell` (state/grid/piece/score/gen/tracker/newGame plus the helpers listed under Verifying visual changes) for console debugging and headless-browser tests.

### Core rules (logic.js)

- Grid is `ROWS=20 × COLS=10` of `null | {ch, dy, vy, tgt?, wild?, bomb?, stone?}`. `ch` is lowercase, and Q only exists as the single tile `'qu'` (words are matched by concatenating tile strings). `tgt` is set on tiles reserved for the live target word.
- Pieces are `{type, n, x, y, cells:[{x,y,ch,tgt?}], target?}` inside an n×n box. Rotation moves letters with their squares, but glyphs stay upright, so rotating changes reading order (90° CW preserves it, 180° reverses it). The O piece rotates too (it cycles its letters). Wall kicks are a simple offset list (`KICKS`), not SRS tables.
- `findWords(grid, dict, rules)` (`rules` is a minLen number or the rules object, see Upgrades) scans each maximal run in every row and column. Within a run, the longest dictionary words win and must not overlap; an across and a down word may share a tile. A word that touches a reserved tile only counts if it contains that tile's target word.
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

### Upgrades (upgrades.js, game.js)

Every `WORDS_PER_LEVEL` (8) words cleared is a level-up, which opens a pick-one-of-three screen. The design is in `docs/superpowers/specs/2026-10-16-upgrades-design.md`. A run with no perks and no items plays like the base game plus hazards (see Hazards); the sim's first five rows play with neither, which is why their baseline still holds.

- **Flow.** `finishClear` adds the new levels to `pendingLevelUps`. When the board is still and no words remain, `resolve()` calls `openLevelUp()` instead of `nextTurn()`; state is `levelup` and `lvl` holds `{cards, sel, t, taken}`. ←/→ move, SPACE or ENTER take; a taken card is applied through `U.takeCard` and `syncRules()`, shows for `CLEAR_TIME`, then the next pending screen opens, or `afterLevelUp()` runs (SINKHOLE) and `nextTurn()` follows. ←/→ move at any time. SPACE or ENTER take the selected card, but only once the screen has been open 500 ms (so a held or mashed drop key can't pick one) and only once per screen.
- **Offers (`U.offerCards`).** Three distinct cards. Each slot rolls an item with `ITEM_CHANCE` (1/5; PACK RAT makes it 2/5), at most one item per screen. Perks are drawn without replacement from `perkPool` (not maxed, not excluded by an owned perk such as SHORT FUSE vs PURIST, not locked by the shop), weighted 2 for families already owned. Items come from `unlockedItems(run)`. A dry pool fills with unlocked items.
- **Run.** `run = {perks:{id:count}, items:[{id,n}], sel, joker, redeal, locked}`, rebuilt by `newGame()` from the shop save (`U.newRun(save.owned)`, then `U.startKit`); only the gem bank and the shop's purchases persist (see Gem shop). Five perk families (PACE, WORDS, BLAST, GEAR, SCORE), 15 perks and 7 items, all in `U.PERKS` / `U.ITEMS`, with card text of at most 14 characters per line.
- **Rules object.** `U.rules(run, minLen)` gives `{minLen, shortLen, mirror, rareBoost}`. `syncRules()` keeps it in `rules` in game.js and hands it to `findWords` (which accepts a number or this object), the hints, and `gen.setRules` for the dealer. PURIST raises `minLen`, SHORT FUSE sets `shortLen` (words one shorter clear for 0 points and don't count toward levels), MIRROR also matches reversed rows and columns (QU stays whole), SCRABBLER boosts rare letters in the dealer. The dealer never deals a piece that would clear itself under these rules.
- **Wild and letterless tiles.** A tile is `{ch, dy, vy, tgt?, wild?, bomb?, stone?}`. WILD (`?`) tiles take whatever letter makes a word fire (`found.wildChs` lets scoring skip their points). Bomb, drill and stone tiles have `ch: ''`, which breaks a run in `findWords`.
- **Clears without a word and broken targets.** Every clear goes through `startClear(found, cells, gained)`: word clears, DRILL, SINKHOLE and QUAKE all use it, and a call with no words and no cells goes straight back to `resolve()`. It runs `L.blastAround`, which sets off any bomb in or next to the cells (radius 1, or 2 with BIG BANG), then `L.breakStones` (see Hazards), then asks `tracker.broken(grid, cells)`. A live target that lost a tile ends at once with a MISSED banner and `gen.targetEnded()`.
- **Where each thing hooks in.**
  - PACE (FEATHER, STICKY, DAREDEVIL): `U.gravityMs`, `U.lockDelayMs`, and the 1.5× in `wordPoints`; `wordwell.timing` shows the live values.
  - WORDS: `U.rules`.
  - BLAST: `extraCells` (CROSSFIRE adds `L.crossCells` for a target hit, QUAKE adds the bottom row at chain 3 via `U.quakeNow`); SINKHOLE is `afterLevelUp`.
  - SCORE: `U.wordPoints` (STRETCH, AFTERSHOCK via `chainFactor`, SCRABBLER via `rareMult`, PURIST ×2).
  - GEAR: `U.bombRadius`, `U.jokerDue` (called once per dealt piece in `spawn`; a hit puts a wild tile on a filler cell and never on a hook or target letter), PACK RAT in the offers.
  - Items fire through `fireItem()` and the `ITEM_FIRE` table: BOMB turns a filler cell of the falling piece into a letterless bomb tile (`ch: ''`, `bomb: true`), WILD makes one a `?` tile, DRILL and I-BEAM swap the piece (`swapPiece`), REROLL calls `gen.reroll`, BEACON calls `gen.callTarget` (only with no live target), FREEZE adds `U.FREEZE_MS` to `freezeLeft`. A refused item is kept and the panel flashes. BOMB, WILD, DRILL and I-BEAM refuse a piece holding target tiles.
- **Keys.** C fires the selected item, V moves the selection; both work only in `play`. SPACE is hard drop, and takes a card on the level-up screen.

### Hazards (logic.js, game.js)

The pressure as levels go up: stone rows rise from the floor, and the dealer gets stingier. The design is in `docs/superpowers/specs/2026-10-16-stone-rows-design.md`. Fall speed is unchanged.

- **Stone tiles.** `L.stoneTile()` is `{ch: '', stone: true, dy, vy}`: no letter and no points, it breaks a run, and it falls with gravity like any tile. A stone breaks when a word cleared in this pass has a tile directly beside it (up, down, left or right, not diagonal), or when it is inside the cells of any clear (a bomb blast, a DRILL column, a target's line, CROSSFIRE, the SINKHOLE or QUAKE row). `L.breakStones(grid, keys, found)` adds those stones in `startClear`, after `blastAround`. A stone just outside a blast stays, and breaking one sets off nothing. Broken stones don't count toward levels. `vowelRatio` skips letterless tiles.
- **Rising rows.** A row is ten cells: stone, plus `junkLetters(hl)` letters that never sit side by side (so a row never spells across by itself; you dig its letters out with down words). The layout (`L.junkLayout`) is fixed when the countdown arms, so the HUD can show it. The letters come from `JUNK_WEIGHTS` (common word endings and vowels, nothing rare) and are dealt at rise time from the live board: `gen.junkRow(grid, layout)` re-draws them until the risen board fires no word under the current rules, and as a last resort turns a letter cell into stone. `L.shiftUp(grid, row)` pushes every tile up one row; if a tile is in row 0 it returns false and the game is over. Junk letters are normal tiles, so hooks and target anchors aim at them.
- **Schedule.** Counted in pieces dealt, so FREEZE doesn't slow it (a DRILL or I-BEAM swap doesn't count as a piece). `L.hazardLevel(level, minLen)` is the level minus `HAZARD_MIN_OFFSET` (1) per letter of the title-screen min length above 3 (PURIST doesn't count), so at MIN 4 rows start at level 3. `L.riseInterval(hl)` is 0 below `RISE_FROM` (2), then `max(RISE_MIN, RISE_START − floor((hl − RISE_FROM) / RISE_STEP))` with `RISE_MIN` 1, `RISE_START` 6 and `RISE_STEP` 1. At MIN 3 the first row comes 6 pieces after the first level-up, the gap shrinks by one piece per level (6, 5, 4, 3, 2), and from level 7 a row rises after every piece. `junkLetters` is 4 below hazard level 9, 3 at 9–14 and 2 from 15. The owner asked for this ramp after playtesting a gentler one (rows from level 3, every 8 pieces down to 3).
- **Stingier dealer.** `L.hookRateFor(hl)` is 0.9 up to level 2, then falls in a straight line to 0.5 at level 15 and stays there. `syncHazards()` sets `gen.hookRate` from it in `newGame()` and on every level change, and arms the countdown (`armRise`) the first time `riseInterval` is above 0. `PieceGenerator` still defaults to `HOOK_RATE`, so the sim's first five rows don't change.
- **Items** come more often to dig with: `ITEM_CHANCE` is 1/5 per card slot (PACK RAT 2/5).
- **Turn order.** `riseLeft` is the pieces left before the next row (`null` while rows are off, 0 while the last piece before it falls); `spawn()` takes one off before dealing. Lock → words resolve and chain → `tracker.endTurn` → level-up screens (and SINKHOLE) → `nextTurn()`, which calls `rise()` when `riseLeft === 0` and `spawn()` otherwise. `rise()` builds the row from `riseLayout`, shifts the grid, re-arms with the current level's interval and a new layout, and goes to `settling` while the stack slides up (positive `dy`) with a shake and a rumble. Then `resolve()` runs once more (it finds nothing; `endTurn` only counts once per piece) and the next piece spawns. A live target's tiles ride up with the stack; the tracker stores no coordinates.

### Gem shop (upgrades.js, game.js)

Gems are a currency, and a shop between runs spends them. The design is in `docs/superpowers/specs/2026-10-16-gem-shop-design.md`.

- **Earning.** One gem per cleared tile, whatever cleared it: `finishClear` adds `cells.size` to `gemsRun` (words, target lines, bombs, DRILL, SINKHOLE, QUAKE, broken stones). Gems are separate from score. One red gem flies per tile, and the HUD's red count (`shownGems`) goes up as each one lands.
- **Banking.** `gameOver()` adds `U.gemsBanked(gemsRun, minLen)` to the bank: ×1 at MIN 3, ×1.5 at MIN 4, ×2 at MIN 5, rounded down (the title-screen MIN; PURIST doesn't count). `?level=N` runs bank 0 (`NOT BANKED`). An abandoned run banks nothing.
- **Save.** One key, `wordwell.shop` = `{gems, owned}`, written on every purchase and banking; `U.loadSave` cleans whatever is stored (unknown ids, repeats, a tier without its first tier, a bad `gems`). `?gems=N` is a sandbox that never writes it.
- **Stock (`U.SHOP`, `U.SHELVES`).** PERKS: DAREDEVIL 250, MIRROR 200, QUAKE 150, JOKER 200, SCRABBLER 150. ITEMS: BEACON 60, WILD 80, DRILL 100. KIT: POUCH 200 then POUCH II 500 (one slot), SECOND LOOK 300, EARLY PICK 600; 2,790 in all. A fresh save's deck is the other 10 perks and BOMB, REROLL, FREEZE, I-BEAM; buying an unlock adds it to what cards can offer (`run.locked` holds the rest). `U.newRun()` with no argument locks nothing, which keeps the sim and the older checks unchanged.
- **Kit.** POUCH/POUCH II: the run starts with 1/2 random unlocked items (`U.startKit`). SECOND LOOK: `run.redeal`; V on a level-up screen re-deals its cards once per run (the footer shows `V REDEAL` while it's unused). EARLY PICK: `newGame()` opens a level-up screen headed `EARLY PICK` (`lvl.early`) before the first spawn.
- **Flow.** Game over → ENTER (after 900 ms) → `shop` (`openShop(true)`, the bank counts up from its old value) → ENTER from anywhere, or SPACE on DIVE → `newGame()`. ↓ on the title opens the shop too; Esc goes back to the title. The cursor starts on DIVE and keys wait 500 ms, so a mashed key can't buy anything. ←/→ and ↑/↓ move, SPACE buys (`U.buy`; too poor: a buzz and the price flashes).
- **Screen (`drawShop`).** The dither of the level-up screen, `SHOP` in the header box, the bank top-right with the gem sprite (the run's score is hidden). Three shelves of 2× card icons at x 8 (lit when owned, price or OWN underneath, prices you can't afford in dim red); the selected entry's name, kind, card text and status (`NOW IN DECK`, `OWNED`, a price, `NEED n MORE`) at x 208; a DIVE button and a key legend. The side panels aren't drawn in the shop.

### Game loop / state machine (game.js)

`state`: `title | play | clearing | settling | levelup | paused | shop | over`.

Lock → `resolve()` (a DRILL piece locks through `lockDrill` and the same clear path). If words are found: `clearing` (flash for `CLEAR_TIME`) → `finishClear()` (score, particles, gems fly to the score, `applyGravity`, with each moved tile animating via `dy/vy`) → `settling` until all tiles land → `resolve()` again, with `chain++` each pass. When no words remain, `tracker.endTurn()` runs first: if the target expired, it shows a MISSED banner and calls `resolve()` once more. After that, `chain=0`, and if `pendingLevelUps > 0` the level-up screen opens; otherwise `nextTurn()` runs. If a stone row is due (`riseLeft === 0`), `rise()` pushes it in and goes to `settling` while the stack slides up, then `resolve()` runs once more and `nextTurn()` spawns. `spawn()` counts the piece off the rise countdown, deals with `gen.next(grid)`, and if the deal starts a target it calls `tracker.announce` and shows the TARGET banner. Game over happens when a spawn collides, a cell locks above row 0, or a row rises while a tile is in row 0. It banks the run's gems, and ENTER then opens the shop (see Gem shop).

Other mechanics: lock delay of 500ms with up to 15 move resets; DAS/ARR auto-repeat in `updateHeld`; levels every 8 words (3 with `?fast`), with gravity `900·0.86^(lvl−1)` ms (min 70), changed by PACE perks.

The **hint** system (`updateHints`) runs `findWords` on a copy of the grid with the piece at its ghost position after every move. The cells involved pulse red in the well, and so do the stones those words would break (toggle: H); there is no word list.

Rendering: sprites (glyphs per color, tiles per `style:ch`) are built once into small canvases and cached. Tile styles: `locked`, `active`, `ghost`, `ghostHint`, `hint`, `flash`, `flashRed`, `dead`, plus three for target letters, which are always red: `target`, `targetHint`, and `activeTarget` (a white square while falling).

**HUD with upgrades.** The left panel shows the level and its word progress (`LV1 0/8`) in a red box. The right panel has an ITEMS list (name and count per stack, the selected one boxed; a row of pips while FREEZE runs) and a C USE / V SWAP legend at the bottom, in place of the old BEST/HINT/MIN lines. Those settings now live on the title screen, which lists the controls including ITEM and SWAP; BEST is on the title screen and on the game-over screen next to LONGEST, CHAIN, TARGETS and GEMS. The top-right strip shows the score (white, left) and the run's gems (red, by the gem sprite); on the title it shows neither, and the title's right panel shows the bank (`GEMS n`) above BEST. Under the MIN setting the title shows `GEMS X1.5`/`X2` when MIN is above 3, and `↓ SHOP`. Bomb, wild, drill and stone tiles have their own sprites (stone: a white cobblestone mark, `ICONS.tile.stone`); the DRILL piece shows a column ghost. The left panel ends in a RISE panel: one red pip per piece of the current interval, filled for pieces left and hollow for pieces used (they blink once none are left), or `FROM LV<n>` while rows are off. While the last piece before a rise falls, the floor strip under the well blinks a preview of the incoming row (white blocks for stone, red boxes for letters). While the last piece before a rise falls, tiles in row 0 also blink red (same phase as the preview), since the row will push them out; if one does, the PUSHED OUT banner shows over the game-over screen. The title screen's HOW TO ends with a stone line.

The right panel's NEXT box shows only the next shape: `gen.plan[0]` (a target's second chunk, with its reserved cells in the target style) or `gen.peekType()`. The TARGET panel shows the live word, ×3, and pips for the pieces left. LONGEST, CHAIN and TARGETS hit/seen appear on the game-over screen. The well's layout constants are `WELL_X/WELL_Y/CELL=12/TILE=11`; use `cellPx(x)`/`cellPy(y)` for tile positions. The HUD is drawn after resetting the transform, so it doesn't shake with the screen.

Settings persist in `localStorage` under `wordwell.*` (minLen, hints, muted, best, and `shop` for the gem bank and purchases), always wrapped in try/catch.

## Verifying visual changes

`node tools/shot.mjs` is the quick way: it opens `index.html` (add `--query=fast` or `--query=level=15`; `--title` stays on the title screen), presses Enter, runs `key:`, `wait:` and `js:` steps in order (each `js:` result is printed as JSON) and saves the canvas PNG. Console helpers on `window.wordwell`: `run`, `level`, `pendingLevelUps`, `wordsCleared`, `wordsPerLevel`, `hint`, `rules`, `timing`, `grant(id)` (take a perk), `give(id, n)` (add items), `levelUp(cards?)` (open the screen, optionally with forced cards), `setPiece(type, letters, x)`, `riseLeft`, `rise()` (a row rises right after the falling piece locks, since rows never rise under a falling piece), `stone(x, y)` (put a stone tile on the grid), `shop` (the save), `gems` (this run's), `lvl` (the open level-up screen), `gameOver()`, `openShop()`, `resetShop()` (wipe the real save), plus `grid`, `piece`, `gen`, `tracker`, `state`, `score`, `newGame`. By hand: launch `--headless=new --remote-debugging-port=…`, then use the CDP `Input.dispatchKeyEvent` and `Page.captureScreenshot` commands over Node's global `WebSocket`. You can set up board states through `window.wordwell.grid`/`.piece`, but only once `wordwell.state === 'play'`; injecting mid-clear corrupts the clear.

## Ideas not yet built

**Built: the upgrades system** (see Upgrades above) and hazards v1: stone rows and a stingier dealer (see Hazards). The constants come from the sim; the owner's playtest has the final say. **Built too: the gem shop** (see Gem shop); its prices and the locked/starting split are the owner's to retune after playtesting. **Not built:** other hazards (+1 minimum length, petrifying tiles, cracked stones with hit points); new shop stock (the parked TWIRL, HOLD, SECOND SIGHT and SLANT could join the shelves).

Other ideas: touch controls and bonuses for crossing words. Without hazards the bot never dies at MIN 3, and with hooks it survives MIN 4 too; with hazards it dies around level 10 at MIN 3 and 8–9 at MIN 4. MIN 4 could become a "hard mode". The long-words perk family is realistic now.
