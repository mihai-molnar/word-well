# Board Hooks and Anchored Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 4–7 letter regular words common by dealing pieces that extend letters already on the board ("hooks"), and rebuild target words so they grow out of board letters and blast their row or column.

**Architecture:** All rules live in the pure `js/logic.js`:
- a prefix/suffix word index;
- a landing-spot and segment search;
- `findHooks`;
- a two-step `PieceGenerator` (`peekType()` for the NEXT box, `next(grid)` at spawn);
- an anchored target planner;
- `TargetTracker.announce`.

`js/game.js` only changes how it calls these: it deals at spawn, draws NEXT as a shape, reserves the anchor, and clears the line on a hit. `tools/simulate.cjs` mirrors the game loop for tuning.

**Tech Stack:** Plain browser JS (globals via `<script>`, runs from `file://`), Node for `tools/*.cjs`, headless Chrome over CDP for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-16-board-hooks-design.md`

## Global Constraints

- Must run from `file://` with zero dependencies: no `fetch()` of local files, no ES modules in the browser.
- `js/logic.js` stays DOM-free and keeps exporting through `module.exports`.
- Pixel-perfect rendering: integer draw coordinates only. Use only the `BLACK`/`WHITE`/`RED` palette and the existing dim helpers.
- `js/words.js` is generated; never edit it by hand.
- Hook words are 4–7 letters (`HOOK_MIN = 4`, `HOOK_MAX = 7`) and never contain Q. `HOOK_RATE = 0.9`.
- The dealer only plans in rotation 0 (spawn) or rotation 1 (one clockwise turn).
- Targets: anchors of 1–3 board letters, words from `TARGETS` (5–7 letters), 1 or 2 pieces, a 2–4 letter straight segment per piece. Across candidates are tried before down candidates.
- The NEXT box shows only the shape. Letters are dealt at spawn from the live board.
- 3-letter word rules are unchanged.
- Go/no-go bar (min 3, bot, hooks without targets): 5+ letter words ≥ 25%, 0/8 games lost, under 5 ms per deal.
- Branch: `board-hooks`. End commits with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A nearly full well.** Landing spots that would poke above row 0 must not be planned. Only the shapes that fit count. (Test in Task 2.)
- **QU tiles next to a hook.** No hook may use a QU tile, because the index has no Q words and tiles ≠ letters there. (Test in Task 2.)
- **Anchor tiles moved by gravity before the chunk lands.** The red mark must move with the tile, and expiry must still free it. (Test in Task 3.)
- **The MIN 4/5 setting.** A hook must never be shorter than the minimum word length, or it can't fire. (Test in Task 3.)
- **A target hit before its last chunk lands.** The late chunk must arrive as plain letters, not as dead red tiles. (Test in Task 3.)

## File Structure

- `js/logic.js` (modify): new constants, `wordsMatching`, `landings`, `boardRun`, `segments`, `findHooks`, `placeAt`, `lineCells`, `pickIndex`, `hookWeight`. The `PieceGenerator` dealing gets rewritten, and `TargetTracker` gains `announce`. `BOTTOM_ROW` and `chunkPiece` are deleted.
- `js/game.js` (modify): `spawn`, `newGame`, the NEXT drawing, `drawMiniPiece`, `drawTargetPanel`, `resolve` (the blast), the title blurb, and the `window.wordwell` getters.
- `tools/check-logic.cjs` (modify): new assertions. The old two-piece/bottom-row target tests and the old tracker tests are replaced.
- `tools/simulate.cjs` (modify): deals at spawn, new dealer rows, hook/target/blast/timing stats.
- `CLAUDE.md` (modify): architecture and the sim baseline.

---

### Task 1: Prefix/suffix word index

**Files:**
- Modify: `js/logic.js` (constants block after `TARGET_BONUS`; `buildDictionary`; `api`)
- Test: `tools/check-logic.cjs` (new section before `// --- generator stats`)

**Interfaces:**
- Produces: `HOOK_MIN`, `HOOK_MAX`, `HOOK_RATE` (exported). `dict.byPrefix` and `dict.bySuffix` are `Map<string, string[]>`. `wordsMatching(dict, len, pre, suf) → string[]` returns words of exactly `len` letters starting with `pre` and ending with `suf`; at least one of the two is non-empty.

- [ ] **Step 1: Write the failing test.** Insert this block in `tools/check-logic.cjs` immediately before the line `// --- generator stats`:

```js
// --- pattern index: hook-length words by prefix and suffix
assert.ok(L.wordsMatching(dict, 6, 'st', '').includes('strong'));
assert.deepStrictEqual(L.wordsMatching(dict, 6, 'pl', 'et'), ['planet']);
assert.ok(L.wordsMatching(dict, 7, '', 'ing').includes('nothing'));
for (const [len, pre, suf] of [[5, 'c', ''], [6, '', 'er'], [7, 'st', 'ng'], [4, 'qu', '']]) {
  for (const w of L.wordsMatching(dict, len, pre, suf)) {
    assert.ok(w.length === len && w.startsWith(pre) && w.endsWith(suf) && !w.includes('q'), `${w} matches ${len}|${pre}|${suf}`);
  }
}
assert.deepStrictEqual(L.wordsMatching(dict, 3, 'ca', ''), [], 'hooks are 4+ letters');
assert.deepStrictEqual(L.wordsMatching(dict, 8, 'st', ''), [], 'hooks are at most 7 letters');

```

- [ ] **Step 2: Run it to confirm it fails.** Run `node tools/check-logic.cjs`. Expected: `TypeError: L.wordsMatching is not a function`.

- [ ] **Step 3: Implement.** In `js/logic.js`, after the line `const TARGET_BONUS = 3; // score multiplier for spelling the target`, add:

```js

  // Hooks: the dealer letters a piece so it can turn letters already on the board into a longer word.
  const HOOK_MIN = 4; // shortest hook word
  const HOOK_MAX = 7; // longest hook word
  const HOOK_RATE = 0.9; // share of plain pieces that try to be a hook
```

Replace the comment above `buildDictionary` and the function itself with the following. The first comment line, "words: valid answers…", stays as it is:

```js
  // words: valid answers (3+ letters). infixes: every 2-4 letter chunk that occurs inside a
  // word, used to check that a piece's letters can actually sit inside real words.
  // byPrefix/bySuffix: hook-length words (no Q, which only exists as the QU tile) keyed by
  // "length|prefix" and "length|suffix", for wordsMatching.
  function buildDictionary(text) {
    const words = new Set();
    const infixes = new Set();
    const byPrefix = new Map();
    const bySuffix = new Map();
    const add = (map, k, w) => { const list = map.get(k); if (list) list.push(w); else map.set(k, [w]); };
    let maxLen = 0;
    for (const raw of text.split(/\s+/)) {
      const w = raw.toLowerCase();
      if (w.length < 3 || !/^[a-z]+$/.test(w)) continue;
      words.add(w);
      if (w.length > maxLen) maxLen = w.length;
      for (let a = 0; a < w.length; a++) {
        for (let n = 2; n <= 4 && a + n <= w.length; n++) infixes.add(w.slice(a, a + n));
      }
      if (w.length < HOOK_MIN || w.length > HOOK_MAX || w.includes('q')) continue;
      for (let k = 1; k < w.length; k++) {
        add(byPrefix, w.length + '|' + w.slice(0, k), w);
        add(bySuffix, w.length + '|' + w.slice(w.length - k), w);
      }
    }
    return { words, infixes, maxLen, byPrefix, bySuffix };
  }

  // Hook-length words of exactly len letters that start with pre and end with suf (not both empty).
  function wordsMatching(dict, len, pre, suf) {
    if (!pre) return dict.bySuffix.get(len + '|' + suf) || [];
    const list = dict.byPrefix.get(len + '|' + pre) || [];
    return suf ? list.filter(w => w.endsWith(suf)) : list;
  }
```

