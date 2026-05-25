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
  let myCharacter  = '';         // 'emmit' | 'hanu' | 'ignatia' | ''
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
  function characterInGame(char) {
    return Object.values(state.players).some(p => p.character === char);
  }
  function charLabel(char) {
    return { emmit: '⏪ Emmit', hanu: '⚡ Hanu', ignatia: '🌀 Ignatia' }[char] || '';
  }

  // ── Show / hide ─────────────────────────────────────────────────────────
  function showLanding() {
    $('landing').style.display = 'flex';
    $('app').style.display     = 'none';
    $('joinForm').style.display        = 'none';
    $('landingMain').style.display     = 'flex';
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
      const charTag = p.character ? `<span class="char-badge">${charLabel(p.character)}</span>` : '';
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
          <option value="emmit"   ${p.character === 'emmit'   ? 'selected' : ''}>⏪ Emmit</option>
          <option value="hanu"    ${p.character === 'hanu'    ? 'selected' : ''}>⚡ Hanu</option>
          <option value="ignatia" ${p.character === 'ignatia' ? 'selected' : ''}>🌀 Ignatia</option>
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
    const hasEmmit   = characterInGame('emmit');
    const hasHanu    = characterInGame('hanu');
    const hasIgnatia = characterInGame('ignatia');
    const active     = state.turns[state.currentTurnIndex];

    // Emmit — Reverse Time: Emmit player always; host/offline if Emmit is in game
    const canRevTime = myCharacter === 'emmit' || ((isHost || isOffline) && hasEmmit);

    // Hanu — Hurry Up: Hanu player on their active turn; host/offline if Hanu is in game
    const activeIds    = active ? (active.players || []).map(p => p.id) : [];
    const hanuOnActive = activeIds.some(id => state.players[id] && state.players[id].character === 'hanu');
    const canHurryUp   = (myCharacter === 'hanu' && hanuOnActive) || ((isHost || isOffline) && hasHanu);

    // Ignatia — Chaos Incarnate: Ignatia player; host/offline if Ignatia is in game
    const canChaos = myCharacter === 'ignatia' || ((isHost || isOffline) && hasIgnatia);

    const panel = $('abilityPanel');
    if (!canRevTime && !canHurryUp && !canChaos) { panel.style.display = 'none'; return; }

    panel.style.display = 'flex';
    let html = '';
    if (canRevTime) {
      const on  = state.reverseInitiative;
      html += `<button class="ability-btn emmit-ability${on ? ' ability-active' : ''}" id="btnReverseTime">
        ⏪ Reverse Time${on ? ' ✓' : ''}</button>`;
    }
    if (canHurryUp) {
      html += `<button class="ability-btn hanu-ability" id="btnHurryUp">⚡ Hurry Up!</button>`;
    }
    if (canChaos) {
      html += `<button class="ability-btn ignatia-ability" id="btnChaosIncarnate">🌀 Chaos Incarnate</button>`;
    }
    panel.innerHTML = html;

    if (canRevTime) {
      $('btnReverseTime').addEventListener('click', () =>
        sendToHost({ type: 'use_reverse_time' }));
    }
    if (canHurryUp) {
      $('btnHurryUp').addEventListener('click', showHurryUpPanel);
    }
    if (canChaos) {
      $('btnChaosIncarnate').addEventListener('click', () =>
        sendToHost({ type: 'use_chaos_incarnate' }));
    }
  }

  function showHurryUpPanel() {
    $('hurryUpPanel').style.display = 'block';
    const targets = Object.values(state.players).filter(p => p.isConnected);
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

  function applyHurryUp(targetId) {
    const target = state.players[targetId];
    if (!target) return;
    const NEW_INIT = 11;
    const cur      = state.currentTurnIndex;

    // Remove target from any future pending turns
    for (let i = state.turns.length - 1; i > cur; i--) {
      const t = state.turns[i];
      if ((t.players || []).some(p => p.id === targetId)) {
        t.players = t.players.filter(p => p.id !== targetId);
        if (t.players.length === 0) state.turns.splice(i, 1);
      }
    }

    state.players[targetId] = { ...target, initiative: NEW_INIT };

    // Find insertion position based on sort order
    let insertAt = state.turns.length;
    for (let i = cur + 1; i < state.turns.length; i++) {
      const before = state.reverseInitiative
        ? state.turns[i].initiative > NEW_INIT   // low→high: insert before higher
        : state.turns[i].initiative < NEW_INIT;  // high→low: insert before lower
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
      // All turns done — show round-complete screen before starting new round
      state.turns.forEach(t => { t.status = 'completed'; });
      state.phase = 'round-complete';
      broadcast({ type: 'round_ended',
        payload: { initiativeToken: state.initiativeToken } });
      render();
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
    if (gameMode === 'host') {
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
    offlinePlayers     = [];
    offlineInitIdx     = 0;
    offlineTokenChoice = 'blue';
    hostManagesTurns   = false;
    if ($('chkHostTurns')) $('chkHostTurns').checked = false;
    // Reset character buttons
    ['btnCharNone','btnCharEmmit','btnCharHanu','btnCharIgnatia'].forEach(id => {
      const el = $(id); if (el) el.classList.remove('selected');
    });
    const none = $('btnCharNone'); if (none) none.classList.add('selected');
    state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
    resetInitPad();
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
  const charBtns = {
    btnCharNone:    '',
    btnCharEmmit:   'emmit',
    btnCharHanu:    'hanu',
    btnCharIgnatia: 'ignatia',
  };
  Object.entries(charBtns).forEach(([btnId, char]) => {
    $(btnId).addEventListener('click', () => {
      myCharacter = char;
      Object.keys(charBtns).forEach(id => $(id).classList.remove('selected'));
      $(btnId).classList.add('selected');
    });
  });

  $('btnCancelHurryUp').addEventListener('click', () => {
    $('hurryUpPanel').style.display = 'none';
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  showLanding();

})();
