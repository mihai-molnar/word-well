# Board hooks and anchored targets: design

Status: approved in brainstorming on 2026-10-16. Branch: `board-hooks`.

## Problem

Today's loop is mostly 3-letter words with a target word now and then. It isn't fun.

- In the bot sim, 67% of words are 3 letters and 5% are 5 letters. Almost every 6+ letter word is a target.
- The dealer letters pieces without looking at the board (apart from the vowel ratio), so long regular words almost never line up.
- Targets feel like a **scripted chore**. Each one is closed off inside its own two pieces. Across needs two flat landing spots at the same height, so in practice the move is always "rotate once, drop the second piece on top".
- Targets **don't help the board** either. The two pieces bring 8 tiles and the target clears 5–7 of them, all from those same pieces.

## Goal and success criteria

- Regular words of 4–6 letters become a normal part of a run. They form by connecting a new piece to letters already on the board.
- Targets depend on the board and pay off by clearing the board, not only with points.
- Bot sim with hooks and no targets, at min length 3: **5+ letter words are at least 25% of words** (2% today), **0/8 games lost**, and **under 5 ms per deal** in Node.
- The real test is the owner's playtest. The bot finds every hidden word, while a human has to spot them.

## Decisions

| Topic | Decision |
|---|---|
| 3-letter words | Unchanged: they still clear and score as today. The fix is entirely on the dealer side. |
| Regular long words | Dealt silently, and nothing marks them. The H hint shows them when the ghost sits in the right spot. |
| Targets | Built on letters already on the board, dealt over 1–2 pieces, ×3 score, and they clear their whole row or column. |
| Old free-floating targets | Removed, with no fallback. |
| Preview | One NEXT slot instead of two. A piece gets its letters when it enters NEXT. |
| Shapes | Classic tetrominoes and the 7-bag stay as they are. |
| Out of scope | The upgrades system, new shapes, rule changes for short words. |

## 1. Hook dealer (regular long words)

A **hook** is a spot where a piece can land so that a straight line of its cells, together with board letters in the same row or column, spells a word of 4–7 letters.

### Finding hooks: `findHooks(grid, type, dict)` in `logic.js`

1. Try the shape in **rotation 0 (spawn) and rotation 1 (one clockwise turn) only**. These two keep reading order: a row read left to right becomes a column read top to bottom. So the player's rule is "read the piece left to right; the dealer's word works across as it is, or down after one turn". The player can still rotate freely.
2. For each rotation and each `x` where the piece fits, hard-drop it to its landing row. Skip spots where any cell would land above row 0.
3. For each row and each column that contains piece cells, the piece cells in that line form one contiguous **segment** (every tetromino is convex along rows and columns). Read the board letters directly before the segment (`L`, left or above) and directly after it (`R`, right or below). Both runs stop at an empty cell, the wall, or a reserved (`tgt`) tile. Skip the line if both are empty.
4. The candidate patterns are `L[-i:] + '?'×m + R[:j]` for `i ∈ 0..|L|`, `j ∈ 0..|R|`, with `i + j ≥ 1` and total length 4–7.
5. Look up matching words in the dictionary's pattern index (see below).
6. Each candidate records: rotation, x, landing y, direction, the word, the piece cells (by cell index) and the letter each one needs, the number of board letters used, and the number of empty cells left directly beneath piece cells (new holes).

### Pattern index (`buildDictionary`)

For words of 4–7 letters (the hook and target range), build `byPrefix: Map<"len|prefix", word[]>` and `bySuffix: Map<"len|suffix", word[]>`. When a pattern has a fixed prefix, look it up in `byPrefix` and filter by suffix. Otherwise look up the suffix in `bySuffix`. Build time counts toward page load and must stay small (target: under 150 ms in Node).

### Choosing a hook

Score each candidate by weight: longer words weigh more, more board letters used weigh more, and new holes cut the weight sharply. Sample by weight and don't always take the best, so the dealer doesn't feel deterministic. The exact formula is tuned in the sim.

### Lettering the hook piece

- The hook's letters go into their cells, which are identified by cell index, so it doesn't matter which rotation the hook used.
- The other cells get the usual filler: vowel quota against the board, at most one rare letter, no letter three times, every run inside the piece readable, and the piece spelling no word on its own. Use the same retry loop as `chunkPiece`.
- **Fire check:** place the piece at the hook's spot on a copy of the board and run `findWords`. It must find the planned word, or a longer word that contains the planned cells in that line. Otherwise try the next candidate.
- If no candidate passes, the piece gets plain letters as it does today.

### Rate

For each plain (non-target) piece, the dealer tries a hook with probability `HOOK_RATE`, starting at 0.65 and tuned in the sim.

## 2. Dealing timing (one NEXT slot)

- The queue holds a single piece. In `spawn()`, the current piece comes from the queue, and the new NEXT piece is dealt right away from the **live board**.
- So the board a deal is planned against is out of date by exactly one piece: the one currently falling, which the player sees together with NEXT and can keep off the spot.
- The right panel drops the second preview. The space it frees stays empty for now.
- `PieceGenerator.next(grid)` takes the grid, where it used to take the vowel ratio, and works the ratio out itself.