In `api`, add `HOOK_MIN, HOOK_MAX, HOOK_RATE` after `TARGET_BONUS`, and add `wordsMatching` after `buildDictionary`.

- [ ] **Step 4: Run tests, expect PASS.** Run `node tools/check-logic.cjs`. Expected: exit 0. Also check the build time: `node -e "globalThis.window=globalThis;require('./js/words.js');const L=require('./js/logic.js');let t=Date.now();L.buildDictionary(window.WORDLIST);console.log(Date.now()-t,'ms')"` should print under 150 ms (about 50 in the prototype).

- [ ] **Step 5: Commit.**

```bash
git add js/logic.js tools/check-logic.cjs
git commit -m "Logic: prefix/suffix index of hook-length words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Landing spots, segments and hook search

**Files:**
- Modify: `js/logic.js` (new functions inserted right before the comment `// Deals tetrominoes from a 7-bag`; `api`)
- Test: `tools/check-logic.cjs` (append to the Task 1 section, before `// --- generator stats`)

**Interfaces:**
- Consumes: `wordsMatching`, `HOOK_MIN`, `HOOK_MAX` (Task 1); the existing `SHAPES`, `collides`, `rotateCells` and `createPiece`.
- Produces:
  - `landings(grid, type) → [{ rot: 0|1, x, y, cells: [{ i, x, y }] }]`, where `i` is the cell index in `SHAPES[type].cells` order.
  - `segments(grid, land) → [{ dir: 'h'|'v', seg: [{ i, x, y }], before: [{ x, y, ch }], after: [{ x, y, ch }] }]`.
  - `findHooks(grid, type, dict) → [{ rot, x, y, dir, pre, suf, len, board, holes, seg: number[], words: string[] }]`.
  - `placeAt(grid, deal, spot) → grid copy`, where `deal = { type, letters, target? }` and `spot = { rot, x, y }`.
  - The module-private helpers `boardRun`, `pickIndex` and `hookWeight`, used by Task 3.

- [ ] **Step 1: Write the failing test.** Append after the Task 1 block, still before `// --- generator stats`:

```js
// --- hooks: board letters a piece can turn into a longer word
const well = (...rows) => {
  const g = L.emptyGrid();
  for (const [y, x, s] of rows) [...s].forEach((ch, i) => { if (ch !== '.') g[y][x + i] = { ch }; });
  return g;
};
const column = (g, x, top, s) => { [...s].forEach((ch, i) => { g[top + i][x] = { ch }; }); return g; };
for (const t of L.TYPES) {
  for (const land of L.landings(L.emptyGrid(), t)) {
    assert.ok(land.rot === 0 || land.rot === 1, 'only the turns that keep reading order');
    assert.ok(land.cells.some(c => c.y === L.ROWS - 1), 'an empty well: every piece rests on the floor');
  }
}
// A nearly full well: only spots inside the well count.
const full = L.emptyGrid();
for (let y = 0; y < L.ROWS; y++) for (let x = 0; x < L.COLS; x++) if (x !== 4) full[y][x] = { ch: 'e' };
assert.deepStrictEqual(L.landings(full, 'I').map(l => [l.rot, l.cells.map(c => c.x).join()]), [[1, '4,4,4,4']], 'only the upright I fits the one open column');
assert.ok(L.TYPES.filter(t => t !== 'I').every(t => L.landings(full, t).length === 0), 'nothing else fits');

let hooks = L.findHooks(well([19, 0, 'st']), 'I', dict);
assert.ok(hooks.some(h => h.rot === 0 && h.x === 2 && h.y === 18 && h.dir === 'h' && h.pre === 'st' && h.words.includes('strong')), 'ST + an I across');
hooks = L.findHooks(well([19, 6, 'ate']), 'I', dict);
assert.ok(hooks.some(h => h.dir === 'h' && h.suf === 'ate' && h.words.includes('climate')), 'an I across to the left of ATE');
hooks = L.findHooks(well([19, 0, 'pl..et']), 'O', dict);
assert.ok(hooks.some(h => h.pre === 'pl' && h.suf === 'et' && h.words.includes('planet')), 'an O bridging PL..ET');
hooks = L.findHooks(column(L.emptyGrid(), 4, 17, 'ing'), 'I', dict);
assert.ok(hooks.some(h => h.rot === 1 && h.dir === 'v' && h.suf === 'ing' && h.words.includes('nothing')), 'an upright I on top of ING');
assert.ok(hooks.every(h => h.rot === 0 || h.rot === 1));
const reservedSt = well([19, 0, 'st']);
reservedSt[19][0].tgt = reservedSt[19][1].tgt = 'stone';
assert.deepStrictEqual(L.findHooks(reservedSt, 'I', dict), [], 'reserved tiles are never hooked');
const quWell = L.emptyGrid();
[{ ch: 'qu' }, { ch: 'i' }, { ch: 't' }].forEach((t, i) => { quWell[19][i] = t; });
hooks = L.findHooks(quWell, 'I', dict);
assert.ok(hooks.length && hooks.every(h => !h.pre.includes('q') && !h.suf.includes('q') && h.words.every(w => !w.includes('q'))), 'QU tiles never take part in hooks');
// placeAt drops a dealt piece at a planned spot (rotation 1 = one clockwise turn).
const placed = L.placeAt(L.emptyGrid(), { type: 'I', letters: ['w', 'o', 'r', 'd'] }, { rot: 1, x: 0, y: 16 });
assert.deepStrictEqual([16, 17, 18, 19].map(y => placed[y][2] && placed[y][2].ch).join(''), 'word');

```

- [ ] **Step 2: Run it to confirm it fails.** Run `node tools/check-logic.cjs`. Expected: `TypeError: L.landings is not a function`.

- [ ] **Step 3: Implement.** In `js/logic.js`, insert right before `  // Deals tetrominoes from a 7-bag and letters them so they stay usable:`:

