# Upgrades system: notes for the next session

Status: brainstormed on 2026-10-15 and 2026-10-16, **not built**. Target words were built first, because they were a prerequisite for this. **The design is now `docs/superpowers/specs/2026-10-16-upgrades-design.md`.** That spec replaces the 'Decisions already made' and 'Open questions' sections below wherever they disagree. Gems and hazards are parked or deferred.

## Goal

Make runs feel different from each other through choices the player makes. Today the only decision is where to put the piece.

## Decisions already made

- **Two kinds of upgrade:**
  - **Perks** are passive rule changes that last for the rest of the run and stack.
  - **Items** are one-shot tools you keep and fire with a key.
- **Economy: a level-up shop.** Every level-up pauses on one screen where you pick 1 of 3 perks for free, then spend **gems** on items.
  - Gems become a currency separate from score. You earn them per cleared tile; the red gems already fly to the HUD.
- **Pressure: rising hazards.** Perks make you stronger, so the well pushes back with hazards as levels go up. The game stays endless (no "bottom of the well" ending).
- **Perks come in build families.** There are 3 families of 3 perks that strengthen each other, so a run becomes a "long-word run" or a "chain run", as in Downwell or Balatro. One or two rule-bending perks can sit in the pool as rare big picks.

## Session 2026-10-16: changes and parked ideas

- **Level-up screen layout (decided).** The game freezes and the well stays visible behind the screen, dithered dark (mockup "B"). The HUD strip stays at the top, with "LEVEL UP" and a "PICK A PERK" rule banner below it. Three cards sit side by side across the full width. Each card has a big 16×16 pixel icon drawn at 2×, the perk name, its family in red, and a short description underneath. ← → selects a card (red frame plus a bobbing cursor) and SPACE takes it and returns to the game. The mockup is in `.superpowers/brainstorm/` (`levelup-perks.html`).
- **Gems: parked, discuss later.** The user's idea is to spend gems **after the run, in a permanent upgrades shop** (meta-progression), not at level-ups. That would replace "spend gems on items" in the level-up shop, so the level-up screen becomes perks only. Open:
  - What permanent upgrades are.
  - How they persist (localStorage).
  - Whether they make later runs too easy.
  - Where the one-shot items go now. **Answered:** see the next point.
- **Items become rare level-up cards (decided).** A card on the level-up screen is usually a perk. Sometimes, at a lower random chance, it's a one-shot item instead. Gems are no longer needed to get items during a run.
  - **Item card look (decided):** a red "ITEM" band across the top of the card, and "ONE USE" in red where a perk shows its family. Mockup: `levelup-item-card.html`, option A.
  - The banner reads "PICK ONE", since a card may be an item.
- **Firing items (decided).** **C** fires an item. Space stays hard drop, and ↑/X/W still rotate.
- **Bomb (decided).** Pressing C swaps the falling piece for one where one square is a letterless bomb tile. The bomb lands and does nothing until a word is spelled that touches it, meaning a word tile is directly beside it up, down, left or right. That word clears as usual, and the bomb also clears its whole 3×3 area. Gravity and chains then run as normal. The card text has to describe this: "PRESS C, LANDS A BOMB, A WORD BY IT BLASTS 3X3" or similar.
- **Inventory (decided).** The HUD shows the items held during play, and an item is removed when used. You can hold more than one of the same item (for example 3 bombs).
  - Items are grouped into stacks by type, for example `BOMB x3` and `WILD x1`.
  - One stack is selected and shown in red. **C** fires the selected stack and **V** moves the selection to the next one.
  - When a stack runs out, the selection moves on by itself.
  - The user first suggested firing items in the order they were picked up. They agreed to the selection instead, because a fixed order would force wrong items out in a crisis.
- **HUD changes (decided).**
  - Remove the HINT word list from the right panel; the in-well hint pulse and the H toggle stay.
  - The item stacks go in the right panel.
  - BEST (the all-time high score) leaves the in-run HUD. It shows on the game-over screen, and it stays on the title screen.
  - The right panel becomes NEXT, TARGET and ITEMS.
  - The ITEMS list uses the list style (mockup `hud-items.html`, option A):
    - each row shows a 9×9 icon, the name and a red `X3`-style count;
    - the selected row has a red frame;
    - `C USE  V SWAP` sits at the bottom of the panel.
  - The `MIN 3` line goes, because the player picked the minimum on the title screen, and that frees room for more item rows. Claude's call: the same line also showed MUTE, which goes with it. M still toggles sound.
  - The bomb tile in the well looks like a locked white tile with a small red bomb inside.
