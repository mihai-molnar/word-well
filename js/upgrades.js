/* Word Well — perks, items, offers and run rules (no DOM). Loaded by the browser game and by node scripts. */
(function (root) {
  'use strict';

  const L = root.WordWellLogic || require('./logic.js');

  const FAMILIES = ['PACE', 'WORDS', 'BLAST', 'GEAR', 'SCORE'];
  const ITEM_CHANCE = 1 / 5; // per card on the level-up screen
  const PACK_RAT_CHANCE = 2 / 5;
  const JOKER_EVERY = 10;
  const FREEZE_MS = 5000;

  // Card text: lines of at most 14 characters, font glyphs only.
  const PERKS = {
    feather: { name: 'FEATHER', family: 'PACE', max: 3, text: () => ['PIECES FALL', 'A QUARTER', 'SLOWER.', 'STACKS UP TO 3'] },
    sticky: { name: 'STICKY', family: 'PACE', max: 1, text: () => ['PIECES WAIT', 'TWICE AS LONG', 'BEFORE THEY', 'LOCK.'] },
    daredevil: { name: 'DAREDEVIL', family: 'PACE', max: 1, text: () => ['FALL AS IF 2', 'LEVELS UP.', 'ALL SCORES', 'X1.5'] },
    mirror: { name: 'MIRROR', family: 'WORDS', max: 1, text: () => ['WORDS ALSO', 'COUNT', 'BACKWARDS:', '← AND ↑'] },
    shortfuse: { name: 'SHORT FUSE', family: 'WORDS', max: 1, excludes: 'purist', text: min => [`${min - 1}-LETTER`, 'WORDS CLEAR', 'TOO, FOR', '0 POINTS.'] },
    purist: { name: 'PURIST', family: 'WORDS', max: 1, excludes: 'shortfuse', text: min => [`${min}-LETTER`, 'WORDS NO', 'LONGER CLEAR.', 'LONGER ONES X2'] },
    crossfire: { name: 'CROSSFIRE', family: 'BLAST', max: 1, text: () => ['TARGETS BLAST', 'THEIR ROW AND', 'THEIR COLUMN.'] },
    sinkhole: { name: 'SINKHOLE', family: 'BLAST', max: 1, text: () => ['EVERY LEVEL-UP', 'CLEARS THE', 'BOTTOM ROW.'] },
    quake: { name: 'QUAKE', family: 'BLAST', max: 1, text: () => ['A CHAIN OF 3+', 'ALSO CLEARS', 'THE BOTTOM ROW'] },
    packrat: { name: 'PACK RAT', family: 'GEAR', max: 1, text: () => ['ITEM CARDS', 'SHOW UP TWICE', 'AS OFTEN.'] },
    bigbang: { name: 'BIG BANG', family: 'GEAR', max: 1, text: () => ['BOMBS BLAST', '5X5 INSTEAD', 'OF 3X3.'] },
    joker: { name: 'JOKER', family: 'GEAR', max: 1, text: () => ['EVERY 10TH', 'PIECE HAS A', 'WILD ? TILE.'] },
    stretch: { name: 'STRETCH', family: 'SCORE', max: 1, text: () => ['6+ LETTER', 'WORDS SCORE', 'X2'] },
    aftershock: { name: 'AFTERSHOCK', family: 'SCORE', max: 1, text: () => ['CHAIN BONUS', 'GROWS TWICE', 'AS FAST'] },
    scrabbler: { name: 'SCRABBLER', family: 'SCORE', max: 1, text: () => ['MORE J K X Z', 'AND QU.', 'THEY SCORE X3'] },
  };

  const ITEMS = {
    bomb: { name: 'BOMB', text: (min, run) => ['C: A BOMB TILE', 'LANDS. A WORD', 'BY IT BLASTS', bombRadius(run) === 2 ? '5X5.' : '3X3.'] },
    wild: { name: 'WILD', text: () => ['C: A ? TILE', 'THAT FITS ANY', 'LETTER.'] },
    reroll: { name: 'REROLL', text: () => ['C: NEW LETTERS', 'FOR THE', 'FALLING PIECE.'] },
    drill: { name: 'DRILL', text: () => ['C: A DRILL.', 'IT CLEARS THE', 'COLUMN IT', 'LANDS IN.'] },
    freeze: { name: 'FREEZE', text: () => ['C: PIECES STOP', 'FALLING FOR', `${FREEZE_MS / 1000} SECONDS.`] },
    ibeam: { name: 'I-BEAM', text: () => ['C: THE PIECE', 'BECOMES A', 'STRAIGHT 4.'] },
    beacon: { name: 'BEACON', text: () => ['C: CALL A', 'TARGET WORD', 'NOW.'] },
  };
  const ITEM_IDS = Object.keys(ITEMS);

  const KIT = {
    pouch: { name: 'POUCH', text: () => ['START EACH RUN', 'WITH 1 RANDOM', 'ITEM.'] },
    pouch2: { name: 'POUCH II', text: () => ['START EACH RUN', 'WITH 2 RANDOM', 'ITEMS.'] },
    secondlook: { name: 'SECOND LOOK', text: () => ['ONCE A RUN, V', 'ON A LEVEL-UP', 'RE-DEALS THE', 'CARDS.'] },
    earlypick: { name: 'EARLY PICK', text: () => ['A FREE PICK', 'BEFORE THE', 'FIRST PIECE.'] },
  };

  // The shop's stock in shelf order. slot: the slot's first tier (POUCH II sells in POUCH's slot).
  const SHOP = [
    ['daredevil', 'PERKS', 250], ['mirror', 'PERKS', 200], ['quake', 'PERKS', 150], ['joker', 'PERKS', 200], ['scrabbler', 'PERKS', 150],
    ['beacon', 'ITEMS', 60], ['wild', 'ITEMS', 80], ['drill', 'ITEMS', 100],
    ['pouch', 'KIT', 200], ['pouch2', 'KIT', 500, 'pouch'], ['secondlook', 'KIT', 300], ['earlypick', 'KIT', 600],
  ].map(([id, shelf, price, needs]) => (needs ? { id, shelf, price, slot: needs, needs } : { id, shelf, price, slot: id }));
  const SHELVES = ['PERKS', 'ITEMS', 'KIT'].map(name => ({
    name, slots: [...new Set(SHOP.filter(e => e.shelf === name).map(e => e.slot))],
  }));
  // Perks and items a fresh save can't be offered until they are bought.
  const LOCKED = SHOP.filter(e => e.shelf !== 'KIT').map(e => e.id);
  const unlockedItems = run => ITEM_IDS.filter(id => !run.locked.includes(id));

  // owned: the save's shop ids. Without it (the sim, the checks) nothing is locked.
  const newRun = owned => ({
    perks: {}, items: [], sel: 0, joker: 0, redeal: false,
    locked: owned ? LOCKED.filter(id => !owned.includes(id)) : [],
  });
  const count = (run, id) => run.perks[id] || 0;
  const has = (run, id) => count(run, id) > 0;

  // Perks that can still be offered: not maxed, and not excluded by one already owned.
  function perkPool(run) {
    return Object.keys(PERKS).filter(id => {
      const p = PERKS[id];
      return count(run, id) < p.max && !(p.excludes && has(run, p.excludes)) && !run.locked.includes(id);
    });
  }

  // Three distinct cards. An item rolls per slot (at most one); the rest are perks,
  // drawn without replacement and weighted 2 for families already owned. A dry pool fills with items.
  function offerCards(run, rng) {
    const chance = has(run, 'packrat') ? PACK_RAT_CHANCE : ITEM_CHANCE;
    const items = unlockedItems(run);
    const cards = [null, null, null];
    // One item per offer at most, in a uniformly random slot.
    if (rng() < 1 - Math.pow(1 - chance, 3)) {
      cards[Math.floor(rng() * 3)] = { kind: 'item', id: items[Math.floor(rng() * items.length)] };
    }
    const pool = perkPool(run);
    const owned = new Set(Object.keys(PERKS).filter(id => has(run, id)).map(id => PERKS[id].family));
    for (let i = 0; i < 3; i++) {
      if (cards[i]) continue;
      if (pool.length) {
        const w = pool.map(id => (owned.has(PERKS[id].family) ? 2 : 1));
        let r = rng() * w.reduce((a, b) => a + b, 0);
        let k = 0;
        while (k < pool.length - 1 && (r -= w[k]) >= 0) k++;
        cards[i] = { kind: 'perk', id: pool.splice(k, 1)[0] };
      } else {
        const free = items.filter(id => !cards.some(c => c && c.id === id));
        cards[i] = { kind: 'item', id: free[Math.floor(rng() * free.length)] };
      }
    }
    return cards;
  }

  function addItem(run, id) {
    const s = run.items.find(it => it.id === id);
    if (s) s.n++; else run.items.push({ id, n: 1 });
  }
  function takeCard(run, card) {
    if (card.kind === 'item') addItem(run, card.id);
    else run.perks[card.id] = count(run, card.id) + 1;
  }
  const selectedItem = run => (run.items[run.sel] ? run.items[run.sel].id : null);
  function selectNext(run) { if (run.items.length) run.sel = (run.sel + 1) % run.items.length; }
  function useItem(run) {
    const s = run.items[run.sel];
    if (!s) return null;
    if (--s.n <= 0) {
      run.items.splice(run.sel, 1);
      if (run.sel >= run.items.length) run.sel = 0;
    }
    return s.id;
  }

  function rules(run, minLen) {
    const purist = has(run, 'purist');
    return {
      minLen: purist ? minLen + 1 : minLen,
      shortLen: has(run, 'shortfuse') ? minLen - 1 : 0,
      mirror: has(run, 'mirror'),
      rareBoost: has(run, 'scrabbler') ? 2 : 1,
    };
  }

  function gravityMs(run, level) {
    const lvl = level + (has(run, 'daredevil') ? 2 : 0);
    return Math.max(70, 900 * Math.pow(0.86, lvl - 1)) * Math.pow(4 / 3, count(run, 'feather'));
  }
  const lockDelayMs = run => (has(run, 'sticky') ? 1000 : 500);
  const bombRadius = run => (has(run, 'bigbang') ? 2 : 1);
  const chainFactor = (run, chain) => (has(run, 'aftershock') ? 1 + 2 * (chain - 1) : chain);

  function wordPoints(found, chain, run, { hit, minLen }) {
    if (found.short) return 0;
    let pts = L.scoreWord(found.word, chainFactor(run, chain), {
      rareMult: has(run, 'scrabbler') ? 3 : 1,
      wildChs: found.wildChs || [],
    });
    if (hit) pts *= L.TARGET_BONUS;
    if (has(run, 'daredevil')) pts *= 1.5;
    if (has(run, 'purist') && found.word.length > minLen) pts *= 2;
    if (has(run, 'stretch') && found.word.length >= 6) pts *= 2;
    return Math.round(pts);
  }

  // Call once per dealt piece; counts only while JOKER is owned.
  function jokerDue(run) {
    if (!has(run, 'joker')) return false;
    if (++run.joker < JOKER_EVERY) return false;
    run.joker = 0;
    return true;
  }
  const quakeNow = (run, chain) => has(run, 'quake') && chain === 3;

  // ---- the gem shop: stock, the save, buying and the start kit ----

  const GEM_MULT = { 3: 1, 4: 1.5, 5: 2 }; // by the title-screen MIN; PURIST doesn't count
  const gemsBanked = (tiles, minLen) => Math.floor(tiles * (GEM_MULT[minLen] || 1));

  const emptySave = () => ({ gems: 0, owned: [] });

  // A save from storage, cleaned: unknown ids, repeats and tiers without their first tier are dropped.
  function loadSave(raw) {
    if (!raw || typeof raw !== 'object') return emptySave();
    const gems = typeof raw.gems === 'number' && Number.isFinite(raw.gems) && raw.gems >= 0 ? Math.floor(raw.gems) : 0;
    const owned = [];
    for (const e of SHOP) {
      if (Array.isArray(raw.owned) && raw.owned.includes(e.id) && (!e.needs || owned.includes(e.needs))) owned.push(e.id);
    }
    return { gems, owned };
  }

  function buy(save, id) {
    const e = SHOP.find(x => x.id === id);
    if (!e) return { ok: false, reason: 'unknown' };
    if (save.owned.includes(id)) return { ok: false, reason: 'owned' };
    if (e.needs && !save.owned.includes(e.needs)) return { ok: false, reason: 'needs' };
    if (save.gems < e.price) return { ok: false, reason: 'poor' };
    save.gems -= e.price;
    save.owned.push(id);
    return { ok: true };
  }

  // What a shop slot sells now: its first tier not owned, or its last tier once all are owned.
  function slotEntry(slot, save) {
    const tiers = SHOP.filter(e => e.slot === slot);
    const entry = tiers.find(e => !save.owned.includes(e.id));
    return entry ? { entry, owned: false } : { entry: tiers[tiers.length - 1], owned: true };
  }

  function shopDef(id) {
    if (PERKS[id]) return { name: PERKS[id].name, kind: PERKS[id].family, text: PERKS[id].text };
    if (ITEMS[id]) return { name: ITEMS[id].name, kind: 'ITEM', text: ITEMS[id].text };
    return { name: KIT[id].name, kind: 'KIT', text: KIT[id].text };
  }

  // POUCH items (independent draws from the unlocked items) and the SECOND LOOK re-deal.
  function startKit(run, owned, rng) {
    const n = owned.includes('pouch2') ? 2 : owned.includes('pouch') ? 1 : 0;
    const items = unlockedItems(run);
    for (let i = 0; i < n; i++) addItem(run, items[Math.floor(rng() * items.length)]);
    run.redeal = owned.includes('secondlook');
  }

  const api = {
    FAMILIES, PERKS, ITEMS, ITEM_CHANCE, PACK_RAT_CHANCE, JOKER_EVERY, FREEZE_MS,
    newRun, count, has, perkPool, offerCards, takeCard, addItem, selectedItem, selectNext, useItem,
    rules, gravityMs, lockDelayMs, bombRadius, chainFactor, wordPoints, jokerDue, quakeNow,
    SHOP, SHELVES, KIT, LOCKED, GEM_MULT, gemsBanked, emptySave, loadSave, buy, slotEntry, shopDef,
    unlockedItems, startKit,
  };
  root.WordWellUpgrades = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