```js
  // Every resting spot of a piece type dropped straight down, in rotation 0 (spawn) or 1 (one
  // clockwise turn): the two turns that keep a row's reading order. Cells keep their index i.
  function landings(grid, type) {
    const n = SHAPES[type].n;
    const out = [];
    let cells = SHAPES[type].cells.map(([x, y], i) => ({ x, y, i }));
    for (let rot = 0; rot < 2; rot++) {
      for (let x = -n; x < grid[0].length; x++) {
        const p = { x, y: -n, cells };
        if (collides(grid, p, 0, 0)) continue;
        while (!collides(grid, p, 0, 1)) p.y++;
        const at = cells.map(c => ({ i: c.i, x: p.x + c.x, y: p.y + c.y }));
        if (at.some(c => c.y < 0)) continue;
        out.push({ rot, x, y: p.y, cells: at });
      }
      cells = rotateCells(cells, n, 1);
    }
    return out;
  }

  // Unreserved board letters from (x, y) onwards in steps of (dx, dy), up to the first gap.
  function boardRun(grid, x, y, dx, dy) {
    const out = [];
    while (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      const t = grid[y][x];
      if (!t || t.tgt) break;
      out.push({ x, y, ch: t.ch });
      x += dx;
      y += dy;
    }
    return out;
  }

  // The straight lines a landed piece makes: in each row and column it touches, its cells there
  // (always one unbroken segment, in reading order) and the board letters directly before and after.
  function segments(grid, land) {
    const at = new Map(land.cells.map(c => [c.x + ',' + c.y, c]));
    const out = [];
    for (const [dir, dx, dy] of [['h', 1, 0], ['v', 0, 1]]) {
      for (const c of land.cells) {
        if (at.has((c.x - dx) + ',' + (c.y - dy))) continue;
        const seg = [];
        for (let x = c.x, y = c.y; at.has(x + ',' + y); x += dx, y += dy) seg.push(at.get(x + ',' + y));
        const end = seg[seg.length - 1];
        out.push({
          dir, seg,
          before: boardRun(grid, c.x - dx, c.y - dy, -dx, -dy).reverse(),
          after: boardRun(grid, end.x + dx, end.y + dy, dx, dy),
        });
      }
    }
    return out;
  }

  // Hooks for a piece type: spots where one straight segment of the piece, with board letters before
  // and/or after it, would spell a HOOK_MIN..HOOK_MAX letter word. Each hook lists every word that fits;
  // seg holds the piece's cell indices in reading order, pre/suf the board letters used.
  function findHooks(grid, type, dict) {
    const hooks = [];
    for (const land of landings(grid, type)) {
      const at = new Set(land.cells.map(c => c.x + ',' + c.y));
      const holes = land.cells.filter(c => c.y + 1 < grid.length && !grid[c.y + 1][c.x] && !at.has(c.x + ',' + (c.y + 1))).length;
      for (const s of segments(grid, land)) {
        const B = s.before.length, A = s.after.length, m = s.seg.length;
        for (let i = 0; i <= B; i++) {
          for (let j = 0; j <= A; j++) {
            const len = i + m + j;
            if (i + j === 0 || len < HOOK_MIN || len > HOOK_MAX) continue;
            const pre = s.before.slice(B - i).map(t => t.ch).join('');
            const suf = s.after.slice(0, j).map(t => t.ch).join('');
            const words = wordsMatching(dict, len, pre, suf);
            if (words.length) {
              hooks.push({ rot: land.rot, x: land.x, y: land.y, dir: s.dir, pre, suf, len, board: i + j, holes, seg: s.seg.map(c => c.i), words });
            }
          }
        }
      }
    }
    return hooks;
  }

  // A copy of the grid with a dealt piece dropped at spot {rot (0|1), x, y}.
  function placeAt(grid, deal, spot) {
    let cells = createPiece(deal.type, deal.letters, deal.target).cells;
    if (spot.rot) cells = rotateCells(cells, SHAPES[deal.type].n, 1);
    const g = grid.map(row => row.slice());
    for (const c of cells) g[spot.y + c.y][spot.x + c.x] = c.tgt ? { ch: c.ch, tgt: c.tgt } : { ch: c.ch };
    return g;
  }

  function pickIndex(weights, rng) {
    let total = 0;
    for (const w of weights) total += w;
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  // Among hooks of the chosen length band: longer words and more board letters used weigh more,
  // spots that bury empty cells much less.
  const hookWeight = h => (h.len - 3) * (h.len - 3) * (1 + h.board) / (1 + 3 * h.holes);

```

In `api`, add `landings, segments, findHooks, placeAt` after `runsOf`.

- [ ] **Step 4: Run tests, expect PASS.** Run `node tools/check-logic.cjs`. Expected: exit 0.

- [ ] **Step 5: Commit.**

```bash
git add js/logic.js tools/check-logic.cjs
git commit -m "Logic: landing spots, line segments and hook search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The new dealer (hooks, anchored targets, deal at spawn) wired into the sim and the game

This task changes the `PieceGenerator` and `TargetTracker` interfaces, so it updates every caller in the same commit.

**Files:**
- Modify: `js/logic.js` (delete `BOTTOM_ROW`; rewrite the `PieceGenerator` dealing; `TargetTracker`)
- Modify: `tools/check-logic.cjs` (replace the old target-dealer and tracker tests; update the vowel-quota check)
- Modify: `tools/simulate.cjs` (deal at spawn; new rows and stats)
- Modify: `js/game.js` (`queue` removed; `newGame`, `spawn`, NEXT box, `drawMiniPiece`, `drawTargetPanel`, debug getters)

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces:
  - `new PieceGenerator(dict, { rng, minLen, hookRate = HOOK_RATE, targets })`.
  - `peekType() → type`.
  - `next(grid) → { type, letters, hook?: { word, rot, x, y }, target?: { word, idx, last, spot: { rot, x, y }, anchor?: [{ x, y }] } }`. Only a target's first piece carries `anchor`.
  - `plan` holds a pending second chunk.
  - Also on the generator: `planTarget(grid, ratio, type) → deals[] | null`, `spells(grid, word) → bool`, `fillAround(type, fixed, ratio, target) → letters | null`.
  - `TargetTracker.announce(grid, target)`. `placed(info)` no longer sets `word`.

- [ ] **Step 1: Write the failing tests.** In `tools/check-logic.cjs`:

(a) Delete the old target-dealer tests and old tracker tests. Remove everything from the line `// The dealer splits a target over two consecutive pieces, the word's end first, then its start,` up to (not including) `// --- pattern index: hook-length words by prefix and suffix`. That covers the bottom-row pair checks, `tgen`/`pairs`, the "no targets unless asked for" line, and the `T1`/`T2`/`T3` tracker tests.

(b) Insert before `// --- generator stats`:

