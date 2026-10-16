# Stone rows and a stingier dealer: design

Status: agreed with the owner on 2026-10-16. They asked for it to be specced, planned and built
without further check-ins unless something blocks.

**Revised 2026-10-16 after the owner's first playtest.** Still too easy. The game is a roguelike
played in short bursts, and dying is part of the loop. The "half full at level 15" goal below
was a misunderstanding: drop it. The new schedule: rows start right after the first level-up
(`RISE_FROM` 2), 6 pieces apart, one piece sooner each level, down to a row after every piece
(`RISE_MIN` 1, from level 7). `HAZARD_MIN_OFFSET` is 1. In the sim the bot now dies around level
10 at MIN 3. CLAUDE.md has the current numbers; where this document disagrees, the revision wins.

## Why

After playtesting the upgrades, the owner reached level 30 with an almost empty well. Nearly every
piece cleared a word the moment it landed, the board never filled up (especially with some perks),
and they never needed an item. A steeper fall-speed ramp was tried and reverted: **the pressure
must come from the well, not from speed.**

## What good looks like

Around level 15 the well is about half full and the player is spending items to dig out. Items
are lifelines, not spares. The game stays endless.

## Anti-goal

**Dying to random junk you couldn't do anything about.** Every hazard is announced before it
arrives, and there is always an answer: a word you can spell, an item you can fire, or a place to
put a piece. Hard is fine, helpless is not.

## Non-goals (v1)

- No change to the fall-speed ramp (`U.gravityMs`).
- No other hazards: no +1 minimum length, no petrifying tiles, no cracked stones with hit points.
  The owner said stone rows plus a stingier dealer are enough for v1.
- No perk nerfs. Perks that make the game easy get answered by the hazards, not weakened.
- No gem shop, no meta-progression.
- No change to how target words are planned or scored.

## The design

Two levers, agreed with the owner:

1. **The well pushes back.** Rows of stone with a few letters mixed in rise from the floor, like
   Tetris garbage rows.
2. **The dealer gets stingier as levels go up.** Fewer pieces arrive pre-built to clear, so words
   take two or three pieces to set up.

Items get more frequent so there is something to dig with.

### 1. Stone tiles

- A stone is a letterless tile: `{ ch: '', stone: true, dy, vy }`. Like bomb tiles, it breaks a
  run in `findWords` (`live()` is already false for `ch: ''` without `wild`). Hooks and target
  anchors already stop at letterless tiles (`boardRun` breaks on `!t.ch`).
