# Gem shop and economy: design

Status: Claude drafted this at the owner's request on 2026-10-16, and the owner approved the
draft ("this looks good"). As with stone rows, they want it specced, planned and built without
further check-ins unless something blocks. Anything marked *Claude's call* was not discussed with
the owner.

## Why

Word Well is a roguelike played in short runs, and dying is part of the loop. Today nothing
carries over from one run to the next except BEST. The red gems flying to the score are
decoration. The owner's parked idea (docs/upgrades-notes.md) was to make gems a currency and spend
them **after the run, in a permanent shop**. The shop gives a reason to dive again, and something
to show for a run that went badly.

## The idea in one line

Every tile you clear is a gem. Gems go into a bank when the run ends. Between runs you spend
them mostly on making runs more varied (new perks and items enter the level-up pool), plus a
short, capped shelf of small head starts. Runs get more varied and only a little easier.

## Goals

- A gem economy players can understand without reading anything: one cleared tile is one gem.
- A shop between runs that sells unlocks (breadth) and a few small, capped head starts (kit).
- The first purchase comes after the first or second run. Buying everything takes about 15 runs.
- Starting another run stays quick: at most two key presses from the game-over screen.

## Non-goals (v1)

- Spending gems during a run. Items stay level-up cards, as now.
- Colour palettes. Downwell unlocks palettes, but they would break the black/white/red rule.
- Anything you can buy again and again. Once the shelves are empty, the bank just grows.
- Losing unspent gems when you die (no Rogue Legacy-style toll).
- New perks or items. The shelf is filled from today's 15 perks and 7 items. The parked ideas
  (TWIRL, HOLD, SECOND SIGHT, SLANT) can join the shelf later.
- Syncing the save between devices. It lives in this browser's `localStorage`.

## Anti-goals

- **The shop gets in the way of diving again.** From the game-over screen, ENTER then ENTER
  starts a new run, and the shop cursor starts on DIVE.
- **Meta power makes runs easy.** Nothing sold weakens stone rows, slows pieces, raises the hook
  rate or adds score. Owning everything should be worth a level or two, not twenty. The hazards
  stay as tuned.
- **Accidental purchases.** Buying is permanent. The cursor never starts on something for sale,
  and the shop ignores input for its first 500 ms, like the level-up screen, so a mashed drop
  key can't buy anything.

## 1. Earning gems

- **One gem per cleared tile.** That is every tile a clear removes: word tiles, a target's row or
  column, bomb blasts, DRILL columns, the SINKHOLE and QUAKE rows, and broken stones. In code
  terms, `finishClear` adds `cells.size`.
- **Gems are separate from score.** Chains, multipliers, target bonuses and SCORE perks raise the
  score, which BEST tracks. They don't change gems.
- **Hard mode pays more.** The run's gems are multiplied when banked: ×1.5 at MIN 4, ×2 at MIN 5,
  rounded down. This uses the title-screen MIN; PURIST doesn't count. The title screen shows
  `GEMS X1.5` (or `X2`) under the MIN setting whenever it is above 3.
- **Banking.** The run's gems go into the bank at game over (`gameOver()`), so closing the tab on
  the game-over screen keeps them. A run abandoned mid-way (closing the tab) banks nothing.
  *Claude's call.*
- **Playtest flags.** `?fast` runs bank as usual, since gems are counted per tile and `?fast` only
  changes how often levels come. `?level=N` runs bank nothing (the game-over row reads
  `NOT BANKED`), so the owner's real progress stays clean. *Claude's call.*
- **Old saves.** There is nothing to migrate. Everyone, the owner included, starts at 0 gems with
  the smaller starting pool.
- **Measured rate** (`tools/simulate.cjs hazards`, greedy bot, MIN 3): about 40 gems per level
  reached. The cumulative totals on reaching levels 2 to 8 are 30, 66, 104, 147, 189, 229 and 273,
  and a whole bot run banks about 390 (it dies around level 10). At MIN 4 the bot clears about 10%
  more tiles per level but dies sooner: about 360 a run before the ×1.5. A person dies sooner than
  the bot. *Claude's estimate:* 60–100 gems for a first run, 150–250 for a decent one.

## 2. The save

- One `localStorage` key, `wordwell.shop`, holding `{ gems, owned }`:
  - `gems` is the bank, a whole number of at least 0;
  - `owned` is an array of shop ids.
  It is read and written through the existing `store` helper, which wraps everything in try/catch.
  Loading cleans up bad data: unknown ids are dropped, and a missing, negative or non-numeric
  `gems` becomes 0. If storage is unavailable, the shop still works for the session, just
  without saving. *Claude's call:* one key, so the bank and the purchases can't drift apart.
- The save is written on every purchase and when a run is banked.
- **Playtest sandbox:** `index.html?gems=N` starts with N gems and nothing owned, and writes
  nothing to the save, so the owner's real progress is safe. A console helper
  `wordwell.resetShop()` wipes the real save. *Claude's call.*

## 3. The shop's stock