```js
// A rough mid-game board: plain pieces dropped at random spots, words cleared as they form.
function roughBoard(seed, pieces) {
  const rng = L.makeRng(seed);
  const gen = new L.PieceGenerator(dict, { rng, hookRate: 0 });
  let g = L.emptyGrid();
  for (let i = 0; i < pieces; i++) {
    const d = gen.next(g);
    const spots = L.landings(g, d.type);
    g = L.placeAt(g, d, spots[Math.floor(rng() * spots.length)]);
    for (let found; (found = L.findWords(g, dict, 3)).length;) {
      for (const w of found) for (const c of w.cells) g[c.y][c.x] = null;
      L.applyGravity(g);
    }
  }
  return g;
}

// --- the dealer letters hook pieces so the word really fires at the hook spot, preferring 5+ letters
const hookGen = new L.PieceGenerator(dict, { rng: L.makeRng(11), hookRate: 1 });
let hooked = 0, longHooks = 0, deals = 0;
for (let seed = 1; seed <= 12; seed++) {
  const g = roughBoard(seed, 12);
  for (let i = 0; i < 10; i++) {
    const type = hookGen.peekType();
    const anyLong = L.findHooks(g, type, dict).some(h => h.len >= 5);
    const d = hookGen.next(g);
    assert.strictEqual(d.type, type, 'next() deals the peeked shape');
    deals++;
    if (!d.hook) continue;
    hooked++;
    assert.ok(d.hook.word.length >= L.HOOK_MIN && d.hook.word.length <= L.HOOK_MAX);
    assert.ok(L.findWords(L.placeAt(g, d, d.hook), dict, 3).some(w => w.word.includes(d.hook.word)), d.hook.word + ' fires at its spot');
    assert.strictEqual(hookGen.problems(d.type, d.letters), 0, 'hook pieces pass the usual letter checks');
    if (anyLong) assert.ok(d.hook.word.length >= 5, '5+ letter hooks win when there are any');
    if (d.hook.word.length >= 5) longHooks++;
  }
}
console.log('hook deals', hooked + '/' + deals, 'of them 5+ letters', longHooks);
assert.ok(hooked >= deals * 0.6, 'most pieces on a rough board can be hooks');
assert.ok(!new L.PieceGenerator(dict, { rng: L.makeRng(1), hookRate: 1 }).next(null).hook, 'no board, no hooks');
// MIN 5: a hook shorter than the minimum could never fire, so none is dealt.
const min5 = new L.PieceGenerator(dict, { rng: L.makeRng(2), hookRate: 1, minLen: 5 });
for (let seed = 1; seed <= 6; seed++) {
  const g = roughBoard(seed, 12);
  for (let i = 0; i < 8; i++) {
    const d = min5.next(g);
    if (d.hook) assert.ok(d.hook.word.length >= 5, 'min 5 hook ' + d.hook.word);
  }
}

// --- anchored targets: a target grows out of board letters and arrives in one or two pieces
const planOn = (g, type, words, seed = 3) => new L.PieceGenerator(dict, { rng: L.makeRng(seed), targets: words, hookRate: 0 }).planTarget(g, null, type);
// Plays a plan at its planned spots: the target must fire exactly once.
function playPlan(g, plan) {
  const T = new L.TargetTracker();
  g = g.map(row => row.map(t => t && { ...t }));
  T.announce(g, plan[0].target);
  for (const d of plan) g = L.placeAt(g, d, d.target.spot);
  const hits = T.hit(g, L.findWords(g, dict, 3));
  assert.strictEqual(hits.length, 1, plan[0].target.word + ' fires once every chunk lands');
  return hits[0];
}
let plan = planOn(well([19, 0, 'st']), 'I', ['strong']);
assert.strictEqual(plan.length, 1, 'ST + an I holds all of STRONG');
assert.deepStrictEqual(plan[0].target.anchor, [{ x: 0, y: 19 }, { x: 1, y: 19 }]);
assert.strictEqual(plan[0].target.last, true);
assert.strictEqual(plan[0].target.idx.map(i => plan[0].letters[i]).join(''), 'rong');
assert.strictEqual(playPlan(well([19, 0, 'st']), plan).dir, 'h');

plan = planOn(well([19, 0, 'st']), 'O', ['strong']);
assert.strictEqual(plan.length, 2, 'an O holds 2 letters, so STRONG needs a second piece');
assert.ok(!plan[0].target.last && plan[1].target.last && !plan[1].target.anchor);
playPlan(well([19, 0, 'st']), plan);

plan = planOn(column(L.emptyGrid(), 4, 17, 'ing'), 'I', ['nothing']);
assert.strictEqual(plan[0].target.spot.rot, 1, 'down: an upright I on top of the column');
assert.deepStrictEqual(plan[0].target.anchor, [{ x: 4, y: 17 }, { x: 4, y: 18 }, { x: 4, y: 19 }]);
assert.strictEqual(playPlan(column(L.emptyGrid(), 4, 17, 'ing'), plan).dir, 'v');

for (let seed = 1; seed <= 6; seed++) {
  plan = planOn(column(well([19, 0, 'st']), 7, 17, 'ing'), 'I', ['strong', 'nothing'], seed);
  assert.strictEqual(plan[0].target.word, 'strong', 'across beats down when both fit');
}
assert.strictEqual(planOn(L.emptyGrid(), 'I', ['strong']), null, 'no board letters, no target');

// Targets come round on schedule, never overlapping; a second chunk comes right after its first.
const tgen = new L.PieceGenerator(dict, { rng: L.makeRng(7), targets: window.TARGETS.split(' '), hookRate: 0 });
const tboard = roughBoard(4, 14);
assert.strictEqual(tgen.next(L.emptyGrid()).target, undefined);
const dealt = Array.from({ length: 120 }, () => tgen.next(tboard));
let starts = 0, lastEnd = -Infinity;
dealt.forEach((d, i) => {
  if (!d.target || !d.target.anchor) return;
  assert.ok(i - lastEnd > L.TARGET_WINDOW, 'a new target never starts inside the last one\'s window');
  const n = d.target.last ? 1 : 2;
  if (n === 2) assert.ok(dealt[i + 1].target && dealt[i + 1].target.last && dealt[i + 1].target.word === d.target.word, 'the second chunk comes right after the first');
  starts++;
  lastEnd = i + n - 1;
});
console.log('targets started in 120 pieces on a rough board', starts);
assert.ok(starts >= 12, 'targets come round regularly');
assert.ok(!new L.PieceGenerator(dict, { rng: L.makeRng(7) }).next(tboard).target, 'no targets unless asked for');
// While a two-piece target's first chunk is in play, NEXT shows the second chunk's shape.
const pgen = new L.PieceGenerator(dict, { rng: L.makeRng(3), targets: ['strong'], hookRate: 0 });
pgen.untilTarget = 0;
pgen.pending = 'O';
const firstChunk = pgen.next(well([19, 0, 'st']));
assert.ok(firstChunk.target && !firstChunk.target.last, 'an O cannot hold RONG, so STRONG takes two pieces');
assert.strictEqual(pgen.peekType(), pgen.plan[0].type);

// --- tracker: announce reserves the anchor; a hit or an expiry frees every red tile
const stInfo = { word: 'strong', anchor: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
const T1 = new L.TargetTracker();
let g7 = line(plain('st'), plain('l'));
T1.announce(g7, stInfo);
assert.strictEqual(T1.word, 'strong');
assert.deepStrictEqual(g7[0].slice(0, 2).map(t => t.tgt), ['strong', 'strong'], 'anchor tiles turn red');
g7 = line(g7[0].slice(0, 2), tg('rong', 'strong'));
T1.placed({ word: 'strong', last: true });
assert.deepStrictEqual(T1.hit(g7, L.findWords(g7, dict, 3)).map(w => w.word), ['strong']);
assert.strictEqual(T1.word, null, 'a hit ends the target');

const T2 = new L.TargetTracker();
const g9 = line(plain('st'), plain('x'), tg('ong', 'strong'));
g9[0][2] = null;
T2.announce(g9, stInfo);
T2.placed(null); assert.strictEqual(T2.endTurn(g9), null, 'pieces before the last chunk do not count');
T2.placed({ word: 'strong', last: true }); assert.strictEqual(T2.endTurn(g9), null);
for (let i = 0; i < 2; i++) { T2.placed(null); assert.strictEqual(T2.endTurn(g9), null); }
assert.strictEqual(T2.endTurn(g9), null, 'a second endTurn in the same turn does not count');
T2.placed(null);
assert.strictEqual(T2.endTurn(g9), 'strong', 'expires after 3 more pieces');
assert.ok(g9[0].every(t => !t || !t.tgt), 'expiry frees the anchor too');

const T3 = new L.TargetTracker();
const g10 = line(tg('ong', 'strong'));
T3.placed({ word: 'strong', last: true });
assert.strictEqual(T3.endTurn(g10), null);
assert.ok(g10[0].every(t => !t || !t.tgt), 'a chunk of a target that already ended lands as plain letters');

// Anchor tiles that fall (a clear beneath them) keep their mark and are still freed on expiry.
const gf = L.emptyGrid(10, 3);
gf[1][0] = { ch: 's' }; gf[1][1] = { ch: 't' }; gf[2][0] = { ch: 'x' };
const T4 = new L.TargetTracker();
T4.announce(gf, { word: 'strong', anchor: [{ x: 0, y: 1 }, { x: 1, y: 1 }] });
gf[2][0] = null;
L.applyGravity(gf);
assert.strictEqual(gf[2][0].tgt, 'strong', 'the red mark falls with its tile');
T4.placed({ word: 'strong', last: true }); T4.endTurn(gf);
for (let i = 0; i < 3; i++) { T4.placed(null); T4.endTurn(gf); }
assert.ok(gf.every(r => r.every(t => !t || !t.tgt)), 'moved anchor tiles are freed too');

```

