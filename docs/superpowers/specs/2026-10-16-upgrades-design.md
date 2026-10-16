# Upgrades (perks and items): design

Status: brainstormed with the owner on 2026-10-16. A builder check has been done, and the owner answered its one question (§4, "Clears without a word"). The document is awaiting the owner's final review. Branch: `upgrades` (not created yet). The background and history are in `docs/upgrades-notes.md`. The mockups are in `.superpowers/brainstorm/*/content/`:
- `levelup-perks.html`: option B was chosen.
- `levelup-item-card.html`: option A was chosen.
- `hud-items.html`: option A was chosen.

## Why

Runs feel the same. The only decision in the game is where to put the piece. The owner wants choices that change **how you play**, not only how much you score. Their words about the first draft perks (long words, chains, rare letters) were: "all of those would just improve my score.. we might need a little diversity."

Hazards (the pressure that pushes back) are **deliberately deferred**. The owner wants to feel the upgrades first.

## Goals

- Every level-up offers a real choice between three cards.
- Perks change the pace, what counts as a word, how the board clears, how items behave, or how you score. Different picks should produce noticeably different runs.
- Items are rare tools you hold and fire at the moment you choose.
- A run with no perks and no items plays exactly like the game does today.

## Non-goals (v1)

- Hazards: junk rows, stone tiles, +1 minimum length. A gravity-ramp cap is also out.
- Gems as a currency, and a permanent shop after the run. Both are parked, see the notes. The red gems keep flying to the score as decoration.
- New piece shapes, touch controls and diagonal words.

## Anti-goals

- **Perks that are only multipliers.** Five of the 15 perks touch score, and they must not crowd out the rest.
- **A cluttered HUD.** The right panel gets simpler, not busier.
- Breaking the hard constraints in `CLAUDE.md`:
  - it must run from `file://` with zero dependencies, using plain `<script>` globals;
  - drawing is pixel-perfect at 320×272 with integer coordinates;
  - the palette is black, white and red (plus the existing dim helpers).

## Decisions at a glance

| Topic | Decision |
|---|---|
| When | Every level-up (every 8 words). The game freezes on a level-up screen. |
| Screen | Three cards side by side, shown over the frozen well, which is dithered dark. Use ← → to choose and SPACE to take. There is no skip. |
| Card | A big icon, a name, a red family line, and a short description. An item card has a red ITEM band and the red line reads ONE USE. |
| Perks | 15 perks in 5 families of 3. They are passive and last for the whole run. Each can be taken once, except FEATHER, which stacks up to 3 times. |
| Items | 7 items, which turn up as rare cards. They sit in stacks in the right panel. C fires the selected stack and V moves the selection. |
| Keys | SPACE stays hard drop. ↑, X and W rotate, and Z rotates the other way. C fires an item and V switches item. |
| HUD | The right panel holds NEXT, TARGET and ITEMS. The BEST, HINT list and MIN/MUTE lines are removed from the in-run HUD. |
| Hazards, gems | Deferred or parked. |

## 1. Run flow

### When the level-up screen opens

Today `finishClear()` raises `level` and shows a `LEVEL n` banner. Instead:

- Count the levels gained that are still waiting (`pendingLevelUps`). One clear can cross more than one level.
- The screen opens when the board is completely still. That is the point in `resolve()` where no words are left and `tracker.endTurn()` has run, just before `spawn()`. At that moment there is no falling piece and nothing is moving.
- Taking a card applies it. If more level-ups are waiting, the next offer opens right away. Otherwise play resumes:
  - if SINKHOLE is owned, it runs first (see §3);
  - then the next piece spawns.
- New state: `levelup`. While it's active, gravity, the lock timer, the target window and the FREEZE countdown all stand still.
- **Input guard.** Players often mash SPACE (hard drop) just as the screen appears. Ignore any take for the first ~500 ms after the screen opens, while the cards appear.
- ENTER takes a card as well as SPACE. P, H and M behave as usual, and P does nothing on this screen.
- `sfx.level()` plays when the screen opens. Moving the selection and taking a card each need a small blip in the existing square-wave style.

