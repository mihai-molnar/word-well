const { L, assert } = require('./_setup.cjs');

// pickFiller never lands on a cell that is already a bomb or wild.
{
  const mk = marks => ({ cells: marks.map((m, i) => ({ x: i, y: 0, ch: 'a', ...m })), hookIdx: [] });
  const p = mk([{ bomb: true }, {}, { wild: true }, { tgt: 'word' }]);
  for (let i = 0; i < 50; i++) assert.strictEqual(L.pickFiller(p, Math.random), 1);
  // hook cell is the only plain one: falls back to it, never to a special cell
  const q = mk([{ bomb: true }, {}, { wild: true }]);
  q.hookIdx = [1];
  assert.strictEqual(L.pickFiller(q, Math.random), 1);
  // everything special or target: -1
  assert.strictEqual(L.pickFiller(mk([{ bomb: true }, { wild: true }, { tgt: 'w' }]), Math.random), -1);
}
console.log('b-board ok');
