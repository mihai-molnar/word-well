// Upgrade checks. Run: node tools/check-upgrades.cjs
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'checks');
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.cjs') || f.startsWith('_')) continue;
  console.log('-- ' + f);
  require(path.join(dir, f));
}
console.log('all upgrade checks passed');
