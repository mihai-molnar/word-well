#!/bin/sh
# Gems: one per cleared tile, banked at game over, saved; ?level=N banks nothing; junk saves load clean.
S=${TMPDIR:-/tmp}
node tools/shot.mjs $S/gems.png "js:wordwell.setPiece('I','cats',3)" key:Space wait:700 "js:wordwell.gems" \
  "js:wordwell.gameOver()" "js:JSON.parse(localStorage.getItem('wordwell.shop'))" wait:1200
node tools/shot.mjs $S/gems-level.png --query=level=3 "js:wordwell.setPiece('I','cats',3)" key:Space wait:700 "js:wordwell.gameOver()" "js:wordwell.shop.gems"
node tools/shot.mjs $S/gems-junk.png "js:localStorage.setItem('wordwell.shop', JSON.stringify({gems:'x',owned:['nope','mirror']}))" "js:location.reload()" wait:800 "js:JSON.stringify(wordwell.shop)"
node tools/shot.mjs $S/gems-sandbox.png --query=gems=500 "js:wordwell.gameOver()" "js:wordwell.shop.gems" "js:localStorage.getItem('wordwell.shop')"
