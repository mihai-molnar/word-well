# Stone Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Word Well harder through the well, not speed. Rows of stone with a few letters rise from the floor on a piece-count schedule, the dealer deals fewer ready-made hooks as levels rise, and items come more often.

**Architecture:** The rules are pure and Node-testable: stone breaking, row shifting, junk-row dealing, schedule and hook-rate curves live in `js/logic.js`, and item odds in `js/upgrades.js`. `js/game.js` wires them into the turn loop through a new `nextTurn()` (it rises a row when one is due, else spawns), animates the rise through the existing settle pass, and draws the warning. `tools/simulate.cjs` gains a hazards row used to tune the constants.

**Tech Stack:** Plain browser JavaScript (globals via `<script>` tags, must run from `file://`), canvas 2D at 320×272, Node for checks (`assert`) and the bot sim, headless Chrome via `tools/shot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-16-stone-rows-design.md`

## Global Constraints

- Must run from `file://` with zero dependencies: no `fetch()` of local files, no ES modules in the browser. New logic goes in the existing IIFEs and is exported on the `api` objects.
- Pixel-perfect: all draw coordinates are integers. Palette is only `BLACK`/`WHITE`/`RED` plus `GREY`/`DIM`/`DIMRED`.
- Pixel marks in `js/icons.js` are strings over `.`/`w`/`r`; tile marks are 7×7.
- HUD text lines fit their panel: the side panels are 76 px wide (12 characters of the 5×7 font).
- The five existing `tools/simulate.cjs` rows must print exactly the baseline numbers (ignore the `ms/deal` column). The baseline is saved at `/private/tmp/claude-501/-Users-mihai-AI-word-tetris/1664d622-3bc7-411b-adc8-656ce7506333/scratchpad/sim-baseline.txt`.
- `node tools/check-logic.cjs` and `node tools/check-upgrades.cjs` pass after every task.
- Starting constants (tuned in Task 5): `RISE_FROM = 3`, `RISE_START = 8`, `RISE_STEP = 3`, `RISE_MIN = 3`, `HAZARD_MIN_OFFSET = 3`; letters per row 4 (levels < 9), 3 (9–14), 2 (15+); hook rate 0.9 up to level 2, falling linearly to 0.5 at level 15, flat after; `ITEM_CHANCE = 1/5`, `PACK_RAT_CHANCE = 2/5`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A rise while a target is live** (anchor reserved, second chunk still to come). The red tiles move up with the stack, the second chunk still lands and spells the word, and the TARGET panel and pips stay correct.
2. **A pending level-up and a due rise on the same turn.** The level-up screen(s) come first, then SINKHOLE, then the rise, then exactly one spawn. Nothing is skipped and nothing spawns twice.
3. **A rise that tops out.** With a tile in row 0, `rise()` ends the game cleanly: state `over`, no settle or resolve afterwards, no exception, retry works and `newGame()` resets the counter.
4. **A DRILL as the last piece before a rise** (`lockDrill` → `startClear` → `resolve` → `nextTurn`). The rise still happens and the counter resets.
5. **MIRROR or SHORT FUSE owned when a row rises.** The junk row never completes a reversed word or a short word, because `junkRow` checks with the generator's current rules.

Task 2 pins item 5 with a test, Task 3's scripted checks pin items 2–4, and Task 3's target check pins item 1.

---

### Task 1: Stone tiles in the rules

**Files:**
- Modify: `js/logic.js` (`vowelRatio` near line 335, new functions next to `blastAround` near line 491, `api` near line 895)
- Create: `tools/checks/stones.cjs`