- **v1 perks (decided, 12):** FEATHER, STICKY, MIRROR, SHORT FUSE, CROSSFIRE, SINKHOLE, QUAKE, PACK RAT, BIG BANG, JOKER, PURIST, DAREDEVIL.
  - The user's reason: the draft families only raised the score, and they want variety in *how* you play.
  - Offered but not picked: TWIRL (Z spins the letters inside the piece), HOLD, SLANT (diagonal words), SECOND SIGHT (NEXT shows letters dealt a turn early).
  - One-line definitions as proposed:
    - FEATHER: pieces fall 25% slower, and it stacks.
    - STICKY: pieces wait twice as long before locking.
    - MIRROR: words also read backwards, right to left and bottom to top.
    - SHORT FUSE: 2-letter words clear tiles but score nothing.
    - CROSSFIRE: a target blasts its row *and* its column.
    - SINKHOLE: every level-up clears the bottom row.
    - QUAKE: a chain of 3 or more also clears the bottom row.
    - PACK RAT: item cards show up twice as often.
    - BIG BANG: bombs blast 5×5.
    - JOKER: now and then a piece carries a wild tile, which needs the WILD item's matching.
    - PURIST: 3-letter words stop clearing, and 4+ letter words score ×2.
    - DAREDEVIL: pieces fall as if 2 levels higher, and all scores are ×1.5.
  - **The original three are in as well (decided):** STRETCH (6+ letter words score ×2), AFTERSHOCK (the chain multiplier grows twice as fast), SCRABBLER (more J/K/X/Z/QU, and they score ×3). That makes **15 perks**.
  - **Families (agreed), 5 of 3.** The family name is the red line on the card.
    - PACE: Feather, Sticky, Daredevil.
    - WORDS: Mirror, Short Fuse, Purist.
    - BLAST: Crossfire, Sinkhole, Quake.
    - GEAR: Pack Rat, Big Bang, Joker.
    - SCORE: Stretch, Aftershock, Scrabbler. The user agreed to the first four; Claude added SCORE to hold the original three.
  - **Short Fuse and Purist exclude each other (agreed).** Once you own one, the other is no longer offered.
  - **Both follow the MIN setting (agreed).** Short Fuse clears words one letter under MIN, for 0 points. Purist stops words of exactly MIN letters from clearing and scores longer words ×2.
- **v1 items (decided, 7).** All fire with C and are used up.
  - BOMB: as described above.
  - WILD: the falling piece gets a `?` tile that matches any letter.
  - REROLL: new letters for the falling piece, same shape.
  - DRILL: the falling piece becomes a drill that bores down its column, deleting the tiles it passes through.
  - FREEZE: gravity stops for **5 seconds** (the user chose 5, not 10).
  - I-BEAM: the falling piece becomes the straight 4-long piece.
  - BEACON: calls a target word now.
- **Offer rules and item edge cases (Claude's proposal, the user approved).** The full list is in the design spec.
- **Hazards: deferred until after upgrades ship.** The user wants to feel how the upgrades play before designing the pressure. Whether to cap the gravity ramp is deferred along with them.
- **Level-up screen details (Claude's calls, the user raised no objection):**
  - It opens after the board settles and before the next spawn.
  - Each card has about a 1-in-8 chance of being an item, with at most one item per screen.
  - There is no skip, so the player always takes a card.

## Draft content (v1 should stay small: about 9 perks, 4 items, 3 hazards)

**Perk families**
- **Long words.** Example: *Stretch*, words of 6+ letters score ×2. Target words now make long words realistic, so this family can lean on them: more frequent targets, longer targets, a bigger target bonus, an extra piece in the target window.
- **Chains.** Example: *Aftershock*, the chain multiplier grows faster.
- **Rare letters.** Example: *Scrabbler*, J/K/X/Z/QU appear more often and score ×3.
- **Rule-benders** (rare): backwards words count, wild vowels, diagonals. These are expensive, because `findWords` and the hint system would both need to support them.

**Items** (about 2 slots)
- Wildcard tile: matches any letter.
- Bomb tile: blasts a 3×3 area where it lands.
- Reroll: new letters for the current piece.
- Eraser: removes the top tile of a column.
- Hold slot: maybe as a perk instead.

**Hazards** (every few levels)
- Junk rows rising from the floor.
- Letterless stone tiles that only break when a word clears next to them.
- +1 minimum word length at some levels.

## What the data showed

All figures come from greedy-bot runs (`tools/simulate.cjs` style), min length 3:

| Letter rule | 3 letters | 4 | 5 | 6+ |
|---|---|---|---|---|
| Generator before target words | 74% | 24% | 2% | 0% |
| + TH/ER/ING digraph tiles | 66% | 30% | 4% | 0% |
| + clears delayed one piece | 68% | 28% | 4% | 0% |
| Letters chosen to fit the board | 66% | 16% | 17% | 1% |
| **Target words (shipped)** | 67% | 19% | 5% | 9% |

- Before target words, the user's own play was about 90% 3-letter and 10% 4-letter words. A long-words family would have been pointless.
- Of the 3-letter words, 91% are the start or end of a longer word, so they fire before a long word can be finished. Target tiles are reserved to get around this.
- Speed is a real problem: at high levels there is no time to read the board, and the hint becomes a crutch. Hazards should carry the pressure, which may mean capping the gravity ramp.

## Open questions for tomorrow

1. How many perks, items and hazards go into v1, and exactly which ones?
2. How many item slots, which keys fire them, and what items cost in gems?
3. Perk offer rules: no duplicates, weighting toward families you already own, rarity.
4. Hazard cadence (which levels), and whether gravity stops speeding up at some level.
5. How the shop screen fits the 320×272 canvas, and how it works with keyboard only.
6. Balancing: does `simulate.cjs` need a perk-aware bot, or do we tune by playing?

## Constraints

- Rules go in pure, Node-testable code next to `js/logic.js`.
- The game must keep running from file:// with zero dependencies.
- Black/white/red palette only.