(c) Replace the last line of the file (the `// adaptive vowel quota` loop that calls `gen.next(r)`) with:

```js
// adaptive vowel quota: a board of 20 tiles with the given share of vowels
for (const r of [0.15, 0.4, 0.65]) {
  const vb = L.emptyGrid();
  for (let i = 0; i < 20; i++) vb[18 + (i >= 10 ? 1 : 0)][i % 10] = { ch: i < Math.round(20 * r) ? 'a' : 't' };
  const vgen = new L.PieceGenerator(dict, { rng: L.makeRng(1), hookRate: 0 });
  let v = 0;
  for (let i = 0; i < 4000; i++) v += vgen.next(vb).letters.filter(L.isVowel).length;
  console.log('board vowel ratio', r, '-> vowels/piece', (v / 4000).toFixed(2));
}
```

- [ ] **Step 2: Run it to confirm it fails.** Run `node tools/check-logic.cjs`. Expected: a failure in the hook-dealer block, for example an `AssertionError` that `peekType` is not a function, or the TypeError `hookGen.peekType is not a function`.

- [ ] **Step 3: Implement in `js/logic.js`.**

(a) Delete the `BOTTOM_ROW` block: the comment `// Indices of each shape's bottom-row cells, left to right…` and the 6 lines that build `BOTTOM_ROW`.

(b) Replace everything from the comment `  // Deals tetrominoes from a 7-bag and letters them so they stay usable:` down to (not including) `    vowelCount(boardVowelRatio) {` with:

```js
  // Deals tetrominoes from a 7-bag and letters them so they stay usable:
  //  - letters are drawn from weighted frequencies, with a vowel quota that leans against the board
  //    (a consonant-heavy stack gets more vowels, a vowel-heavy one fewer)
  //  - at most one rare letter (J K QU V X Z) per piece and no letter three times
  //  - every across/down run inside the piece must occur inside a real word ("TRYX" never appears)
  //  - a piece never arrives already spelling a word (no free clears)
  // Given the board, it also deals hooks (see hookPiece) and, with opts.targets (a word list),
  // target words that grow out of board letters (see planTarget).
  class PieceGenerator {
    constructor(dict, opts = {}) {
      this.dict = dict;
      this.rng = opts.rng || Math.random;
      this.minLen = opts.minLen || 3;
      this.hookRate = opts.hookRate == null ? HOOK_RATE : opts.hookRate;
      this.targets = opts.targets && opts.targets.length ? opts.targets : null;
      this.targetsBy = new Map(); // "p|st" / "s|ing" -> target words starting / ending with those letters
      for (const w of this.targets || []) {
        for (let a = 1; a <= 3; a++) {
          for (const k of ['p|' + w.slice(0, a), 's|' + w.slice(w.length - a)]) {
            if (!this.targetsBy.has(k)) this.targetsBy.set(k, []);
            this.targetsBy.get(k).push(w);
          }
        }
      }
      this.bag = [];
      this.pending = null; // the peeked plain shape, lettered by the next call to next()
      this.plan = []; // a target's second piece, dealt next
      this.untilTarget = FIRST_TARGET;
    }

    nextType() {
      if (!this.bag.length) this.bag = shuffle(TYPES.slice(), this.rng);
      return this.bag.pop();
    }

    // The shape of the piece the next call to next() deals: what the NEXT box shows.
    peekType() {
      if (this.plan.length) return this.plan[0].type;
      if (!this.pending) this.pending = this.nextType();
      return this.pending;
    }

    // Letters the peeked piece for the board as it is now, the moment it spawns. A due target that
    // finds no anchor for this shape is tried again on the following piece.
    next(grid = null) {
      if (this.plan.length) return this.plan.shift();
      const type = this.peekType();
      this.pending = null;
      const ratio = grid ? vowelRatio(grid) : null;
      if (this.targets && grid && this.untilTarget-- <= 0) {
        const plan = this.planTarget(grid, ratio, type);
        if (plan) {
          this.plan = plan.slice(1);
          this.untilTarget = TARGET_WINDOW + TARGET_GAP;
          return plan[0];
        }
      }
      if (grid && this.rng() < this.hookRate) {
        const hooked = this.hookPiece(type, grid, ratio);
        if (hooked) return hooked;
      }
      return { type, letters: this.lettersFor(type, ratio) };
    }

    // Letters this piece so one of its straight segments, dropped at a hook spot, spells a word with
    // the board letters there. 5+ letter hooks win whenever there are any. Returns
    // { type, letters, hook: { word, rot, x, y } }, or null when no hook works.
    hookPiece(type, grid, ratio) {
      let hooks = findHooks(grid, type, this.dict);
      const long = hooks.filter(h => h.len >= 5);
      if (long.length) hooks = long;
      for (let tries = 0; tries < 8 && hooks.length; tries++) {
        const k = pickIndex(hooks.map(hookWeight), this.rng);
        const h = hooks[k];
        const word = h.words[Math.floor(this.rng() * h.words.length)];
        const mid = word.slice(h.pre.length, h.len - h.suf.length);
        const letters = this.fillAround(type, h.seg.map((i, n) => [i, mid[n]]), ratio);
        if (letters) {
          const deal = { type, letters, hook: { word, rot: h.rot, x: h.x, y: h.y } };
          if (this.spells(placeAt(grid, deal, deal.hook), word)) return deal;
        }
        hooks.splice(k, 1);
      }
      return null;
    }

    // Does the board spell word (or a longer word containing it)?
    spells(grid, word) {
      return findWords(grid, this.dict, this.minLen).some(w => w.word.includes(word));
    }

    // Letters for a piece whose cells in fixed ([[index, letter], ...]) are already decided; the rest
    // are drawn as usual and the whole piece must pass the usual checks. Null if no draw passes.
    fillAround(type, fixed, ratio, target) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const letters = this.drawLetters(this.vowelCount(ratio));
        if (!letters) continue;
        for (const [i, ch] of fixed) letters[i] = ch;
        if (this.problems(type, letters, target) === 0) return letters;
      }
      return null;
    }

    // Picks a target word that grows out of 1-3 letters already on the board (the anchor) and deals
    // the rest over one or two pieces, each holding one straight segment of it:
    //  - across, the anchor is the word's start (new letters to its right) or its end (to its left)
    //  - down, new letters can only land on top, so the anchor is the word's end
    // The first piece has the shape NEXT already showed; it touches the anchor. A second piece, when
    // needed, picks its own shape. Every chunk is checked to land where planned and the finished word
    // to fire. Returns the deals, or null when nothing fits yet.
    planTarget(grid, ratio, type) {
      const cands = [];
      for (const land of landings(grid, type)) {
        for (const s of segments(grid, land)) {
          if (s.seg.length < 2) continue;
          for (const start of [true, false]) {
            const run = start ? s.before : s.after;
            if ((start ? s.after : s.before).length) continue; // the far side stays open
            for (let a = 1; a <= Math.min(3, run.length); a++) {
              const anchor = start ? run.slice(run.length - a) : run.slice(0, a);
              const key = (start ? 'p|' : 's|') + anchor.map(t => t.ch).join('');
              for (const word of this.targetsBy.get(key) || []) {
                const rest = word.length - a - s.seg.length;
                if (rest === 0 || (rest >= 2 && rest <= 4)) cands.push({ type, land, s, start, anchor, word });
              }
            }
          }
        }
      }
      // Across first: stacking down onto a column is always possible, so it would crowd across out.
      const across = shuffle(cands.filter(c => c.s.dir === 'h'), this.rng);
      const down = shuffle(cands.filter(c => c.s.dir === 'v'), this.rng);
      for (const c of [...across.slice(0, 20), ...down.slice(0, 20)]) {
        const plan = this.buildTarget(grid, ratio, c);
        if (plan) return plan;
      }
      return null;
    }

    buildTarget(grid, ratio, { type, land, s, start, anchor, word }) {
      const a = anchor.length, m = s.seg.length, rest = word.length - a - m;
      const mid = start ? word.slice(a, a + m) : word.slice(rest, rest + m);
      const far = start ? word.slice(a + m) : word.slice(0, rest);
      const spot = { rot: land.rot, x: land.x, y: land.y };
      const target = { word, idx: s.seg.map(c => c.i), last: rest === 0, spot, anchor: anchor.map(t => ({ x: t.x, y: t.y })) };
      const letters = this.fillAround(type, s.seg.map((c, k) => [c.i, mid[k]]), ratio, target);
      if (!letters) return null;
      const first = { type, letters, target };
      const reserved = grid.map(row => row.slice());
      for (const t of anchor) reserved[t.y][t.x] = { ch: t.ch, tgt: word };
      const board = placeAt(reserved, first, spot);
      if (!rest) return this.spells(board, word) ? [first] : null;
      // The second chunk's segment must start right where the word continues.
      const [dx, dy] = s.dir === 'h' ? [1, 0] : [0, 1];
      const from = start ? s.seg[m - 1] : s.seg[0];
      const want = start ? { x: from.x + dx, y: from.y + dy } : { x: from.x - rest * dx, y: from.y - rest * dy };
      for (const type2 of shuffle(TYPES.slice(), this.rng)) {
        for (const land2 of landings(board, type2)) {
          for (const s2 of segments(board, land2)) {
            if (s2.dir !== s.dir || s2.seg.length !== rest || s2.seg[0].x !== want.x || s2.seg[0].y !== want.y) continue;
            const target2 = { word, idx: s2.seg.map(c => c.i), last: true, spot: { rot: land2.rot, x: land2.x, y: land2.y } };
            const letters2 = this.fillAround(type2, s2.seg.map((c, k) => [c.i, far[k]]), ratio, target2);
            if (!letters2) continue;
            const second = { type: type2, letters: letters2, target: target2 };
            if (this.spells(placeAt(board, second, target2.spot), word)) return [first, second];
          }
        }
      }
      return null;
    }

```

