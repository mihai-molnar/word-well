const { L, U, FONT, assert } = require('./_setup.cjs');
const glyphOk = s => [...s].every(ch => ch === ' ' || FONT.glyphs[ch]);
// stock
assert.deepStrictEqual(U.SHOP.map(e => [e.id, e.price]), [['daredevil', 250], ['mirror', 200], ['quake', 150], ['joker', 200], ['scrabbler', 150],
  ['beacon', 60], ['wild', 80], ['drill', 100], ['pouch', 200], ['pouch2', 500], ['secondlook', 300], ['earlypick', 600]]);
assert.strictEqual(U.SHOP.reduce((n, e) => n + e.price, 0), 2790);
assert.deepStrictEqual(U.SHELVES.map(s => s.slots.length), [5, 3, 3]);
assert.deepStrictEqual([...U.LOCKED].sort(), ['beacon', 'daredevil', 'drill', 'joker', 'mirror', 'quake', 'scrabbler', 'wild']);
for (const e of U.SHOP) {
  const d = U.shopDef(e.id);
  for (const min of [3, 4, 5]) { const lines = d.text(min, U.newRun()); assert.ok(lines.length >= 1 && lines.length <= 4, e.id);
    for (const s of [d.name, d.kind, ...lines]) assert.ok(s.length <= 14 && glyphOk(s), `${e.id}: "${s}"`); }
}
assert.strictEqual(U.shopDef('mirror').kind, 'WORDS'); assert.strictEqual(U.shopDef('wild').kind, 'ITEM'); assert.strictEqual(U.shopDef('pouch2').name, 'POUCH II');
// locked pool
const offers = (run, n, seed = 1) => { const rng = L.makeRng(seed); return Array.from({ length: n }, () => U.offerCards(run, rng)).flat().map(c => c.id); };
assert.deepStrictEqual(U.newRun().locked, []); assert.strictEqual(U.newRun().redeal, false);
const fresh = U.newRun([]);
assert.deepStrictEqual(U.unlockedItems(fresh), ['bomb', 'reroll', 'freeze', 'ibeam']);
assert.strictEqual(U.perkPool(fresh).length, 10);
const seen = new Set(offers(fresh, 3000));
for (const id of U.LOCKED) assert.ok(!seen.has(id), 'locked never offered: ' + id);
const some = new Set(offers(U.newRun(['mirror', 'drill']), 3000));
assert.ok(some.has('mirror') && some.has('drill') && !some.has('quake') && !some.has('wild'));
const all = new Set(offers(U.newRun(), 3000));
assert.ok(U.LOCKED.every(id => all.has(id)), 'no argument: everything offered');
// dry pool fills with distinct unlocked items
const dry = Object.assign(U.newRun([]), { perks: Object.fromEntries(Object.keys(U.PERKS).map(id => [id, U.PERKS[id].max])) });
for (let s = 1; s < 200; s++) { const o = U.offerCards(dry, L.makeRng(s)); assert.ok(o.every(c => c.kind === 'item' && U.unlockedItems(dry).includes(c.id))); assert.strictEqual(new Set(o.map(c => c.id)).size, 3); }
// slots and buying
let save = { gems: 1000, owned: [] };
assert.strictEqual(U.slotEntry('pouch', save).entry.id, 'pouch');
assert.deepStrictEqual(U.buy(save, 'pouch2'), { ok: false, reason: 'needs' });
assert.deepStrictEqual(U.buy(save, 'nope'), { ok: false, reason: 'unknown' });
assert.deepStrictEqual(U.buy(save, 'pouch'), { ok: true }); assert.deepStrictEqual(save, { gems: 800, owned: ['pouch'] });
assert.deepStrictEqual(U.buy(save, 'pouch'), { ok: false, reason: 'owned' });
assert.strictEqual(U.slotEntry('pouch', save).entry.id, 'pouch2');
assert.deepStrictEqual(U.buy(save, 'earlypick'), { ok: true }); assert.strictEqual(save.gems, 200);
assert.deepStrictEqual(U.buy(save, 'pouch2'), { ok: false, reason: 'poor' }); assert.strictEqual(save.gems, 200);
save.gems = 500; U.buy(save, 'pouch2');
assert.deepStrictEqual(U.slotEntry('pouch', save), { entry: U.SHOP.find(e => e.id === 'pouch2'), owned: true });
// gems
assert.deepStrictEqual([3, 4, 5].map(m => U.gemsBanked(143, m)), [143, 214, 286]);
// save cleaning
assert.deepStrictEqual(U.loadSave('garbage'), { gems: 0, owned: [] });
assert.deepStrictEqual(U.loadSave(null), { gems: 0, owned: [] });
assert.deepStrictEqual(U.loadSave({ gems: 'x', owned: ['nope', 'mirror', 'mirror', 'pouch2'] }), { gems: 0, owned: ['mirror'] });
assert.deepStrictEqual(U.loadSave({ gems: 12.7, owned: ['pouch', 'pouch2'] }), { gems: 12, owned: ['pouch', 'pouch2'] });
assert.deepStrictEqual(U.loadSave({ gems: -5 }), { gems: 0, owned: [] });
// start kit
const kit = (owned, seed) => { const r = U.newRun(owned); U.startKit(r, owned, L.makeRng(seed)); return r; };
assert.deepStrictEqual(kit([], 1).items, []);
for (let s = 1; s < 50; s++) {
  const one = kit(['pouch'], s); assert.strictEqual(one.items.reduce((n, it) => n + it.n, 0), 1);
  const two = kit(['pouch', 'pouch2'], s); assert.strictEqual(two.items.reduce((n, it) => n + it.n, 0), 2);
  assert.ok(two.items.every(it => ['bomb', 'reroll', 'freeze', 'ibeam'].includes(it.id)), 'pouch draws only unlocked items');
}
assert.ok(kit(['pouch', 'wild'], 3).items.length === 1);
assert.strictEqual(kit(['secondlook'], 1).redeal, true); assert.strictEqual(kit([], 1).redeal, false);
console.log('shop ok');
