#!/bin/sh
# Shop: opens from game over, ignores the first 500 ms, buys, dives with the new pool; title ↓ opens it, Esc returns.
S=${TMPDIR:-/tmp}
node tools/shot.mjs $S/shop.png --query=gems=1000 "js:wordwell.gameOver()" wait:1000 key:Enter key:Space "js:wordwell.state" wait:600 \
  key:ArrowUp key:ArrowUp key:ArrowUp key:ArrowRight key:Space "js:JSON.stringify(wordwell.shop)" wait:1500
node tools/shot.mjs $S/shop-dive.png --query=gems=1000 "js:wordwell.gameOver()" wait:1000 key:Enter wait:600 \
  key:ArrowUp key:ArrowUp key:ArrowUp key:Space key:Enter "js:wordwell.state" "js:JSON.stringify(wordwell.run.locked)"
node tools/shot.mjs $S/shop-title.png --title --query=gems=50 key:ArrowDown "js:wordwell.state" wait:600 key:ArrowUp key:ArrowUp key:Space "js:wordwell.shop.gems" key:Escape "js:wordwell.state"
node tools/shot.mjs $S/shop-poor.png --title --query=gems=50 key:ArrowDown wait:600 key:ArrowUp key:ArrowUp key:ArrowUp wait:300
# Another tab's progress survives: banking and buying re-read the save first.
node tools/shot.mjs $S/shop-tabs.png "js:localStorage.setItem('wordwell.shop', JSON.stringify({gems:900,owned:['mirror','earlypick']}))" \
  "js:wordwell.setPiece('I','cats',3)" key:Space wait:700 "js:wordwell.gameOver()" "js:localStorage.getItem('wordwell.shop')" wait:1000 key:Enter wait:600 \
  "js:localStorage.setItem('wordwell.shop', JSON.stringify({gems:500,owned:['quake']}))" key:ArrowUp key:ArrowUp key:Space "js:localStorage.getItem('wordwell.shop')"
# A double SPACE on the POUCH slot buys POUCH only, not POUCH II right after.
node tools/shot.mjs $S/shop-double.png --query=gems=1000 "js:wordwell.gameOver()" wait:1000 key:Enter wait:600 key:ArrowUp key:Space key:Space "js:JSON.stringify(wordwell.shop)"
# No red danger walls in the shop; Esc to the title leaves an empty well at LV1.
RED="js:(()=>{const d=document.getElementById('screen').getContext('2d').getImageData(92,0,8,18).data;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<50)return 'red';return 'white'})()"
node tools/shot.mjs $S/shop-danger.png --query=gems=10 "js:wordwell.stone(0,2)" "js:wordwell.gameOver()" wait:1000 key:Enter wait:100 "$RED" wait:150 "$RED" wait:150 "$RED" wait:150 "$RED" \
  key:Escape "js:wordwell.grid.flat().filter(Boolean).length" "js:wordwell.level"
