const { L, U, FONT, assert } = require('./_setup.cjs');
const ids = Object.keys(U.PERKS);
assert.strictEqual(ids.length, 15);
assert.deepStrictEqual(U.FAMILIES.map(f => ids.filter(id => U.PERKS[id].family === f).length), [3, 3, 3, 3, 3]);
assert.strictEqual(Object.keys(U.ITEMS).length, 7);
// card text fits the card and the font, at every MIN, with and without BIG BANG
const glyphOk = s => [...s].every(ch => ch === ' ' || FONT.glyphs[ch]);
for (const min of [3, 4, 5]) for (const run of [U.newRun(), Object.assign(U.newRun(), { perks: { bigbang: 1 } })]) {
  for (const def of [...Object.values(U.PERKS), ...Object.values(U.ITEMS)]) {
    const lines = def.text(min, run);
    assert.ok(lines.length >= 1 && lines.length <= 4, def.name);
    for (const s of [def.name, ...lines]) assert.ok(s.length <= 14 && glyphOk(s), `${def.name}: "${s}"`);
  }
}
assert.ok(U.PERKS.shortfuse.text(3, U.newRun())[0].startsWith('2-LETTER'));
assert.ok(U.PERKS.purist.text(4, U.newRun())[0].startsWith('4-LETTER'));
assert.ok(U.ITEMS.bomb.text(3, Object.assign(U.newRun(), { perks: { bigbang: 1 } })).join(' ').includes('5X5'));

// offers
const offers = (run, n, seed = 1) => { const rng = L.makeRng(seed); return Array.from({ length: n }, () => U.offerCards(run, rng)); };
for (const o of offers(U.newRun(), 2000)) {
  assert.strictEqual(o.length, 3);
  assert.strictEqual(new Set(o.map(c => c.id)).size, 3, 'distinct cards');
  assert.ok(o.filter(c => c.kind === 'item').length <= 1, 'at most one item while perks remain');
}
const withItem = os => os.filter(o => o.some(c => c.kind === 'item')).length / os.length;
const base = withItem(offers(U.newRun(), 4000));
assert.ok(base > 0.28 && base < 0.38, 'about 1-(7/8)^3 = 0.33 of offers hold an item: ' + base);
const rat = withItem(offers(Object.assign(U.newRun(), { perks: { packrat: 1 } }), 4000));
assert.ok(rat > 0.52 && rat < 0.64, 'PACK RAT: about 1-(3/4)^3 = 0.58: ' + rat);
const allIds = os => os.flat().map(c => c.id);
assert.ok(!allIds(offers(Object.assign(U.newRun(), { perks: { shortfuse: 1 } }), 500)).includes('purist'));
assert.ok(!allIds(offers(Object.assign(U.newRun(), { perks: { purist: 1 } }), 500)).includes('shortfuse'));
assert.ok(allIds(offers(Object.assign(U.newRun(), { perks: { feather: 2 } }), 500)).includes('feather'));
assert.ok(!allIds(offers(Object.assign(U.newRun(), { perks: { feather: 3 } }), 500)).includes('feather'));
// owning a family makes it come up more often
const scoreShare = run => { const ps = offers(run, 3000).flat().filter(c => c.kind === 'perk'); return ps.filter(c => U.PERKS[c.id].family === 'SCORE').length / ps.length; };
const owned = scoreShare(Object.assign(U.newRun(), { perks: { stretch: 1 } }));
assert.ok(owned > 0.2 && owned < 0.32, 'SCORE share with STRETCH owned: ' + owned);
// a short pool fills with distinct items; with every perk owned, all three cards are items
const allOwned = Object.assign(U.newRun(), { perks: Object.fromEntries(ids.map(id => [id, U.PERKS[id].max])) });
assert.ok(U.perkPool(allOwned).length === 0);
for (const o of offers(allOwned, 200)) { assert.ok(o.every(c => c.kind === 'item')); assert.strictEqual(new Set(o.map(c => c.id)).size, 3); }
const oneLeft = Object.assign(U.newRun(), { perks: Object.fromEntries(ids.filter(id => id !== 'quake' && id !== 'purist').map(id => [id, U.PERKS[id].max])) });
for (const o of offers(oneLeft, 200)) assert.deepStrictEqual(o.filter(c => c.kind === 'perk').map(c => c.id), ['quake']);

