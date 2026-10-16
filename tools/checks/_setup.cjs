// Shared setup for the upgrade checks.
globalThis.window = globalThis;
const P = require('path').join(__dirname, '../../js/');
require(P + 'words.js');
require(P + 'font.js');
const L = require(P + 'logic.js');
const U = require(P + 'upgrades.js');
const assert = require('assert');
const dict = L.buildDictionary(window.WORDLIST, window.SHORTWORDS || '');
const well = (...rows) => {
  const g = L.emptyGrid();
  for (const [y, x, s] of rows) [...s].forEach((ch, i) => { if (ch !== '.') g[y][x + i] = { ch }; });
  return g;
};
module.exports = { L, U, FONT: window.WordWellFont, dict, assert, well };