**Interfaces:**
- Produces:
  - `L.stoneTile() → { ch: '', stone: true, dy: 0, vy: 0 }`: a fresh stone tile (the game's settle loop needs numeric `dy`/`vy`).
  - `L.breakStones(grid, keys, found) → Set<string>`: a new Set holding every key of `keys` (`"x,y"` strings) plus the key of every stone tile directly beside (not diagonal to) any cell of any word in `found`. `found` is `findWords` output (`[{ cells: [{x, y}], ... }]`). It doesn't mutate `keys`.
  - `L.vowelRatio(grid)` ignores tiles with no `ch` (stones and bombs) when counting tiles and vowels.

- [ ] **Step 1: Write the failing test** `tools/checks/stones.cjs`

```js
const { L, dict, assert, well } = require('./_setup.cjs');
const S = L.stoneTile;
// a stone splits a run
let g = well([19, 0, 'ca.t']); g[19][2] = S();
assert.deepStrictEqual(L.findWords(g, dict, 3), [], 'stone breaks the run');
assert.deepStrictEqual(S(), { ch: '', stone: true, dy: 0, vy: 0 });
// stones beside a cleared word break; diagonal and farther ones don't
g = well([19, 0, 'cat'], [17, 5, 'x']);
g[18][0] = S(); g[19][3] = S(); g[19][4] = S(); g[18][3] = S();
const cat = { word: 'cat', dir: 'h', cells: [0, 1, 2].map(x => ({ x, y: 19 })) };
const keys = new Set(cat.cells.map(c => c.x + ',' + c.y));
const out = L.breakStones(g, keys, [cat]);
assert.deepStrictEqual([...out].sort(), ['0,18', '0,19', '1,19', '2,19', '3,19'].sort());
assert.strictEqual(keys.size, 3, 'input set untouched');
// a letter beside the word is not a stone and stays
assert.ok(!out.has('2,18'));
// no words (drill, sinkhole): only the given cells
const col = new Set(['3,19', '3,18']);
assert.deepStrictEqual([...L.breakStones(g, col, [])].sort(), ['3,18', '3,19']);
// vowelRatio skips letterless tiles
g = L.emptyGrid();
for (let x = 0; x < 8; x++) g[19][x] = { ch: x < 4 ? 'a' : 't' };
for (let x = 0; x < 10; x++) g[18][x] = S();
assert.strictEqual(L.vowelRatio(g), 0.5);
g = L.emptyGrid(); for (let x = 0; x < 10; x++) g[19][x] = S();
assert.strictEqual(L.vowelRatio(g), null, 'stones alone are not enough tiles');
console.log('stones ok');
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/check-upgrades.cjs`
Expected: FAIL at `-- stones.cjs` with `L.stoneTile is not a function`.

- [ ] **Step 3: Implement `stoneTile`, `breakStones`, and the `vowelRatio` change in `js/logic.js`, and export the two new functions on `api`**

- [ ] **Step 4: Run all checks**

Run: `node tools/check-upgrades.cjs && node tools/check-logic.cjs`
Expected: `stones ok`, `all upgrade checks passed`, and check-logic finishing without an assertion error.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tools/checks/stones.cjs
git commit -m "Stones: letterless stone tiles break beside a cleared word"
```

---

### Task 2: Rising rows, the hazard schedule and the stingier dealer (pure)

**Files:**
- Modify: `js/logic.js` (constants block near line 36, new helpers after `crossCells`, a `junkRow` method on `PieceGenerator`, `api`)
- Modify: `js/upgrades.js:8-9` (`ITEM_CHANCE`, `PACK_RAT_CHANCE`)
- Create: `tools/checks/rise.cjs`

**Interfaces:**
- Consumes: `L.stoneTile()` (Task 1).
- Produces:
  - Constants exported on `api`: `RISE_FROM = 3`, `RISE_START = 8`, `RISE_STEP = 3`, `RISE_MIN = 3`, `HAZARD_MIN_OFFSET = 3`, and `JUNK_WEIGHTS`, an object whose **first key is `e`**. It holds common word-final letters and vowels and no J K QU V X Z. Suggested: `{ e: 12, s: 6, t: 6, a: 6, d: 4, r: 5, n: 5, o: 5, l: 4, i: 4, y: 2, h: 2, g: 2, m: 2 }`.
  - `L.hazardLevel(level, minLen) → number`: `level - HAZARD_MIN_OFFSET * (minLen - 3)`, where `minLen` is the title-screen setting.
  - `L.riseInterval(hl) → number`: 0 when `hl < RISE_FROM` (no rows), else `max(RISE_MIN, RISE_START - floor((hl - RISE_FROM) / RISE_STEP))`.
  - `L.junkLetters(hl) → number`: 4 when `hl < 9`, 3 when `hl < 15`, else 2.
  - `L.junkLayout(n, rng) → boolean[]`: `COLS` entries, exactly `n` true (a letter cell), no two true entries next to each other, positions random via `rng`.
  - `L.hookRateFor(hl) → number`: 0.9 when `hl <= 2`, 0.5 when `hl >= 15`, linear in between.
  - `L.shiftUp(grid, row) → boolean`: false and the grid untouched when any tile is in `grid[0]`; else every row moves up one, `grid[grid.length - 1] = row`, and it returns true.
  - `gen.junkRow(grid, layout) → tile[]`: a new row the length of `layout`. Each false entry is `L.stoneTile()`; each true entry is `{ ch, dy: 0, vy: 0 }` with `ch` drawn from `JUNK_WEIGHTS` via `this.rng`. It must not fire a word: the check board is `grid.slice(1).concat([row])` and `findWords(check, this.dict, this.rules)` must come back empty. It redraws the letters up to 30 times. After that it takes the last draw and repeatedly turns into stone any row-19 letter cell that a found word uses, until nothing fires. It never mutates `grid`.
  - `U.ITEM_CHANCE = 1 / 5`, `U.PACK_RAT_CHANCE = 2 / 5`.

- [ ] **Step 1: Write the failing test** `tools/checks/rise.cjs`

```js
const { L, U, dict, assert, well } = require('./_setup.cjs');
assert.strictEqual(L.hazardLevel(10, 3), 10); assert.strictEqual(L.hazardLevel(10, 4), 7); assert.strictEqual(L.hazardLevel(10, 5), 4);
assert.deepStrictEqual([1, 2, 3, 5, 6, 8, 9, 14, 15, 17, 18, 40].map(L.riseInterval), [0, 0, 8, 8, 7, 7, 6, 5, 4, 4, 3, 3]);
assert.deepStrictEqual([3, 8, 9, 14, 15, 30].map(L.junkLetters), [4, 4, 3, 3, 2, 2]);
assert.strictEqual(L.hookRateFor(1), 0.9); assert.strictEqual(L.hookRateFor(2), 0.9);
assert.strictEqual(L.hookRateFor(15), 0.5); assert.strictEqual(L.hookRateFor(30), 0.5);
for (let l = 3; l <= 15; l++) assert.ok(L.hookRateFor(l) < L.hookRateFor(l - 1), 'falls every level from 2 to 15');
for (let s = 1; s <= 200; s++) {
  const n = 2 + (s % 3), lay = L.junkLayout(n, L.makeRng(s));
  assert.strictEqual(lay.length, L.COLS); assert.strictEqual(lay.filter(Boolean).length, n);
  for (let x = 1; x < lay.length; x++) assert.ok(!(lay[x] && lay[x - 1]), 'no two letters side by side');
}
// shiftUp
let g = well([19, 0, 'ab'], [18, 0, 'c']);
const row = Array.from({ length: L.COLS }, () => L.stoneTile());
assert.strictEqual(L.shiftUp(g, row), true);
assert.strictEqual(g[18][0].ch, 'a'); assert.strictEqual(g[17][0].ch, 'c'); assert.strictEqual(g[19], row);
g = well([0, 4, 'x'], [19, 0, 'a']);
assert.strictEqual(L.shiftUp(g, row), false, 'a tile in row 0 tops out');
assert.strictEqual(g[0][4].ch, 'x'); assert.strictEqual(g[19][0].ch, 'a');
// junkRow: stones where the layout says, safe letters, never fires a word
assert.strictEqual(Object.keys(L.JUNK_WEIGHTS)[0], 'e');
const layout = [false, true, false, false, true, false, false, true, false, false];
for (let s = 1; s <= 100; s++) {
  const gen = new L.PieceGenerator(dict, { rng: L.makeRng(s) });
  const b = well([18, 1, 'c'], [19, 1, 'a'], [18, 4, 't'], [19, 4, 'h'], [18, 7, 'o'], [19, 7, 'n']);
  const r = gen.junkRow(b, layout);
  r.forEach((t, x) => assert.ok(layout[x] ? (t.ch && !t.stone && !'jkvxzq'.includes(t.ch[0])) || t.stone : t.stone));
  assert.deepStrictEqual(L.findWords(b.slice(1).concat([r]), dict, 3), [], 'seed ' + s);
}
// last resort: an rng stuck at 0 always draws 'e'; under T,H that spells THE, so that cell becomes stone
const stuck = new L.PieceGenerator(dict, { rng: () => 0 });
const b2 = well([18, 4, 't'], [19, 4, 'h']);
const r2 = stuck.junkRow(b2, layout);
assert.ok(r2[4].stone, 'the would-be word cell is stone'); assert.strictEqual(r2[1].ch, 'e');
// the dealer's rules count: F over L over the junk E reads FLE down (no word) and ELF backwards
assert.ok(dict.words.has('elf') && !dict.words.has('fle'));
const plain = new L.PieceGenerator(dict, { rng: () => 0 }).junkRow(well([18, 1, 'f'], [19, 1, 'l']), layout);
assert.strictEqual(plain[1].ch, 'e', 'plain rules: FLE fires nothing, the letter stays');
const mir = new L.PieceGenerator(dict, { rng: () => 0 }); mir.setRules({ minLen: 3, mirror: true });
const b4 = well([18, 1, 'f'], [19, 1, 'l']);
const r4 = mir.junkRow(b4, layout);
assert.ok(r4[1].stone, 'MIRROR: ELF would fire, so that cell becomes stone');
assert.deepStrictEqual(L.findWords(b4.slice(1).concat([r4]), dict, mir.rules), []);
assert.strictEqual(U.ITEM_CHANCE, 1 / 5); assert.strictEqual(U.PACK_RAT_CHANCE, 2 / 5);
console.log('rise ok');
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tools/check-upgrades.cjs`
Expected: FAIL at `-- rise.cjs` with `L.hazardLevel is not a function`.

- [ ] **Step 3: Implement the constants, the helpers and `PieceGenerator.junkRow` in `js/logic.js`, export them, and change the two chances in `js/upgrades.js`**

`junkLayout` approach: pick a random cell index among the cells that are still allowed (not a letter and not next to one), `n` times. With `COLS = 10` and `n ≤ 4` there is always room.

- [ ] **Step 4: Run all checks**

Run: `node tools/check-upgrades.cjs && node tools/check-logic.cjs`
Expected: `rise ok`, `all upgrade checks passed`.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js js/upgrades.js tools/checks/rise.cjs
git commit -m "Rising rows: junk rows, hazard schedule, hook-rate curve, more item cards"
```

---

### Task 3: Stones and rising rows in the game

**Files:**
- Modify: `js/icons.js:218-221` (add `tile.stone`)
- Modify: `tools/checks/icons.cjs` (check `tile.stone` is 7×7)
- Modify: `js/game.js`. That covers `tileKey`/`tileSprite` (lines 114–171), `newGame` (327), `spawn` (355), `resolve` (497), `startClear` (554), `finishClear` (575), `updateLevelUp` (627), `updateSettling` (686), the sfx table (around line 63 of the sfx IIFE), and `window.wordwell` (1327).

**Interfaces:**
- Consumes: `L.stoneTile`, `L.breakStones` (Task 1); `L.hazardLevel`, `L.riseInterval`, `L.junkLetters`, `L.junkLayout`, `L.hookRateFor`, `L.shiftUp`, `gen.junkRow` (Task 2).
- Produces (used by Task 4):
  - game state `riseLeft` (`null` while rows are off; otherwise the number of pieces still to be dealt before the next row; `0` means the falling piece is the last one before it);
  - `riseLayout` (`boolean[]`, the next row's layout);
  - `riseEvery` (the interval the current countdown started from, for the pips);
  - `hazLevel()` (`L.hazardLevel(level, minLen)`);
  - `ICONS.tile.stone`;
  - `tileKey(t)` returning `'*stone'` for stone tiles.

Behavior to build, in order:

- [ ] **Step 1: Add the stone mark and its icon check.** `ICONS.tile.stone` is a 7×7 white-only cobble pattern, a few irregular stones with black seams, unlike the bomb and the drill. `tileKey` maps `t.stone` to `'*stone'`, and `tileSprite`'s letterless branch draws it. Add `shape(I.tile.stone, 7, 'tile stone')` to `tools/checks/icons.cjs`.

Run: `node tools/check-upgrades.cjs`, expected `icons ok`.

- [ ] **Step 2: Stones break.** In `startClear`, right after the `blastAround` call, set `cells = L.breakStones(grid, cells, found)`. It has to come after the BOOM check: compare sizes around `blastAround` only, so a stone breaking doesn't trigger the BOOM banner.

- [ ] **Step 3: The schedule and the dealer.**
  - Add `armRise()`. When `riseLeft === null` and `L.riseInterval(hazLevel()) > 0`, it sets `riseEvery = riseLeft = L.riseInterval(hazLevel())` and `riseLayout = L.junkLayout(L.junkLetters(hazLevel()), Math.random)`.
  - Add `syncHazards()`. It sets `gen.hookRate = L.hookRateFor(hazLevel())` and calls `armRise()`.
  - Call `syncHazards()` at the end of `newGame()`, before its `spawn()`, and in `finishClear()` whenever `level` changed.
  - `newGame()` resets `riseLeft = null` and `riseLayout = null`.
  - `?level=N` (parsed once, like `?fast`) starts `newGame()` at `level = N` and `wordsCleared = (N - 1) * WORDS_PER_LEVEL`, with no pending level-ups.
  - `spawn()` does `riseLeft--` when `riseLeft > 0`, before dealing.

- [ ] **Step 4: The rise.**
  - Add `nextTurn()`: `if (riseLeft === 0) rise(); else spawn();`. Replace the `spawn()` call in `resolve()` (the no-words branch) and the one in `updateLevelUp()` with `nextTurn()`. `newGame()` keeps calling `spawn()`.
  - Add `rise()`:
    1. `const row = gen.junkRow(grid, riseLayout)`.
    2. If `!L.shiftUp(grid, row)`, call `gameOver()` and return.
    3. Otherwise set every tile's `dy += CELL`, so it draws one cell lower and slides up.
    4. Re-arm: `riseLeft = riseEvery = L.riseInterval(hazLevel())` and a new `riseLayout`.
    5. `shake = Math.max(shake, 3)`, `sfx.rise()` (a low rumble: `noise` plus a low sawtooth `tone`, like `blast` but softer), then `state = 'settling'`.
  - In `updateSettling`, also move tiles with `t.dy > 0` toward 0 at `CELL / 150` px per ms, and keep `moving` true while any are still moving. Falling tiles (`dy < 0`) behave as before.

- [ ] **Step 5: Debug helpers.** On `window.wordwell`:
  - `get riseLeft()`.
  - `rise()`: arms a layout if there is none and sets `riseLeft = 0`, so a row rises right after the falling piece locks.
  - `stone(x, y)`: `grid[y][x] = L.stoneTile()`.

- [ ] **Step 6: Scripted checks (Review Focus 1–4).** Run each command and check the printed `js:` results.

```sh
# rows armed at level 3: 8, minus the first spawn
node tools/shot.mjs /tmp/ww-arm.png --query=level=3 "js:wordwell.riseLeft"
# expected: 7
# a row rises after the piece locks; the bottom row is junk; the counter re-arms (8, minus the next spawn)
node tools/shot.mjs /tmp/ww-rise.png --query=level=3 "js:(wordwell.rise(), wordwell.riseLeft)" key:Space wait:1500 "js:[wordwell.state, wordwell.grid[19].filter(t=>t&&t.stone).length >= 6, wordwell.riseLeft]"
# expected: 0, then ["play", true, 7]
# top-out: a tile in row 0, then a forced rise, ends the game
node tools/shot.mjs /tmp/ww-over.png --query=level=3 "js:wordwell.stone(0,0),wordwell.rise()" key:Space wait:1500 "js:wordwell.state"
# expected: "over"
# level-up pending and rise due together: the level-up screen first, then the rise, then play
node tools/shot.mjs /tmp/ww-both.png --query=level=3 "js:wordwell.levelUp(),wordwell.rise()" key:Space wait:1500 "js:wordwell.state" wait:600 key:Enter wait:1500 "js:[wordwell.state, wordwell.grid[19].filter(t=>t&&t.stone).length >= 6, wordwell.riseLeft]"
# expected: "levelup", then ["play", true, 7]
# drill as the last piece before a rise
node tools/shot.mjs /tmp/ww-drill.png --query=level=3 "js:wordwell.give('drill'),wordwell.rise()" key:KeyC key:Space wait:1500 "js:[wordwell.state, wordwell.riseLeft]"
# expected: ["play", 7]
```

Also force a target before a rise to cover Review Focus 1. In the console or a `js:` step, call `wordwell.give('beacon')`, fire it, place the first chunk, call `wordwell.rise()` and drop a piece. Then check `wordwell.tracker.word` is still set and the red tiles moved up one row. If the pieces this sets up make it awkward, note in the report what was checked.

- [ ] **Step 7: Run all checks**

Run: `node tools/check-upgrades.cjs && node tools/check-logic.cjs`
Expected: `all upgrade checks passed`; check-logic has no assertion error.

- [ ] **Step 8: Commit**

```bash
git add js/icons.js js/game.js tools/checks/icons.cjs
git commit -m "Game: stone rows rise between pieces, stones break beside words, hook rate falls with level"
```

---

### Task 4: The warning, stone hints and the title text

**Files:**
- Modify: `js/game.js`. That covers `drawHUD` (1153), a new `drawRisePanel(y)` next to `drawTargetPanel` (1234), `drawWell` (954, the floor preview), `updateHints` (406), `drawBoard` (965) and `drawTitlePanels` (1252).
- Modify: `tools/shot.mjs` (a `--title` flag)

**Interfaces:**
- Consumes: `riseLeft`, `riseEvery`, `riseLayout`, `tileKey`'s `'*stone'` (Task 3); `L.breakStones` (Task 1).

- [ ] **Step 1: The RISE panel.**
  - The left panel's WORDS list shows 17 rows (y = 42 … 202) instead of 21.
  - `drawRisePanel(222)` draws `drawHeader('RISE', LEFT_X, 222)`. Below it:
    - while `riseLeft === null`, `FROM LV` plus the first level with rows (`RISE_FROM + HAZARD_MIN_OFFSET * (minLen - 3)`), in GREY;
    - otherwise `riseEvery` pips in the TARGET panel's style (6×5, 8 px apart, right-aligned at y = 239): filled for `i < riseLeft`, hollow otherwise.
  - When `riseLeft === 0`, the hollow pips blink (`Math.floor(time / 200) % 2`).

- [ ] **Step 2: The floor preview.** In `drawWell`, when `riseLeft === 0`, `riseLayout` is set and the state is `play` or `paused`, draw over the floor strip on the blink-on phase. For each column `x`, at `cellPx(x)` and `y = WELL_Y + WELL_H + 1`, draw an 11×6 cell: a white block with one black seam for a stone column, or a red 11×6 outline for a letter column. Clear the strip to black first, so the cobbles don't show through.

- [ ] **Step 3: Stone hints.** In `updateHints`, after the word cells are collected, add every key from `L.breakStones(tmp, new Set(), found)` to `hint.cells` (`found` is the `findWords` result already computed there). `drawBoard` already draws pulsing hint cells in the `hint` style, and `tileSprite('*stone', 'hint')` gives a red outline around the white mark. Also check that the `ghostHint` and `dead` styles render a stone sensibly.

- [ ] **Step 4: The title text.** Append these to the HOW TO list in `drawTitlePanels`, with no blank line before them, so they end at y = 242, above BEST at 252: `['STONES RISE.', RED], ['WORDS BREAK', WHITE], ['STONES NEXT', WHITE], ['TO THEM.', WHITE]`.

- [ ] **Step 5: Screenshots.** `tools/shot.mjs` always presses Enter. Add a `--title` flag that skips the Enter press and the wait for `play`, and add it to the usage line. Then take these shots and check them by eye.

```sh
node tools/shot.mjs /tmp/ww-title.png --title wait:300
node tools/shot.mjs /tmp/ww-pips.png --query=level=6 wait:300
node tools/shot.mjs /tmp/ww-floor-a.png --query=level=3 "js:wordwell.rise()" wait:300
node tools/shot.mjs /tmp/ww-floor-b.png --query=level=3 "js:wordwell.rise()" wait:500
node tools/shot.mjs /tmp/ww-stones.png --query=level=3 "js:wordwell.rise()" key:Space wait:1500 "js:wordwell.setPiece('I',['c','a','t','s'],0)" wait:100
node tools/shot.mjs /tmp/ww-hint.png "js:{for(let x=0;x<10;x++)wordwell.stone(x,19);wordwell.setPiece('I',['c','a','t','s'],0)}" wait:100
```

Expected:
- `ww-title`: the four new lines above BEST.
- `ww-pips`: a RISE header with 7 pips, 6 of them filled.
- `ww-floor-a`/`-b`: the floor strip showing the row layout in one of the two shots (they land on different blink phases).
- `ww-stones`: a bottom row of white cobble stones with up to 4 letters.
- `ww-hint`: CATS ghosted on row 18. The stones under C, A, T, S (x = 0–3) pulse in the hint style alongside the word cells. Retake with `wait:280` if the frame lands on the off phase.

- [ ] **Step 6: Run all checks and commit**

Run: `node tools/check-upgrades.cjs && node tools/check-logic.cjs`
Expected: `all upgrade checks passed`.

```bash
git add js/game.js tools/shot.mjs
git commit -m "HUD: RISE countdown, floor preview of the incoming row, stone hints, title text"
```

---

### Task 5: Hazards in the sim, tuning, docs

**Files:**
- Modify: `tools/simulate.cjs`
- Modify: `js/logic.js` constants (only if tuning changes them), plus `tools/checks/rise.cjs` expectations to match
- Modify: `CLAUDE.md`, `docs/upgrades-notes.md`

**Interfaces:**
- Consumes: everything from Tasks 1–2 (`hazardLevel`, `riseInterval`, `junkLetters`, `junkLayout`, `hookRateFor`, `shiftUp`, `gen.junkRow`, `breakStones`, `stoneTile`).

- [ ] **Step 1: Add the hazards row.**
  - Add a `playHazards(minLen, maxPieces, rng, stats)` loop beside `play()`. Leave `play()` and the five dealers untouched.
  - It uses `generator(rng, minLen, { targets: TARGETS })` and keeps `gen` reachable (add `dealer.gen = gen` in `generator()`).
  - It tracks `words`, then `level = 1 + floor(words / 8)` (no short words in the sim), then `hl = L.hazardLevel(level, minLen)`. Each turn it sets `gen.hookRate = L.hookRateFor(hl)`.
  - Rise schedule, mirroring game.js:
    - arm when `riseLeft === null && L.riseInterval(hl) > 0`;
    - `riseLeft--` on each deal;
    - after a turn's clears settle, if `riseLeft === 0`, call `L.shiftUp(grid, gen.junkRow(grid, layout))`. A false result means the bot lost. Otherwise re-arm.
  - Clears: the word cells, plus target line cells on a hit (as in `play()`), then `L.breakStones(grid, cells, found)`.
  - The bot's `value()` for this row adds 10 per stone `breakStones` would add, so the bot wants to dig.
  - Cap at 1000 pieces.
  - Print these rows after the existing loop, under their own header line starting with `=== hazards`, so the old output above it stays byte-for-byte the same.
  - Per `minLen` in [3, 4], 8 games, print one line:
    - games lost and the median level reached;
    - the mean fill (`tiles / 200`, as a %) the first time each game reaches levels 10, 15 and 20, with `-` when no game got there;
    - stones broken per row risen;
    - words/piece and the length mix.

- [ ] **Step 2: Check the old rows still match the baseline**

Run: `node tools/simulate.cjs > /tmp/ww-sim.txt; diff <(sed -E 's/ +[0-9.]+ ms\/deal//' /private/tmp/claude-501/-Users-mihai-AI-word-tetris/1664d622-3bc7-411b-adc8-656ce7506333/scratchpad/sim-baseline.txt) <(sed '/^=== hazards/,$d' /tmp/ww-sim.txt | sed -E 's/ +[0-9.]+ ms\/deal//')`
Expected: no output (the old rows are unchanged).

- [ ] **Step 3: Tune.** The goal at MIN 3:
  - the bot survives past level 15 in at least 7 of 8 games;
  - its mean fill at level 15 is about 25–35%, and higher at level 20 than at 10;
  - it eventually loses: the median death level is reported, and if the bot never dies by 1000 pieces, raise the pressure;
  - at MIN 4, the bot reaches level 10 in at least 6 of 8 games.

  The knobs, in this order: `RISE_START`/`RISE_MIN`/`RISE_STEP`, the letters per row, the hook-rate floor (0.5), then `HAZARD_MIN_OFFSET`. Keep each change small and re-run. Update `tools/checks/rise.cjs` expectations for any constant that changes. Record the final constants and the sim lines.

- [ ] **Step 4: Docs.**
  - CLAUDE.md:
    - a **Hazards** section after Upgrades. It covers stone tiles and when they break; rising rows (layout at arm time, letters at rise time, no free words, top-out); the schedule constants and `hazardLevel`; `hookRateFor`; item odds; and the turn order with `nextTurn()`/`rise()`.
    - the state machine paragraph: the rise step.
    - the HUD paragraph: the RISE panel and the floor preview.
    - the sim table: a `game+hazards` row with its MIN 3 numbers, and a sentence that the old rows play with hazards off.
    - Commands: `?level=N`.
    - Verifying visual changes: `rise()`, `riseLeft`, `stone(x, y)`.
    - Ideas not yet built: hazards v1 is built; other hazard ideas (+1 min length, petrify) stay unbuilt.
  - `docs/upgrades-notes.md`: in the Status line, hazards v1 is built (stone rows and a stingier dealer, spec `2026-10-16-stone-rows-design.md`).

- [ ] **Step 5: Final verification and commit**

Run: `node tools/check-logic.cjs && node tools/check-upgrades.cjs && node tools/simulate.cjs`
Expected: all checks pass, and the sim prints the old rows unchanged plus the hazards rows.

```bash
git add tools/simulate.cjs js/logic.js tools/checks/rise.cjs CLAUDE.md docs/upgrades-notes.md
git commit -m "Sim: hazards row; tune stone rows; docs"
```