(`vowelCount`, `drawLetters`, `readable`, `problems` and `lettersFor` stay unchanged. The old `planTarget(boardVowelRatio)` and `chunkPiece` are gone, because the block above replaced them.)

(c) Replace the `TargetTracker` comment and its `placed` and `endTurn` methods, and add `announce`. The full class becomes:

```js
  // Follows the live target through a game: announce() when its first piece is dealt, placed() on
  // every lock, hit() on every resolve pass and endTurn() once the board has settled. The target
  // expires TARGET_WINDOW pieces after its last chunk lands; when it ends (hit or expired) its leftover
  // tiles, anchor included, become ordinary letters.
  class TargetTracker {
    constructor(window = TARGET_WINDOW) {
      this.window = window;
      this.word = null;
      this.left = Infinity; // pieces left, counted once the last chunk is down
      this.turn = undefined; // target info of the piece placed this turn (null: a plain piece)
    }

    // The target goes live as soon as its first piece is dealt: its anchor tiles are reserved.
    announce(grid, target) {
      this.word = target.word;
      this.left = Infinity;
      for (const a of target.anchor) grid[a.y][a.x].tgt = target.word;
    }

    placed(info) {
      this.turn = info || null;
    }

    // The found words that spell the live target (they score the bonus). A hit ends the target.
    hit(grid, found) {
      const word = this.word;
      if (!word) return [];
      const hits = found.filter(w => w.word.includes(word) && w.cells.some(c => grid[c.y][c.x].tgt === word));
      if (hits.length) this.end(grid);
      return hits;
    }

    // Returns the target word if it just expired. Only the first call after a placed() counts.
    endTurn(grid) {
      const info = this.turn;
      this.turn = undefined;
      if (info === undefined) return null;
      if (info && info.word === this.word) {
        if (info.last) this.left = this.window;
        return null;
      }
      if (info) { // a chunk of a target that already ended: its letters are free
        this.end(grid);
        return null;
      }
      if (!this.word || --this.left > 0) return null;
      const word = this.word;
      this.end(grid);
      return word;
    }

    end(grid) {
      this.word = null;
      this.left = Infinity;
      for (const row of grid) for (const t of row) if (t && t.tgt) delete t.tgt;
    }
  }
```

- [ ] **Step 4: Run tests, expect PASS.** Run `node tools/check-logic.cjs`. Expected: exit 0, printing `hook deals 120/120 of them 5+ letters 1xx` (at least 72 hooked), `targets started in 120 pieces on a rough board 1x` (at least 12), and vowels/piece of about 2.5 / 1.7 / 1.0.

- [ ] **Step 5: Update the sim (`tools/simulate.cjs`).**

(a) Replace the header comment (first 3 lines) with:

```js
// Greedy-bot simulation: how playable are the dealt letters? Compares uniform random letters
// with PieceGenerator, with and without hooks and target words. Like the game, every piece is
// lettered from the board the moment it spawns; for a two-piece target the bot also sees the
// planned second piece (a player knows the word). Re-run after tuning weights, hook or target rules
// in js/logic.js. Run: node tools/simulate.cjs
```

(b) In the comment above `choose`, replace `second chunk (which the NEXT preview shows) and keeps the pair that scores best.` with `planned second chunk and keeps the pair that scores best.`