### The level-up screen (mockup `levelup-perks.html`, option B)

This is drawn on the 320×272 canvas:

- **Backdrop:**
  - The frozen board, panels and walls are drawn as usual, then darkened with a 3-in-4 black dither (keep 1 pixel in every 2×2 block) everywhere below the HUD strip (y ≥ 18).
  - The HUD strip above that stays clear: the level bar, now showing the new level, and the score with its gem.
- **Header:**
  - `LEVEL UP` at scale 2, centred, white with a red drop shadow 2 px below and a black outline (the same treatment as the title screen).
  - Below it, a full-width rule banner reading `PICK ONE`. This is the existing `drawRuleBanner` look, stretched to span x 8–312.
- **Cards:**
  - Three cards, each 96 px wide, at x = 8, 112 and 216, from about y 68 to 218. Each card has a solid black background.
  - **Selected card:** a 2 px red frame with notched corners, a 7-px red triangle cursor bobbing above it, and the icon bobbing 1 px every 300 ms. Its text is bright: name white, family red, description white.
  - **Unselected card:** a dotted dim frame, with the icon and text in the dim colours (white becomes GREY, red becomes DIMRED).
  - **Card contents, top to bottom:**
    - the 16×16 icon drawn at 2×;
    - the name, centred;
    - the family name in red, or `ONE USE` for an item;
    - a dotted divider;
    - 3–4 centred description lines of at most 14 characters each.
  - **Item card** (mockup `levelup-item-card.html`, option A): a red band 11 px tall across the top inside the card, with `ITEM` in black. The icon sits just below it.
- **Footer:**
  - `← → CHOOSE   SPACE TAKE`, with the keys in red and the words in white.
  - After a take, the chosen card flashes white and red for about 480 ms, the text `<NAME> TAKEN` appears in red, and then play resumes. This is shorter than the 2 s in the mockup; the builder may tune it.

The font has no `%` and no `×`. Write `X2`, or add a glyph to `font.js` if one is really needed.

### Offer rules: a pure function in the new upgrades module

1. The perk pool is every perk not yet owned. FEATHER stays in the pool until it has been taken 3 times. SHORT FUSE and PURIST exclude each other: owning one removes the other.
2. A family you already own at least one perk from gets weight 2. The others get weight 1.
3. Each of the three slots has a chance of holding an item: 1 in 8, or 1 in 4 with PACK RAT. There is **at most one item per screen**, and its type is picked uniformly from the 7. The item can land in any slot.
4. The remaining slots draw **distinct** perks from the pool, by weight, without replacement.
5. If the pool runs short, fill the remaining slots with items of distinct types. Once every perk is owned, all three cards are items.

### Run state

- `run.perks`: perk id → count.
- `run.items`: an ordered list of stacks `{ id, n }`, kept in the order each type was first acquired.
- `run.sel`: the index of the selected stack.

Taking an item card either adds to the existing stack of that type or appends a new stack. The selection doesn't move when a stack is added, except that the very first stack is selected.

When a stack empties, it is removed, and the selection stays at the same index. If that index now points past the end of the list, it wraps to 0.

Nothing persists between runs.

## 2. HUD changes (mockup `hud-items.html`, option A)

- **Right panel,** top to bottom:
  - NEXT, unchanged.
  - **TARGET**, moved up to about y 92 into the space BEST used to take.
  - **ITEMS**, a header at about y 146 followed by one row per stack. Each row has a 9×9 icon, the item name, and a right-aligned count such as `X3`.
    - The selected row has a 1 px red frame around it, with the name in white and the count in red.
    - The other rows show the icon dimmed, the name in GREY and the count in DIMRED.
    - With no items held, the panel shows `-`.
    - All 7 types fit with 13 px rows.
  - `C USE  V SWAP` at the bottom of the panel, with the keys in red and the words in GREY.