// inventory
const inv = U.newRun();
assert.strictEqual(U.selectedItem(inv), null); assert.strictEqual(U.useItem(inv), null);
U.takeCard(inv, { kind: 'item', id: 'bomb' }); U.addItem(inv, 'wild'); U.addItem(inv, 'bomb');
assert.deepStrictEqual(inv.items, [{ id: 'bomb', n: 2 }, { id: 'wild', n: 1 }]);
U.selectNext(inv); assert.strictEqual(U.selectedItem(inv), 'wild');
assert.strictEqual(U.useItem(inv), 'wild'); assert.deepStrictEqual(inv.items, [{ id: 'bomb', n: 2 }]); assert.strictEqual(inv.sel, 0, 'wraps to 0');
U.takeCard(inv, { kind: 'perk', id: 'feather' }); U.takeCard(inv, { kind: 'perk', id: 'feather' });
assert.strictEqual(U.count(inv, 'feather'), 2); assert.ok(U.has(inv, 'feather') && !U.has(inv, 'sticky'));

// rules, timing, scoring
const R = perks => Object.assign(U.newRun(), { perks });
assert.deepStrictEqual(U.rules(R({}), 3), { minLen: 3, shortLen: 0, mirror: false, rareBoost: 1 });
assert.deepStrictEqual(U.rules(R({ purist: 1, mirror: 1, scrabbler: 1 }), 3), { minLen: 4, shortLen: 0, mirror: true, rareBoost: 2 });
assert.strictEqual(U.rules(R({ shortfuse: 1 }), 4).shortLen, 3);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' vs ' + b);
close(U.gravityMs(R({}), 1), 900); close(U.gravityMs(R({ feather: 1 }), 1), 1200); close(U.gravityMs(R({ feather: 2 }), 1), 1600);
close(U.gravityMs(R({ daredevil: 1 }), 1), 900 * 0.86 * 0.86); close(U.gravityMs(R({}), 40), 70);
assert.strictEqual(U.lockDelayMs(R({})), 500); assert.strictEqual(U.lockDelayMs(R({ sticky: 1 })), 1000);
assert.strictEqual(U.bombRadius(R({})), 1); assert.strictEqual(U.bombRadius(R({ bigbang: 1 })), 2);
assert.strictEqual(U.chainFactor(R({}), 3), 3); assert.strictEqual(U.chainFactor(R({ aftershock: 1 }), 3), 5);
const P = (word, perks, o = {}) => U.wordPoints({ word, ...o.found }, o.chain || 1, R(perks), { hit: !!o.hit, minLen: 3 });
assert.strictEqual(P('cat', {}), 50);
assert.strictEqual(P('quiz', {}), 420); assert.strictEqual(P('quiz', { scrabbler: 1 }), 1220);
assert.strictEqual(P('cat', { aftershock: 1 }, { chain: 2 }), 150);
assert.strictEqual(P('cat', { daredevil: 1 }), 75);
assert.strictEqual(P('cats', { purist: 1 }), 240);
assert.strictEqual(P('planet', { stretch: 1 }), 640);
assert.strictEqual(P('strong', {}, { hit: true }), 840);
assert.strictEqual(P('strong', { stretch: 1, daredevil: 1 }, { hit: true }), 2520);
assert.strictEqual(P('at', {}, { found: { short: true } }), 0);
assert.strictEqual(P('cat', {}, { found: { wildChs: ['c'] } }), 20);
// JOKER: every 10th piece, counted only while owned
const j = U.newRun(); assert.ok(!U.jokerDue(j)); assert.strictEqual(j.joker, 0);
j.perks.joker = 1; const due = Array.from({ length: 20 }, () => U.jokerDue(j));
assert.deepStrictEqual(due.map((d, i) => d ? i + 1 : 0).filter(Boolean), [10, 20]);
assert.deepStrictEqual([1, 2, 3, 4].map(c => U.quakeNow(R({ quake: 1 }), c)), [false, false, true, false]);
assert.strictEqual(U.quakeNow(R({}), 3), false);
{
  // the item lands in each slot about equally often
  const slots = [0, 0, 0];
  for (const o of offers(U.newRun(), 3000, 7)) { const i = o.findIndex(c => c.kind === 'item'); if (i >= 0) slots[i]++; }
  const tot = slots.reduce((x, y) => x + y, 0);
  assert(tot > 300, 'enough item offers');
  slots.forEach(n => assert(n / tot > 0.25 && n / tot < 0.42, 'item slot uniform ' + slots));
}
console.log('upgrades module ok');