(c) Replace the whole `function play(...) {…}` with:

```js
// Letters the next piece from the live board and starts its target, timing the dealer.
function deal(dealer, grid, tracker, stats) {
  const t = process.hrtime.bigint();
  const d = dealer(grid);
  stats.ns += Number(process.hrtime.bigint() - t);
  stats.deals++;
  if (d.target && d.target.anchor) {
    tracker.announce(grid, d.target);
    stats.targets++;
  }
  return d;
}

function play(dealer, minLen, maxPieces, rng, stats) {
  let grid = L.emptyGrid();
  const tracker = new L.TargetTracker();
  for (let pieces = 1; pieces <= maxPieces; pieces++) {
    const current = deal(dealer, grid, tracker, stats);
    const g = choose(grid, current, dealer.planned ? dealer.planned() : null, minLen, tracker.word, rng);
    if (!g) return { pieces, over: true };
    grid = g;
    tracker.placed(current.target);
    let spelled = false;
    for (;;) {
      const found = L.findWords(grid, dict, minLen);
      if (!found.length) {
        if (tracker.endTurn(grid)) continue; // expired: its letters are free now, look again
        break;
      }
      if (tracker.hit(grid, found).length) stats.hits++;
      const cells = new Set();
      for (const w of found) {
        stats.lens[Math.min(6, w.word.length)]++;
        stats.words++;
        if (current.hook && w.word.includes(current.hook.word)) spelled = true;
        for (const c of w.cells) cells.add(c.x + ',' + c.y);
      }
      for (const k of cells) {
        const [x, y] = k.split(',').map(Number);
        grid[y][x] = null;
      }
      L.applyGravity(grid);
    }
    if (current.hook) stats.hooks++;
    if (spelled) stats.hooksSpelled++;
  }
  return { pieces: maxPieces, over: false };
}
```

(d) Replace the `const dealers = {…};` object with:

```js
// A PieceGenerator as a dealer; planned() is a two-piece target's second piece, once it is planned.
function generator(rng, minLen, opts) {
  const gen = new L.PieceGenerator(dict, { rng, minLen, ...opts });
  const dealer = grid => gen.next(grid);
  dealer.planned = () => gen.plan[0] || null;
  return dealer;
}
const dealers = {
  'uniform A-Z    ': rng => () => ({ type: TYPES[Math.floor(rng() * 7)], letters: [0, 1, 2, 3].map(() => AZ[Math.floor(rng() * 26)]) }),
  'generator      ': (rng, minLen) => generator(rng, minLen, { hookRate: 0 }),
  'gen+targets    ': (rng, minLen) => generator(rng, minLen, { hookRate: 0, targets: TARGETS }),
  'gen+hooks      ': (rng, minLen) => generator(rng, minLen, {}),
  'gen+hooks+tgts ': (rng, minLen) => generator(rng, minLen, { targets: TARGETS }),
};
```

(e) Replace the body of the inner `for (const [name, mk] of Object.entries(dealers)) {…}` loop with:

```js
    const stats = { words: 0, lens: [0, 0, 0, 0, 0, 0, 0], targets: 0, hits: 0, hooks: 0, hooksSpelled: 0, deals: 0, ns: 0 };
    let pieces = 0, overs = 0;
    for (let s = 1; s <= GAMES; s++) {
      const rng = L.makeRng(s * 101);
      const r = play(mk(rng, minLen), minLen, 300, rng, stats);
      pieces += r.pieces; overs += r.over;
    }
    const pct = n => (stats.lens[n] / stats.words * 100).toFixed(0).padStart(3) + '%';
    console.log(name, 'words/piece', (stats.words / pieces).toFixed(2), ' survived', (pieces / GAMES).toFixed(0).padStart(3),
      ' lost', overs + '/' + GAMES, ' | len 3', pct(3), ' 4', pct(4), ' 5', pct(5), ' 6+', pct(6),
      ' |', (stats.ns / stats.deals / 1e6).toFixed(2), 'ms/deal',
      stats.hooks ? ` | hooks spelled ${stats.hooksSpelled}/${stats.hooks}` : '',
      stats.targets ? ` | targets hit ${stats.hits}/${stats.targets}` : '');
```

- [ ] **Step 6: Run the sim, the GO/NO-GO checkpoint.** Run `node tools/simulate.cjs` (about 10 s). Expected at min 3 (prototype values):
  - the `gen+hooks` row has len 5 + 6+ ≥ 25% (prototype: 25% + 3%), lost 0/8, and well under 5 ms/deal;
  - `gen+hooks+tgts` has targets hit ≥ 90% (prototype: 340/351).

**If `gen+hooks` 5+ is under 25%, STOP: report the table to the owner before continuing.**

- [ ] **Step 7: Wire the game (`js/game.js`).**

(a) Delete the line `  let queue = [];`.

(b) In `newGame()`, delete the line `    queue = [gen.next(null), gen.next(null)];`.

(c) Replace the start of `spawn()`, from `  function spawn() {` through `    piece = L.createPiece(next.type, next.letters, next.target);`, with:

```js
  // Letters are dealt the moment a piece spawns, from the board as it is now (NEXT only shows the
  // shape), so a hook the dealer aims at is still there. A target goes live with its first piece.
  function spawn() {
    const dealt = gen.next(grid);
    if (dealt.target && dealt.target.anchor) {
      tracker.announce(grid, dealt.target);
      showBanner('TARGET ' + dealt.target.word.toUpperCase());
    }
    piece = L.createPiece(dealt.type, dealt.letters, dealt.target);
```

(d) In `drawHUD`, replace the two `queue` lines after `drawHeader('NEXT', RIGHT_X, 26);` with:

```js
    if (gen) drawMiniPiece(gen.plan[0] || { type: gen.peekType() }, RIGHT_X + PANEL_W / 2, 58, 'active');
```

(e) Replace the first two lines of `drawMiniPiece` with:

```js
  // NEXT shows only the shape (letters come at spawn); a target's second piece shows its red cells.
  function drawMiniPiece(next, cx, cy, style) {
    const cells = L.createPiece(next.type, ['', '', '', ''], next.target).cells;
```

(f) In `drawTargetPanel`, replace the comment and the two lines that compute `upcoming`/`word` with:

```js
  // The live target and how many pieces are left to spell it.
  function drawTargetPanel(y) {
    drawHeader('TARGET', RIGHT_X, y);
    const word = tracker.word;
```

(g) In `window.wordwell`, replace `get queue() { return queue; },` with `get gen() { return gen; },`.

(h) Run `grep -n "queue" js/game.js`. Expected: no output.

