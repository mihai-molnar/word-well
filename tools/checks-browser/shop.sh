#!/bin/sh
# Shop: opens from game over, ignores the first 500 ms, buys, dives with the new pool; title ↓ opens it, Esc returns.
S=${TMPDIR:-/tmp}
node tools/shot.mjs $S/shop.png --query=gems=1000 "js:wordwell.gameOver()" wait:1000 key:Enter key:Space "js:wordwell.state" wait:600 \
  key:ArrowUp key:ArrowUp key:ArrowUp key:ArrowRight key:Space "js:JSON.stringify(wordwell.shop)" wait:1500
node tools/shot.mjs $S/shop-dive.png --query=gems=1000 "js:wordwell.gameOver()" wait:1000 key:Enter wait:600 \
  key:ArrowUp key:ArrowUp key:ArrowUp key:Space key:Enter "js:wordwell.state" "js:JSON.stringify(wordwell.run.locked)"
node tools/shot.mjs $S/shop-title.png --title --query=gems=50 key:ArrowDown "js:wordwell.state" wait:600 key:ArrowUp key:ArrowUp key:Space "js:wordwell.shop.gems" key:Escape "js:wordwell.state"
node tools/shot.mjs $S/shop-poor.png --title --query=gems=50 key:ArrowDown wait:600 key:ArrowUp key:ArrowUp key:ArrowUp wait:300