Every entry has an id, a shelf, a price, a name and card text. The PERKS and ITEMS shelves reuse
the names, text and 16×16 card icons from `U.PERKS` / `U.ITEMS`. The KIT shelf needs three new
16×16 card icons (pouch, second look, early pick). Their art is the builder's call, in the
existing style.

### UNLOCKS: what level-up cards can offer

**A fresh save starts with 10 perks and 4 items** in the level-up pool, two perks per family:

| Family | Starts in the pool | Sold in the shop |
|---|---|---|
| PACE | FEATHER, STICKY | DAREDEVIL 250 |
| WORDS | SHORT FUSE, PURIST | MIRROR 200 |
| BLAST | CROSSFIRE, SINKHOLE | QUAKE 150 |
| GEAR | PACK RAT, BIG BANG | JOKER 200 |
| SCORE | STRETCH, AFTERSHOCK | SCRABBLER 150 |

Items: BOMB, REROLL, FREEZE and I-BEAM start in the pool. On sale: BEACON 60, WILD 80, DRILL 100.

- Buying an unlock **adds it to what level-up cards can offer**. It doesn't give you the perk or
  item. Card text on the shop says so.
- The perk sold in each family is that family's strangest one, so the starting pool reads simply
  and the shop deepens each build. The owner approved this split.
- Offer rules are unchanged otherwise: family weighting, PURIST and SHORT FUSE excluding each
  other, one item per screen at most, and a dry perk pool filling with items. All of it now runs
  over the unlocked pool only. A dry pool always has at least 4 items to fill 3 cards.

### KIT: small permanent head starts

| Entry | Price | Effect |
|---|---|---|
| POUCH | 200 | Start each run holding 1 random item from your unlocked items. |
| POUCH II | 500 | Start each run holding 2 (two independent draws, so possibly the same item twice; they stack). Only sold once POUCH is owned. |
| SECOND LOOK | 300 | Once per run, press V on a level-up screen to re-deal its three cards. |
| EARLY PICK | 600 | A free pick-one screen before the first piece of every run. |

- POUCH and POUCH II share one shop slot: it sells POUCH first, then POUCH II, then shows as
  owned. *Claude's call.*
- **SECOND LOOK.**
  - The level-up screen's footer adds `V REDEAL` while the re-deal is unused this run.
  - Pressing V replaces the three cards with a fresh `U.offerCards` draw and keeps the selected
    slot. Then the footer drops `V REDEAL`, and V does nothing for the rest of the run.
  - V is ignored once a card is taken. The new draw can repeat a card.
- **EARLY PICK.**
  - `newGame()` opens a level-up screen before the first spawn. It uses the usual offer rules,
    but the header reads `EARLY PICK` instead of `LEVEL UP`.
  - It doesn't change the level or the word count.
  - Taking a card spawns the first piece, through the same `afterLevelUp()` / `nextTurn()` path.
    SINKHOLE on an empty well clears nothing.
  - The 500 ms input guard on the screen keeps the title screen's ENTER from taking a card.
- POUCH items are added when the run starts, before the EARLY PICK screen.
- SECOND LOOK works on the EARLY PICK screen too, because that is a level-up screen. *Claude's call.*

**Total cost:** 950 for perks, 240 for items, 1,600 for kit: 2,790 gems, about 15 decent runs.
The cheapest unlock (BEACON, 60) is within reach after one short run. Tuning these numbers is
the owner's call after playtesting.

## 4. Flow

- **Game over.** The game-over panel gains a `GEMS` row: `+143`, or `+214 X1.5` when MIN is
  above 3. The banked figure comes first. The prompt changes from `ENTER RETRY` to `ENTER SHOP`.
  ENTER or SPACE (after the existing 900 ms) opens the shop.
- **Shop.**
  - The bank counts up from its old value to the new one over about a second, with gem ticks.
  - ENTER always dives (starts a new run), whatever is selected.
  - SPACE buys the selected entry, or dives when the cursor is on DIVE.
  - The cursor starts on DIVE.
- **Title screen.**
  - A new line `↓ SHOP` under `HINTS` opens the shop.
  - The right panel shows the bank (`GEMS 1240`) above `BEST`. The HOW TO list runs down to y 242,
    so the builder makes room by moving lines or dropping a blank spacer.
  - Esc (the pause key) in the shop goes back to the title screen.
  - From the title, ENTER still starts a run directly.
- New state: `shop`. `state` becomes `title | play | clearing | settling | levelup | paused | shop | over`.

## 5. The shop screen

It draws over the frozen well, under the same 1-in-4 dither as the level-up screen. All
coordinates are integers on the 320×272 canvas.

- **HUD strip:** while in `shop`, the in-run score and gem count are hidden, so the bank is the
  only number in the top-right. The LV bar can stay. *Claude's call.*
- **Header:** `SHOP` at scale 2 (white, red drop shadow, black outline, like `LEVEL UP`), with
  the bank in the top-right corner next to the gem sprite.
- **Left column, three shelves:** `PERKS` (5 slots), `ITEMS` (3 slots) and `KIT` (3 slots).
  - Each shelf has a `drawHeader`-style label and a row of slots.
  - Each slot shows a 32×32 card icon drawn at 2× (`iconSprite`) and its price underneath.
