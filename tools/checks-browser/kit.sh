#!/bin/sh
# EARLY PICK opens a pick screen before the first piece; SECOND LOOK re-deals once; POUCH starts with an item.
S=${TMPDIR:-/tmp}
BUY="js:['pouch','secondlook','earlypick'].forEach(id=>window.WordWellUpgrades.buy(wordwell.shop,id))"
node tools/shot.mjs $S/kit-early.png --query=gems=5000 "$BUY" "js:wordwell.newGame()" "js:wordwell.state" "js:wordwell.piece" "js:wordwell.run.items.length" wait:400
node tools/shot.mjs $S/kit-sink.png --query=gems=5000 "$BUY" "js:wordwell.levelUp([{kind:'perk',id:'sinkhole'},{kind:'perk',id:'feather'},{kind:'perk',id:'sticky'}])" \
  "js:wordwell.newGame()" wait:600 key:Space wait:900 "js:wordwell.state" "js:!!wordwell.piece" "js:wordwell.pendingLevelUps"
node tools/shot.mjs $S/kit-redeal.png --query=gems=5000 "$BUY" "js:wordwell.newGame()" wait:600 \
  "js:JSON.stringify(wordwell.lvl.cards)" key:KeyV "js:JSON.stringify(wordwell.lvl.cards)" "js:wordwell.run.redeal" key:KeyV "js:JSON.stringify(wordwell.lvl.cards)" wait:200
