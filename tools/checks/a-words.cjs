const { L, dict, assert } = require('./_setup.cjs');
const short = (window.SHORTWORDS || '').split(' ').filter(Boolean);
assert.ok(short.length >= 30 && short.every(w => w.length === 2) && short.includes('at') && short.includes('ox'));
assert.ok(dict.short.has('at'));
const row = s => { const g = L.emptyGrid(10, 1); [...s].forEach((ch, i) => { if (ch !== '.') g[0][i] = { ch }; }); return g; };
const F = (g, r) => L.findWords(g, dict, r).map(w => w.word + (w.short ? '!' : ''));
assert.deepStrictEqual(F(row('at'), { minLen: 3, shortLen: 2 }), ['at!']);
assert.deepStrictEqual(F(row('cat'), { minLen: 3, shortLen: 2 }), ['cat'], 'longest wins');
assert.deepStrictEqual(F(row('cat'), { minLen: 4, shortLen: 3 }), ['cat!']);
assert.deepStrictEqual(F(row('at'), { minLen: 3 }), []);
assert.deepStrictEqual(F(row('tac'), { minLen: 3, mirror: true }), ['cat']);
assert.deepStrictEqual(F(row('stop'), { minLen: 3, mirror: true }), ['stop'], 'reads both ways: forward wins, counted once');
const v = L.emptyGrid(1, 3); v[0][0] = { ch: 't' }; v[1][0] = { ch: 'a' }; v[2][0] = { ch: 'c' };
const fv = L.findWords(v, dict, { minLen: 3, mirror: true });
assert.deepStrictEqual(fv.map(w => [w.word, w.cells.map(c => c.y)]), [['cat', [2, 1, 0]]], 'down words read bottom to top');
const tg = L.emptyGrid(10, 1); [...'gnorts'].forEach((ch, i) => tg[0][i] = { ch, tgt: 'strong' });
assert.deepStrictEqual(F(tg, { minLen: 3, mirror: true }), ['strong'], 'a backwards target counts');
const gen = new L.PieceGenerator(dict, { rng: L.makeRng(2) });
gen.setRules({ minLen: 3, mirror: true }); assert.ok(gen.clearsAlone('tac'));
gen.setRules({ minLen: 3, shortLen: 2 }); assert.ok(gen.clearsAlone('at') && !gen.clearsAlone('qz'));
// the dealer avoids pieces that clear themselves (the 400-try fallback may rarely still contain one)
let selfClears = 0;
for (let i = 0; i < 2000; i++) { const d = gen.next(null); if (L.runsOf(L.createPiece(d.type, d.letters).cells).some(r => gen.clearsAlone(r))) selfClears++; }
assert.ok(selfClears / 2000 < 0.05, 'self-clearing pieces under SHORT FUSE: ' + selfClears);
console.log('mirror/short ok', selfClears);
// MIRROR reverses by tile: the QU tile stays whole ('tiqu' backwards is 'quit')
gen.setRules({ minLen: 3, mirror: true }); assert.ok(gen.clearsAlone('tiqu'), 'QU-aware mirror reversal');