- **Removed from the in-run HUD:**
  - BEST: it moves to the game-over screen as a row, and stays on the title screen.
  - The HINT header and word list: the in-well hint pulse and the H toggle stay.
  - The `MIN n  MUTE` line: M still toggles sound.
- **Title screen:** add `C ITEM` and `V SWAP` to the CONTROLS list. The builder may also add a line about level-up cards to HOW TO if it fits.
- **FREEZE needs a visible countdown** while it runs, for example a shrinking bar or 5 pips near the ITEMS header. Placement is the builder's call.

## 3. Perks

There are 15 perks, each taken once unless noted. The card text below fits 14 characters per line; the builder may polish the wording. **MIN** means the minimum word length chosen on the title screen.

### PACE

| Perk | Rule | Card text |
|---|---|---|
| FEATHER | Gravity interval × 4/3, so pieces fall 25% slower. Stacks up to 3 times, multiplying each time. | PIECES FALL / A QUARTER / SLOWER. / STACKS UP TO 3 |
| STICKY | Lock delay 500 → 1000 ms. The lock-reset limit is unchanged. | PIECES WAIT / TWICE AS LONG / BEFORE THEY / LOCK. |
| DAREDEVIL | Gravity uses `gravityInterval(level + 2)`, with any FEATHER factor applied on top. Every word's points × 1.5. | FALL AS IF 2 / LEVELS UP. / ALL SCORES / X1.5 |

### WORDS

These change what `findWords` accepts. The hint system calls `findWords` too, so it picks them up automatically. `findWords` needs an options argument, for example `{ mirror, shortWords, minLen }`, built from the run.

| Perk | Rule | Card text |
|---|---|---|
| MIRROR | A run read backwards also counts: right to left across, bottom to top down. Forward and backward candidates compete in the same longest-first, no-overlap pick. The reported word is the dictionary word, and a palindrome counts once. Target reservation checks the dictionary word. | WORDS ALSO / COUNT / BACKWARDS: / ← AND ↑ |
| SHORT FUSE | Words of exactly MIN − 1 letters also clear, for **0 points**. They **don't count** toward the 8 words per level (otherwise they'd hand out level-ups). They still show in the WORDS list, with 0. They do add to the chain like any other clear. | (MIN−1)-LETTER / WORDS CLEAR / TOO, FOR / 0 POINTS. |
| PURIST | Words of exactly MIN letters no longer clear. Words of MIN + 1 or more letters score × 2. | (MIN)-LETTER / WORDS NO / LONGER CLEAR. / LONGER ONES X2 |

Both SHORT FUSE and PURIST follow MIN, and their card text shows the real numbers. **At MIN 3, SHORT FUSE needs 2-letter words, and the dictionary today is 3+ letters only.** Add a curated list of common 2-letter words to `tools/build-words.mjs` (am, an, as, at, be, by, do, go, he, hi, if, in, is, it, me, my, no, of, oh, ok, on, or, ox, so, to, up, us, we, and similar), checked against the source list and the blocklist. It is written out as `window.SHORTWORDS`. `js/words.js` stays generated, never edited by hand.

**The dealer has to follow the same word rules:**
- Its "a piece never spells a word on its own" check uses the effective rules, so no piece clears itself through MIRROR or SHORT FUSE.
- Hook and target words must be at least the effective minimum length. With PURIST at MIN 5, for example, only 6+ letter targets and hooks are dealt.
- How to thread the rules into `PieceGenerator` is the builder's call.

### BLAST

