const { L, dict, assert, well } = require('./_setup.cjs');
const S = L.stoneTile;
// a stone splits a run
let g = well([19, 0, 'ca.t']); g[19][2] = S();
assert.deepStrictEqual(L.findWords(g, dict, 3), [], 'stone breaks the run');
assert.deepStrictEqual(S(), { ch: '', stone: true, dy: 0, vy: 0 });
// stones beside a cleared word break; diagonal and farther ones don't
g = well([19, 0, 'cat'], [17, 5, 'x']);
g[18][0] = S(); g[19][3] = S(); g[19][4] = S(); g[18][3] = S();
const cat = { word: 'cat', dir: 'h', cells: [0, 1, 2].map(x => ({ x, y: 19 })) };
const keys = new Set(cat.cells.map(c => c.x + ',' + c.y));
const out = L.breakStones(g, keys, [cat]);
assert.deepStrictEqual([...out].sort(), ['0,18', '0,19', '1,19', '2,19', '3,19'].sort());
assert.strictEqual(keys.size, 3, 'input set untouched');
// a letter beside the word is not a stone and stays
assert.ok(!out.has('2,18'));
// no words (drill, sinkhole): only the given cells
const col = new Set(['3,19', '3,18']);
assert.deepStrictEqual([...L.breakStones(g, col, [])].sort(), ['3,18', '3,19']);
// vowelRatio skips letterless tiles
g = L.emptyGrid();
for (let x = 0; x < 8; x++) g[19][x] = { ch: x < 4 ? 'a' : 't' };
for (let x = 0; x < 10; x++) g[18][x] = S();
assert.strictEqual(L.vowelRatio(g), 0.5);
g = L.emptyGrid(); for (let x = 0; x < 10; x++) g[19][x] = S();
assert.strictEqual(L.vowelRatio(g), null, 'stones alone are not enough tiles');
console.log('stones ok');