- **Slot looks.**
  - Owned: icon lit (white and red), `OWN` underneath in grey.
  - For sale: icon dim (grey and dim red).
  - Price: white if you can afford it, dim red if you can't.
  - Selected: a red frame and the bobbing cursor from the level-up cards.
- **Right column: the selected entry.**
  - Name in white and kind in red (the perk's family, `ITEM`, or `KIT`).
  - A dotted rule, then the card text: up to 4 lines of at most 14 characters, the same text the
    level-up card shows. Text that depends on settings (SHORT FUSE, PURIST, BOMB) is filled
    from the title-screen MIN and an empty run.
  - A status line, with this wording:
    - `NOW IN DECK`: an unlock you own;
    - `OWNED`: a kit entry you own;
    - `60` and the gem sprite: a price you can afford;
    - `NEED 40 MORE`: a price you can't afford.
  - For unlocks the text also says the card joins the deck. It can be its own line above the card
    text, for example `JOINS THE DECK`.
- **Bottom:** a `DIVE` button the cursor can sit on, and a key legend
  (`↑↓←→ MOVE  SPACE BUY  ENTER DIVE`).
- **Navigation:** ←/→ move within a shelf, ↑/↓ move between shelves and DIVE. Moving down onto a
  shorter shelf keeps the cursor at the nearest column.
- **Buying:**
  - Can afford: the gems are taken from the bank, the entry is owned at once, the slot flashes as
    a taken level-up card does, and `sfx.take` plays.
  - Can't afford: `sfx.no` plays and the price flashes.
  - Already owned: nothing happens.
- **When everything is bought,** every slot shows `OWN` and the bank keeps growing. There's no
  extra screen.
- Exact pixel layout is the builder's call, checked with `tools/shot.mjs` screenshots.

## 6. The in-run HUD

- **The gem count joins the top-right strip.** The score keeps its place, white. The run's gem
  count sits in red next to the gem sprite, and the flying gems land there. The exact arrangement
  is the builder's call as long as both numbers stay readable at 6 digits of score.
- **One flying gem per cleared tile** (today there are two). The shown count goes up by one as
  each gem lands, the way `shownScore` catches up. The true count updates when the clear finishes,
  so a game over with gems still in the air loses nothing.
- **Level-up screen footer:** adds `V REDEAL` while SECOND LOOK is available. The black box behind
  the footer widens to fit.

## 7. Code shape

- **Rules stay pure and testable.** All shop data and logic go in `js/upgrades.js`, which is
  DOM-free and exported for Node:
  - `SHOP`: the stock, in shelf order, with prices.
  - `LOCKED` / `isUnlocked`: which perks and items need buying.
  - `loadSave(raw)`: cleans the save (see §2).
  - `buy(save, id)` returns `{ ok, reason }` and changes the save only on success. The reasons are
    `owned`, `poor` and `needs`.
  - `nextEntry(slot, save)`: which tier a slot sells.
  - `gemsBanked(tiles, minLen)`.
  - `startKit(run, save, rng)`: the POUCH items and the SECOND LOOK flag.
- **`U.newRun(owned)`** records the unlocked pool on the run. `perkPool`, `offerCards` and the
  pouch draw use only unlocked ids.
  - With no argument, everything is unlocked. That keeps `tools/simulate.cjs` and the existing
    checks unchanged. The game always passes the save's `owned`.
  - The console helpers `grant` and `give` can still hand out locked perks and items.
- **`game.js`** holds:
  - the `shop` state, its input and drawing;
  - loading and writing the save through `store`;
  - the `?gems=N` sandbox;
  - the HUD gem count, the game-over row and the title-screen lines;
  - SECOND LOOK on the level-up screen and EARLY PICK in `newGame()`.
- **Console helpers:** `wordwell.shop` (the save), `wordwell.gems` (this run's count),
  `wordwell.openShop()`, `wordwell.resetShop()`.
- **Checks:** a new `tools/checks/shop.cjs`, picked up by `check-upgrades.cjs`, covers:
  - the stock refers to real perks and items, prices are positive, and card text fits;
  - locked perks and items are never offered until owned, and are offered once owned;
  - `newRun()` with no argument still offers everything;
  - `buy`: can't afford, already owned, POUCH II before POUCH, the bank going down;
  - `loadSave` cleaning junk;
  - `gemsBanked` at MIN 3, 4 and 5;
  - POUCH drawing only unlocked items.

  `tools/checks/icons.cjs` also checks the three new kit icons.
- **Sim:** the hazards row of `tools/simulate.cjs` also prints gems per game (tiles cleared), so
  prices can be retuned against it. The first five rows and their baseline don't change.
- **Docs:** CLAUDE.md describes the economy, the shop, the save key, `?gems=N` and the new
  helpers, and drops "gem shop not built" from the ideas list. docs/upgrades-notes.md points here.

## Left to the builder

- Pixel layout of the shop, the HUD gem count and the new game-over row.
- The three kit icons.
- The count-up animation and its sound.
- Internal names, as long as the console helpers above exist.