- **A stone breaks when** (owner's rule):
  - a word cleared in this resolve pass has a tile directly beside it (up, down, left or right;
    not diagonal). Any cleared word counts: SHORT FUSE words, MIRROR words, wild-tile words and
    target words included; or
  - it is inside the cells of any clear: a bomb blast, a DRILL column, a target's row or column
    blast, CROSSFIRE, or the SINKHOLE or QUAKE bottom row.
- A stone just outside a blast or drill column does **not** break. Breaking a stone sets off
  nothing else. (Claude's call.)
- Stones fall with gravity like every other tile (per-column `applyGravity`, unchanged).
- Broken stones score no points and don't count toward levels. They flash, burst into particles
  and throw gems like any cleared tile. (Claude's call.)
- `vowelRatio` skips letterless tiles (stones and bombs). Today they would count as consonants and
  push the dealer toward vowels. The base game has neither, so the sim baseline is unchanged.
- **Look.** A chunk of the well wall: a white cobblestone mark, clearly not a letter and clearly
  not a bomb. It uses the existing letterless-tile path in `tileSprite` (`tileKey` → `'*stone'`,
  a 7×7 `ICONS.tile.stone` mark using white only), with the usual flash, hint and dead styles.
  Exact pixels are the builder's call.

### 2. Rising rows

- **A rise** moves every tile up one row, and the new row fills row 19 (the bottom). If any tile
  is in row 0 when a rise happens, it would be pushed out of the well and **the game is over**.
- **Row contents.** Ten cells: mostly stone, plus `k` letter tiles (`k` depends on the level, see
  Schedule). No empty cells. (Claude's call.)
  - Letter cells never sit side by side in a row; each has stone on both sides. So a row never
    spells anything across by itself, and junk letters get dug out with **down** words that end
    on them, or by blasts. (Claude's call.)
  - Letters are drawn from a table that favors common word endings (roughly E S T D R N Y L A O,
    plus the usual vowels), never J K QU V X Z. The exact table is the builder's call.
  - Junk letters are normal tiles. The dealer aims hooks and target anchors at them like any other
    board letter, so a generous dealer helps you dig.
- **No free words.** The row's *layout* (which columns hold letters) is fixed when its countdown
  starts, so the warning can show it. Its *letters* are dealt at the moment it rises, from the live
  board, with the same idea as the NEXT box (shape known, letters at spawn). Letters are re-drawn
  until a copy of the risen board fires no word under the current rules (`findWords` with
  `rules`, so MIRROR and SHORT FUSE count). As a last resort a letter cell becomes stone. (Owner
  agreed that a row never arrives spelling a word.)
- **When it happens.** Rises happen between pieces, never under a falling piece. The turn order
  becomes: lock → words resolve and chain → `tracker.endTurn` → level-up screens (and SINKHOLE) →
  **rise, if due** → the board settles → `resolve()` once more (it should find nothing) → spawn.
  In code, today's `spawn()` calls from `resolve()` and `updateLevelUp()` go through a new
  `nextTurn()` that rises first when one is due.
- **Animation and sound.** The whole stack slides up one cell (about 150 ms, using the tiles'
  `dy`), with a small screen shake and a low rumble. Today `updateSettling` only moves tiles with
  `dy < 0`; it has to handle `dy > 0` too, or the rise gets its own short state. Builder's call.
- **Targets.** A live target's tiles carry `tgt` and move up with the stack; `TargetTracker`
  stores no coordinates, so nothing breaks. A planned second chunk's `spot` is only used while
  planning, so it doesn't need adjusting. A rise never clears anything, so it can't break a target.

### 3. Schedule

All numbers are starting values. They live as named constants at the top of `js/logic.js` and get
tuned with the sim (section 7), then by the owner playing.

- Rows are counted in **pieces dealt**, not seconds, so they don't turn into speed pressure and
  FREEZE doesn't affect them. Every spawned piece counts; an item that swaps the falling piece
  (DRILL, I-BEAM) doesn't add one.
- **No rows before level 3** (`RISE_FROM = 3`). The counter starts the first time the level is 3
  or higher. With `?fast` that happens after 6 words.
- **Interval** in pieces: `max(RISE_MIN, RISE_START - floor((level - RISE_FROM) / RISE_STEP))`,
  starting at 8 pieces (`RISE_START`), one shorter every 3 levels (`RISE_STEP`), never under 3
  (`RISE_MIN`). Level 3–5: 8, 6–8: 7, 9–11: 6, 12–14: 5, 15–17: 4, 18+: 3.
  Tuned in the sim: RISE_STEP ended at 2, so the interval drops one piece every 2 levels (see CLAUDE.md).
- **Letters per row:** 4 at levels 3–8, 3 at 9–14, 2 from 15.
- The counter resets to the interval for the current level each time a row rises. Pure helpers in
  `logic.js` (for example `L.riseInterval(level)` and `L.junkLetters(level)`) keep this testable.
- **Which MIN setting (Claude's call).** The numbers above are tuned for **MIN 3**, the default
  and what the owner plays. MIN 4 and 5 are already much harder (the plain dealer loses every
  game at MIN 4), so hazards there run on an effective level that is `HAZARD_MIN_OFFSET` (3)
  levels lower per letter above 3: `L.hazardLevel(level, minLen) = level - 3 * (minLen - 3)`.
  At MIN 4, rows start at level 6; at MIN 5, at level 9. The same effective level drives the rise
  interval, the letters per row and `hookRateFor`. `minLen` here is the title-screen setting;
  PURIST's +1 doesn't count. The sim checks MIN 4 stays survivable (section 7). MIN 5 isn't tuned.

### 4. The warning

- **Countdown (Claude's call on placement).** Once rows are active, the left panel ends in a RISE
  section: a header like the others plus one red pip per piece left before the next row, drawn
  like the TARGET panel's pips (filled for pieces left, hollow for used). The WORDS list loses the
  rows it needs to make room.
- **Last-piece preview.** While the falling piece is the last one before a rise, the well's floor
  strip (the 8 px cobblestone strip under the well) shows the incoming row's layout: a white
  stone block under each stone column and a red mark under each letter column, blinking.
- In the brainstorm the owner was offered "pips on the floor, row drawn under the floor". There
  are no pixels under the floor (the floor ends at the bottom of the 272 px canvas), so the pips
  moved to the left panel and the floor itself becomes the preview.
- The title screen's HOW TO text gets a short stone line, for example `STONE ROWS RISE.` /
  `WORDS BESIDE A` / `STONE BREAK IT.`, if it fits above BEST.

### 5. The stingier dealer

- `L.hookRateFor(level)`: 0.9 at levels 1–2, falling in a straight line to 0.5 at level 15, flat
  after that. `game.js` sets `gen.hookRate` in `newGame()` and whenever the level changes.
- `PieceGenerator` keeps defaulting to `HOOK_RATE` (0.9), so every existing sim row and check is
  unchanged.
- Target scheduling and scoring stay as they are.

### 6. Items and hints

- `ITEM_CHANCE` goes from 1/8 to 1/5 per card slot, so about half the level-up screens offer an
  item. PACK RAT goes from 1/4 to 2/5. The PACK RAT card text ("TWICE AS OFTEN") stays true.
  (Claude's call; the owner agreed that items should come more often.)
- Items need no rule changes to dig: BOMB, DRILL, SINKHOLE and QUAKE already clear cells, and the
  stone rule above covers those cells.
- **Hints.** When the ghost would spell a word, the stones that word would break pulse too, in a
  hint style for stone tiles. (Claude's call: it shows players that words dig.)

### 7. Simulation and tuning

`tools/simulate.cjs` gets a new row for the full game with hazards. It tracks words cleared, then
levels (8 words per level), then `hookRateFor(level)` and the rise schedule. Stones break by the
same rules (beside a cleared word, or inside a target's line blast). The bot keeps its greedy
one-ply search. Its value function may count broken stones so it wants to dig, which is the
builder's call. The game is endless, so the row plays until the bot dies or a high piece cap
(about 1000).

It reports, at min length 3 and 4:
- games lost and the level each bot died at (median),
- how full the well is (tiles out of 200) when the bot reaches levels 10, 15 and 20,
- stones broken per row risen.

**Tuning goal.** The bot is much stronger than a person: it searches every placement and finds
every hook. So at MIN 3 the bot should survive past level 15 in nearly every game, with its well clearly
filling as levels go up (roughly a quarter to a third full around level 15), and it should
eventually lose. A person playing the same schedule will be fuller than the bot, which is the
owner's "half full at level 15". At MIN 4 the bot should reach level 10 in most games;
`HAZARD_MIN_OFFSET` is the knob if it doesn't. Once the constants hit that, the owner's playtest
has the final say.

The existing five sim rows play with hazards off and must match the CLAUDE.md baseline exactly.

### 8. Debug and playtest helpers

- `?level=N` starts a run at level N (no perks), for trying late-game rows quickly. It combines
  with `?fast`.
- `window.wordwell` gains `rise()` (a row rises right after the falling piece locks, since a rise
  never happens under a falling piece), `riseLeft` (pieces until the next row) and
  `stone(x, y)` (put a stone tile on the grid).

### 9. Tests

- `tools/check-logic.cjs` or a new `tools/checks/*.cjs` file covers the pure parts:
  - stone breaking (beside a word, not diagonal, inside a blast, not just outside one);
  - `findWords` treating stone as a run break;
  - the rise (shift, game over when row 0 is occupied, no free word after it, the last-resort
    stone);
  - the schedule helpers, `hookRateFor`, and `vowelRatio` skipping letterless tiles.
- The existing checks keep passing, and the sim's five old rows match the baseline.
- Visual check with `node tools/shot.mjs` (stone tiles, the RISE pips, the floor preview, a rise
  mid-animation).

### 10. Docs

- CLAUDE.md: a Hazards section (stones, rises, schedule, hook rate), the new state and turn order,
  the new sim row with its numbers, the new debug helpers, and an update to the "Ideas not yet
  built" section.
- `docs/upgrades-notes.md`: mark hazards as built (v1: stone rows and a stingier dealer).

## Left to the builder

Pixel art for the stone tile and floor preview, animation timing, the rumble sound, the bot's
value function, the exact junk-letter table, and how to split the work into tasks.
