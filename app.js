// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
(() => {

  // ── State ──────────────────────────────────────────────────────────────
  let gameMode    = null;   // 'host' | 'player'
  let peer        = null;
  let hostConn    = null;   // player → host
  let playerConns = {};     // host: { peerId: DataConnection }

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
  let lastNotifiedTurnIndex = -1; // tracks last turn we fired the notification for

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

  // ── Character helpers ────────────────────────────────────────────────────
    const CHARACTERS = [
    { id: 'arien',       name: 'Arien',        subtitle: 'the Tidemaster',    accent: '#70B858',
      quotes: ['The tide does not ask permission. Neither do I.', 'Elegance is not weakness. My blade has never missed.', 'Every current bends to me. Can you say the same?', "Steel and sea — I have mastered both.", "They called it noble. I call it winning."] },
    { id: 'bain',        name: 'Bain',          subtitle: 'the Bounty Hunter', accent: '#6888C8',
      quotes: ["There's a price on your head. I already spent it.", 'My sister takes the gold. I take the shot.', 'Run all you want. The bolt is already in the air.', "I never miss twice. I barely miss once.", "The contract is simple: find, follow, finish."] },
    { id: 'brogan',      name: 'Brogan',        subtitle: 'the Destroyer',     accent: '#B07040',
      quotes: ["I don't need to be fast. I just need one swing.", 'Every scar I carry was worth giving.', 'They called me slow. They called me that once.', "The ground shakes when I decide to move.", "Small moves, big problems. Mine are bigger."] },
    { id: 'brynn',       name: 'Brynn',         subtitle: 'the Seeker',        accent: '#D07898',
      quotes: ['The higher the wall, the better the view.', "My picks don't distinguish between ice and armor.", "Every obstacle is an opportunity. I've found many.", "I have climbed walls people thought were ceilings.", "Lock, vault, glacier — same answer, same picks."] },
    { id: 'cutter',      name: 'Cutter',        subtitle: 'the Sky Pirate',    accent: '#50A8C0',
      quotes: ["Gold doesn't spend itself. That's what I'm for.", 'My brother takes the shot. I take everything else.', "The sky is free. Everything on it — that's mine.", "From up here, everything looks like a target. How convenient.", "Call it piracy. I call it redistributing wealth."] },
    { id: 'dodger',      name: 'Dodger',        subtitle: 'the Warlock',       accent: '#C0A830',
      quotes: ["I don't bury the dead. I put them to work.", 'Every corpse on this field owes me a favor.', 'Death is just another resource. I waste nothing.', "They fought bravely. Now they fight for me.", "The battlefield never empties. It just changes sides."] },
    { id: 'emmit',       name: 'Emmitt',        subtitle: 'the Traveler',      accent: '#8080CC', special: '⏪',
      quotes: ["I've seen how this ends. Let's try a different path.", "Speed is not running away. It's arriving first.", "Time is a river. I'm the one with the oar.", "You blinked. I went back and already won.", "Every mistake I make, I make sure to unmake."] },
    { id: 'garrus',      name: 'Garrus',        subtitle: 'the Gladiator',     accent: '#9080C0',
      quotes: ['The arena remembers every name. Yours ends today.', 'One howl and they scatter. I prefer it when they run.', 'Man and hound, bound by glory. Fear us both.', "We trained for glory. We stayed for the hunt.", "Hound and blade. Neither has ever failed me."] },
    { id: 'gydion',      name: 'Gydion',        subtitle: 'the Archwizard',    accent: '#58C0A0',
      quotes: ['Every page of my spellbook has ended a dynasty.', 'You face a library of devastation. Pick your chapter.', 'Wisdom and power are the same word in my book.', "I have forgotten more spells than you will ever learn.", "The arcane does not tire. Neither do I."] },
    { id: 'hanu',        name: 'Hanu',          subtitle: 'the Trickster',     accent: '#CC4030', special: '⚡',
      quotes: ["Blink and you'll miss me. I'll already be there.", "I don't need to hit hard. I just need your plan to fail.", "Alone I'm a nuisance. With friends, I'm a catastrophe.", "My enemies make plans. I make them regret plans.", "Speed and spite — a devastating combination."] },
    { id: 'ignatia',     name: 'Ignatia',       subtitle: 'the Mad',           accent: '#C060D8', special: '🌀',
      quotes: ["Order is just chaos that hasn't woken up yet.", 'I rolled the dice. The dice caught fire. Close enough.', 'They said unpredictable like it was an insult.', "The plan was wrong. I improved it by ignoring it.", "I thrive in the unexpected. Luckily, I cause most of it."] },
    { id: 'min',         name: 'Min',           subtitle: 'the Dragonmonk',    accent: '#E0B040',
      quotes: ['Dragon, crane, serpent — pick which kills you faster.', 'I fight in stances. You fight in panic. Fair enough.', 'The smoke clears. By then, the mine has already spoken.', "Every stance is a language. I speak all of them.", "The dragon does not explain itself. Neither do I."] },
    { id: 'misa',        name: 'Misa',          subtitle: 'the Samurai',       accent: '#E07070',
      quotes: ["A single breath. A single cut. Then I'm already gone.", 'Honor is not slow. Watch how fast I prove it.', 'They said she can fly. The last thing they ever said.', "The blade remembered the way. My hand simply followed.", "Swift, clean, final. That is my code."] },
    { id: 'mortimer',    name: 'Mortimer',      subtitle: 'the Awakener',      accent: '#70B870',
      quotes: ['Death is not an ending. It is an introduction.', 'My minions march to the beat. Quite literally.', "I don't mourn the fallen. I conduct them.", "Every soldier I lose becomes a soldier I keep.", "The symphony never ends. The performers just rotate."] },
    { id: 'mrak',        name: 'Mrak',          subtitle: 'the Rockshaper',    accent: '#C04040',
      quotes: ['The stone speaks to me. Today it says: flatten them.', 'I am not slow. I am inevitable.', 'You cannot fight the mountain. You can only survive it.', "Soft things break. I shaped myself from stone.", "Every wall you hide behind was made by someone like me."] },
    { id: 'nebkher',     name: 'NebKher',       subtitle: 'the Harbinger',     accent: '#D0A858',
      quotes: ['My mirror walks where I do not. Even I forget which is real.', 'The sands of Atlantis remember my name. You should too.', "Mwahahaha — yes, that's mandatory. Now kneel.", "My reflection has its own plans. We rarely disagree.", "To face me is to face twice the problem."] },
    { id: 'razzle',      name: 'Razzle',        subtitle: 'the Ringmaster',    accent: '#F04880',
      quotes: ["Which one is the real me? Honestly, I've lost track.", 'Step right in — and pray the exit is real.', "Three of me, none of us takes a hit. Marvelous, isn't it?", "The show never stops. The exits, however, do.", "Illusion or reality? I suggest you not find out."] },
    { id: 'rowenna',     name: 'Rowenna',       subtitle: 'the Vanguard',      accent: '#D07840',
      quotes: ["I go first so others don't have to.", 'There is no glory in a cowardly victory.', "Fair is not weak. Ask anyone I've beaten.", "The shield does not waver. I made sure of that.", "My stand is your shelter. That is enough for me."] },
    { id: 'sabina',      name: 'Sabina',        subtitle: 'the Commander',     accent: '#88B8D8',
      quotes: ['By the time you see my pistol, the trap is already set.', "Victory is not luck. It's preparation meeting chaos.", "I don't shoot first. I position first. Then I shoot first.", "The battlefield is a board. I have already played my turn.", "Every shot I fire was planned three moves ago."] },
    { id: 'silverarrow', name: 'Silverarrow',   subtitle: 'the Pathfinder',    accent: '#B8D0E8',
      quotes: ["I've mapped every path. This is the one we take.", 'Distance is my armor. I need no other.', 'They think terrain slows me. Terrain is my shortcut.', "The arrow knows the way. I simply point it there.", "I have never needed to be close to be effective."] },
    { id: 'snorri',      name: 'Snorri',        subtitle: 'the Runescribe',    accent: '#A8C0D8',
      quotes: ['The rune does not lie. I merely choose which truth to write.', 'Carve the right symbol and reality bends to you.', 'Every ability has a better version. I write the upgrade.', "Write the rune. Rewrite the fight.", "My pen has won more battles than your sword."] },
    { id: 'swift',       name: 'Swift',         subtitle: 'the Sharpshooter',  accent: '#78D898',
      quotes: ['One shot. One truth.', "Far for the rifle, close for the blast. I'm ready either way.", 'The jetpack is for a better angle. Not for running.', "I do not spray and pray. I aim and know.", "Elevation is just another word for advantage."] },
    { id: 'takahide',    name: 'Takahide',      subtitle: 'the Warlord',       accent: '#C89060',
      quotes: ['Nations kneel. Armies follow. I nap afterward.', 'The sake flows. The tactics hold. Victory is already mine.', "Why rush? I've already won. I'm just being polite.", "Generals worry. I plan. There is a difference.", "The field is mine before the first step is taken."] },
    { id: 'tali',        name: 'Tali',          subtitle: 'the Spirit Caller', accent: '#D8A0C0',
      quotes: ['The spirits do not forgive those who disturb their rest.', 'Every totem I place is a promise. The ice delivers it.', 'The battlefield freezes. The spirits smile. So do I.', "The frozen do not argue. They wait.", "Each totem whispers to the cold. The cold obeys."] },
    { id: 'tigerclaw',   name: 'Tigerclaw',     subtitle: 'the Cutpurse',      accent: '#E8A030',
      quotes: ["What's yours is yours — until I blink through you.", "Fastest hands in Atlantis. Not that you'd feel them.", "I was never here. Your coins disagree.", "By the time you feel the loss, I am three streets away.", "They guard their gold like I cannot reach through walls."] },
    { id: 'trinkets',    name: 'Trinkets',      subtitle: 'the Scavenger',     accent: '#C8D060',
      quotes: ['Why fight them myself when the turret is right there?', "One guard's trash is my greatest military asset.", 'Dig in. Build up. Let steel do the talking.', "Every battlefield leaves scraps. I leave artillery.", "You brought a weapon. I brought an arsenal I found here."] },
    { id: 'ursafar',     name: 'Ursafar',       subtitle: 'the Savage',        accent: '#A87840',
      quotes: ['Pain is a teacher. I have graduated.', "I'm the slowest thing on this field. None of that matters.", "Rage is not a weakness. It's the dial turning to eleven.", "I do not need to be the fastest. Just the last one standing.", "Hit me harder. I will hit back harder still."] },
    { id: 'wasp',        name: 'Wasp',          subtitle: 'the Warmaiden',     accent: '#88C840',
      quotes: ['Stay in the field or leave it. I control both.', 'The boomerang comes back. So does the voltage.', 'They called it reckless. The field was already live.', "The current runs through everything I touch. Careful.", "My range is longer than you think. So is my patience."] },
    { id: 'whisper',     name: 'Whisper',       subtitle: 'the Outcast',       accent: '#A888D0',
      quotes: ['The wounded cannot hide. Blood has a scent.', 'Run. It only makes the chase worth having.', 'I sentence you — not to death. To running from me.', "Every wound you carry leads me to you.", "The dark does not hide you. It just hides me better."] },
    { id: 'widget',      name: 'Widget & Pyro', subtitle: 'the Scavenger Duo', accent: '#58C8E0',
      quotes: ["Pyro breathes fire. I aim it. We're very professional.", "Two minds, one plan. Usually Pyro's. I just survive it.", 'The temple walls echo our names. For good reason.', "Widget steers. Pyro inspires. Usually at the same time.", "We have burned our way through worse than this."] },
    { id: 'wuk',         name: 'Wuk',           subtitle: 'the Grove Guardian',accent: '#E06840',
      quotes: ['The grove does not forgive trespassers. Neither do I.', 'Plant enough trees and the battlefield becomes my home.', 'Every root I grow is a trap waiting to wake.', "The forest remembers every intruder. I help it remember.", "Take one step off the path. My roots will find you."] },
    { id: 'xargatha',    name: 'Xargatha',      subtitle: 'the Changed',       accent: '#B04060',
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
    $('landingMain').style.display     = 'flex';
    $('viewCharPick').style.display    = 'none';
    $('codeInput').value = '';
    setStatus('');
  }

  function showApp() {
    $('landing').style.display = 'none';
    $('app').style.display     = 'flex';
  }

  const VIEWS = ['viewOfflineSetup','viewLobbyHost','viewLobbyPlayer','viewInitiative','viewTurns','viewRoundComplete'];
  function show(id) {
    VIEWS.forEach(v => $(v).style.display = v === id ? 'block' : 'none');
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
        $('initiativeDisplay').textContent = initValue || '—';
        $('btnLock').disabled = !initValue || initLocked;
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
    el.innerHTML = players.map(p => {
      const isMe = p.id === myId;
      const disc = !p.isConnected;
      const statusClass = disc ? 'pstatus-disconnected'
        : p.submissionStatus === 'locked'    ? 'pstatus-locked'
        : p.submissionStatus === 'submitted' ? 'pstatus-submitted'
        :                                      'pstatus-waiting';
      const statusText = disc ? 'Disconnected'
        : p.submissionStatus === 'locked'    ? 'Locked ✓'
        : p.submissionStatus === 'submitted' ? 'Entered…'
        :                                      'Waiting…';
      const teamDot = p.team ? `<span class="team-dot ${p.team}"></span>` : '';
      const charTag = p.character ? `<span class="char-badge">· ${charLabel(p.character)}</span>` : '';
      return `
        <div class="player-row${isMe ? ' is-me' : ''}">
          <span class="player-name">
            ${teamDot}${esc(p.name)}${charTag}${isMe ? '<span class="me-tag">(you)</span>' : ''}
          </span>
          <span class="pstatus ${statusClass}">${statusText}</span>
        </div>`;
    }).join('');
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
                        : (!isSimul && players[0] && players[0].team) ? ` team-${players[0].team}` : '';
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
        <div class="turn-row${cls}${teamCls}">
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

    // Hanu — Hurry Up: Hanu player on their active turn; online host always; offline only on Hanu's turn
    const activeIds    = active ? (active.players || []).map(p => p.id) : [];
    const hanuOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'hanu');
    const canHurryUp   = (myCharacter === 'hanu' && hanuOnActive)
                      || (isHost && hasHanu)
                      || (isOffline && hanuOnActive);

    // Ignatia — Chaos Incarnate: Ignatia player; online host always; offline only on Ignatia's turn
    const ignatiaOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'ignatia');
    const canChaos = (myCharacter === 'ignatia')
                  || (isHost && hasIgnatia)
                  || (isOffline && ignatiaOnActive);

    // Tigerclaw — Poison Token: only during Tigerclaw's own turn
    const tigerclawOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'tigerclaw');
    const canPoison = tigerclawOnActive && (myCharacter === 'tigerclaw' || isHost || isOffline);

    // Takahide — Warlord's Order: only during Takahide's own turn
    const takahideOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'takahide');
    const canOrder = takahideOnActive && (myCharacter === 'takahide' || isHost || isOffline);

    const panel = $('abilityPanel');
    if (!canHurryUp && !canChaos && !canPoison && !canOrder) { panel.style.display = 'none'; return; }

    panel.style.display = 'flex';
    let html = '';
    if (canHurryUp) {
      html += `<button class="ability-btn hanu-ability" id="btnHurryUp">⚡ Hurry Up!</button>`;
    }
    if (canChaos) {
      html += `<button class="ability-btn ignatia-ability" id="btnChaosIncarnate">🌀 Chaos Incarnate</button>`;
    }
    if (canPoison) {
      html += `<button class="ability-btn tigerclaw-ability" id="btnPoisonToken">☠️ Poison Token</button>`;
    }
    if (canOrder) {
      html += `<button class="ability-btn takahide-ability" id="btnWarlordOrder">⚔️ Warlord's Order</button>`;
    }
    panel.innerHTML = html;

    if (canHurryUp) {
      $('btnHurryUp').addEventListener('click', showHurryUpPanel);
    }
    if (canChaos) {
      $('btnChaosIncarnate').addEventListener('click', () =>
        sendToHost({ type: 'use_chaos_incarnate' }));
    }
    if (canPoison) {
      $('btnPoisonToken').addEventListener('click', showPoisonPanel);
    }
    if (canOrder) {
      $('btnWarlordOrder').addEventListener('click', showTakahidePanel);
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
          sendToHost({ type: 'use_hurry_up', payload: { targetId: btn.dataset.id } });
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
    // Remove from all mixed-tie pools
    Object.keys(state.mixedTies).forEach(init => {
      const tie = state.mixedTies[+init];
      tie.bluePool   = tie.bluePool.filter(p => p.id !== targetId);
      tie.orangePool = tie.orangePool.filter(p => p.id !== targetId);
    });
  }

  function applyHurryUp(targetId) {
    const target = state.players[targetId];
    if (!target) return;
    const NEW_INIT = 11;
    const cur      = state.currentTurnIndex;

    purgePlayerFromUpcoming(targetId);
    state.players[targetId] = { ...target, initiative: NEW_INIT };

    // Find insertion position based on sort order
    let insertAt = state.turns.length;
    for (let i = cur + 1; i < state.turns.length; i++) {
      const before = state.reverseInitiative
        ? state.turns[i].initiative > NEW_INIT
        : state.turns[i].initiative < NEW_INIT;
      if (before) { insertAt = i; break; }
    }
    state.turns.splice(insertAt, 0, {
      order:      0,
      players:    [{ id: targetId, name: target.name, team: target.team }],
      initiative: NEW_INIT,
      status:     'pending',
      doneIds:    [],
    });
    state.turns.forEach((t, i) => { t.order = i + 1; });

    toast(`⚡ ${esc(target.name)} rushes to initiative 11!`);
    broadcast({ type: 'turn_advanced',
      payload: { turns: state.turns, currentTurnIndex: cur,
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies,
                 reverseInitiative: state.reverseInitiative } });
    render();
  }

  function showPoisonPanel() {
    $('poisonPanel').style.display = 'block';
    const tigerPlayer = Object.values(state.players).find(p => p.character === 'tigerclaw');
    const tigerTeam   = tigerPlayer ? tigerPlayer.team : null;
    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.team !== tigerTeam
    );
    if (!targets.length) {
      $('poisonTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No enemy players.</p>';
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
          sendToHost({ type: 'use_poison', payload: { targetId: btn.dataset.id, penalty: +btn.dataset.penalty } });
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
    // Re-insert at new initiative
    let insertAt = state.turns.length;
    for (let j = cur + 1; j < state.turns.length; j++) {
      const before = state.reverseInitiative
        ? state.turns[j].initiative > newInit
        : state.turns[j].initiative < newInit;
      if (before) { insertAt = j; break; }
    }
    state.turns.splice(insertAt, 0, {
      order: 0, players: [{ id: targetId, name: target.name, team: target.team }],
      initiative: newInit, status: 'pending', doneIds: [],
    });
    state.turns.forEach((t, i) => { t.order = i + 1; });
    toast(`☠️ ${esc(target.name)} poisoned! -${penalty} initiative (now ${newInit})`);
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }

  function showTakahidePanel() {
    $('takahidePanel').style.display = 'block';
    const takahidePlayer = Object.values(state.players).find(p => p.character === 'takahide');
    const takaTeam = takahidePlayer ? takahidePlayer.team : null;
    const takaId   = takahidePlayer ? takahidePlayer.id  : null;
    const targets = Object.values(state.players).filter(p =>
      p.isConnected && p.team === takaTeam && p.id !== takaId
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
          sendToHost({ type: 'use_warlord_order', payload: { targetId: btn.dataset.id, newInit: val } });
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
    // Re-insert at new initiative
    let insertAt = state.turns.length;
    for (let j = cur + 1; j < state.turns.length; j++) {
      const before = state.reverseInitiative
        ? state.turns[j].initiative > newInit
        : state.turns[j].initiative < newInit;
      if (before) { insertAt = j; break; }
    }
    state.turns.splice(insertAt, 0, {
      order: 0, players: [{ id: targetId, name: target.name, team: target.team }],
      initiative: newInit, status: 'pending', doneIds: [],
    });
    state.turns.forEach((t, i) => { t.order = i + 1; });
    toast(`⚔️ ${esc(target.name)}'s initiative changed to ${newInit}!`);
    broadcast({ type: 'state_sync', payload: serializeState() });
    render();
  }

  // ── Offline turn advancement ────────────────────────────────────────────
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
    $('initiativeDisplay').textContent = initValue || '—';
    $('btnLock').disabled = !initValue || initLocked;
  }

  document.querySelectorAll('.pad-btn[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (initLocked) return;
      if (initValue.length >= 3) return;
      initValue += btn.dataset.val;
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
    const connected = Object.values(state.players).filter(p => p.isConnected);
    const allLocked = connected.length > 0 && connected.every(p => p.submissionStatus === 'locked');
    if (allLocked) {
      revealTurns();
    } else {
      broadcast({ type: 'state_sync', payload: serializeState() });
      render();
    }
  }

  function revealTurns() {
    const connected = Object.values(state.players).filter(p => p.isConnected);

    // Group players by initiative value
    const byVal = {};
    connected.forEach(p => {
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
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies } });
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
    return {
      phase:             state.phase,
      players:           state.players,
      turns:             state.turns,
      currentTurnIndex:  state.currentTurnIndex,
      initiativeToken:   state.initiativeToken,
      mixedTies:         state.mixedTies,
      hostManagesTurns:  state.hostManagesTurns,
      reverseInitiative: state.reverseInitiative,
    };
  }

  // ── Messaging ───────────────────────────────────────────────────────────
  function broadcast(msg) {
    Object.values(playerConns).forEach(conn => {
      if (conn.open) conn.send(msg);
    });
  }

  // Unified: host handles locally, player sends over wire
  function sendToHost(msg) {
    if (gameMode === 'host' || gameMode === 'offline') {
      handleHostMsg(msg);
    } else if (hostConn && hostConn.open) {
      hostConn.send(msg);
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
      case 'use_chaos_incarnate': {
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
        if (msg.payload.initiativeToken  !== undefined) state.initiativeToken  = msg.payload.initiativeToken;
        if (msg.payload.mixedTies        !== undefined) state.mixedTies        = msg.payload.mixedTies;
        if (msg.payload.reverseInitiative !== undefined) state.reverseInitiative = msg.payload.reverseInitiative;
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
  function setupPlayerConn(conn) {
    conn.on('data',  msg => handleHostMsg(msg));
    conn.on('close', ()  => {
      // Find the player by their PeerJS peer id and mark disconnected
      const found = Object.values(state.players).find(p => p.peerId === conn.peer);
      if (found) {
        state.players[found.id] = { ...state.players[found.id], isConnected: false };
        broadcast({ type: 'state_sync', payload: serializeState() });
        render();
      }
    });
  }

  function tryHost(code) {
    sessionCode = code;
    if (peer) { try { peer.destroy(); } catch (_) {} }
    peer = new Peer(code);

    peer.on('open', id => {
      sessionCode = id.toUpperCase();
      gameMode = 'host';
      myId     = genId();
      myName   = ($('nameInput').value || 'Host').trim();

      state = {
        phase: 'lobby',
        players: {
          [myId]: {
            id: myId, peerId: id,
            name: myName, team: myTeam, character: myCharacter,
            submissionStatus: 'not-submitted',
            isConnected: true,
          },
        },
        turns: [], currentTurnIndex: 0,
        initiativeToken: 'blue',
        mixedTies: {},
      };
      showApp();
      render();
      setStatus('');
    });

    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });

    peer.on('error', err => {
      if (err.type === 'unavailable-id') {
        tryHost(genCode());
      } else {
        setStatus('Error: ' + (err.message || err.type), true);
        gameMode = null;
      }
    });

    peer.on('connection', conn => {
      playerConns[conn.peer] = conn;
      setupPlayerConn(conn);
    });
  }

  function joinGame(code) {
    setStatus('Connecting…');
    gameMode = 'player';
    if (peer) { try { peer.destroy(); } catch (_) {} }
    peer = new Peer();

    peer.on('open', () => {
      hostConn = peer.connect(code);

      hostConn.on('open', () => {
        clearTimeout(joinTimeout);
        myId   = genId();
        myName = ($('nameInput').value || 'Player').trim();
        sessionCode = code;

        state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {} };
        showApp();
        render();
        setStatus('');

        // Announce self to host
        hostConn.send({
          type: 'player_joined',
          payload: {
            id: myId, peerId: peer.id,
            name: myName, team: myTeam, character: myCharacter,
            submissionStatus: 'not-submitted',
            isConnected: true,
          },
        });
      });

      hostConn.on('data',  msg => handlePlayerMsg(msg));

      hostConn.on('error', () => {
        clearTimeout(joinTimeout);
        setStatus('Could not connect — check the code and try again.', true);
        gameMode = null;
      });

      hostConn.on('close', () => {
        $('statusBadge').textContent  = 'disconnected';
        $('statusBadge').className    = 'badge badge-disconnected';
        toast('Connection to host lost.');
      });
    });

    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });

    peer.on('error', err => {
      clearTimeout(joinTimeout);
      setStatus('Network error: ' + (err.message || err.type), true);
      gameMode = null;
    });

    const joinTimeout = setTimeout(() => {
      if (!hostConn || !hostConn.open) {
        setStatus('Connection timed out — check the code and try again.', true);
        gameMode = null;
      }
    }, 10000);
  }

  function cleanup() {
    if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
    hostConn    = null;
    playerConns = {};
    gameMode    = null;
    sessionCode = myId = myName = myTeam = '';
    myCharacter = '';
    updateSelectedCharDisplay();
    offlinePlayers     = [];
    offlineInitIdx     = 0;
    offlineTokenChoice = 'blue';
    hostManagesTurns   = false;
    if ($('chkHostTurns')) $('chkHostTurns').checked = false;
    state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
    resetInitPad();
    applyCharacterTheme();
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
    setStatus('Creating session…');
    tryHost(genCode());
  });

  $('btnShowJoin').addEventListener('click', () => {
    $('landingMain').style.display = 'none';
    $('joinForm').style.display    = 'flex';
    $('codeInput').focus();
  });

  $('btnOffline').addEventListener('click', () => {
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
    const name = ($('nameInput').value || '').trim();
    if (!name) {
      $('joinForm').style.display    = 'none';
      $('landingMain').style.display = 'flex';
      $('nameInput').focus();
      $('nameInput').placeholder = 'Enter your name first!';
      return;
    }
    if (!myTeam) {
      $('joinForm').style.display    = 'none';
      $('landingMain').style.display = 'flex';
      toast('Select your team (Blue or Orange) first!');
      return;
    }
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

  // ── Character selection ───────────────────────────────────────────────
  function updateSelectedCharDisplay() {
    const disp = $('selectedCharDisplay');
    if (!myCharacter) { disp.style.display = 'none'; return; }
    const c = charData(myCharacter);
    if (!c) { disp.style.display = 'none'; return; }
    const abilityName = c.id === 'emmit' ? 'Reverse Time' : c.id === 'hanu' ? 'Hurry Up' : c.id === 'ignatia' ? 'Chaos Incarnate' : '';
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
        <span class="char-pick-name">${c.special ? c.special + ' ' : ''}${esc(c.name)}</span>
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

  // ── Boot ────────────────────────────────────────────────────────────────
  showLanding();

})();