- [ ] **Step 8: Smoke-test the game headless.** Run the CDP driver from the session scratchpad: `node <scratchpad>/shot.mjs index.html <scratchpad>/steps-smoke.mjs <scratchpad>/out-task3`. It starts a game, drops 12 pieces, then forces a `STRONG` target on an `ST` board and spells it. Expected:
  - `no page errors`;
  - the target-live eval shows `"word":"strong"`, the piece `r* o* n* g*` and the anchor `["strong","strong"]`;
  - `target-live.png` shows red S T on the board and a red NEXT shape with no letters.

  (The blast isn't in yet. The row keeps its other tiles.)

- [ ] **Step 9: Commit.**

```bash
git add js/logic.js js/game.js tools/check-logic.cjs tools/simulate.cjs
git commit -m "Dealer: hooks from board letters, anchored targets, letters dealt at spawn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A target hit clears its row or column

**Files:**
- Modify: `js/logic.js` (`lineCells` after `placeAt`; `api`)
- Modify: `js/game.js` (`resolve`; title blurb)
- Modify: `tools/simulate.cjs` (blast stat)
- Test: `tools/check-logic.cjs`

**Interfaces:**
- Consumes: `found` entries `{ word, dir, cells }` from `findWords`; `tracker.hit`.
- Produces: `lineCells(grid, found) → [{ x, y }]`, every occupied cell in the found word's row (`dir 'h'`) or column (`'v'`).

- [ ] **Step 1: Write the failing test.** Insert before `// --- generator stats`:

```js
// --- a target hit clears its whole line
const gl = well([19, 0, 'ab.cd'], [18, 1, 'x']);
assert.deepStrictEqual(L.lineCells(gl, { dir: 'h', cells: [{ x: 3, y: 19 }] }), [{ x: 0, y: 19 }, { x: 1, y: 19 }, { x: 3, y: 19 }, { x: 4, y: 19 }]);
assert.deepStrictEqual(L.lineCells(gl, { dir: 'v', cells: [{ x: 1, y: 18 }] }), [{ x: 1, y: 18 }, { x: 1, y: 19 }]);

```

- [ ] **Step 2: Run it to confirm it fails.** Run `node tools/check-logic.cjs`. Expected: `TypeError: L.lineCells is not a function`.

- [ ] **Step 3: Implement.** In `js/logic.js`, after the `placeAt` function, add:

```js

  // Every occupied cell in the row (across) or column (down) of a found word: what a target hit clears.
  function lineCells(grid, found) {
    const { x, y } = found.cells[0];
    const out = [];
    if (found.dir === 'h') {
      for (let i = 0; i < grid[0].length; i++) if (grid[y][i]) out.push({ x: i, y });
    } else {
      for (let i = 0; i < grid.length; i++) if (grid[i][x]) out.push({ x, y: i });
    }
    return out;
  }
```

In `api`, add `lineCells` after `placeAt`.

- [ ] **Step 4: Run tests, expect PASS.** Run `node tools/check-logic.cjs`. Expected: exit 0.

- [ ] **Step 5: Game blast.** In `js/game.js` `resolve()`, right after the `found.forEach((w, i) => {…});` block (it ends with `if (w.word.length > longest.length) longest = w.word;` then `    });`), add:

```js
    // A target hit blasts its whole row (across) or column (down).
    for (const w of hits) for (const p of L.lineCells(grid, w)) cells.add(key(p.x, p.y));
```

In `drawTitlePanels`, replace `['RED LETTERS', RED], ['MAKE THE', WHITE], ['TARGET WORD:', WHITE], ['JOIN THEM', WHITE], ['FOR X3.', WHITE],` with:

```js
      ['RED LETTERS', RED], ['BEGIN A', WHITE], ['TARGET WORD.', WHITE], ['SPELL IT FOR', WHITE], ['X3 + BLAST.', WHITE],
```

- [ ] **Step 6: Sim blast stat.** In `tools/simulate.cjs` `play()`:
  - Replace `      if (tracker.hit(grid, found).length) stats.hits++;` with `      const hits = tracker.hit(grid, found);`.
  - After the `for (const w of found) {…}` loop, add:

```js
      if (hits.length) {
        stats.hits++;
        const before = cells.size;
        for (const w of hits) for (const c of L.lineCells(grid, w)) cells.add(c.x + ',' + c.y);
        stats.blasted += cells.size - before;
      }
```

  - In the stats object literal, add `blasted: 0`.
  - Change the last print argument to:

```js
      stats.targets ? ` | targets hit ${stats.hits}/${stats.targets}, ${(stats.blasted / Math.max(1, stats.hits)).toFixed(1)} tiles blasted/hit` : '');
```

- [ ] **Step 7: Verify.**
  - Run `node tools/check-logic.cjs`: expect exit 0.
  - Run `node tools/simulate.cjs`: expect the `tiles blasted/hit` column (under 1–2 at min 3, several at min 4) and no other change in the rows.
  - Rerun the headless smoke test with output to `out-task4`. Expected: no page errors. `target-blast.png` shows the `STRONG` row flashing, including the unrelated `C`, and the after-blast eval shows the bottom row refilled by gravity from above.

- [ ] **Step 8: Commit.**

```bash
git add js/logic.js js/game.js tools/check-logic.cjs tools/simulate.cjs
git commit -m "Targets blast their row or column when spelled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs, visual check, playtest handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`.**
  - **Sim baseline:** replace the table with the min-3 rows from the Task 4 sim run. Keep the existing column headings, add a "hooks spelled" column, and replace the "Generator + targets" row with the four `generator` / `gen+targets` / `gen+hooks` / `gen+hooks+tgts` rows.
  - **Bot sentence:** change it to say the bot searches every placement, sees a two-piece target's planned second chunk, and finds every hook, so humans hit fewer than it does.
  - **"The letters must be usable" section:** keep the bullets. Add that `next(grid)` letters the piece at spawn from the live board; that `peekType()` is the NEXT shape; and that with probability `HOOK_RATE` a plain piece is a hook (`findHooks`: rotation 0/1 landing spots, a straight segment plus board letters before/after, a 4–7 letter word from the `byPrefix`/`bySuffix` index, 5+ letters preferred, verified to fire at its spot).
  - **"Target words" section:** rewrite the Dealing bullets for anchors:
    - 1–3 unreserved board letters; across with the anchor at either end, or down with the anchor as the column top (the word's end);
    - 1–2 pieces, the first using the peeked shape;
    - across candidates tried first;
    - the target goes live at spawn of its first piece via `tracker.announce` (anchor turns red);
    - a hit also clears the word's whole row or column (`lineCells`).
    - Delete the `BOTTOM_ROW` and "end comes first" text.
  - **Lifecycle bullet:** `placed` no longer sets the word, and a chunk landing after its target ended is freed.
  - **Game loop section:** NEXT shows one piece's shape only. `window.wordwell` exposes `gen` (not `queue`).
  - **"Ideas not yet built":** note that MIN 4 is now survivable for the bot (0/8 lost) and could become the default or hard mode.

- [ ] **Step 2: Full verification.**
  - Run `node tools/check-logic.cjs`: exit 0.
  - Run `node tools/simulate.cjs`: numbers match the new CLAUDE.md table.
  - Run the headless smoke test: no page errors.
  - Read `title.png`, `midgame.png`, `target-live.png` and `target-blast.png`, and confirm: the title blurb fits the panel, NEXT is a blank red shape, the anchor is red, and the blast row flashes.

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md
git commit -m "Docs: hooks, anchored targets, shape-only NEXT, new sim baseline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Request a whole-branch code review** (superpowers:requesting-code-review). Fix the confirmed findings and re-run Step 2.

- [ ] **Step 5: Playtest handoff.** Run `open index.html` and tell the owner what to look for:
  - do hidden long words get spotted with hints on and off;
  - do targets feel tied to the board, with across showing up as often as down;
  - is the row/column blast satisfying or too strong;
  - is shape-only NEXT fine?
