const { U, assert } = require('./_setup.cjs');
require('../../js/icons.js');
const I = window.WordWellIcons;
const shape = (rows, n, name) => { assert.strictEqual(rows.length, n, name); for (const r of rows) assert.ok(r.length === n && /^[.wr]+$/.test(r), name + ': ' + r); };
for (const id of [...Object.keys(U.PERKS), ...Object.keys(U.ITEMS)]) shape(I.card[id], 16, 'card ' + id);
for (const id of Object.keys(U.ITEMS)) shape(I.hud[id], 9, 'hud ' + id);
shape(I.tile.bomb, 7, 'tile bomb'); shape(I.tile.drill, 7, 'tile drill');
console.log('icons ok');
