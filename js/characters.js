// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Characters module — character data and lookup functions

window.GoA = window.GoA || {};

// ── Character roster ──────────────────────────────────────────────────────
GoA.CHARACTERS = [
  { id: 'arien', name: 'Arien', subtitle: 'the Tidemaster', accent: '#4A9BB5',
    quotes: ['The tide does not ask permission. Neither do I.', 'Elegance is not weakness. My blade has never missed.', 'Every current bends to me. Can you say the same?', "Steel and sea — I have mastered both.", "They called it noble. I call it winning."] },
  { id: 'bain', name: 'Bain', subtitle: 'the Bounty Hunter', accent: '#B03050',
    quotes: ["There's a price on your head. I already spent it.", 'My sister takes the gold. I take the shot.', 'Run all you want. The bolt is already in the air.', "I never miss twice. I barely miss once.", "The contract is simple: find, follow, finish."] },
  { id: 'brogan', name: 'Brogan', subtitle: 'the Destroyer', accent: '#C88030',
    quotes: ["I don't need to be fast. I just need one swing.", 'Every scar I carry was worth giving.', 'They called me slow. They called me that once.', "The ground shakes when I decide to move.", "Small moves, big problems. Mine are bigger."] },
  { id: 'brynn', name: 'Brynn', subtitle: 'the Seeker', accent: '#C87840',
    quotes: ['The higher the wall, the better the view.', "My picks don't distinguish between ice and armor.", "Every obstacle is an opportunity. I've found many.", "I have climbed walls people thought were ceilings.", "Lock, vault, glacier — same answer, same picks."] },
  { id: 'cutter', name: 'Cutter', subtitle: 'the Sky Pirate', accent: '#3AACCC',
    quotes: ["Gold doesn't spend itself. That's what I'm for.", 'My brother takes the shot. I take everything else.', "The sky is free. Everything on it — that's mine.", "From up here, everything looks like a target. How convenient.", "Call it piracy. I call it redistributing wealth."] },
  { id: 'dodger', name: 'Dodger', subtitle: 'the Warlock', accent: '#A02030',
    quotes: ["I don't bury the dead. I put them to work.", 'Every corpse on this field owes me a favor.', 'Death is just another resource. I waste nothing.', "They fought bravely. Now they fight for me.", "The battlefield never empties. It just changes sides."] },
  { id: 'emmit', name: 'Emmitt', subtitle: 'the Traveler', accent: '#4090D0', special: '⏪',
    quotes: ["I've seen how this ends. Let's try a different path.", "Speed is not running away. It's arriving first.", "Time is a river. I'm the one with the oar.", "You blinked. I went back and already won.", "Every mistake I make, I make sure to unmake."] },
  { id: 'garrus', name: 'Garrus', subtitle: 'the Gladiator', accent: '#C03030',
    quotes: ['The arena remembers every name. Yours ends today.', 'One howl and they scatter. I prefer it when they run.', 'Man and hound, bound by glory. Fear us both.', "We trained for glory. We stayed for the hunt.", "Hound and blade. Neither has ever failed me."] },
  { id: 'gydion', name: 'Gydion', subtitle: 'the Archwizard', accent: '#C8A030',
    quotes: ['Every page of my spellbook has ended a dynasty.', 'You face a library of devastation. Pick your chapter.', 'Wisdom and power are the same word in my book.', "I have forgotten more spells than you will ever learn.", "The arcane does not tire. Neither do I."] },
  { id: 'hanu', name: 'Hanu', subtitle: 'the Trickster', accent: '#CC3828', special: '⚡',
    quotes: ["Blink and you'll miss me. I'll already be there.", "I don't need to hit hard. I just need your plan to fail.", "Alone I'm a nuisance. With friends, I'm a catastrophe.", "My enemies make plans. I make them regret plans.", "Speed and spite — a devastating combination."] },
  { id: 'ignatia', name: 'Ignatia', subtitle: 'the Mad', accent: '#D03020', special: '🌀',
    quotes: ["Order is just chaos that hasn't woken up yet.", 'I rolled the dice. The dice caught fire. Close enough.', 'They said unpredictable like it was an insult.', "The plan was wrong. I improved it by ignoring it.", "I thrive in the unexpected. Luckily, I cause most of it."] },
  { id: 'min', name: 'Min', subtitle: 'the Dragonmonk', accent: '#D05020',
    quotes: ['Dragon, crane, serpent — pick which kills you faster.', 'I fight in stances. You fight in panic. Fair enough.', 'The smoke clears. By then, the mine has already spoken.', "Every stance is a language. I speak all of them.", "The dragon does not explain itself. Neither do I."] },
  { id: 'misa', name: 'Misa', subtitle: 'the Samurai', accent: '#A82840',
    quotes: ["A single breath. A single cut. Then I'm already gone.", 'Honor is not slow. Watch how fast I prove it.', 'They said she can fly. The last thing they ever said.', "The blade remembered the way. My hand simply followed.", "Swift, clean, final. That is my code."] },
  { id: 'mortimer', name: 'Mortimer', subtitle: 'the Awakener', accent: '#C03878',
    quotes: ['Death is not an ending. It is an introduction.', 'My minions march to the beat. Quite literally.', "I don't mourn the fallen. I conduct them.", "Every soldier I lose becomes a soldier I keep.", "The symphony never ends. The performers just rotate."] },
  { id: 'mrak', name: 'Mrak', subtitle: 'the Rockshaper', accent: '#3A9858',
    quotes: ['The stone speaks to me. Today it says: flatten them.', 'I am not slow. I am inevitable.', 'You cannot fight the mountain. You can only survive it.', "Soft things break. I shaped myself from stone.", "Every wall you hide behind was made by someone like me."] },
  { id: 'nebkher', name: 'NebKher', subtitle: 'the Harbinger', accent: '#30A898',
    quotes: ['My mirror walks where I do not. Even I forget which is real.', 'The sands of Atlantis remember my name. You should too.', "Mwahahaha — yes, that's mandatory. Now kneel.", "My reflection has its own plans. We rarely disagree.", "To face me is to face twice the problem."] },
  { id: 'razzle', name: 'Razzle', subtitle: 'the Ringmaster', accent: '#C02840',
    quotes: ["Which one is the real me? Honestly, I've lost track.", 'Step right in — and pray the exit is real.', "Three of me, none of us takes a hit. Marvelous, isn't it?", "The show never stops. The exits, however, do.", "Illusion or reality? I suggest you not find out."] },
  { id: 'rowenna', name: 'Rowenna', subtitle: 'the Vanguard', accent: '#4A6880',
    quotes: ["I go first so others don't have to.", 'There is no glory in a cowardly victory.', "Fair is not weak. Ask anyone I've beaten.", "The shield does not waver. I made sure of that.", "My stand is your shelter. That is enough for me."] },
  { id: 'sabina', name: 'Sabina', subtitle: 'the Commander', accent: '#B87830',
    quotes: ['By the time you see my pistol, the trap is already set.', "Victory is not luck. It's preparation meeting chaos.", "I don't shoot first. I position first. Then I shoot first.", "The battlefield is a board. I have already played my turn.", "Every shot I fire was planned three moves ago."] },
  { id: 'silverarrow', name: 'Silverarrow', subtitle: 'the Pathfinder', accent: '#28A060',
    quotes: ["I've mapped every path. This is the one we take.", 'Distance is my armor. I need no other.', 'They think terrain slows me. Terrain is my shortcut.', "The arrow knows the way. I simply point it there.", "I have never needed to be close to be effective."] },
  { id: 'snorri', name: 'Snorri', subtitle: 'the Runescribe', accent: '#7050B8',
    quotes: ['The rune does not lie. I merely choose which truth to write.', 'Carve the right symbol and reality bends to you.', 'Every ability has a better version. I write the upgrade.', "Write the rune. Rewrite the fight.", "My pen has won more battles than your sword."] },
  { id: 'swift', name: 'Swift', subtitle: 'the Sharpshooter', accent: '#88A030',
    quotes: ['One shot. One truth.', "Far for the rifle, close for the blast. I'm ready either way.", 'The jetpack is for a better angle. Not for running.', "I do not spray and pray. I aim and know.", "Elevation is just another word for advantage."] },
  { id: 'takahide', name: 'Takahide', subtitle: 'the Warlord', accent: '#2898A8',
    quotes: ['Nations kneel. Armies follow. I nap afterward.', 'The sake flows. The tactics hold. Victory is already mine.', "Why rush? I've already won. I'm just being polite.", "Generals worry. I plan. There is a difference.", "The field is mine before the first step is taken."] },
  { id: 'tali', name: 'Tali', subtitle: 'the Spirit Caller', accent: '#40B0D0',
    quotes: ['The spirits do not forgive those who disturb their rest.', 'Every totem I place is a promise. The ice delivers it.', 'The battlefield freezes. The spirits smile. So do I.', "The frozen do not argue. They wait.", "Each totem whispers to the cold. The cold obeys."] },
  { id: 'tigerclaw', name: 'Tigerclaw', subtitle: 'the Cutpurse', accent: '#C03830',
    quotes: ["What's yours is yours — until I blink through you.", "Fastest hands in Atlantis. Not that you'd feel them.", "I was never here. Your coins disagree.", "By the time you feel the loss, I am three streets away.", "They guard their gold like I cannot reach through walls."] },
  { id: 'trinkets', name: 'Trinkets', subtitle: 'the Scavenger', accent: '#3ABAB8',
    quotes: ['Why fight them myself when the turret is right there?', "One guard's trash is my greatest military asset.", 'Dig in. Build up. Let steel do the talking.', "Every battlefield leaves scraps. I leave artillery.", "You brought a weapon. I brought an arsenal I found here."] },
  { id: 'ursafar', name: 'Ursafar', subtitle: 'the Savage', accent: '#2878A8',
    quotes: ['Pain is a teacher. I have graduated.', "I'm the slowest thing on this field. None of that matters.", "Rage is not a weakness. It's the dial turning to eleven.", "I do not need to be the fastest. Just the last one standing.", "Hit me harder. I will hit back harder still."] },
  { id: 'wasp', name: 'Wasp', subtitle: 'the Warmaiden', accent: '#9060C0',
    quotes: ['Stay in the field or leave it. I control both.', 'The boomerang comes back. So does the voltage.', 'They called it reckless. The field was already live.', "The current runs through everything I touch. Careful.", "My range is longer than you think. So is my patience."] },
  { id: 'whisper', name: 'Whisper', subtitle: 'the Outcast', accent: '#901830',
    quotes: ['The wounded cannot hide. Blood has a scent.', 'Run. It only makes the chase worth having.', 'I sentence you — not to death. To running from me.', "Every wound you carry leads me to you.", "The dark does not hide you. It just hides me better."] },
  { id: 'widget', name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#28A890',
    quotes: ["Pyro breathes fire. I aim it. We're very professional.", "Two minds, one plan. Usually Pyro's. I just survive it.", 'The temple walls echo our names. For good reason.', "Widget steers. Pyro inspires. Usually at the same time.", "We have burned our way through worse than this."] },
  { id: 'wuk', name: 'Wuk', subtitle: 'the Grove Guardian', accent: '#C03028',
    quotes: ['The grove does not forgive trespassers. Neither do I.', 'Plant enough trees and the battlefield becomes my home.', 'Every root I grow is a trap waiting to wake.', "The forest remembers every intruder. I help it remember.", "Take one step off the path. My roots will find you."] },
  { id: 'xargatha', name: 'Xargatha', subtitle: 'the Changed', accent: '#38B048',
    quotes: ["Look into my eyes. I promise it won't hurt.", 'I have shed what I was. What remains is power.', 'They came closer when I sang. They stopped when I squeezed.', "I did not choose this form. It chose correctly.", "Sing with me. You will find it very hard to stop."] },
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