## 3. Anchored targets

### Cadence

`FIRST_TARGET` and the 7-piece spacing stay as they are. When a target is due, the dealer looks for an anchor while lettering the NEXT piece. If none fits, it tries again on the following piece, and keeps trying until one fits.

### Picking the word and the anchor

- An **anchor** is a run of 1–3 unreserved board letters with an open side where a piece can land. It is found with the same landing-spot search as the hooks (rotation 0 or 1).
- The **word** comes from `TARGETS` (5–7 letters, existing rules). It is the anchor plus 2–6 new letters.
  - **Across:** the anchor is the start of the word and the new letters go to its right, or the anchor is the end and they go to its left.
  - **Down:** new letters can only land on top of a column, so the anchor is the end of the word (the top of the column, read downward).
- The new letters come in **1 or 2 pieces**, each holding a straight segment of 2–4 letters. One piece is used when that's enough.
  - The dealer picks each chunk piece's shape (target pieces don't use the 7-bag, as today).
  - The chunk that touches the anchor comes first. The far chunk is the next piece after that.
- **Reachability check, before announcing:**
  - Chunk 1 must have a landing spot (rotation 0 or 1) where its segment lines up next to the anchor.
  - With chunk 1 placed there on a copy of the board, chunk 2 must have a landing spot next to chunk 1.
  - The fire check must find the target word.
- Chunk filler cells get the usual checks. `runsOf` still skips runs that touch reserved cells.

### Announcing and reservation

- The target goes live **when chunk 1 is dealt into NEXT**. At that point the banner shows `TARGET <WORD>` and `TargetTracker.announce(grid, target)`:
  - sets `tgt = word` on the anchor tiles, which then render red through the existing `target` style;
  - makes the word live, so reserved tiles can't be taken by other words while the current piece falls.
- Chunk cells carry `tgt` as they do today.
- `placed(info)` keeps counting chunks. The 3-piece window (`TARGET_WINDOW`) starts once the last chunk lands, as today.

### Payoff

- A hit scores `TARGET_BONUS` (×3) as today.
- A hit also **clears the target's whole line**. `lineCells(grid, found)` returns every occupied cell in that row (across) or column (down). Those cells join the clear set for that resolve pass.
- Then gravity runs, and the next resolve pass is a chain as usual.
- Blasted tiles score no extra points: the ×3 is the points payoff, and the clear is the survival payoff.
- **Balance check:** the sim reports tiles cleared by blasts. If clearing the column turns out too strong, the fallback rule is to clear the word's tiles plus everything above them in that column.

### Missing a target

- Expiry works as today: when the window runs out, `MISSED` shows, `tgt` is stripped from every tile (anchor included), and `resolve()` looks at the board again.
- Clears beneath the anchor can make it fall and break the plan. The target just expires if it isn't spelled. Any word that contains the target and uses a reserved tile still counts as a hit, as today.
- If the player covers the anchor's open side, the target is effectively lost. The anchor is red, so the player can see that coming.

## 4. Code changes

**`js/logic.js`:**
- `buildDictionary`: add `byPrefix` and `bySuffix`.
- New: `findHooks`, `lineCells`, `HOOK_RATE`.
- `PieceGenerator`: `next(grid)`, hook dealing, anchored-target planning (this replaces `planTarget`).
- `TargetTracker`: add `announce`; `end` also clears the anchor tiles (it already strips every `tgt`).
- Export the new pieces through `api`.

**`js/game.js`:**
- The queue becomes one piece. `spawn()` calls `gen.next(grid)` and, when a target starts, `tracker.announce`.
- `resolve()` adds `lineCells` for every hit to the cells being cleared.
- The panel drops the second NEXT slot. The TARGET panel reads the live word from the tracker as soon as it's announced.

**`tools/simulate.cjs`:**
- The dealer gets the grid, and the bot plays with one preview, matching the game.
- Rows: generator; generator + hooks; generator + hooks + anchored targets.
- Columns: words/piece, games lost, word length mix, targets hit/seen, and tiles cleared by blasts.

**`tools/check-logic.cjs`:**
- `findHooks` on hand-built boards: across to the right, across to the left, bridging a gap, down on top of a column, ignoring reserved tiles, and never planning rotation 2 or 3.
- The pattern index returns the right words for prefix, suffix and mixed patterns.
- A hook piece placed at its planned spot fires its word.
- Anchored targets: the chunks are reachable, announce reserves the anchor, expiry strips the anchor, and `lineCells` returns the right row or column.
- The existing assertions keep passing, or are updated where the target rules changed.

**`CLAUDE.md`:** update the target and generator sections, the queue description and the sim baseline table.

## 5. Verification and rollout

1. Run `node tools/check-logic.cjs`: everything passes.
2. Run `node tools/simulate.cjs` against the go/no-go bar above. **If hooks miss the bar, stop and report the numbers to the owner before building the target or game parts.**
3. Take a headless Chrome screenshot of a board with a red anchor, plus a blast.
4. Open `index.html` so the owner can playtest. Things to look for: do hidden long words get spotted, do targets feel tied to the board, and is the blast fun or too strong?
