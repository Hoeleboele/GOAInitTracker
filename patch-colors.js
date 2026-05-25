const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let src = fs.readFileSync(filePath, 'utf8');

const replacements = [
  // id: old => new
  ["{ id: 'arien',       name: 'Arien',        subtitle: 'the Tidemaster',    accent: '#70B858',",
   "{ id: 'arien',       name: 'Arien',        subtitle: 'the Tidemaster',    accent: '#4A9BB5',"],
  ["{ id: 'bain',        name: 'Bain',          subtitle: 'the Bounty Hunter', accent: '#6888C8',",
   "{ id: 'bain',        name: 'Bain',          subtitle: 'the Bounty Hunter', accent: '#B03050',"],
  ["{ id: 'brogan',      name: 'Brogan',        subtitle: 'the Destroyer',     accent: '#B07040',",
   "{ id: 'brogan',      name: 'Brogan',        subtitle: 'the Destroyer',     accent: '#C88030',"],
  ["{ id: 'brynn',       name: 'Brynn',         subtitle: 'the Seeker',        accent: '#D07898',",
   "{ id: 'brynn',       name: 'Brynn',         subtitle: 'the Seeker',        accent: '#C87840',"],
  ["{ id: 'cutter',      name: 'Cutter',        subtitle: 'the Sky Pirate',    accent: '#50A8C0',",
   "{ id: 'cutter',      name: 'Cutter',        subtitle: 'the Sky Pirate',    accent: '#3AACCC',"],
  ["{ id: 'dodger',      name: 'Dodger',        subtitle: 'the Warlock',       accent: '#C0A830',",
   "{ id: 'dodger',      name: 'Dodger',        subtitle: 'the Warlock',       accent: '#A02030',"],
  ["{ id: 'emmit',       name: 'Emmitt',        subtitle: 'the Traveler',      accent: '#8080CC',",
   "{ id: 'emmit',       name: 'Emmitt',        subtitle: 'the Traveler',      accent: '#4090D0',"],
  ["{ id: 'garrus',      name: 'Garrus',        subtitle: 'the Gladiator',     accent: '#9080C0',",
   "{ id: 'garrus',      name: 'Garrus',        subtitle: 'the Gladiator',     accent: '#C03030',"],
  ["{ id: 'gydion',      name: 'Gydion',        subtitle: 'the Archwizard',    accent: '#58C0A0',",
   "{ id: 'gydion',      name: 'Gydion',        subtitle: 'the Archwizard',    accent: '#C8A030',"],
  ["{ id: 'hanu',        name: 'Hanu',          subtitle: 'the Trickster',     accent: '#CC4030',",
   "{ id: 'hanu',        name: 'Hanu',          subtitle: 'the Trickster',     accent: '#CC3828',"],
  ["{ id: 'ignatia',     name: 'Ignatia',       subtitle: 'the Mad',           accent: '#C060D8',",
   "{ id: 'ignatia',     name: 'Ignatia',       subtitle: 'the Mad',           accent: '#D03020',"],
  ["{ id: 'min',         name: 'Min',           subtitle: 'the Dragonmonk',    accent: '#E0B040',",
   "{ id: 'min',         name: 'Min',           subtitle: 'the Dragonmonk',    accent: '#D05020',"],
  ["{ id: 'misa',        name: 'Misa',          subtitle: 'the Samurai',       accent: '#E07070',",
   "{ id: 'misa',        name: 'Misa',          subtitle: 'the Samurai',       accent: '#A82840',"],
  ["{ id: 'mortimer',    name: 'Mortimer',      subtitle: 'the Awakener',      accent: '#70B870',",
   "{ id: 'mortimer',    name: 'Mortimer',      subtitle: 'the Awakener',      accent: '#C03878',"],
  ["{ id: 'mrak',        name: 'Mrak',          subtitle: 'the Rockshaper',    accent: '#C04040',",
   "{ id: 'mrak',        name: 'Mrak',          subtitle: 'the Rockshaper',    accent: '#3A9858',"],
  ["{ id: 'nebkher',     name: 'NebKher',       subtitle: 'the Harbinger',     accent: '#D0A858',",
   "{ id: 'nebkher',     name: 'NebKher',       subtitle: 'the Harbinger',     accent: '#30A898',"],
  ["{ id: 'razzle',      name: 'Razzle',        subtitle: 'the Ringmaster',    accent: '#F04880',",
   "{ id: 'razzle',      name: 'Razzle',        subtitle: 'the Ringmaster',    accent: '#C02840',"],
  ["{ id: 'rowenna',     name: 'Rowenna',       subtitle: 'the Vanguard',      accent: '#D07840',",
   "{ id: 'rowenna',     name: 'Rowenna',       subtitle: 'the Vanguard',      accent: '#4A6880',"],
  ["{ id: 'sabina',      name: 'Sabina',        subtitle: 'the Commander',     accent: '#88B8D8',",
   "{ id: 'sabina',      name: 'Sabina',        subtitle: 'the Commander',     accent: '#B87830',"],
  ["{ id: 'silverarrow', name: 'Silverarrow',   subtitle: 'the Pathfinder',    accent: '#B8D0E8',",
   "{ id: 'silverarrow', name: 'Silverarrow',   subtitle: 'the Pathfinder',    accent: '#28A060',"],
  ["{ id: 'snorri',      name: 'Snorri',        subtitle: 'the Runescribe',    accent: '#A8C0D8',",
   "{ id: 'snorri',      name: 'Snorri',        subtitle: 'the Runescribe',    accent: '#7050B8',"],
  ["{ id: 'swift',       name: 'Swift',         subtitle: 'the Sharpshooter',  accent: '#78D898',",
   "{ id: 'swift',       name: 'Swift',         subtitle: 'the Sharpshooter',  accent: '#88A030',"],
  ["{ id: 'takahide',    name: 'Takahide',      subtitle: 'the Warlord',       accent: '#C89060',",
   "{ id: 'takahide',    name: 'Takahide',      subtitle: 'the Warlord',       accent: '#2898A8',"],
  ["{ id: 'tali',        name: 'Tali',          subtitle: 'the Spirit Caller', accent: '#D8A0C0',",
   "{ id: 'tali',        name: 'Tali',          subtitle: 'the Spirit Caller', accent: '#40B0D0',"],
  ["{ id: 'tigerclaw',   name: 'Tigerclaw',     subtitle: 'the Cutpurse',      accent: '#E8A030',",
   "{ id: 'tigerclaw',   name: 'Tigerclaw',     subtitle: 'the Cutpurse',      accent: '#C03830',"],
  ["{ id: 'trinkets',    name: 'Trinkets',      subtitle: 'the Scavenger',     accent: '#C8D060',",
   "{ id: 'trinkets',    name: 'Trinkets',      subtitle: 'the Scavenger',     accent: '#3ABAB8',"],
  ["{ id: 'ursafar',     name: 'Ursafar',       subtitle: 'the Savage',        accent: '#A87840',",
   "{ id: 'ursafar',     name: 'Ursafar',       subtitle: 'the Savage',        accent: '#2878A8',"],
  ["{ id: 'wasp',        name: 'Wasp',          subtitle: 'the Warmaiden',     accent: '#88C840',",
   "{ id: 'wasp',        name: 'Wasp',          subtitle: 'the Warmaiden',     accent: '#9060C0',"],
  ["{ id: 'whisper',     name: 'Whisper',       subtitle: 'the Outcast',       accent: '#A888D0',",
   "{ id: 'whisper',     name: 'Whisper',       subtitle: 'the Outcast',       accent: '#901830',"],
  ["{ id: 'widget',      name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#58C8E0',",
   "{ id: 'widget',      name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#28A890',"],
  ["{ id: 'wuk',         name: 'Wuk',           subtitle: 'the Grove Guardian',accent: '#E06840',",
   "{ id: 'wuk',         name: 'Wuk',           subtitle: 'the Grove Guardian',accent: '#C03028',"],
  ["{ id: 'xargatha',    name: 'Xargatha',      subtitle: 'the Changed',       accent: '#B04060',",
   "{ id: 'xargatha',    name: 'Xargatha',      subtitle: 'the Changed',       accent: '#38B048',"],
];

let count = 0;
for (const [oldStr, newStr] of replacements) {
  if (src.includes(oldStr)) {
    src = src.replace(oldStr, newStr);
    count++;
  } else {
    console.error('NOT FOUND:', oldStr.substring(0, 60));
  }
}

fs.writeFileSync(filePath, src, 'utf8');
console.log(`Done. Applied ${count}/${replacements.length} replacements.`);
