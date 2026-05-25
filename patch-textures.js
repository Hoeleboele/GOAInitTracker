const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let src = fs.readFileSync(filePath, 'utf8');

const textures = {
  arien: 'waves',     bain: 'scales',     brogan: 'stone',    brynn: 'grid',
  cutter: 'waves',    dodger: 'smoke',    emmit: 'runes',     garrus: 'scales',
  gydion: 'runes',    hanu: 'embers',     ignatia: 'embers',  min: 'embers',
  misa: 'scales',     mortimer: 'smoke',  mrak: 'stone',      nebkher: 'sand',
  razzle: 'diamonds', rowenna: 'stone',   sabina: 'grid',     silverarrow: 'leaves',
  snorri: 'runes',    swift: 'grid',      takahide: 'grid',   tali: 'hex',
  tigerclaw: 'scales',trinkets: 'sand',   ursafar: 'waves',   wasp: 'hex',
  whisper: 'smoke',   widget: 'leaves',   wuk: 'leaves',      xargatha: 'leaves'
};

let count = 0;
for (const [id, tex] of Object.entries(textures)) {
  // Match: accent: '#XXXXXX', optionally followed by special: '...', on the same line
  // Add texture: 'X' right after the accent value (before special or end of accent property)
  const re = new RegExp(`(\\{ id: '${id}',[^\\n]*accent: '[^']+')(,)`, '');
  if (re.test(src)) {
    src = src.replace(re, `$1, texture: '${tex}'$2`);
    count++;
  } else {
    console.error('NOT FOUND for:', id);
  }
}

fs.writeFileSync(filePath, src, 'utf8');
console.log(`Done. Added texture to ${count}/32 characters.`);
