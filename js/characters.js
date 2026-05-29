// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Characters module — character data and lookup functions

window.GoA = window.GoA || {};

// ── Character roster ──────────────────────────────────────────────────────
GoA.CHARACTERS = [
  { id: 'arien', name: 'Arien', subtitle: 'the Tidemaster', accent: '#4A9BB5' },
  { id: 'bain', name: 'Bain', subtitle: 'the Bounty Hunter', accent: '#B03050' },
  { id: 'brogan', name: 'Brogan', subtitle: 'the Destroyer', accent: '#C88030' },
  { id: 'brynn', name: 'Brynn', subtitle: 'the Seeker', accent: '#C87840' },
  { id: 'cutter', name: 'Cutter', subtitle: 'the Sky Pirate', accent: '#3AACCC' },
  { id: 'dodger', name: 'Dodger', subtitle: 'the Warlock', accent: '#A02030' },
  { id: 'emmit', name: 'Emmitt', subtitle: 'the Traveler', special: '⏪', accent: '#4090D0' },
  { id: 'garrus', name: 'Garrus', subtitle: 'the Gladiator', accent: '#C03030' },
  { id: 'gydion', name: 'Gydion', subtitle: 'the Archwizard', accent: '#C8A030' },
  { id: 'hanu', name: 'Hanu', subtitle: 'the Trickster', special: '⚡', accent: '#CC3828' },
  { id: 'ignatia', name: 'Ignatia', subtitle: 'the Mad', special: '🌀', accent: '#D03020' },
  { id: 'min', name: 'Min', subtitle: 'the Dragonmonk', accent: '#D05020' },
  { id: 'misa', name: 'Misa', subtitle: 'the Samurai', accent: '#A82840' },
  { id: 'mortimer', name: 'Mortimer', subtitle: 'the Awakener', accent: '#C03878' },
  { id: 'mrak', name: 'Mrak', subtitle: 'the Rockshaper', accent: '#3A9858' },
  { id: 'nebkher', name: 'NebKher', subtitle: 'the Harbinger', accent: '#30A898' },
  { id: 'razzle', name: 'Razzle', subtitle: 'the Ringmaster', accent: '#C02840' },
  { id: 'rowenna', name: 'Rowenna', subtitle: 'the Vanguard', accent: '#4A6880' },
  { id: 'sabina', name: 'Sabina', subtitle: 'the Commander', accent: '#B87830' },
  { id: 'silverarrow', name: 'Silverarrow', subtitle: 'the Pathfinder', accent: '#28A060' },
  { id: 'snorri', name: 'Snorri', subtitle: 'the Runescribe', accent: '#7050B8' },
  { id: 'swift', name: 'Swift', subtitle: 'the Sharpshooter', accent: '#88A030' },
  { id: 'takahide', name: 'Takahide', subtitle: 'the Warlord', accent: '#2898A8' },
  { id: 'tali', name: 'Tali', subtitle: 'the Spirit Caller', accent: '#40B0D0' },
  { id: 'tigerclaw', name: 'Tigerclaw', subtitle: 'the Cutpurse', accent: '#C03830' },
  { id: 'trinkets', name: 'Trinkets', subtitle: 'the Scavenger', accent: '#3ABAB8' },
  { id: 'ursafar', name: 'Ursafar', subtitle: 'the Savage', accent: '#2878A8' },
  { id: 'wasp', name: 'Wasp', subtitle: 'the Warmaiden', accent: '#9060C0' },
  { id: 'whisper', name: 'Whisper', subtitle: 'the Outcast', accent: '#901830' },
  { id: 'widget', name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#28A890' },
  { id: 'wuk', name: 'Wuk', subtitle: 'the Grove Guardian', accent: '#C03028' },
  { id: 'xargatha', name: 'Xargatha', subtitle: 'the Changed', accent: '#38B048' },
];

// ── Character lookup functions ────────────────────────────────────────────
GoA.charData = function(id) {
  return GoA.CHARACTERS.find(c => c.id === id) || null;
};

GoA.charAvatarPath = function(id) {
  return 'avatars_full/' + (id === 'emmit' ? 'emmitt' : id) + '.webp';
};

GoA.characterInGame = function(char) {
  return Object.values(GoA.state.players).some(p => p.character === char);
};

GoA.charLabel = function(char) {
  const c = GoA.charData(char);
  if (!c) return '';
  return (c.special ? c.special + ' ' : '') + c.name;
};
