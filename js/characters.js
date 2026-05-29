// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Characters module — character data and lookup functions

window.GoA = window.GoA || {};

// ── Character roster ──────────────────────────────────────────────────────
GoA.CHARACTERS = [
  { id: 'arien', name: 'Arien', subtitle: 'the Tidemaster' },
  { id: 'bain', name: 'Bain', subtitle: 'the Bounty Hunter' },
  { id: 'brogan', name: 'Brogan', subtitle: 'the Destroyer' },
  { id: 'brynn', name: 'Brynn', subtitle: 'the Seeker' },
  { id: 'cutter', name: 'Cutter', subtitle: 'the Sky Pirate' },
  { id: 'dodger', name: 'Dodger', subtitle: 'the Warlock' },
  { id: 'emmit', name: 'Emmitt', subtitle: 'the Traveler', special: '⏪' },
  { id: 'garrus', name: 'Garrus', subtitle: 'the Gladiator' },
  { id: 'gydion', name: 'Gydion', subtitle: 'the Archwizard' },
  { id: 'hanu', name: 'Hanu', subtitle: 'the Trickster', special: '⚡' },
  { id: 'ignatia', name: 'Ignatia', subtitle: 'the Mad', special: '🌀' },
  { id: 'min', name: 'Min', subtitle: 'the Dragonmonk' },
  { id: 'misa', name: 'Misa', subtitle: 'the Samurai' },
  { id: 'mortimer', name: 'Mortimer', subtitle: 'the Awakener' },
  { id: 'mrak', name: 'Mrak', subtitle: 'the Rockshaper' },
  { id: 'nebkher', name: 'NebKher', subtitle: 'the Harbinger' },
  { id: 'razzle', name: 'Razzle', subtitle: 'the Ringmaster' },
  { id: 'rowenna', name: 'Rowenna', subtitle: 'the Vanguard' },
  { id: 'sabina', name: 'Sabina', subtitle: 'the Commander' },
  { id: 'silverarrow', name: 'Silverarrow', subtitle: 'the Pathfinder' },
  { id: 'snorri', name: 'Snorri', subtitle: 'the Runescribe' },
  { id: 'swift', name: 'Swift', subtitle: 'the Sharpshooter' },
  { id: 'takahide', name: 'Takahide', subtitle: 'the Warlord' },
  { id: 'tali', name: 'Tali', subtitle: 'the Spirit Caller' },
  { id: 'tigerclaw', name: 'Tigerclaw', subtitle: 'the Cutpurse' },
  { id: 'trinkets', name: 'Trinkets', subtitle: 'the Scavenger' },
  { id: 'ursafar', name: 'Ursafar', subtitle: 'the Savage' },
  { id: 'wasp', name: 'Wasp', subtitle: 'the Warmaiden' },
  { id: 'whisper', name: 'Whisper', subtitle: 'the Outcast' },
  { id: 'widget', name: 'Widget & Pyro', subtitle: 'the Scavenger Duo' },
  { id: 'wuk', name: 'Wuk', subtitle: 'the Grove Guardian' },
  { id: 'xargatha', name: 'Xargatha', subtitle: 'the Changed' },
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
