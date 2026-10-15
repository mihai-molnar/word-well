# Upgrades system: notes for the next session

Status: brainstormed on 2026-10-15, **not built**. Target words were built first, because they were a prerequisite for this. Next step: turn these notes into a design, then a plan.

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
