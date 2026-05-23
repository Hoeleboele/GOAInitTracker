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
  let hostTokenChoice = 'blue'; // host only: which team starts with token

  let state = {
    phase:            'lobby',  // 'lobby'|'initiative'|'turns'|'round-complete'
    players:          {},       // { [id]: Player }
    turns:            [],
    currentTurnIndex: 0,
    initiativeToken:  'blue',   // 'blue' | 'orange'
    mixedTies:        {},       // { [initiative]: { bluePool, orangePool } }
  };

  // initiative pad state
  let initValue  = '';
  let initLocked = false;

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

  const VIEWS = ['viewLobbyHost','viewLobbyPlayer','viewInitiative','viewTurns','viewRoundComplete'];
  function show(id) {
    VIEWS.forEach(v => $(v).style.display = v === id ? 'block' : 'none');
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function render() {
    const players = Object.values(state.players);
    $('btnLeave').textContent = gameMode === 'host' ? 'Close' : 'Leave';

    // Token banner — visible whenever a game is in progress
    const tb  = $('tokenBanner');
    const tok = state.initiativeToken || 'blue';
    if (state.phase !== 'lobby') {
      tb.className   = `token-banner ${tok}`;
      tb.textContent = tok === 'blue' ? '🔵 Blue has the initiative token' : '🟠 Orange has the initiative token';
      tb.style.display = 'block';
    } else {
      tb.style.display = 'none';
    }

    switch (state.phase) {

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
        renderPlayers('initiativePlayers', players);
        $('btnLock').disabled = !initValue || initLocked;
        break;

      case 'turns': {
        show('viewTurns');
        renderTurnList('turnsList');
        break;
      }

      case 'round-complete':
        show('viewRoundComplete');
        renderTurnList('roundSummary');
        $('btnNewRound').style.display    = gameMode === 'host' ? 'block' : 'none';
        $('newRoundHint').style.display   = gameMode === 'host' ? 'none'  : 'block';
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
      return `
        <div class="player-row${isMe ? ' is-me' : ''}">
          <span class="player-name">
            ${teamDot}${esc(p.name)}${isMe ? '<span class="me-tag">(you)</span>' : ''}
          </span>
          <span class="pstatus ${statusClass}">${statusText}</span>
        </div>`;
    }).join('');
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
      const names       = isMixedSlot
                        ? players.map(p => esc(p.name)).join(' / ') + ' <em>(any&nbsp;1)</em>'
                        : players.map(p => esc(p.name)).join(' & ');
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
      const isMyTurn     = active && (active.players || []).some(p => p.id === myId);
      const iAlreadyDone = active && (active.doneIds || []).includes(myId);
      $('turnActions').style.display = (isMyTurn && !iAlreadyDone) ? 'block' : 'none';
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
    $('btnLock').style.display = 'none';
    $('btnEdit').style.display = 'block';
    $('lockStatus').textContent = '✓ Locked in — waiting for others';
    sendToHost({ type: 'initiative_locked',
      payload: { playerId: myId, initiative: +initValue } });
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
    sendToHost({ type: 'turn_ended', payload: { playerId: myId } });
  });

  $('btnNewRound').addEventListener('click', () => {
    if (gameMode === 'host') startNewRound();
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
    state.initiativeToken = hostTokenChoice;
    Object.keys(state.players).forEach(id => {
      state.players[id] = { ...state.players[id],
        submissionStatus: 'not-submitted', initiative: undefined };
    });
    resetInitPad();
    broadcast({ type: 'game_started', payload: { initiativeToken: hostTokenChoice } });
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
    const sortedVals = Object.keys(byVal).map(Number).sort((a, b) => b - a);

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
                 initiativeToken: state.initiativeToken, mixedTies: state.mixedTies } });
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
    state.phase = 'initiative';
    state.turns = [];
    state.currentTurnIndex = 0;
    state.mixedTies = {};
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
      phase:            state.phase,
      players:          state.players,
      turns:            state.turns,
      currentTurnIndex: state.currentTurnIndex,
      initiativeToken:  state.initiativeToken,
      mixedTies:        state.mixedTies,
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
        applyInitiativeLocked(msg.payload.playerId, msg.payload.initiative);
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
        state.phase = 'initiative';
        state.initiativeToken = msg.payload.initiativeToken || 'blue';
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
        render();
        break;

      case 'turns_revealed':
        state.turns            = msg.payload.turns;
        state.currentTurnIndex = msg.payload.currentTurnIndex;
        state.phase            = 'turns';
        state.initiativeToken  = msg.payload.initiativeToken || state.initiativeToken;
        state.mixedTies        = msg.payload.mixedTies || {};
        render();
        break;

      case 'turn_advanced':
        state.turns            = msg.payload.turns;
        state.currentTurnIndex = msg.payload.currentTurnIndex;
        if (msg.payload.initiativeToken !== undefined) state.initiativeToken = msg.payload.initiativeToken;
        if (msg.payload.mixedTies       !== undefined) state.mixedTies       = msg.payload.mixedTies;
        render();
        break;

      case 'round_ended':
        state.turns = state.turns.map(t => ({ ...t, status: 'completed' }));
        state.phase = 'round-complete';
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
            name: myName, team: myTeam,
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
            name: myName, team: myTeam,
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
    state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue' };
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

  // ── Boot ────────────────────────────────────────────────────────────────
  showLanding();

})();
