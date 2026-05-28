// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
(() => {

  // ── State ──────────────────────────────────────────────────────────────
  let gameMode    = null;   // 'host' | 'player'
  let peer        = null;
  let hostConn    = null;   // player → host
  let playerConns = {};     // host: { peerId: DataConnection }
  let socket      = null;   // Socket.IO client
  const SERVER_URL = 'https://goainittracker.onrender.com';

  let sessionCode = '';
  let myId        = '';
  let myName      = '';
  let myTeam      = '';         // 'blue' | 'orange'
  let myCharacter  = '';         // any character id from CHARACTERS, or ''
  let hostTokenChoice  = 'blue'; // host only: which team starts with token
  let hostManagesTurns = false;   // host only: host manually ends each turn

  let state = {
    phase:            'lobby',  // 'lobby'|'initiative'|'turns'|'round-complete'
    players:          {},       // { [id]: Player }
    turns:            [],
    currentTurnIndex: 0,
    initiativeToken:  'blue',   // 'blue' | 'orange'
    mixedTies:        {},       // { [initiative]: { bluePool, orangePool } }
    hostManagesTurns: false,    // host manages turn endings on behalf of players
    reverseInitiative: false,   // Emmit: sort low→high instead of high→low
  };

  // initiative pad state
  let initValue  = '';
  let initLocked = false;
  let lastNotifiedTurnIndex  = -1; // tracks last turn we fired the notification for
  let usedAbilitiesThisTurn  = new Set(); // abilities used this turn (each can only fire once)

  // ── Offline mode state ───────────────────────────────────────
  let offlinePlayers     = [];     // [{ id, name, team, initiative }]
  let offlineInitIdx     = 0;      // which player is currently entering initiative
  let offlineTokenChoice = 'blue';

  // ── DOM helpers ────────────────────────────────────────────────────────
  const $  = id  => document.getElementById(id);
  const $$ = sel => document.querySelector(sel);

  // ── Utilities ──────────────────────────────────────────────────────────
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }

  function genId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ── Landing status ──────────────────────────────────────────────────────
  function setStatus(msg, isErr = false) {
    const el = $('landingStatus');
    el.textContent = msg;
    el.className   = 'status-msg' + (isErr ? ' err' : '');
  }

  // ── Reconnect helpers ────────────────────────────────────────────────────
  const RECONNECT_KEY     = 'goa_reconnect';
  const RECONNECT_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours
  // How long a disconnected player still blocks the round (ms)
  const DISCONNECT_GRACE_MS = 5 * 60 * 1000; // 5 minutes
  let disconnectTimer = null;

  function formatMs(ms) {
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function saveReconnectData(savedState) {
    try {
      const existing = loadReconnectData() || {};
      const data = {
        ...existing,
        role:      gameMode === 'host' ? 'host' : 'player',
        code:      sessionCode,
        name:      myName,
        team:      myTeam,
        character: myCharacter,
        myId:      myId,
        timestamp: Date.now(),
      };
      if (savedState !== undefined) data.savedState = savedState;
      localStorage.setItem(RECONNECT_KEY, JSON.stringify(data));
      updateReconnectButton();
    } catch (_) {}
  }

  function clearReconnectData() {
    try { localStorage.removeItem(RECONNECT_KEY); } catch (_) {}
    updateReconnectButton();
  }

  function loadReconnectData() {
    try {
      const raw = localStorage.getItem(RECONNECT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > RECONNECT_MAX_AGE) { clearReconnectData(); return null; }
      return data;
    } catch (_) { return null; }
  }

  function updateReconnectButton() {
    const btn  = $('btnReconnect');
    if (!btn) return;
    const data = loadReconnectData();
    if (!data) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.textContent = data.role === 'host'
      ? `↩ Reconnect as Host (${data.code})`
      : `↩ Rejoin Session (${data.code})`;
  }

  function doReconnect() {
    const data = loadReconnectData();
    if (!data) return;

    myName      = data.name      || '';
    myTeam      = data.team      || '';
    myCharacter = data.character || '';
    myId        = data.myId      || '';

    // The server now uses Socket.IO (not PeerJS). Reuse Socket.IO flow for reconnects.
    if (data.role === 'host') {
      setStatus('Reconnecting session…');
      gameMode = 'host';

      // Restore saved game state (if any) and mark other players disconnected
      if (data.savedState) {
        state = {
          phase:             data.savedState.phase            || 'lobby',
          players:           data.savedState.players          || {},
          turns:             data.savedState.turns            || [],
          currentTurnIndex:  data.savedState.currentTurnIndex || 0,
          initiativeToken:   data.savedState.initiativeToken  || 'blue',
          mixedTies:         data.savedState.mixedTies        || {},
          hostManagesTurns:  data.savedState.hostManagesTurns || false,
          reverseInitiative: data.savedState.reverseInitiative || false,
        };
        usedAbilitiesThisTurn = new Set(data.savedState.usedAbilities || []);
        Object.keys(state.players).forEach(id => {
          if (id !== myId) state.players[id] = { ...state.players[id], isConnected: false };
        });
      }

      // Use Socket.IO host flow and reuse saved session code / IDs
      try { if (socket && socket.connected) socket.disconnect(); } catch (_) {}
      // tryHost will detect restore mode by seeing existing state and myId
      tryHost(data.code, { restore: true });
      // showApp/render will be driven from tryHost's 'host_created' handler

    } else {
      // Player reconnecting via Socket.IO
      setStatus('Reconnecting to session…');
      gameMode = 'player';

      try { if (socket && socket.connected) socket.disconnect(); } catch (_) {}
      // joinGame will reuse `myId` when provided (opts.reuseId)
      joinGame(data.code, { reuseId: true });
    }
  }

  // ── Character helpers ────────────────────────────────────────────────────
    const CHARACTERS = [
    { id: 'arien',       name: 'Arien',        subtitle: 'the Tidemaster',    accent: '#4A9BB5',
      quotes: ['The tide does not ask permission. Neither do I.', 'Elegance is not weakness. My blade has never missed.', 'Every current bends to me. Can you say the same?', "Steel and sea — I have mastered both.", "They called it noble. I call it winning."] },
    { id: 'bain',        name: 'Bain',          subtitle: 'the Bounty Hunter', accent: '#B03050',
      quotes: ["There's a price on your head. I already spent it.", 'My sister takes the gold. I take the shot.', 'Run all you want. The bolt is already in the air.', "I never miss twice. I barely miss once.", "The contract is simple: find, follow, finish."] },
    { id: 'brogan',      name: 'Brogan',        subtitle: 'the Destroyer',     accent: '#C88030',
      quotes: ["I don't need to be fast. I just need one swing.", 'Every scar I carry was worth giving.', 'They called me slow. They called me that once.', "The ground shakes when I decide to move.", "Small moves, big problems. Mine are bigger."] },
    { id: 'brynn',       name: 'Brynn',         subtitle: 'the Seeker',        accent: '#C87840',
      quotes: ['The higher the wall, the better the view.', "My picks don't distinguish between ice and armor.", "Every obstacle is an opportunity. I've found many.", "I have climbed walls people thought were ceilings.", "Lock, vault, glacier — same answer, same picks."] },
    { id: 'cutter',      name: 'Cutter',        subtitle: 'the Sky Pirate',    accent: '#3AACCC',
      quotes: ["Gold doesn't spend itself. That's what I'm for.", 'My brother takes the shot. I take everything else.', "The sky is free. Everything on it — that's mine.", "From up here, everything looks like a target. How convenient.", "Call it piracy. I call it redistributing wealth."] },
    { id: 'dodger',      name: 'Dodger',        subtitle: 'the Warlock',       accent: '#A02030',
      quotes: ["I don't bury the dead. I put them to work.", 'Every corpse on this field owes me a favor.', 'Death is just another resource. I waste nothing.', "They fought bravely. Now they fight for me.", "The battlefield never empties. It just changes sides."] },
    { id: 'emmit',       name: 'Emmitt',        subtitle: 'the Traveler',      accent: '#4090D0', special: '⏪',
      quotes: ["I've seen how this ends. Let's try a different path.", "Speed is not running away. It's arriving first.", "Time is a river. I'm the one with the oar.", "You blinked. I went back and already won.", "Every mistake I make, I make sure to unmake."] },
    { id: 'garrus',      name: 'Garrus',        subtitle: 'the Gladiator',     accent: '#C03030',
      quotes: ['The arena remembers every name. Yours ends today.', 'One howl and they scatter. I prefer it when they run.', 'Man and hound, bound by glory. Fear us both.', "We trained for glory. We stayed for the hunt.", "Hound and blade. Neither has ever failed me."] },
    { id: 'gydion',      name: 'Gydion',        subtitle: 'the Archwizard',    accent: '#C8A030',
      quotes: ['Every page of my spellbook has ended a dynasty.', 'You face a library of devastation. Pick your chapter.', 'Wisdom and power are the same word in my book.', "I have forgotten more spells than you will ever learn.", "The arcane does not tire. Neither do I."] },
    { id: 'hanu',        name: 'Hanu',          subtitle: 'the Trickster',     accent: '#CC3828', special: '⚡',
      quotes: ["Blink and you'll miss me. I'll already be there.", "I don't need to hit hard. I just need your plan to fail.", "Alone I'm a nuisance. With friends, I'm a catastrophe.", "My enemies make plans. I make them regret plans.", "Speed and spite — a devastating combination."] },
    { id: 'ignatia',     name: 'Ignatia',       subtitle: 'the Mad',           accent: '#D03020', special: '🌀',
      quotes: ["Order is just chaos that hasn't woken up yet.", 'I rolled the dice. The dice caught fire. Close enough.', 'They said unpredictable like it was an insult.', "The plan was wrong. I improved it by ignoring it.", "I thrive in the unexpected. Luckily, I cause most of it."] },
    { id: 'min',         name: 'Min',           subtitle: 'the Dragonmonk',    accent: '#D05020',
      quotes: ['Dragon, crane, serpent — pick which kills you faster.', 'I fight in stances. You fight in panic. Fair enough.', 'The smoke clears. By then, the mine has already spoken.', "Every stance is a language. I speak all of them.", "The dragon does not explain itself. Neither do I."] },
    { id: 'misa',        name: 'Misa',          subtitle: 'the Samurai',       accent: '#A82840',
      quotes: ["A single breath. A single cut. Then I'm already gone.", 'Honor is not slow. Watch how fast I prove it.', 'They said she can fly. The last thing they ever said.', "The blade remembered the way. My hand simply followed.", "Swift, clean, final. That is my code."] },
    { id: 'mortimer',    name: 'Mortimer',      subtitle: 'the Awakener',      accent: '#C03878',
      quotes: ['Death is not an ending. It is an introduction.', 'My minions march to the beat. Quite literally.', "I don't mourn the fallen. I conduct them.", "Every soldier I lose becomes a soldier I keep.", "The symphony never ends. The performers just rotate."] },
    { id: 'mrak',        name: 'Mrak',          subtitle: 'the Rockshaper',    accent: '#3A9858',
      quotes: ['The stone speaks to me. Today it says: flatten them.', 'I am not slow. I am inevitable.', 'You cannot fight the mountain. You can only survive it.', "Soft things break. I shaped myself from stone.", "Every wall you hide behind was made by someone like me."] },
    { id: 'nebkher',     name: 'NebKher',       subtitle: 'the Harbinger',     accent: '#30A898',
      quotes: ['My mirror walks where I do not. Even I forget which is real.', 'The sands of Atlantis remember my name. You should too.', "Mwahahaha — yes, that's mandatory. Now kneel.", "My reflection has its own plans. We rarely disagree.", "To face me is to face twice the problem."] },
    { id: 'razzle',      name: 'Razzle',        subtitle: 'the Ringmaster',    accent: '#C02840',
      quotes: ["Which one is the real me? Honestly, I've lost track.", 'Step right in — and pray the exit is real.', "Three of me, none of us takes a hit. Marvelous, isn't it?", "The show never stops. The exits, however, do.", "Illusion or reality? I suggest you not find out."] },
    { id: 'rowenna',     name: 'Rowenna',       subtitle: 'the Vanguard',      accent: '#4A6880',
      quotes: ["I go first so others don't have to.", 'There is no glory in a cowardly victory.', "Fair is not weak. Ask anyone I've beaten.", "The shield does not waver. I made sure of that.", "My stand is your shelter. That is enough for me."] },
    { id: 'sabina',      name: 'Sabina',        subtitle: 'the Commander',     accent: '#B87830',
      quotes: ['By the time you see my pistol, the trap is already set.', "Victory is not luck. It's preparation meeting chaos.", "I don't shoot first. I position first. Then I shoot first.", "The battlefield is a board. I have already played my turn.", "Every shot I fire was planned three moves ago."] },
    { id: 'silverarrow', name: 'Silverarrow',   subtitle: 'the Pathfinder',    accent: '#28A060',
      quotes: ["I've mapped every path. This is the one we take.", 'Distance is my armor. I need no other.', 'They think terrain slows me. Terrain is my shortcut.', "The arrow knows the way. I simply point it there.", "I have never needed to be close to be effective."] },
    { id: 'snorri',      name: 'Snorri',        subtitle: 'the Runescribe',    accent: '#7050B8',
      quotes: ['The rune does not lie. I merely choose which truth to write.', 'Carve the right symbol and reality bends to you.', 'Every ability has a better version. I write the upgrade.', "Write the rune. Rewrite the fight.", "My pen has won more battles than your sword."] },
    { id: 'swift',       name: 'Swift',         subtitle: 'the Sharpshooter',  accent: '#88A030',
      quotes: ['One shot. One truth.', "Far for the rifle, close for the blast. I'm ready either way.", 'The jetpack is for a better angle. Not for running.', "I do not spray and pray. I aim and know.", "Elevation is just another word for advantage."] },
    { id: 'takahide',    name: 'Takahide',      subtitle: 'the Warlord',       accent: '#2898A8',
      quotes: ['Nations kneel. Armies follow. I nap afterward.', 'The sake flows. The tactics hold. Victory is already mine.', "Why rush? I've already won. I'm just being polite.", "Generals worry. I plan. There is a difference.", "The field is mine before the first step is taken."] },
    { id: 'tali',        name: 'Tali',          subtitle: 'the Spirit Caller', accent: '#40B0D0',
      quotes: ['The spirits do not forgive those who disturb their rest.', 'Every totem I place is a promise. The ice delivers it.', 'The battlefield freezes. The spirits smile. So do I.', "The frozen do not argue. They wait.", "Each totem whispers to the cold. The cold obeys."] },
    { id: 'tigerclaw',   name: 'Tigerclaw',     subtitle: 'the Cutpurse',      accent: '#C03830',
      quotes: ["What's yours is yours — until I blink through you.", "Fastest hands in Atlantis. Not that you'd feel them.", "I was never here. Your coins disagree.", "By the time you feel the loss, I am three streets away.", "They guard their gold like I cannot reach through walls."] },
    { id: 'trinkets',    name: 'Trinkets',      subtitle: 'the Scavenger',     accent: '#3ABAB8',
      quotes: ['Why fight them myself when the turret is right there?', "One guard's trash is my greatest military asset.", 'Dig in. Build up. Let steel do the talking.', "Every battlefield leaves scraps. I leave artillery.", "You brought a weapon. I brought an arsenal I found here."] },
    { id: 'ursafar',     name: 'Ursafar',       subtitle: 'the Savage',        accent: '#2878A8',
      quotes: ['Pain is a teacher. I have graduated.', "I'm the slowest thing on this field. None of that matters.", "Rage is not a weakness. It's the dial turning to eleven.", "I do not need to be the fastest. Just the last one standing.", "Hit me harder. I will hit back harder still."] },
    { id: 'wasp',        name: 'Wasp',          subtitle: 'the Warmaiden',     accent: '#9060C0',
      quotes: ['Stay in the field or leave it. I control both.', 'The boomerang comes back. So does the voltage.', 'They called it reckless. The field was already live.', "The current runs through everything I touch. Careful.", "My range is longer than you think. So is my patience."] },
    { id: 'whisper',     name: 'Whisper',       subtitle: 'the Outcast',       accent: '#901830',
      quotes: ['The wounded cannot hide. Blood has a scent.', 'Run. It only makes the chase worth having.', 'I sentence you — not to death. To running from me.', "Every wound you carry leads me to you.", "The dark does not hide you. It just hides me better."] },
    { id: 'widget',      name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#28A890',
      quotes: ["Pyro breathes fire. I aim it. We're very professional.", "Two minds, one plan. Usually Pyro's. I just survive it.", 'The temple walls echo our names. For good reason.', "Widget steers. Pyro inspires. Usually at the same time.", "We have burned our way through worse than this."] },
    { id: 'wuk',         name: 'Wuk',           subtitle: 'the Grove Guardian',accent: '#C03028',
      quotes: ['The grove does not forgive trespassers. Neither do I.', 'Plant enough trees and the battlefield becomes my home.', 'Every root I grow is a trap waiting to wake.', "The forest remembers every intruder. I help it remember.", "Take one step off the path. My roots will find you."] },
    { id: 'xargatha',    name: 'Xargatha',      subtitle: 'the Changed',       accent: '#38B048',
      quotes: ["Look into my eyes. I promise it won't hurt.", 'I have shed what I was. What remains is power.', 'They came closer when I sang. They stopped when I squeezed.', "I did not choose this form. It chose correctly.", "Sing with me. You will find it very hard to stop."] },
  ];

  function charData(id) {
    return CHARACTERS.find(c => c.id === id) || null;
  }

  function charAvatarPath(id) {
    return 'avatars_full/' + (id === 'emmit' ? 'emmitt' : id) + '.webp';
  }

  function characterInGame(char) {
    return Object.values(state.players).some(p => p.character === char);
  }

  function charLabel(char) {
    const c = charData(char);
    if (!c) return '';
    return (c.special ? c.special + ' ' : '') + c.name;
  }

  // ── Show / hide ─────────────────────────────────────────────────────────
  function showLanding() {
    $('landing').style.display = 'flex';
    $('app').style.display     = 'none';
    $('joinForm').style.display        = 'none';
    $('landingMode').style.display     = 'flex';
    $('landingMain').style.display     = 'none';
    $('viewCharPick').style.display    = 'none';
    $('codeInput').value = '';
    // Reset team button visual state to match the (cleared) myTeam variable
    $('btnTeamBlue').classList.remove('selected');
    $('btnTeamOrange').classList.remove('selected');
    setStatus('');
  }

  function showApp() {
    $('landing').style.display = 'none';
    $('app').style.display     = 'flex';
  }

  const VIEWS = ['viewOfflineSetup','viewLobbyHost','viewLobbyPlayer','viewInitiative','viewTurns','viewRoundComplete'];
  function show(id) {
    VIEWS.forEach(v => $(v).style.display = v === id ? (v === 'viewInitiative' ? 'flex' : 'block') : 'none');
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function render() {
    const players = Object.values(state.players);
    $('btnLeave').textContent = gameMode === 'offline' ? 'Quit' : gameMode === 'host' ? 'Close' : 'Leave';

    // Token banner — visible whenever a game is in progress
    const tb  = $('tokenBanner');
    const tok = state.initiativeToken || 'blue';
    if (state.phase !== 'lobby' && state.phase !== 'offline-setup') {
      tb.className   = `token-banner ${tok}`;
      tb.textContent = tok === 'blue' ? '💎 Blue has the initiative token' : '🔥 Orange has the initiative token';
      tb.style.display = 'block';
    } else {
      tb.style.display = 'none';
    }

    switch (state.phase) {

      case 'offline-setup':
        show('viewOfflineSetup');
        renderOfflineSetup();
        break;

      case 'lobby':
        if (gameMode === 'host') {
          show('viewLobbyHost');
          $('lobbyCode').textContent = sessionCode;
          renderPlayers('lobbyPlayers', players);
          const others = players.filter(p => p.id !== myId && p.isConnected);
          $('btnStartGame').disabled = others.length === 0;
          $('startHint').textContent = others.length === 0
            ? 'Waiting for players to join…'
            : `${others.length} player${others.length !== 1 ? 's' : ''} ready — start when ready!`;
        } else {
          show('viewLobbyPlayer');
          $('lobbyPlayerCode').innerHTML = `Session <strong>${esc(sessionCode)}</strong>`;
          renderPlayers('lobbyPlayerPlayers', players);
        }
        break;

      case 'initiative':
        show('viewInitiative');
        applyCharacterTheme();
        updatePad();
        if (gameMode === 'offline') {
          const op = offlinePlayers[offlineInitIdx];
          $('offlineInitFor').innerHTML = op
            ? `<span class="team-dot ${op.team}"></span> <strong>${esc(op.name)}</strong>  ·  <span style="font-size:13px">${offlineInitIdx + 1} / ${offlinePlayers.length}</span>`
            : '';
          $('offlineInitFor').style.display = 'block';
          $('initiativePlayers').style.display = 'none';
          const offlineEmmit = op && op.character === 'emmit';
          $('abilityReverseTime').style.display = offlineEmmit ? 'block' : 'none';
        } else {
          $('offlineInitFor').style.display = 'none';
          $('initiativePlayers').style.display = '';
          renderPlayers('initiativePlayers', players);
          const showRevTime = myCharacter === 'emmit'
            || (gameMode === 'host' && characterInGame('emmit'));
          $('abilityReverseTime').style.display = showRevTime ? 'block' : 'none';
        }
        break;

      case 'turns': {
        show('viewTurns');
        renderTurnList('turnsList');
        renderAbilities();
        break;
      }

      case 'round-complete':
        show('viewRoundComplete');
        renderTurnList('roundSummary');
        $('abilityPanel').style.display  = 'none';
        $('hurryUpPanel').style.display  = 'none';
        $('btnNewRound').style.display  = (gameMode === 'host' || gameMode === 'offline') ? 'block' : 'none';
        $('newRoundHint').style.display = (gameMode === 'host' || gameMode === 'offline') ? 'none'  : 'block';
        break;
    }
  }

  function renderPlayers(containerId, players) {
    const el = $(containerId);
    if (!players.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:8px 0;">No players yet…</div>';
      return;
    }
    const canKill = (gameMode === 'host' || gameMode === 'offline') && state.phase === 'turns';
    el.innerHTML = players.map(p => {
      const isMe = p.id === myId;
      const disc = !p.isConnected;
      const statusClass = disc ? 'pstatus-disconnected'
        : p.submissionStatus === 'locked'    ? 'pstatus-locked'
        : p.submissionStatus === 'submitted' ? 'pstatus-submitted'
        :                                      'pstatus-waiting';
      let statusText = '';
      if (disc) {
        let prefix = '';
        if (p.disconnectedAt && gameMode === 'host') {
          const remaining = DISCONNECT_GRACE_MS - (Date.now() - p.disconnectedAt);
          if (remaining > 0) prefix = `(${formatMs(remaining)}) `;
        }
        statusText = `${prefix}Disconnected`;
      } else if (p.submissionStatus === 'locked') {
        statusText = 'Locked ✓';
      } else if (p.submissionStatus === 'submitted') {
        statusText = 'Entered…';
      } else {
        statusText = 'Waiting…';
      }
      const teamDot = p.team ? `<span class="team-dot ${p.team}"></span>` : '';
      const charTag = p.character ? `<span class="char-badge">· ${charLabel(p.character)}</span>` : '';
      return `
        <div class="player-row${isMe ? ' is-me' : ''}">
          <span class="player-name">
            ${teamDot}${esc(p.name)}${charTag}${isMe ? '<span class="me-tag">(you)</span>' : ''}
          </span>
          <span class="pstatus ${statusClass}">${statusText}</span>
          ${canKill && !isMe ? `<button class="btn btn-sm btn-ghost btn-kill-player" data-id="${p.id}" title="Remove from this round">✖</button>` : ''}
        </div>`;
    }).join('');

    // Manage a periodic re-render while any disconnected players remain within the grace window
    const now = Date.now();
    const needsTimer = Object.values(state.players).some(pp => pp.disconnectedAt && (now - pp.disconnectedAt) < DISCONNECT_GRACE_MS);
    if (needsTimer && !disconnectTimer) {
      disconnectTimer = setInterval(() => { try { render(); } catch (_) {} }, 1000);
    } else if (!needsTimer && disconnectTimer) {
      clearInterval(disconnectTimer); disconnectTimer = null;
    }

    // Wire kill buttons for host/offline host
    if (canKill) {
      el.querySelectorAll('.btn-kill-player').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = btn.dataset.id;
          const name = (state.players[id] && state.players[id].name) || 'Player';
          if (!confirm(`Remove ${name} from this round?`)) return;
          if (gameMode === 'host' || gameMode === 'offline') {
            killPlayerThisRound(id);
          } else {
            // send request to host (shouldn't reach here for non-hosts)
            sendToHost({ type: 'kill_player', payload: { targetId: id } });
          }
        });
      });
    }
  }

  // ── Turn notification (sound + vibration) ──────────────────────────────
  function notifyMyTurn() {
    // Double-beep using Web Audio API (no external files needed)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(offset => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } catch (_) {}
    // Haptic feedback on supported devices (Android Chrome)
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }

  function renderTurnList(containerId) {
    const el = $(containerId);
    if (!state.turns.length) { el.innerHTML = ''; return; }

    el.innerHTML = state.turns.map(t => {
      const cls         = t.status === 'active' ? ' active' : t.status === 'completed' ? ' completed' : '';
      const players     = t.players || [];
      const isMixedSlot = !!t.mixedTieSlot;
      const isSimul     = !isMixedSlot && players.length > 1;
      const teamCls     = isMixedSlot ? ` team-${t.teamTurn}`
                        : (players[0] && players[0].team) ? ` team-${players[0].team}` : '';

      // Resolve primary character avatar for the ghost background
      const getAvatar = id => { const c = state.players[id]; return c && c.character ? charAvatarPath(c.character) : ''; };
      let bgAvatar = '';
      if (isMixedSlot) {
        const tie = state.mixedTies && state.mixedTies[t.initiative];
        const pool = tie && tie[`${t.teamTurn}Pool`];
        bgAvatar = pool && pool[0] ? getAvatar(pool[0].id) : '';
      } else if (players.length > 0) {
        bgAvatar = getAvatar(players[0].id);
      }
      const avatarAttr = bgAvatar ? ` style="--avatar-url: url('${bgAvatar}')"` : '';
      let names;
      if (isMixedSlot) {
        const tie = t.status !== 'completed' && state.mixedTies && state.mixedTies[t.initiative];
        if (tie) {
          const mkTeam = (pool, key) => pool.length
            ? `<span class="team-dot ${key}"></span>${pool.map(p => esc(p.name)).join(', ')}` : null;
          const blueHtml   = mkTeam(tie.bluePool,   'blue');
          const orangeHtml = mkTeam(tie.orangePool, 'orange');
          const activeHtml  = t.teamTurn === 'blue' ? blueHtml   : orangeHtml;
          const waitingHtml = t.teamTurn === 'blue' ? orangeHtml : blueHtml;
          const parts = [];
          if (activeHtml)  parts.push(activeHtml + ' <em>(any&nbsp;1)</em>');
          if (waitingHtml) parts.push(waitingHtml);
          names = parts.join(' <span class="tie-vs">vs</span> ');
        } else {
          names = players.map(p => esc(p.name)).join(' / ') + ' <em>(any&nbsp;1)</em>';
        }
      } else {
        names = players.map(p => esc(p.name)).join(' & ');
      }
      const badge       = t.status === 'active' ? '<span class="turn-badge">▶ Active</span>' : '';
      const subLabel    = isMixedSlot ? ' · Tie' : isSimul ? ' · Simultaneous' : '';
      let waitInfo      = '';
      if (t.status === 'active' && isSimul) {
        const done = (t.doneIds || []).length;
        waitInfo = `<div class="turn-wait">Simultaneous — ${done}/${players.length} ready</div>`;
      }
      return `
        <div class="turn-row${cls}${teamCls}"${avatarAttr}>
          <div class="turn-order">${t.order}</div>
          <div class="turn-info">
            <div class="turn-name">${names}</div>
            <div class="turn-initiative">Initiative ${t.initiative}${subLabel}</div>
            ${waitInfo}
          </div>
          ${badge}
        </div>`;
    }).join('');

    if (containerId === 'turnsList') {
      const active       = state.turns[state.currentTurnIndex];
      const hostManaged  = state.hostManagesTurns && gameMode === 'host';
      const isMyTurn     = (gameMode === 'offline' || hostManaged)
        ? !!active
        : active && (active.players || []).some(p => p.id === myId);
      const iAlreadyDone = (gameMode !== 'offline' && !hostManaged) && active && (active.doneIds || []).includes(myId);
      // Update End Turn button label
      const btn = $('btnEndTurn');
      const selfManaged  = gameMode === 'offline' || hostManaged;
      if (selfManaged && active && active.mixedTieSlot) {
        btn.textContent = `End ${active.teamTurn === 'blue' ? '💎 Blue' : '🔥 Orange'} Team’s Turn`;
      } else {
        btn.textContent = selfManaged ? 'End Turn' : 'End My Turn';
      }
      $('turnActions').style.display = (isMyTurn && !iAlreadyDone) ? 'block' : 'none';
      // Notify once per turn when it first becomes this player’s move (skip in offline)
      if (gameMode !== 'offline' && !hostManaged && isMyTurn && !iAlreadyDone && state.currentTurnIndex !== lastNotifiedTurnIndex) {
        lastNotifiedTurnIndex = state.currentTurnIndex;
        notifyMyTurn();
      }
      const waitEl = $('turnWaiting');
      if (isMyTurn && iAlreadyDone && !active.mixedTieSlot) {
        const waiting = (active.players || [])
          .filter(p => p.id !== myId && !(active.doneIds || []).includes(p.id))
          .map(p => esc(p.name));
        waitEl.textContent  = `Waiting for ${waiting.join(' & ')}…`;
        waitEl.style.display = 'block';
      } else {
        waitEl.style.display = 'none';
      }
    }
  }

  // ── Offline Setup Renderer ──────────────────────────────────────────────
  function renderOfflineSetup() {
    const list = $('offlinePlayerList');
    list.innerHTML = offlinePlayers.map((p, i) => `
      <div class="offline-player-row">
        <input class="offline-name-input" type="text" value="${esc(p.name)}" maxlength="20"
               placeholder="Player ${i + 1}" data-idx="${i}" autocomplete="off" />
        <div class="offline-team-toggle">
          <button class="offline-team-btn${p.team === 'blue'   ? ' active' : ''}" data-idx="${i}" data-team="blue">💎</button>
          <button class="offline-team-btn${p.team === 'orange' ? ' active' : ''}" data-idx="${i}" data-team="orange">🔥</button>
        </div>
        <select class="offline-char-select" data-idx="${i}">
          <option value="">—</option>
          <option value="emmit"      ${p.character === 'emmit'      ? 'selected' : ''}>⏪ Emmit</option>
          <option value="hanu"       ${p.character === 'hanu'       ? 'selected' : ''}>⚡ Hanu</option>
          <option value="ignatia"    ${p.character === 'ignatia'    ? 'selected' : ''}>🌀 Ignatia</option>
          <option value="tali"       ${p.character === 'tali'       ? 'selected' : ''}>🧊 Tali</option>
          <option value="tigerclaw"  ${p.character === 'tigerclaw'  ? 'selected' : ''}>☠️ Tigerclaw</option>
          <option value="takahide"   ${p.character === 'takahide'   ? 'selected' : ''}>⚔️ Takahide</option>
        </select>
        <button class="btn-remove-offline" data-idx="${i}" title="Remove">&#x2715;</button>
      </div>
    `).join('');
    list.querySelectorAll('.offline-name-input').forEach(inp =>
      inp.addEventListener('input', e => { offlinePlayers[+e.target.dataset.idx].name = e.target.value; })
    );
    list.querySelectorAll('.offline-team-btn').forEach(btn =>
      btn.addEventListener('click', e => {
        offlinePlayers[+e.target.dataset.idx].team = e.target.dataset.team;
        renderOfflineSetup();
      })
    );
    list.querySelectorAll('.offline-char-select').forEach(sel =>
      sel.addEventListener('change', e => {
        offlinePlayers[+e.target.dataset.idx].character = e.target.value;
      })
    );
    list.querySelectorAll('.btn-remove-offline').forEach(btn =>
      btn.addEventListener('click', e => {
        offlinePlayers.splice(+e.target.dataset.idx, 1);
        renderOfflineSetup();
      })
    );
  }

  // ── Special character abilities ─────────────────────────────────────────
  function renderAbilities() {
    const isHost    = gameMode === 'host';
    const isOffline = gameMode === 'offline';
    const hasHanu    = characterInGame('hanu');
    const hasIgnatia = characterInGame('ignatia');
    const active     = state.turns[state.currentTurnIndex];

    // Hanu — Hurry Up: Hanu player on their active turn; host/offline when Hanu is active
    const activeIds    = active ? (active.players || []).map(p => p.id) : [];
    // Fallback: if I am Hanu and my own ID is in the active slot, treat as active
    // even if the synced state.players character field hasn't arrived yet.
    const hanuOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'hanu')
                      || (myCharacter === 'hanu' && activeIds.includes(myId));
    const canHurryUp   = hanuOnActive && (myCharacter === 'hanu' || isHost || isOffline);

    // Ignatia — Chaos Incarnate: Ignatia player on their active turn; host/offline when Ignatia is active
    const ignatiaOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'ignatia')
                         || (myCharacter === 'ignatia' && activeIds.includes(myId));
    const canChaos = ignatiaOnActive && (myCharacter === 'ignatia' || isHost || isOffline);

    // Tigerclaw — Poison Token: only during Tigerclaw's own turn
    const tigerclawOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'tigerclaw');
    const canPoison = tigerclawOnActive && (myCharacter === 'tigerclaw' || isHost || isOffline);

    // Takahide — Warlord's Order: only during Takahide's own turn
    const takahideOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'takahide');
    const canOrder = takahideOnActive && (myCharacter === 'takahide' || isHost || isOffline);

    // Tali — Ice Barrier: only during Tali's own turn
    const taliOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'tali');
    const canIceBarrier = taliOnActive && (myCharacter === 'tali' || isHost || isOffline);

    const panel = $('abilityPanel');
    if (!canHurryUp && !canChaos && !canPoison && !canOrder && !canIceBarrier) { panel.style.display = 'none'; return; }

    panel.style.display = 'flex';
    let html = '';
    if (canHurryUp && !usedAbilitiesThisTurn.has('hurryUp')) {
      html += `<button class="ability-btn hanu-ability" id="btnHurryUp">⚡ Hurry Up!</button>`;
    }
    if (canChaos && !usedAbilitiesThisTurn.has('chaos')) {
      html += `<button class="ability-btn ignatia-ability" id="btnChaosIncarnate">🌀 Chaos Incarnate</button>`;
    }
    if (canPoison && !usedAbilitiesThisTurn.has('poison')) {
      html += `<button class="ability-btn tigerclaw-ability" id="btnPoisonToken">☠️ Poison Token</button>`;
    }
    if (canOrder && !usedAbilitiesThisTurn.has('warlordOrder')) {
      html += `<button class="ability-btn takahide-ability" id="btnWarlordOrder">🍶 Hold my sake</button>`;
    }
    if (canIceBarrier && !usedAbilitiesThisTurn.has('iceBarrier')) {
      html += `<button class="ability-btn tali-ability" id="btnIceBarrier">🧊 Ice Barrier</button>`;
    }
    panel.innerHTML = html;

    if (canHurryUp) {
      $('btnHurryUp').addEventListener('click', showHurryUpPanel);
    }
    if (canChaos && !usedAbilitiesThisTurn.has('chaos')) {
      $('btnChaosIncarnate').addEventListener('click', () => {
        usedAbilitiesThisTurn.add('chaos');
        sendToHost({ type: 'use_chaos_incarnate' });
        renderAbilities();
      });
    }
    if (canPoison) {
      $('btnPoisonToken').addEventListener('click', showPoisonPanel);
    }
    if (canOrder) {
      $('btnWarlordOrder').addEventListener('click', showTakahidePanel);
    }
    if (canIceBarrier && !usedAbilitiesThisTurn.has('iceBarrier')) {
      $('btnIceBarrier').addEventListener('click', showIceBarrierPanel);
    }
  }

  function showHurryUpPanel() {
    $('hurryUpPanel').style.display = 'block';

    // Only show players who have a pending turn AFTER the current one (or in the current
    // mixed-tie's other-team pool), and exclude Hanu himself
    const cur = state.currentTurnIndex;
    const futureTurnPlayerIds = new Set();
    for (let i = cur + 1; i < state.turns.length; i++) {
      const t = state.turns[i];
      if (t.status !== 'completed') (t.players || []).forEach(p => futureTurnPlayerIds.add(p.id));
    }
    // Also include every mixed-tie pool player (covers: other team in a future mixed slot
    // whose turn hasn't been created yet, and teammates/enemies when Hanu is in a mixed tie himself)
    Object.values(state.mixedTies).forEach(tie => {
      (tie.bluePool   || []).forEach(p => futureTurnPlayerIds.add(p.id));
      (tie.orangePool || []).forEach(p => futureTurnPlayerIds.add(p.id));
    });
    // Also include players in the current slot who haven't ended their turn yet
    const currentTurn = state.turns[cur];
    if (currentTurn) {
      const doneSet = new Set(currentTurn.doneIds || []);
      (currentTurn.players || []).forEach(p => { if (!doneSet.has(p.id)) futureTurnPlayerIds.add(p.id); });
    }
    const hanuPlayer = Object.values(state.players).find(p => p.character === 'hanu');
    const hanuId = hanuPlayer ? hanuPlayer.id : null;

    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.id !== hanuId && futureTurnPlayerIds.has(p.id)
    );
    if (!targets.length) {
      $('hurryUpTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No eligible players (everyone after Hanu has already gone).</p>';
    } else {
      $('hurryUpTargets').innerHTML = targets.map(p =>
        `<button class="hurry-target-btn" data-id="${p.id}">
          <span class="team-dot ${p.team}"></span>${esc(p.name)}
          ${p.character ? `<span class="char-badge">${charLabel(p.character)}</span>` : ''}
        </button>`
      ).join('');
      $('hurryUpTargets').querySelectorAll('.hurry-target-btn').forEach(btn =>
        btn.addEventListener('click', () => {
          $('hurryUpPanel').style.display = 'none';
          usedAbilitiesThisTurn.add('hurryUp');
          sendToHost({ type: 'use_hurry_up', payload: { targetId: btn.dataset.id } });
          renderAbilities();
        })
      );
    }
  }

  // Removes a player from all future turn slots and mixed-tie pools.
  // When splicing an empty mixedTieSlot, rescues the other team's pool as a plain pending slot.
  function purgePlayerFromUpcoming(targetId) {
    const cur = state.currentTurnIndex;
    for (let i = state.turns.length - 1; i > cur; i--) {
      const t = state.turns[i];
      if (!(t.players || []).some(p => p.id === targetId)) continue;
      t.players = t.players.filter(p => p.id !== targetId);
      if (t.players.length === 0) {
        state.turns.splice(i, 1);
        // If this was a mixed-tie slot, rescue the partner team's pool players
        if (t.mixedTieSlot) {
          const tie = state.mixedTies[t.initiative];
          if (tie) {
            const otherTeam = t.teamTurn === 'blue' ? 'orange' : 'blue';
            const rescued = (tie[`${otherTeam}Pool`] || []).filter(p => p.id !== targetId);
            if (rescued.length > 0) {
              state.turns.splice(i, 0, {
                order:      0,
                players:    rescued.map(p => ({ id: p.id, name: p.name, team: p.team })),
                initiative: t.initiative,
                status:     'pending',
                doneIds:    [],
              });
            }
            delete state.mixedTies[t.initiative];
          }
        }
      }
    }
    // Remove from all mixed-tie pools; if one pool empties, convert slot to simultaneous
    Object.keys(state.mixedTies).forEach(init => {
      const initNum = +init;
      const tie = state.mixedTies[initNum];
      tie.bluePool   = tie.bluePool.filter(p => p.id !== targetId);
      tie.orangePool = tie.orangePool.filter(p => p.id !== targetId);
      if (tie.bluePool.length === 0 || tie.orangePool.length === 0) {
        const remaining = tie.bluePool.length > 0 ? tie.bluePool : tie.orangePool;
        const slotIdx = state.turns.findIndex(t => t.initiative === initNum && t.mixedTieSlot);
        // Only modify future slots — never touch the currently-active slot.
        // If the collapsed tie belongs to the active slot, advanceTurn() will
        // clean it up naturally when the current team finishes.
        if (slotIdx > cur) {
          if (remaining.length > 0) {
            // Convert to a plain simultaneous slot for the surviving team
            state.turns[slotIdx] = {
              order:      state.turns[slotIdx].order,
              players:    remaining.map(p => ({ id: p.id, name: p.name, team: p.team })),
              initiative: initNum,
              status:     'pending',
              doneIds:    [],
            };
          } else {
            state.turns.splice(slotIdx, 1);
          }
          delete state.mixedTies[initNum];
        }
      }
    });
  }

  // Remove a player from the remainder of this round's turn order.
  function killPlayerThisRound(targetId) {
    const target = state.players[targetId];
    if (!target) return;
    // Mark as removed for UI purposes
    state.players[targetId] = { ...(state.players[targetId] || {}), removedThisRound: true };

    // Remove from upcoming turns and mixed ties
    purgePlayerFromUpcoming(targetId);

    // If currently active slot includes them, mark them done so they won't block advancement
    const cur = state.currentTurnIndex;
    const active = state.turns[cur];
    if (active && (active.players || []).some(p => p.id === targetId)) {
      if (!active.doneIds) active.doneIds = [];
      if (!active.doneIds.includes(targetId)) active.doneIds.push(targetId);
    }

    // If the active slot is a mixed-tie, update its pools/players immediately
    if (active && active.mixedTieSlot) {
      const tie = state.mixedTies && state.mixedTies[active.initiative];
      if (tie) {
        tie.bluePool   = (tie.bluePool || []).filter(p => p.id !== targetId);
        tie.orangePool = (tie.orangePool || []).filter(p => p.id !== targetId);

        const curPoolKey = `${active.teamTurn}Pool`;
        const otherTeam = active.teamTurn === 'blue' ? 'orange' : 'blue';
        const otherPoolKey = `${otherTeam}Pool`;

        const curPool   = tie[curPoolKey] || [];
        const otherPool = tie[otherPoolKey] || [];

        if (curPool.length > 0) {
          active.players = curPool.map(p => ({ id: p.id, name: p.name, team: p.team }));
        } else if (otherPool.length > 0) {
          // Switch the active team for this mixed slot to the other team
          active.teamTurn = otherTeam;
          active.players = otherPool.map(p => ({ id: p.id, name: p.name, team: p.team }));
        } else {
          // Both pools empty: remove tie and advance the turn immediately
          delete state.mixedTies[active.initiative];
          // Ensure the current slot won't block advancement
          if (!active.doneIds) active.doneIds = [];
          // Advance turn to clean up the empty mixed slot
          advanceTurn();
          toast(`${esc(target.name)} removed from this round.`);
          return;
        }
      }
    }

    toast(`${esc(target.name)} removed from this round.`);
    // Broadcast updated state to clients
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }

  // Inserts a player at newInit in the future turn order.
  // If a pending slot already exists at that initiative, merges into it;
  // if teams differ, converts it into a proper mixed-tie slot.
  function insertPlayerAtInitiative(id, name, team, newInit) {
    const cur = state.currentTurnIndex;
    let mergeIdx = -1;
    for (let j = cur + 1; j < state.turns.length; j++) {
      if (state.turns[j].initiative === newInit && state.turns[j].status !== 'completed') {
        mergeIdx = j; break;
      }
    }
    if (mergeIdx === -1) {
      // No collision — insert in sort order
      let insertAt = state.turns.length;
      for (let j = cur + 1; j < state.turns.length; j++) {
        const before = state.reverseInitiative
          ? state.turns[j].initiative > newInit
          : state.turns[j].initiative < newInit;
        if (before) { insertAt = j; break; }
      }
      state.turns.splice(insertAt, 0, {
        order: 0, players: [{ id, name, team }], initiative: newInit, status: 'pending', doneIds: [],
      });
    } else {
      const slot = state.turns[mergeIdx];
      const existingTeams = new Set((slot.players || []).map(p => p.team));
      if (existingTeams.size === 0 || existingTeams.has(team) || slot.mixedTieSlot) {
        // Same team or already a mixed-tie slot — add player directly
        if (!slot.players.some(p => p.id === id)) slot.players.push({ id, name, team });
        if (slot.mixedTieSlot && state.mixedTies[newInit]) {
          const pool = state.mixedTies[newInit][`${team}Pool`];
          if (pool && !pool.some(p => p.id === id))
            pool.push({ ...(state.players[id] || {}), id, name, team });
        }
      } else {
        // Different team — create a mixed tie
        const existing = (slot.players || []).map(p =>
          ({ ...(state.players[p.id] || {}), id: p.id, name: p.name, team: p.team }));
        const incoming = [{ ...(state.players[id] || {}), id, name, team }];
        const bluePool   = team === 'blue'   ? incoming : existing;
        const orangePool = team === 'orange' ? incoming : existing;
        state.mixedTies[newInit] = { bluePool, orangePool };
        const firstTeam = state.initiativeToken;
        const otherTeam = firstTeam === 'blue' ? 'orange' : 'blue';
        state.turns[mergeIdx] = {
          order:        slot.order,
          players:      state.mixedTies[newInit][`${firstTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
          initiative:   newInit,
          status:       'pending',
          doneIds:      [],
          mixedTieSlot: true,
          teamTurn:     firstTeam,
          tokenAfter:   state.mixedTies[newInit][`${otherTeam}Pool`].length > 0 ? otherTeam : undefined,
        };
      }
    }
    state.turns.forEach((t, i) => { t.order = i + 1; });
  }

  function applyHurryUp(targetId) {
    const target = state.players[targetId];
    if (!target) return;
    const NEW_INIT = 11;
    const cur      = state.currentTurnIndex;

    purgePlayerFromUpcoming(targetId);
    state.players[targetId] = { ...target, initiative: NEW_INIT };
    insertPlayerAtInitiative(targetId, target.name, target.team, NEW_INIT);

    usedAbilitiesThisTurn.add('hurryUp');
    toast(`⚡ ${esc(target.name)} rushes to initiative 11!`);
    broadcast({ type: 'turn_advanced',
      payload: { turns: state.turns, currentTurnIndex: cur,
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies,
                 reverseInitiative: state.reverseInitiative,
                 usedAbilities: [...usedAbilitiesThisTurn] } });
    render();
  }

  function showPoisonPanel() {
    $('poisonPanel').style.display = 'block';
    const tigerPlayer = Object.values(state.players).find(p => p.character === 'tigerclaw');
    const tigerTeam   = tigerPlayer ? tigerPlayer.team : null;
    const cur = state.currentTurnIndex;
    const futurePendingIds = new Set();
    for (let i = cur + 1; i < state.turns.length; i++) {
      const t = state.turns[i];
      if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
    }
    Object.values(state.mixedTies).forEach(tie => {
      (tie.bluePool   || []).forEach(p => futurePendingIds.add(p.id));
      (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
    });
    // Also include players in the current slot who haven't ended their turn yet
    const currentTurnP = state.turns[cur];
    if (currentTurnP) {
      const doneSet = new Set(currentTurnP.doneIds || []);
      (currentTurnP.players || []).forEach(p => { if (!doneSet.has(p.id)) futurePendingIds.add(p.id); });
    }
    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.team !== tigerTeam && futurePendingIds.has(p.id)
    );
    if (!targets.length) {
      $('poisonTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No enemy players with a pending turn.</p>';
    } else {
      $('poisonTargets').innerHTML = targets.map(p =>
        `<div class="poison-target-row">
          <span class="poison-target-name">
            <span class="team-dot ${p.team}"></span>${esc(p.name)}
            ${p.character ? `<span class="char-badge">${charLabel(p.character)}</span>` : ''}
          </span>
          <button class="poison-penalty-btn" data-id="${p.id}" data-penalty="1">-1</button>
          <button class="poison-penalty-btn" data-id="${p.id}" data-penalty="2">-2</button>
        </div>`
      ).join('');
      $('poisonTargets').querySelectorAll('.poison-penalty-btn').forEach(btn =>
        btn.addEventListener('click', () => {
          $('poisonPanel').style.display = 'none';
          usedAbilitiesThisTurn.add('poison');
          sendToHost({ type: 'use_poison', payload: { targetId: btn.dataset.id, penalty: +btn.dataset.penalty } });
          renderAbilities();
        })
      );
    }
  }

  function applyPoison(targetId, penalty) {
    const target = state.players[targetId];
    if (!target) return;
    const newInit = target.initiative - penalty;
    const cur     = state.currentTurnIndex;
    state.players[targetId] = { ...target, initiative: newInit };
    purgePlayerFromUpcoming(targetId);
    // Only give the target a future slot if their new initiative is still ahead
    // in the turn order. If it lands at or behind the current turn they lose
    // their remaining turn this round.
    const currentInit = state.turns[cur] ? state.turns[cur].initiative : null;
    const stillFuture = currentInit === null || (
      state.reverseInitiative ? newInit > currentInit : newInit < currentInit
    );
    if (stillFuture) insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
    usedAbilitiesThisTurn.add('poison');
    toast(`☠️ ${esc(target.name)} poisoned! -${penalty} initiative (now ${newInit})`);
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }

  function showTakahidePanel() {
    $('takahidePanel').style.display = 'block';
    const takahidePlayer = Object.values(state.players).find(p => p.character === 'takahide');
    const takaTeam = takahidePlayer ? takahidePlayer.team : null;
    const takaId   = takahidePlayer ? takahidePlayer.id  : null;
    // Build set of players who still have a pending turn
    const cur = state.currentTurnIndex;
    const futurePendingIds = new Set();
    for (let i = cur + 1; i < state.turns.length; i++) {
      const t = state.turns[i];
      if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
    }
    Object.values(state.mixedTies).forEach(tie => {
      (tie.bluePool   || []).forEach(p => futurePendingIds.add(p.id));
      (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
    });
    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.team === takaTeam && p.id !== takaId && futurePendingIds.has(p.id)
    );
    if (!targets.length) {
      $('takahideTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No other friendly players.</p>';
    } else {
      $('takahideTargets').innerHTML = targets.map(p =>
        `<div class="takahide-target-row" data-id="${p.id}">
          <span class="takahide-target-name">
            <span class="team-dot ${p.team}"></span>${esc(p.name)}
            ${p.character ? `<span class="char-badge">${charLabel(p.character)}</span>` : ''}
          </span>
          <input class="takahide-init-input" type="number" min="1" max="30"
            value="${p.initiative || ''}" placeholder="Init" data-id="${p.id}" />
          <button class="takahide-set-btn" data-id="${p.id}">\u2714 Set</button>
        </div>`
      ).join('');
      $('takahideTargets').querySelectorAll('.takahide-set-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = $('takahideTargets').querySelector(`.takahide-init-input[data-id="${btn.dataset.id}"]`);
          const val = parseInt(input && input.value, 10);
          if (!val || val < 1) { input && input.focus(); return; }
          $('takahidePanel').style.display = 'none';
          usedAbilitiesThisTurn.add('warlordOrder');
          sendToHost({ type: 'use_warlord_order', payload: { targetId: btn.dataset.id, newInit: val } });
          renderAbilities();
        });
      });
    }
  }

  function applyWarlordOrder(targetId, newInit) {
    const target = state.players[targetId];
    if (!target) return;
    const cur = state.currentTurnIndex;
    state.players[targetId] = { ...target, initiative: newInit };
    purgePlayerFromUpcoming(targetId);
    insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
    usedAbilitiesThisTurn.add('warlordOrder');
    toast(`⚔️ ${esc(target.name)}'s initiative changed to ${newInit}!`);
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }

  function showIceBarrierPanel() {
    $('taliPanel').style.display = 'block';
    const taliPlayer = Object.values(state.players).find(p => p.character === 'tali');
    const taliTeam   = taliPlayer ? taliPlayer.team : null;
    const cur = state.currentTurnIndex;
    // Only enemy players with a pending future turn
    const futurePendingIds = new Set();
    for (let i = cur + 1; i < state.turns.length; i++) {
      const t = state.turns[i];
      if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
    }
    Object.values(state.mixedTies).forEach(tie => {
      (tie.bluePool   || []).forEach(p => futurePendingIds.add(p.id));
      (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
    });
    // Also include players in the current slot who haven't ended their turn yet
    const currentTurnT = state.turns[cur];
    if (currentTurnT) {
      const doneSet = new Set(currentTurnT.doneIds || []);
      (currentTurnT.players || []).forEach(p => { if (!doneSet.has(p.id)) futurePendingIds.add(p.id); });
    }
    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.team !== taliTeam && futurePendingIds.has(p.id)
    );
    if (!targets.length) {
      $('taliTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No enemy players with a pending turn.</p>';
    } else {
      $('taliTargets').innerHTML = targets.map(p =>
        `<div class="poison-target-row">
          <span class="poison-target-name">
            <span class="team-dot ${p.team}"></span>${esc(p.name)}
            ${p.character ? `<span class="char-badge">${charLabel(p.character)}</span>` : ''}
          </span>
          <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="1">-1</button>
          <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="2">-2</button>
          <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="3">-3</button>
        </div>`
      ).join('');
      $('taliTargets').querySelectorAll('.tali-penalty').forEach(btn =>
        btn.addEventListener('click', () => {
          $('taliPanel').style.display = 'none';
          usedAbilitiesThisTurn.add('iceBarrier');
          sendToHost({ type: 'use_ice_barrier', payload: { targetId: btn.dataset.id, penalty: +btn.dataset.penalty } });
          renderAbilities();
        })
      );
    }
  }

  function applyIceBarrier(targetId, penalty) {
    const target = state.players[targetId];
    if (!target) return;
    const newInit = target.initiative - penalty;
    const cur     = state.currentTurnIndex;
    const hadFutureTurn =
      state.turns.slice(cur + 1).some(t =>
        t.status !== 'completed' && (t.players || []).some(p => p.id === targetId)
      ) ||
      Object.values(state.mixedTies).some(tie =>
        [...(tie.bluePool || []), ...(tie.orangePool || [])].some(p => p.id === targetId)
      );
    state.players[targetId] = { ...target, initiative: newInit };
    purgePlayerFromUpcoming(targetId);
    const currentInit = state.turns[cur] ? state.turns[cur].initiative : null;
    const stillFuture = currentInit === null || (
      state.reverseInitiative ? newInit > currentInit : newInit < currentInit
    );
    if (hadFutureTurn && stillFuture) insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
    usedAbilitiesThisTurn.add('iceBarrier');
    toast(`🧊 ${esc(target.name)} frozen! -${penalty} initiative (now ${newInit})`);
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }


  function endTurnOffline() {
    const turn = state.turns[state.currentTurnIndex];
    if (!turn) return;
    if (!turn.doneIds) turn.doneIds = [];
    if (turn.mixedTieSlot) {
      // One manager click = one team slot; auto-pick the first candidate
      const first = (turn.players || [])[0];
      if (first && !turn.doneIds.includes(first.id)) turn.doneIds.push(first.id);
    } else {
      // Mark all players done (simultaneous = single click in offline)
      (turn.players || []).forEach(p => {
        if (!turn.doneIds.includes(p.id)) turn.doneIds.push(p.id);
      });
    }
    advanceTurn();
  }

  // ── Initiative pad ──────────────────────────────────────────────────────
  function updatePad() {
    const el = $('initiativeDisplay');
    if (initValue) {
      el.textContent = initValue;
      el.classList.remove('is-placeholder');
    } else {
      el.textContent = 'Enter initiative';
      el.classList.add('is-placeholder');
    }
    $('btnLock').disabled = !initValue || initLocked;
  }

  document.querySelectorAll('.pad-btn[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (initLocked) return;
      if (initValue.length >= 2) return;
      const next = initValue + btn.dataset.val;
      if (+next > 99) return;
      initValue = next;
      updatePad();
      if (initValue) {
        sendToHost({ type: 'player_initiative_updated',
          payload: { playerId: myId, initiative: +initValue } });
      }
    });
  });

  $('padBack').addEventListener('click', () => {
    if (initLocked) return;
    initValue = initValue.slice(0, -1);
    updatePad();
  });

  $('btnLock').addEventListener('click', () => {
    if (!initValue || initLocked) return;
    initLocked = true;
    document.querySelectorAll('.pad-btn').forEach(b => b.disabled = true);

    if (gameMode === 'offline') {
      // Store initiative for current offline player and advance
      if ($('abilityReverseTime').style.display !== 'none' && $('chkReverseTime').checked) {
        state.reverseInitiative = true;
      }
      offlinePlayers[offlineInitIdx].initiative = +initValue;
      offlineInitIdx++;
      if (offlineInitIdx >= offlinePlayers.length) {
        // All done — populate state.players and reveal turns
        state.players = {};
        offlinePlayers.forEach(p => {
          state.players[p.id] = {
            id: p.id, peerId: p.id, name: p.name, team: p.team, character: p.character || '',
            initiative: p.initiative, submissionStatus: 'locked', isConnected: true,
          };
        });
        revealTurns();
      } else {
        resetInitPad();
        render();
      }
      return;
    }
    $('btnLock').style.display = 'none';
    $('btnEdit').style.display = 'block';
    $('lockStatus').textContent = '✓ Locked in — waiting for others';
    const reverseTime = $('abilityReverseTime').style.display !== 'none' && $('chkReverseTime').checked;
    sendToHost({ type: 'initiative_locked',
      payload: { playerId: myId, initiative: +initValue, reverseTime } });
    if (gameMode === 'host') {
      applyInitiativeLocked(myId, +initValue);
    }
  });

  $('btnEdit').addEventListener('click', () => {
    initLocked = false;
    document.querySelectorAll('.pad-btn').forEach(b => b.disabled = false);
    $('btnLock').style.display = 'block';
    $('btnEdit').style.display = 'none';
    $('lockStatus').textContent = '';
    if (state.players[myId]) {
      state.players[myId] = { ...state.players[myId], submissionStatus: 'not-submitted' };
    }
    updatePad();
    if (gameMode === 'host') {
      broadcast({ type: 'state_sync', payload: serializeState() });
    }
    render();
  });

  // ── End turn / new round ────────────────────────────────────────────────
  $('btnEndTurn').addEventListener('click', () => {
    if (gameMode === 'offline' || (state.hostManagesTurns && gameMode === 'host')) {
      endTurnOffline(); return;
    }
    sendToHost({ type: 'turn_ended', payload: { playerId: myId } });
  });

  $('btnNewRound').addEventListener('click', () => {
    if (gameMode === 'host' || gameMode === 'offline') startNewRound();
  });

  // ── Host game logic ─────────────────────────────────────────────────────
  function resetInitPad() {
    initValue  = '';
    initLocked = false;
    document.querySelectorAll('.pad-btn').forEach(b => b.disabled = false);
    $('btnLock').style.display = 'block';
    $('btnEdit').style.display = 'none';
    $('lockStatus').textContent = '';
    updatePad();
  }

  function startGame() {
    state.phase = 'initiative';
    state.initiativeToken  = hostTokenChoice;
    state.hostManagesTurns = hostManagesTurns;
    Object.keys(state.players).forEach(id => {
      state.players[id] = { ...state.players[id],
        submissionStatus: 'not-submitted', initiative: undefined };
    });
    resetInitPad();
    broadcast({ type: 'game_started',
      payload: { initiativeToken: hostTokenChoice, hostManagesTurns } });
    render();
  }

  function applyInitiativeLocked(playerId, initiative) {
    if (state.players[playerId]) {
      state.players[playerId] = { ...state.players[playerId],
        initiative, submissionStatus: 'locked' };
    }
    const now = Date.now();
    const blocking = Object.values(state.players).filter(p =>
      p.isConnected || (p.disconnectedAt && (now - p.disconnectedAt) < DISCONNECT_GRACE_MS)
    );
    const allLocked = blocking.length > 0 && blocking.every(p => p.submissionStatus === 'locked');
    if (allLocked) {
      revealTurns();
    } else {
      broadcast({ type: 'state_sync', payload: serializeState() });
      render();
    }
  }

  function revealTurns() {
    const now = Date.now();
    // Consider connected players and recently-disconnected players within the grace window
    const considered = Object.values(state.players).filter(p =>
      p.isConnected || (p.disconnectedAt && (now - p.disconnectedAt) < DISCONNECT_GRACE_MS)
    );

    // Group players by initiative value
    const byVal = {};
    considered.forEach(p => {
      const v = p.initiative || 0;
      if (!byVal[v]) byVal[v] = [];
      byVal[v].push(p);
    });
    const sortedVals = Object.keys(byVal).map(Number)
      .sort((a, b) => state.reverseInitiative ? a - b : b - a);

    state.mixedTies = {};
    const turns = [];
    let order = 1;

    for (const val of sortedVals) {
      const group  = byVal[val];
      const blue   = group.filter(p => p.team === 'blue');
      const orange = group.filter(p => p.team === 'orange');

      if (blue.length === 0 || orange.length === 0) {
        // Pure same-team (or unassigned): one simultaneous slot
        turns.push({
          order:      order++,
          players:    group.map(p => ({ id: p.id, name: p.name, team: p.team || '' })),
          initiative: val,
          status:     'pending',
          doneIds:    [],
        });
      } else {
        // Mixed teams: store pools and build ONLY the first team slot
        state.mixedTies[val] = { bluePool: [...blue], orangePool: [...orange] };
        turns.push(buildMixedSlot(val, state.initiativeToken, order++));
      }
    }

    if (turns.length > 0) turns[0].status = 'active';
    state.turns            = turns;
    state.currentTurnIndex = 0;
    state.phase            = 'turns';
    broadcast({ type: 'turns_revealed',
      payload: { turns: state.turns, currentTurnIndex: 0,
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies,
                 reverseInitiative: state.reverseInitiative } });
    render();
  }

  // Builds one mixed-tie team slot; tokenAfter = flip to other team UNLESS other team is already empty
  function buildMixedSlot(initiative, teamTurn, order) {
    const tie       = state.mixedTies[initiative];
    const otherTeam = teamTurn === 'blue' ? 'orange' : 'blue';
    const otherHasPlayers = tie[`${otherTeam}Pool`].length > 0;
    return {
      order,
      players:      tie[`${teamTurn}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
      initiative,
      status:       'pending',
      doneIds:      [],
      mixedTieSlot: true,
      teamTurn,
      tokenAfter:   otherHasPlayers ? otherTeam : undefined, // no flip on last mixed slot
    };
  }

  function advanceTurn() {
    // Close any open ability panels and reset used-ability tracking for the new turn
    ['hurryUpPanel', 'poisonPanel', 'takahidePanel', 'taliPanel'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
    usedAbilitiesThisTurn.clear();

    const cur         = state.currentTurnIndex;
    const currentTurn = state.turns[cur];

    // Apply token flip stored on the just-completed turn
    if (currentTurn && currentTurn.tokenAfter !== undefined) {
      state.initiativeToken = currentTurn.tokenAfter;
    }

    // If this was a mixed-tie slot, update pools and inject the next slot
    if (currentTurn && currentTurn.mixedTieSlot) {
      const initiative = currentTurn.initiative;
      const takenTeam  = currentTurn.teamTurn;
      const otherTeam  = takenTeam === 'blue' ? 'orange' : 'blue';
      const takenById  = currentTurn.doneIds[0];
      const tie        = state.mixedTies[initiative];

      // Remove the player who took this slot
      tie[`${takenTeam}Pool`] = tie[`${takenTeam}Pool`].filter(p => p.id !== takenById);

      const takenRemaining = tie[`${takenTeam}Pool`].length;
      const otherRemaining = tie[`${otherTeam}Pool`].length;
      const nextOrder      = cur + 2; // 1-based

      let nextSlot = null;
      if (otherRemaining > 0) {
        // Other team still has players — next mixed slot for them (token just flipped)
        nextSlot = buildMixedSlot(initiative, state.initiativeToken, nextOrder);
      } else if (takenRemaining > 0) {
        // Other team exhausted — remaining players go simultaneously
        nextSlot = {
          order:      nextOrder,
          players:    tie[`${takenTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
          initiative,
          status:     'pending',
          doneIds:    [],
        };
      }

      if (nextSlot) {
        state.turns.splice(cur + 1, 0, nextSlot);
        for (let i = cur + 1; i < state.turns.length; i++) state.turns[i].order = i + 1;
      }
    }

    const next = cur + 1;
    if (next >= state.turns.length) {
      // All turns done — auto-start next round
      startNewRound();
      return;
    }
    state.turns[cur].status   = 'completed';
    state.turns[next].status  = 'active';
    state.turns[next].doneIds = [];
    state.currentTurnIndex    = next;
    broadcast({ type: 'turn_advanced',
      payload: { turns: state.turns, currentTurnIndex: next,
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies,
                 usedAbilities: [] } });
    render();
  }

  function startNewRound() {
    const quoteEl = $('initiativeCharQuote');
    if (quoteEl) quoteEl.textContent = '';
    state.phase = 'initiative';
    state.turns = [];
    state.currentTurnIndex = 0;
    state.mixedTies = {};
    state.reverseInitiative = false;
    if (gameMode === 'offline') {
      offlinePlayers.forEach(p => { p.initiative = undefined; });
      offlineInitIdx = 0;
      resetInitPad();
      render();
      return;
    }
    Object.keys(state.players).forEach(id => {
      state.players[id] = { ...state.players[id],
        submissionStatus: 'not-submitted', initiative: undefined };
    });
    resetInitPad();
    broadcast({ type: 'new_round', payload: serializeState() });
    render();
  }

  function serializeState() {
    const data = {
      phase:             state.phase,
      players:           state.players,
      turns:             state.turns,
      currentTurnIndex:  state.currentTurnIndex,
      initiativeToken:   state.initiativeToken,
      mixedTies:         state.mixedTies,
      hostManagesTurns:  state.hostManagesTurns,
      reverseInitiative: state.reverseInitiative,
      usedAbilities:     [...usedAbilitiesThisTurn],
    };
    // Keep localStorage in sync so the host can reconnect with full state
    if (gameMode === 'host') saveReconnectData(data);
    return data;
  }

  // ── Messaging ───────────────────────────────────────────────────────────
  function broadcast(msg) {
    if (gameMode === 'host' || gameMode === 'offline') {
      if (socket && socket.connected) socket.emit('host_event', { code: sessionCode, msg });
    } else if (socket && socket.connected) {
      socket.emit('player_event', { code: sessionCode, msg });
    }
  }

  // Unified: host handles locally, player sends over wire
  function sendToHost(msg) {
    if (gameMode === 'host' || gameMode === 'offline') {
      handleHostMsg(msg);
    } else if (socket && socket.connected) {
      socket.emit('player_event', { code: sessionCode, msg });
    }
  }

  function handleHostMsg(msg) {
    switch (msg.type) {
      case 'player_joined': {
        const p = msg.payload;
        state.players[p.id] = p;
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
        break;
      }
      case 'player_rejoined': {
        const p = msg.payload;
        if (state.players[p.id]) {
          // Restore existing slot: update connection info and mark connected
          state.players[p.id] = {
            ...state.players[p.id],
            peerId:      p.peerId,
            isConnected: true,
            disconnectedAt: undefined,
          };
        } else {
          // Unknown ID — treat as a new player
          state.players[p.id] = { ...p, submissionStatus: 'not-submitted' };
        }
        // Send the full current state to the reconnecting player
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
        break;
      }
      case 'player_initiative_updated': {
        const { playerId, initiative } = msg.payload;
        if (state.players[playerId]) {
          state.players[playerId] = { ...state.players[playerId],
            initiative, submissionStatus: 'submitted' };
        }
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
        break;
      }
      case 'initiative_locked': {
        if (msg.payload.reverseTime) state.reverseInitiative = true;
        applyInitiativeLocked(msg.payload.playerId, msg.payload.initiative);
        break;
      }
      case 'use_reverse_time': {
        state.reverseInitiative = !state.reverseInitiative;
        if (state.phase === 'turns') {
          const cur = state.currentTurnIndex;
          const pending = state.turns.slice(cur + 1);
          pending.sort((a, b) => state.reverseInitiative ? a.initiative - b.initiative : b.initiative - a.initiative);
          state.turns.splice(cur + 1, state.turns.length - cur - 1, ...pending);
          state.turns.forEach((t, i) => { t.order = i + 1; });
          broadcast({ type: 'turn_advanced',
            payload: { turns: state.turns, currentTurnIndex: cur,
                       initiativeToken: state.initiativeToken, mixedTies: state.mixedTies,
                       reverseInitiative: state.reverseInitiative } });
        } else {
          broadcast({ type: 'state_sync', payload: serializeState() });
        }
        toast(state.reverseInitiative ? '\u23ea Reverse Time: now low \u2192 high' : '\u23ea Time restored: high \u2192 low');
        render();
        break;
      }
      case 'use_hurry_up': {
        applyHurryUp(msg.payload.targetId);
        break;
      }
      case 'use_poison': {
        applyPoison(msg.payload.targetId, msg.payload.penalty);
        break;
      }
      case 'use_warlord_order': {
        applyWarlordOrder(msg.payload.targetId, msg.payload.newInit);
        break;
      }
      case 'use_ice_barrier': {
        applyIceBarrier(msg.payload.targetId, msg.payload.penalty);
        break;
      }
      case 'use_chaos_incarnate': {
        usedAbilitiesThisTurn.add('chaos');
        state.initiativeToken = state.initiativeToken === 'blue' ? 'orange' : 'blue';
        toast('\ud83c\udf00 Chaos Incarnate! Token flipped to ' + state.initiativeToken + '.');
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
        break;
      }
      case 'turn_ended': {
        const { playerId } = msg.payload;
        const turn = state.turns[state.currentTurnIndex];
        if (!turn) break;
        if (!turn.doneIds) turn.doneIds = [];
        // Only candidates listed for this turn may end it
        const eligible = (turn.players || []).some(p => p.id === playerId);
        if (!eligible || turn.doneIds.includes(playerId)) break;
        turn.doneIds.push(playerId);
        // Mixed-tie team slots complete when any 1 player ends their turn
        const required = turn.mixedTieSlot ? 1 : (turn.players || []).length;
        if (turn.doneIds.length >= required) {
          advanceTurn();
        } else {
          broadcast({ type: 'state_sync', payload: serializeState() });
          render();
        }
        break;
      }
    }
  }

  function handlePlayerMsg(msg) {
    switch (msg.type) {

      case 'game_started':
        state.phase            = 'initiative';
        state.initiativeToken  = msg.payload.initiativeToken || 'blue';
        state.hostManagesTurns = msg.payload.hostManagesTurns || false;
        Object.keys(state.players).forEach(id => {
          state.players[id] = { ...state.players[id],
            submissionStatus: 'not-submitted', initiative: undefined };
        });
        resetInitPad();
        render();
        break;

      case 'state_sync':
        state.players          = msg.payload.players;
        state.phase            = msg.payload.phase;
        state.turns            = msg.payload.turns || [];
        state.currentTurnIndex = msg.payload.currentTurnIndex || 0;
        state.initiativeToken  = msg.payload.initiativeToken || state.initiativeToken;
        state.mixedTies        = msg.payload.mixedTies || {};
        state.hostManagesTurns = msg.payload.hostManagesTurns || false;
        state.reverseInitiative = msg.payload.reverseInitiative || false;
        if (msg.payload.usedAbilities) usedAbilitiesThisTurn = new Set(msg.payload.usedAbilities);
        render();
        break;

      case 'turns_revealed':
        state.turns            = msg.payload.turns;
        state.currentTurnIndex = msg.payload.currentTurnIndex;
        state.phase            = 'turns';
        state.initiativeToken  = msg.payload.initiativeToken || state.initiativeToken;
        state.mixedTies        = msg.payload.mixedTies || {};
        state.reverseInitiative = msg.payload.reverseInitiative || false;
        render();
        break;

      case 'turn_advanced':
        state.turns            = msg.payload.turns;
        state.currentTurnIndex = msg.payload.currentTurnIndex;
        if (msg.payload.initiativeToken   !== undefined) state.initiativeToken   = msg.payload.initiativeToken;
        if (msg.payload.mixedTies         !== undefined) state.mixedTies         = msg.payload.mixedTies;
        if (msg.payload.reverseInitiative !== undefined) state.reverseInitiative = msg.payload.reverseInitiative;
        if (msg.payload.usedAbilities     !== undefined) usedAbilitiesThisTurn   = new Set(msg.payload.usedAbilities);
        render();
        break;

      case 'round_ended':
        state.turns = state.turns.map(t => ({ ...t, status: 'completed' }));
        state.phase = 'round-complete';
        if (msg.payload && msg.payload.initiativeToken) {
          state.initiativeToken = msg.payload.initiativeToken;
        }
        render();
        break;

      case 'new_round':
        state.phase            = 'initiative';
        state.players          = msg.payload.players;
        state.turns            = [];
        state.currentTurnIndex = 0;
        state.initiativeToken  = msg.payload.initiativeToken || state.initiativeToken;
        resetInitPad();
        render();
        break;

      case 'session_closed':
        toast('Host closed the session.');
        cleanup();
        showLanding();
        break;
    }
  }

  // ── PeerJS ──────────────────────────────────────────────────────────────
  // PeerJS-specific connection helper removed for Socket.IO; left as a noop.
  function setupPlayerConn(conn) {
    // No-op: Socket.IO handles player sockets on the server and forwards events
  }

  function tryHost(code, opts = {}) {
    sessionCode = (code || '').toUpperCase();
    if (socket) { try { socket.disconnect(); } catch (_) {} }
    socket = io(SERVER_URL);

    socket.on('connect', () => {
      socket.emit('host_create', { code: sessionCode });
    });

    socket.on('host_created', (data) => {
      sessionCode = (data.code || sessionCode).toUpperCase();
      gameMode = 'host';
      // If restoring, prefer existing myId/myName/state set by caller
      if (opts.restore) {
        myId   = myId || genId();
        myName = myName || ($('nameInput').value || 'Host').trim();
        state = state || { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {} };
        state.players = state.players || {};
        state.players[myId] = {
          id: myId, socketId: socket.id,
          name: myName, team: myTeam, character: myCharacter,
          submissionStatus: state.players[myId] ? state.players[myId].submissionStatus : 'not-submitted',
          isConnected: true,
        };
        saveReconnectData();
        showApp();
        render();
        setStatus('');
        toast('Session restored — waiting for players to reconnect.');
      } else {
        myId     = genId();
        myName   = ($('nameInput').value || 'Host').trim();

        state = {
          phase: 'lobby',
          players: {
            [myId]: {
              id: myId, socketId: socket.id,
              name: myName, team: myTeam, character: myCharacter,
              submissionStatus: 'not-submitted',
              isConnected: true,
            },
          },
          turns: [], currentTurnIndex: 0,
          initiativeToken: 'blue',
          mixedTies: {},
        };
        saveReconnectData();
        showApp();
        render();
        setStatus('');
      }
    });

    socket.on('host_create_failed', () => {
      // try another code
      tryHost(genCode());
    });

    socket.on('player_joined', p => handleHostMsg({ type: 'player_joined', payload: p }));
    socket.on('player_rejoined', p => handleHostMsg({ type: 'player_rejoined', payload: p }));
    socket.on('player_event', msg => handleHostMsg(msg));
    socket.on('player_disconnected', d => {
      if (d && d.id && state.players[d.id]) {
        const ts = d.timestamp || Date.now();
        state.players[d.id] = { ...state.players[d.id], isConnected: false, disconnectedAt: ts };
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
      }
    });

    socket.on('disconnect', () => { /* socket.io will auto-reconnect by default */ });
    socket.on('error', err => { setStatus('Error: ' + (err && err.message ? err.message : err), true); gameMode = null; });
  }

  function joinGame(code, opts = {}) {
    setStatus('Connecting…');
    gameMode = 'player';
    if (socket) { try { socket.disconnect(); } catch (_) {} }
    socket = io(SERVER_URL);

    socket.on('connect', () => {
      clearTimeout(joinTimeout);
      // Reuse existing myId/myName when reconnecting
      if (opts.reuseId && myId) {
        // keep myId/myName as-is
      } else {
        myId   = genId();
        myName = ($('nameInput').value || 'Player').trim();
      }
      sessionCode = code.toUpperCase();

      state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {} };
      showApp();
      render();
      setStatus('');

      socket.emit('player_join', { code: sessionCode, player: {
        id: myId, name: myName, team: myTeam, character: myCharacter,
        submissionStatus: 'not-submitted', isConnected: true
      } });
      saveReconnectData();
    });

    socket.on('host_event', msg => handlePlayerMsg(msg));
    // Server may emit a top-level `session_closed` when the host disconnects.
    socket.on('session_closed', () => {
      toast('Host closed the session.');
      cleanup();
      showLanding();
    });
    socket.on('join_failed', (data) => {
      clearTimeout(joinTimeout);
      const reason = data && data.reason;
      if (reason === 'no_host') {
        setStatus('Could not connect — no host for that code.', true);
      } else if (reason === 'name_not_unique') {
        setStatus('Name not unique in this room — choose another name.', true);
      } else {
        setStatus('Could not connect — check the code and try again.', true);
      }
      gameMode = null;
    });
    socket.on('disconnect', () => {
      $('statusBadge').textContent = 'disconnected';
      $('statusBadge').className   = 'badge badge-disconnected';
      toast('Connection to host lost.');
    });
    socket.on('error', err => { clearTimeout(joinTimeout); setStatus('Network error: ' + (err && err.message ? err.message : err), true); gameMode = null; });

    const joinTimeout = setTimeout(() => {
      if (!socket || !socket.connected) {
        setStatus('Connection timed out — check the code and try again.', true);
        gameMode = null;
      }
    }, 10000);
  }

  function cleanup() {
    try {
      if (socket && socket.connected) {
        if (gameMode === 'host') socket.emit('host_close', { code: sessionCode });
        socket.disconnect();
      }
    } catch (_) {}
    socket = null;
    hostConn    = null;
    playerConns = {};
    gameMode    = null;
    sessionCode = myId = myName = myTeam = '';
    myCharacter = '';
    clearReconnectData();
    updateSelectedCharDisplay();
    offlinePlayers     = [];
    offlineInitIdx     = 0;
    offlineTokenChoice = 'blue';
    hostManagesTurns   = false;
    if ($('chkHostTurns')) $('chkHostTurns').checked = false;
    state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
    resetInitPad();
    applyCharacterTheme();
    if (disconnectTimer) { clearInterval(disconnectTimer); disconnectTimer = null; }
  }

  // ── Landing wiring ───────────────────────────────────────────────────────
  $('btnHost').addEventListener('click', () => {
    const name = ($('nameInput').value || '').trim();
    if (!name) {
      $('nameInput').focus();
      $('nameInput').placeholder = 'Enter your name first!';
      return;
    }
    if (!myTeam) { toast('Select your team (Blue or Orange) first!'); return; }
    if (!myCharacter) { toast('Pick a character first!'); return; }
    setStatus('Creating session…');
    tryHost(genCode());
  });

  $('btnShowJoin').addEventListener('click', () => {
    const name = ($('nameInput').value || '').trim();
    if (!name) {
      $('nameInput').focus();
      $('nameInput').placeholder = 'Enter your name first!';
      return;
    }
    if (!myTeam) { toast('Select your team (Blue or Orange) first!'); return; }
    if (!myCharacter) { toast('Pick a character first!'); return; }
    $('landingMain').style.display = 'none';
    $('joinForm').style.display    = 'flex';
    $('codeInput').focus();
  });

  $('btnPlayOnline').addEventListener('click', () => {
    $('landingMode').style.display = 'none';
    $('landingMain').style.display = 'flex';
  });

  $('btnBackToMode').addEventListener('click', () => {
    $('landingMain').style.display = 'none';
    $('landingMode').style.display = 'flex';
  });

  $('btnReconnect').addEventListener('click', doReconnect);

  // Show reconnect button if a previous session is saved
  updateReconnectButton();

  $('btnPlayOffline').addEventListener('click', () => {
    gameMode           = 'offline';
    myId               = genId();
    offlineTokenChoice = 'blue';
    offlinePlayers     = [
      { id: genId(), name: '', team: 'blue',   character: '' },
      { id: genId(), name: '', team: 'orange', character: '' },
    ];
    offlineInitIdx = 0;
    state = { phase: 'offline-setup', players: {}, turns: [], currentTurnIndex: 0,
              initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
    $('statusBadge').textContent = 'offline';
    $('statusBadge').className   = 'badge badge-offline';
    showApp();
    render();
  });

  $('btnAddOfflinePlayer').addEventListener('click', () => {
    offlinePlayers.push({ id: genId(), name: '', team: 'blue', character: '' });
    renderOfflineSetup();
  });
  $('btnOfflineTokenBlue').addEventListener('click', () => {
    offlineTokenChoice = 'blue';
    $('btnOfflineTokenBlue').classList.add('selected');
    $('btnOfflineTokenOrange').classList.remove('selected');
  });
  $('btnOfflineTokenOrange').addEventListener('click', () => {
    offlineTokenChoice = 'orange';
    $('btnOfflineTokenOrange').classList.add('selected');
    $('btnOfflineTokenBlue').classList.remove('selected');
  });
  $('btnStartOffline').addEventListener('click', () => {
    offlinePlayers = offlinePlayers.filter(p => p.name.trim());
    if (offlinePlayers.length < 1) { toast('Add at least one player first!'); return; }
    offlinePlayers.forEach(p => { p.initiative = undefined; });
    offlineInitIdx = 0;
    state.initiativeToken = offlineTokenChoice;
    state.phase = 'initiative';
    resetInitPad();
    render();
  });

  $('btnCancelJoin').addEventListener('click', () => {
    $('joinForm').style.display    = 'none';
    $('landingMain').style.display = 'flex';
    setStatus('');
  });

  $('btnJoin').addEventListener('click', doJoin);
  $('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  $('codeInput').addEventListener('input', () => {
    $('codeInput').value = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  function doJoin() {
    const code = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { $('codeInput').focus(); return; }
    joinGame(code);
  }

  $('btnCopyCode').addEventListener('click', () => {
    navigator.clipboard.writeText(sessionCode)
      .then(() => toast('Code copied!'))
      .catch(() => toast('Copy failed — select the code manually'));
  });

  $('btnStartGame').addEventListener('click', () => {
    if (gameMode === 'host') startGame();
  });

  $('btnLeave').addEventListener('click', () => {
    if (gameMode === 'host') {
      if (!confirm('Close the session? All players will be disconnected.')) return;
      broadcast({ type: 'session_closed', payload: null });
    }
    cleanup();
    showLanding();
  });

  // Host manage players panel
  if ($('btnManagePlayers')) {
    $('btnManagePlayers').addEventListener('click', () => {
      $('hostManagePanel').style.display = 'block';
      renderPlayers('hostManageList', Object.values(state.players));
    });
  }
  if ($('btnCloseManage')) $('btnCloseManage').addEventListener('click', () => { $('hostManagePanel').style.display = 'none'; });
  if ($('btnCloseManage2')) $('btnCloseManage2').addEventListener('click', () => { $('hostManagePanel').style.display = 'none'; });

  // ── Team & token selection ────────────────────────────────────────────
  $('btnTeamBlue').addEventListener('click', () => {
    myTeam = 'blue';
    $('btnTeamBlue').classList.add('selected');
    $('btnTeamOrange').classList.remove('selected');
  });
  $('btnTeamOrange').addEventListener('click', () => {
    myTeam = 'orange';
    $('btnTeamOrange').classList.add('selected');
    $('btnTeamBlue').classList.remove('selected');
  });

  $('btnTokenBlue').addEventListener('click', () => {
    hostTokenChoice = 'blue';
    $('btnTokenBlue').classList.add('selected');
    $('btnTokenOrange').classList.remove('selected');
  });
  $('btnTokenOrange').addEventListener('click', () => {
    hostTokenChoice = 'orange';
    $('btnTokenOrange').classList.add('selected');
    $('btnTokenBlue').classList.remove('selected');
  });
  $('chkHostTurns').addEventListener('change', e => {
    hostManagesTurns = e.target.checked;
  });

  // Allow the host (and offline host) to flip the initiative token
  // by clicking the token banner at the top of the page.
  const tokenBannerEl = $('tokenBanner');
  if (tokenBannerEl) {
    tokenBannerEl.addEventListener('click', () => {
      if (gameMode === 'host' || gameMode === 'offline') {
        state.initiativeToken = state.initiativeToken === 'blue' ? 'orange' : 'blue';
        toast(state.initiativeToken === 'blue' ? '💎 Initiative token: Blue' : '🔥 Initiative token: Orange');
        if (gameMode === 'host') {
          broadcast({ type: 'state_sync', payload: serializeState() });
        }
        render();
      } else {
        toast('Only the host can flip the initiative token.');
      }
    });
  }

  // ── Character selection ───────────────────────────────────────────────
  function updateSelectedCharDisplay() {
    const disp = $('selectedCharDisplay');
    if (!myCharacter) { disp.style.display = 'none'; return; }
    const c = charData(myCharacter);
    if (!c) { disp.style.display = 'none'; return; }
    const abilityName = c.id === 'emmit' ? 'Reverse Time'
      : c.id === 'hanu'      ? 'Hurry Up'
      : c.id === 'ignatia'   ? 'Chaos Incarnate'
      : c.id === 'tigerclaw' ? 'Poison Token'
      : c.id === 'takahide'  ? "Warlord's Order"
      : c.id === 'tali'      ? 'Ice Barrier'
      : '';
    disp.innerHTML = `
      <img class="selchar-avatar" src="${charAvatarPath(c.id)}" alt="${esc(c.name)}" />
      <div class="selchar-info">
        <span class="selchar-name">${c.special ? c.special + ' ' : ''}${esc(c.name)}</span>
        ${abilityName ? `<span class="selchar-ability">${esc(abilityName)}</span>` : ''}
      </div>
      <button class="selchar-clear" id="btnClearChar">✕</button>
    `;
    disp.style.display = 'flex';
    $('btnClearChar').addEventListener('click', e => { e.stopPropagation(); selectCharacter(''); });
  }

  function selectCharacter(id) {
    myCharacter = id;
    updateSelectedCharDisplay();
    hideCharPicker();
  }

  function showCharPicker() {
    renderCharPicker();
    $('landingMain').style.display  = 'none';
    $('landingMode').style.display  = 'none';
    $('viewCharPick').style.display = 'flex';
  }

  function hideCharPicker() {
    $('viewCharPick').style.display = 'none';
    $('landingMain').style.display  = 'flex';
  }

  function renderCharPicker() {
    const grid = $('charPickGrid');
    let html = `<button class="char-pick-card${!myCharacter ? ' selected' : ''}" data-charid="">
      <div class="char-pick-no-avatar">—</div>
      <span class="char-pick-name">None</span>
    </button>`;
    CHARACTERS.forEach(c => {
      html += `<button class="char-pick-card${myCharacter === c.id ? ' selected' : ''}" data-charid="${c.id}">
        <div class="char-pick-img-wrap"><img src="${charAvatarPath(c.id)}" alt="${esc(c.name)}" loading="lazy" /></div>
        <span class="char-pick-name">${esc(c.name)}</span>
      </button>`;
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.char-pick-card').forEach(card =>
      card.addEventListener('click', () => selectCharacter(card.dataset.charid))
    );
  }

  function applyCharacterTheme() {
    const view    = $('viewInitiative');
    const banner  = $('initiativeCharBanner');
    const title   = $('initiativePhaseTitle');
    const ability = $('initiativeCharAbility');
    if (!view || !banner) return;
    const isOnline = gameMode === 'host' || gameMode === 'player';
    if (!isOnline || !myCharacter) {
      banner.style.display = 'none';
      view.classList.remove('char-themed');
      view.style.removeProperty('--char-accent');
      view.style.removeProperty('--char-accent-dim');
      view.style.removeProperty('background');
      if (title) title.style.display = '';
      return;
    }
    const c = charData(myCharacter);
    if (!c) {
      banner.style.display = 'none';
      view.classList.remove('char-themed');
      view.style.removeProperty('background');
      if (title) title.style.display = '';
      return;
    }
    $('initiativeCharImg').src = charAvatarPath(c.id);
    $('initiativeCharName').textContent = (c.special ? c.special + ' ' : '') + c.name;
    const subtitle = $('initiativeCharSubtitle');
    if (subtitle) { subtitle.textContent = c.subtitle || ''; }
    if (ability) {
      const abilityText = c.id === 'emmit' ? 'Reverse Time' : c.id === 'hanu' ? 'Hurry Up' : c.id === 'ignatia' ? 'Chaos Incarnate' : '';
      ability.textContent = abilityText ? '— ' + abilityText : '';
      ability.style.display = abilityText ? '' : 'none';
    }
    const quote = $('initiativeCharQuote');
    if (quote && !quote.textContent) {
      const pool = c.quotes && c.quotes.length ? c.quotes : [];
      const picked = pool[Math.floor(Math.random() * pool.length)] || '';
      quote.textContent = picked ? '“' + picked + '”' : '';
    }
    banner.style.display = 'block';
    view.classList.add('char-themed');
    view.style.setProperty('--char-accent', c.accent);
    view.style.setProperty('--char-accent-dim', c.accent + '30');
    // Atmospheric background glow matching the character
    view.style.background = `radial-gradient(ellipse 110% 45% at 50% 0%, ${c.accent}1A 0%, transparent 75%)`;
    if (title) title.style.display = 'none';
  }

  $('btnPickChar').addEventListener('click', showCharPicker);
  $('btnBackFromCharPick').addEventListener('click', hideCharPicker);

  $('btnCancelHurryUp').addEventListener('click', () => {
    $('hurryUpPanel').style.display = 'none';
  });

  $('btnCancelPoison').addEventListener('click', () => {
    $('poisonPanel').style.display = 'none';
  });

  $('btnCancelTakahide').addEventListener('click', () => {
    $('takahidePanel').style.display = 'none';
  });

  $('btnCancelTali').addEventListener('click', () => {
    $('taliPanel').style.display = 'none';
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  showLanding();

})();