| Perk | Rule | Card text |
|---|---|---|
| CROSSFIRE | A target blast also clears the line crossing the target through its middle tile (the left or upper of the two middle tiles for even lengths). An across target clears its row plus that column; a down target clears its column plus that row. | TARGETS BLAST / THEIR ROW AND / THEIR COLUMN. |
| SINKHOLE | After every level-up screen (including the one where it's taken), the bottom row is cleared. It uses the normal clear flash with no points, then gravity, then chains through `resolve()`. Only after that does the next piece spawn. | EVERY LEVEL-UP / CLEARS THE / BOTTOM ROW. |
| QUAKE | When a turn's resolve pass reaches chain 3, that pass also clears the bottom row. This happens at most once per turn. | A CHAIN OF 3+ / ALSO CLEARS / THE BOTTOM ROW |

### GEAR

| Perk | Rule | Card text |
|---|---|---|
| PACK RAT | The item chance per card goes from 1 in 8 to 1 in 4. | ITEM CARDS / SHOW UP TWICE / AS OFTEN. |
| BIG BANG | Bombs blast 5×5 instead of 3×3. The BOMB card text changes to match. | BOMBS BLAST / 5X5 INSTEAD / OF 3X3. |
| JOKER | Every 10th piece dealt carries one wild `?` tile in place of a filler letter, never a hook or target letter. It uses the WILD rules in §4. | EVERY 10TH / PIECE HAS A / WILD ? TILE. |

### SCORE (the original three)

| Perk | Rule | Card text |
|---|---|---|
| STRETCH | Words of 6+ letters score × 2. | 6+ LETTER / WORDS SCORE / X2 |
| AFTERSHOCK | The chain multiplier grows twice as fast: `1 + 2 × (chain − 1)`, so ×1, ×3, ×5 and so on. | CHAIN BONUS / GROWS TWICE / AS FAST |
| SCRABBLER | J, K, QU, X and Z have their draw weights doubled; the "at most one rare letter per piece" rule stays. Those letters score × 3 of their letter points. | MORE J K X Z / AND QU. / THEY SCORE X3 |

**Stacking:** every multiplier multiplies together per word: target × 3, DAREDEVIL × 1.5, PURIST × 2, STRETCH × 2, and the chain. Round each word's final points to an integer.

## 4. Items

Each item fires with **C**, consumes one from the selected stack, and turns up only as a level-up card. Item card text starts with `C:`.

### General firing rules

- Items fire only in the `play` state while a piece is falling. They never fire mid-clear, while settling, while paused or on the level-up screen.
- **Swap items** (BOMB, WILD, DRILL, I-BEAM) replace the falling piece in place.
  - If the new piece collides there, it moves to the spawn position.
  - If it collides there too, the item doesn't fire.
- **The falling piece carries target letters** (it's a target chunk):
  - swap items don't fire;
  - REROLL keeps the red letters and only re-deals the others;
  - FREEZE works normally.
- **When an item can't fire,** it isn't used up. Play a short "no" blip and flash the selected row.
- **Tiles without a letter** (the bomb tile, and the drill while falling) **break a run**, the same way an empty cell does.
- **The dealer's hook and target search** treats bomb and wild tiles on the board like reserved tiles: it never builds a word through them.

| Item | Rule | Card text |
|---|---|---|
| BOMB | One filler cell of the falling piece becomes a **bomb tile**: letterless, drawn as a white tile with a small red bomb inside. The builder picks which cell, preferring one that isn't a hook letter. The bomb locks and falls with gravity like any tile. It sits there until a word clears with a tile directly beside it (up, down, left or right). Then it detonates: everything in its 3×3 (5×5 with BIG BANG) clears in the same pass. A bomb removed by **any** clear also goes off (Claude's call, so GEAR and BLAST perks combine). That includes another bomb's blast, a target line, CROSSFIRE, DRILL, SINKHOLE and QUAKE. Blasted tiles score nothing. | C: A BOMB TILE / LANDS. A WORD / BY IT BLASTS / 3X3. |
| WILD | One filler cell becomes a **wild tile** `?`, which matches any single letter (QU counts as one letter) in every word through it. It is worth 0 letter points. The word shown and logged is the dictionary word it completed; if several fit, take the highest-scoring. JOKER uses the same tile. | C: A ? TILE / THAT FITS ANY / LETTER. |
| REROLL | Re-deal the falling piece's letters from the live board, keeping its shape, position and rotation. Hooks are tried as at spawn, and red target letters stay. | C: NEW LETTERS / FOR THE / FALLING PIECE. |
| DRILL | The falling piece becomes a 1×1 **drill**, which moves like a normal piece and doesn't rotate. When it locks, it clears every tile in its column, and itself, with no points. Then gravity and chains run as usual. The ghost should make the column it will clear obvious. | C: A DRILL. / IT CLEARS THE / COLUMN IT / LANDS IN. |
| FREEZE | Gravity and the lock timer stop for **5 seconds** of `play` time (the owner chose 5, not 10). Moving, rotating, soft drop and hard drop all still work. Firing again adds another 5 seconds. Show a countdown. | C: PIECES STOP / FALLING FOR / 5 SECONDS. |
| I-BEAM | The falling piece becomes the I piece, lettered by the dealer for the live board (hook-aware). It doesn't consume the bag or change what NEXT shows. | C: THE PIECE / BECOMES A / STRAIGHT 4. |
| BEACON | Makes the next spawn attempt a target, by setting the dealer's countdown to 0. If no anchor fits, it retries each piece as it does today. It doesn't fire while a target is live, while a target's second chunk is planned, or while a target is already due. | C: CALL A / TARGET WORD / NOW. |

### Clears without a word (decided by the owner)

The following all remove tiles without spelling a word:
- bomb blasts;
- DRILL;
- SINKHOLE;
- QUAKE;
- target lines, including CROSSFIRE.

These clears **remove everything in their cells, red target tiles included.** This is a deliberate exception to the rule that red tiles only clear inside their target word. A blast clears everything, so no red islands are left standing in the rubble.

**A target that loses a red tile this way ends at once:**
- the MISSED banner and sound play, and it counts as seen but not hit;
- `tgt` is stripped from its remaining red tiles, which become normal letters;
- `gen.targetEnded()` is called, so a planned second chunk arrives as plain letters;
- after the clear settles, `resolve()` takes its usual further look, so the freed letters can clear.

This needs new behaviour in `TargetTracker`, for example `broken(grid)` or a check inside `endTurn`.

**All of these clears go through one shared helper.** Given the found words, the run and the board, it returns:
- the cells to remove: target lines, CROSSFIRE, QUAKE's row, and bombs next to words;
- every bomb in those cells set off in turn, as a chain reaction;
- whether the live target was broken.

DRILL and SINKHOLE feed their cells into the same helper, so bombs they hit go off too. **The helper and the tracker change belong in the foundation step,** because every track depends on them.

### Wild matching performance

`findWords` runs on every move for hints. With wild tiles on the board, it must stay **under about 2 ms** on a full board in Node. Trying all 26 letters at each wild cell in a candidate is fine for one or two wilds per candidate. Anything smarter is the builder's call.

## 5. Where the code goes

- **`js/logic.js`** gets the word and board rule changes:
  - `findWords` options: mirror, short words, wild tiles, and letterless tiles breaking runs;
  - generator hooks for the effective rules, the JOKER wild cell, SCRABBLER weights, re-dealing a piece, lettering an I piece, and BEACON;
  - helpers for blast cells (bomb, drill, bottom row, crossfire).
- **A new pure module, `js/upgrades.js`,** exposes `window.WordWellUpgrades` and `module.exports`. It holds:
  - the PERKS and ITEMS data: id, family, card text, stack limit, exclusions;
  - the offer function;
  - inventory operations;
  - turning `run.perks` into rule and scoring options.
  - It loads after `logic.js` and before `game.js`.
- **Icon bitmaps** cover 22 card icons (16×16), 7 HUD icons (9×9), and the bomb, wild and drill tile looks. They can go in `font.js` or in a new `js/icons.js` loaded after it; the builder chooses. The pixel art is the builder's call within the palette. The mockups' stretch, aftershock, scrabbler and bomb icons are a fair starting point.
- **`js/game.js`** gets:
  - the `levelup` state and its rendering;
  - the HUD changes;
  - the C and V bindings;
  - item firing;
  - the hooks where perks apply: gravity, lock delay, scoring, blasts, Sinkhole and Quake;
  - the new sfx;
  - BEST on the game-over screen.
- **Playtest shortcuts.** The owner judges by playing, and reaching level 6 takes a while.
  - A `?fast` URL parameter that makes a level every 3 words. `location.search` works on `file://`.
  - Console helpers on `window.wordwell`: `grant(perkId)`, `give(itemId, n)` and `levelUp()`.

## 6. Verification

- **`tools/check-logic.cjs`** gets assertions for:
  - **Offers:** cards are distinct; SHORT FUSE and PURIST exclude each other; FEATHER caps at 3; at most one item per screen; a short pool fills with items; with every perk owned, all cards are items.
  - **Word rules:** `findWords` with MIRROR (including a palindrome and a target-reserved run), SHORT FUSE, PURIST and wild tiles; letterless tiles breaking runs.
  - **Blasts:** bomb triggering by adjacency, 3×3 and 5×5 cells, a bomb chain; a bomb set off by a target line, DRILL or SINKHOLE; CROSSFIRE cells; QUAKE firing at chain 3 only once per turn.
  - **Broken targets:** a blast that removes a red tile ends the target. The remaining red tiles are freed, the planned second chunk becomes plain letters, and it counts as missed.
  - **Scoring:** the multipliers stacking.
  - **Inventory:** add, use, selection after a stack empties.
  - **The dealer:** never deals a piece that clears itself under MIRROR or SHORT FUSE.
- **`tools/simulate.cjs`, with no perks:** the numbers must match the baseline table in `CLAUDE.md`. That's the regression check that a perk-free run is unchanged. A perk-aware bot is **not** in scope; tuning happens by playtest.
- **Headless Chrome screenshots** of the level-up screen (perk cards, an item card), the HUD with items, a bomb on the board, FREEZE's countdown and the game-over screen with BEST. Compare them with the mockups.
- **The owner's playtest is the real test.** Do different picks make runs feel different?

## 7. Build order

1. **Foundation, in order:**
   - run state;
   - the offer function;
   - the `levelup` state and screen;
   - the HUD changes;
   - C and V with the inventory;
   - the playtest shortcuts;
   - the `findWords` options plumbing;
   - letterless and wild tiles in `findWords`;
   - the shared helper for clears without a word, including the bomb chain reaction and broken-target handling in `TargetTracker` (§4).
2. **Parallel tracks.** Each is one agent in its own worktree, split by the part of the code it touches:
   - **Word rules:** MIRROR, SHORT FUSE (with `build-words.mjs`), PURIST, WILD, JOKER.
   - **Board:** BOMB, BIG BANG, DRILL, CROSSFIRE, SINKHOLE, QUAKE.
   - **Pace and score:** FEATHER, STICKY, DAREDEVIL, STRETCH, AFTERSHOCK, SCRABBLER, FREEZE.
   - **Dealer items:** REROLL, I-BEAM, BEACON.
3. **Integration, in order:** merge, run the logic checks and the no-perk sim, take screenshots, then the owner's playtest.

## Left to the builder

- Icon and tile pixel art, sfx, and small layout nudges, all within the mockups and the palette.
- Card wording polish, keeping to 14 characters per line.
- Which filler cell gets the bomb or wild tile.
- How the effective word rules reach `PieceGenerator`.
- The FREEZE countdown's look and placement.
- The take-animation timing.
- How the wild matching is implemented.
