// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Network module — Socket.IO connection, broadcast, host/player message handlers

window.GoA = window.GoA || {};

// ── Broadcast message to all connected players ────────────────────────────
GoA.broadcast = function(msg) {
  if (GoA.gameMode === 'host' || GoA.gameMode === 'offline') {
    if (GoA.socket && GoA.socket.connected) GoA.socket.emit('host_event', { code: GoA.sessionCode, msg });
  } else if (GoA.socket && GoA.socket.connected) {
    GoA.socket.emit('player_event', { code: GoA.sessionCode, msg });
  }
};

// ── Send message to host (or handle locally if host) ────────────────────────
GoA.sendToHost = function(msg) {
  if (GoA.gameMode === 'host' || GoA.gameMode === 'offline') {
    GoA.handleHostMsg(msg);
  } else if (GoA.socket && GoA.socket.connected) {
    GoA.socket.emit('player_event', { code: GoA.sessionCode, msg });
  }
};

// ── Handle messages for the host ───────────────────────────────────────────
GoA.handleHostMsg = function(msg) {
  switch (msg.type) {
    case 'player_joined': {
      const p = msg.payload;
      GoA.state.players[p.id] = p;
      GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      GoA.render();
      break;
    }
    case 'player_rejoined': {
      const p = msg.payload;
      if (GoA.state.players[p.id]) {
        // Restore existing slot: update connection info and mark connected
        GoA.state.players[p.id] = {
          ...GoA.state.players[p.id],
          peerId: p.peerId,
          isConnected: true,
          disconnectedAt: undefined,
        };
      } else {
        // Unknown ID — treat as a new player
        GoA.state.players[p.id] = { ...p, submissionStatus: 'not-submitted' };
      }
      // Send the full current state to the reconnecting player
      GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      GoA.render();
      break;
    }
    case 'player_initiative_updated': {
      const { playerId, initiative } = msg.payload;
      if (GoA.state.players[playerId]) {
        GoA.state.players[playerId] = { ...GoA.state.players[playerId],
          initiative, submissionStatus: 'submitted' };
      }
      GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      GoA.render();
      break;
    }
    case 'initiative_locked': {
      if (msg.payload.reverseTime) GoA.state.reverseInitiative = true;
      GoA.applyInitiativeLocked(msg.payload.playerId, msg.payload.initiative);
      break;
    }
    case 'use_reverse_time': {
      GoA.state.reverseInitiative = !GoA.state.reverseInitiative;
      if (GoA.state.phase === 'turns') {
        const cur = GoA.state.currentTurnIndex;
        const pending = GoA.state.turns.slice(cur + 1);
        pending.sort((a, b) => GoA.state.reverseInitiative ? a.initiative - b.initiative : b.initiative - a.initiative);
        GoA.state.turns.splice(cur + 1, GoA.state.turns.length - cur - 1, ...pending);
        GoA.state.turns.forEach((t, i) => { t.order = i + 1; });
        GoA.broadcast({ type: 'turn_advanced',
          payload: { turns: GoA.state.turns, currentTurnIndex: cur,
            initiativeToken: GoA.state.initiativeToken, mixedTies: GoA.state.mixedTies,
            reverseInitiative: GoA.state.reverseInitiative } });
      } else {
        GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      }
      GoA.toast(GoA.state.reverseInitiative ? '⏪ Reverse Time: now low → high' : '⏪ Time restored: high → low');
      GoA.render();
      break;
    }
    case 'use_hurry_up': {
      GoA.applyHurryUp(msg.payload.targetId);
      break;
    }
    case 'use_poison': {
      GoA.applyPoison(msg.payload.targetId, msg.payload.penalty);
      break;
    }
    case 'use_warlord_order': {
      GoA.applyWarlordOrder(msg.payload.targetId, msg.payload.newInit);
      break;
    }
    case 'use_ice_barrier': {
      GoA.applyIceBarrier(msg.payload.targetId, msg.payload.penalty);
      break;
    }
    case 'use_chaos_incarnate': {
      GoA.usedAbilitiesThisTurn.add('chaos');
      GoA.state.initiativeToken = GoA.state.initiativeToken === 'blue' ? 'orange' : 'blue';
      GoA.toast('🌀 Chaos Incarnate! Token flipped to ' + GoA.state.initiativeToken + '.');
      GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      GoA.render();
      break;
    }
    case 'turn_ended': {
      const { playerId } = msg.payload;
      const turn = GoA.state.turns[GoA.state.currentTurnIndex];
      if (!turn) break;
      if (!turn.doneIds) turn.doneIds = [];
      // Only candidates listed for this turn may end it
      const eligible = (turn.players || []).some(p => p.id === playerId);
      if (!eligible || turn.doneIds.includes(playerId)) break;
      turn.doneIds.push(playerId);
      // Mixed-tie team slots complete when any 1 player ends their turn
      const required = turn.mixedTieSlot ? 1 : (turn.players || []).length;
      if (turn.doneIds.length >= required) {
        GoA.advanceTurn();
      } else {
        GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
        GoA.render();
      }
      break;
    }
    case 'kill_player': {
      GoA.killPlayerThisRound(msg.payload.targetId);
      break;
    }
  }
};

// ── Handle messages for players ────────────────────────────────────────────
GoA.handlePlayerMsg = function(msg) {
  switch (msg.type) {
    case 'game_started':
      GoA.state.phase = 'initiative';
      GoA.state.initiativeToken = msg.payload.initiativeToken || 'blue';
      GoA.state.hostManagesTurns = msg.payload.hostManagesTurns || false;
      Object.keys(GoA.state.players).forEach(id => {
        GoA.state.players[id] = { ...GoA.state.players[id],
          submissionStatus: 'not-submitted', initiative: undefined };
      });
      GoA.resetInitPad();
      GoA.render();
      break;

    case 'state_sync':
      GoA.state.players = msg.payload.players;
      GoA.state.phase = msg.payload.phase;
      GoA.state.turns = msg.payload.turns || [];
      GoA.state.currentTurnIndex = msg.payload.currentTurnIndex || 0;
      GoA.state.initiativeToken = msg.payload.initiativeToken || GoA.state.initiativeToken;
      GoA.state.mixedTies = msg.payload.mixedTies || {};
      GoA.state.hostManagesTurns = msg.payload.hostManagesTurns || false;
      GoA.state.reverseInitiative = msg.payload.reverseInitiative || false;
      if (msg.payload.usedAbilities) GoA.usedAbilitiesThisTurn = new Set(msg.payload.usedAbilities);
      GoA.render();
      break;

    case 'turns_revealed':
      GoA.state.turns = msg.payload.turns;
      GoA.state.currentTurnIndex = msg.payload.currentTurnIndex;
      GoA.state.phase = 'turns';
      GoA.state.initiativeToken = msg.payload.initiativeToken || GoA.state.initiativeToken;
      GoA.state.mixedTies = msg.payload.mixedTies || {};
      GoA.state.reverseInitiative = msg.payload.reverseInitiative || false;
      GoA.render();
      break;

    case 'turn_advanced':
      GoA.state.turns = msg.payload.turns;
      GoA.state.currentTurnIndex = msg.payload.currentTurnIndex;
      if (msg.payload.initiativeToken !== undefined) GoA.state.initiativeToken = msg.payload.initiativeToken;
      if (msg.payload.mixedTies !== undefined) GoA.state.mixedTies = msg.payload.mixedTies;
      if (msg.payload.reverseInitiative !== undefined) GoA.state.reverseInitiative = msg.payload.reverseInitiative;
      if (msg.payload.usedAbilities !== undefined) GoA.usedAbilitiesThisTurn = new Set(msg.payload.usedAbilities);
      GoA.render();
      break;

    case 'round_ended':
      GoA.state.turns = GoA.state.turns.map(t => ({ ...t, status: 'completed' }));
      GoA.state.phase = 'round-complete';
      if (msg.payload && msg.payload.initiativeToken) {
        GoA.state.initiativeToken = msg.payload.initiativeToken;
      }
      GoA.render();
      break;

    case 'new_round':
      GoA.state.phase = 'initiative';
      GoA.state.players = msg.payload.players;
      GoA.state.turns = [];
      GoA.state.currentTurnIndex = 0;
      GoA.state.initiativeToken = msg.payload.initiativeToken || GoA.state.initiativeToken;
      GoA.resetInitPad();
      GoA.render();
      break;

    case 'session_closed':
      // Host unexpectedly disconnected — preserve reconnect data so player can rejoin
      try { GoA.saveReconnectData(); } catch (_) {}
      GoA.toast('Host closed the session.');
      GoA.cleanup({ keepReconnect: true });
      GoA.showLanding();
      break;
  }
};

// ── Legacy PeerJS (no-op for Socket.IO) ────────────────────────────────────
GoA.setupPlayerConn = function(conn) {
  // No-op: Socket.IO handles player sockets on the server and forwards events
};

// ── Host connection flow ───────────────────────────────────────────────────
GoA.tryHost = function(code, opts = {}) {
  GoA.sessionCode = (code || '').toUpperCase();
  if (GoA.socket) { try { GoA.socket.disconnect(); } catch (_) {} }
  GoA.socket = io(GoA.SERVER_URL);

  GoA.socket.on('connect', () => {
    GoA.socket.emit('host_create', { code: GoA.sessionCode });
  });

  GoA.socket.on('host_created', (data) => {
    GoA.sessionCode = (data.code || GoA.sessionCode).toUpperCase();
    GoA.gameMode = 'host';
    // If restoring, prefer existing myId/myName/state set by caller
    if (opts.restore) {
      GoA.myId = GoA.myId || GoA.genId();
      GoA.myName = GoA.myName || (GoA.$('nameInput').value || 'Host').trim();
      GoA.state = GoA.state || { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {} };
      GoA.state.players = GoA.state.players || {};
      GoA.state.players[GoA.myId] = {
        id: GoA.myId, socketId: GoA.socket.id,
        name: GoA.myName, team: GoA.myTeam, character: GoA.myCharacter,
        submissionStatus: GoA.state.players[GoA.myId] ? GoA.state.players[GoA.myId].submissionStatus : 'not-submitted',
        isConnected: true,
      };
      GoA.saveReconnectData();
      GoA.showApp();
      GoA.render();
      GoA.setStatus('');
      GoA.toast('Session restored — waiting for players to reconnect.');
    } else {
      GoA.myId = GoA.genId();
      GoA.myName = (GoA.$('nameInput').value || 'Host').trim();

      GoA.state = {
        phase: 'lobby',
        players: {
          [GoA.myId]: {
            id: GoA.myId, socketId: GoA.socket.id,
            name: GoA.myName, team: GoA.myTeam, character: GoA.myCharacter,
            submissionStatus: 'not-submitted',
            isConnected: true,
          },
        },
        turns: [], currentTurnIndex: 0,
        initiativeToken: 'blue',
        mixedTies: {},
      };
      GoA.saveReconnectData();
      GoA.showApp();
      GoA.render();
      GoA.setStatus('');
    }
  });

  GoA.socket.on('host_create_failed', () => {
    // try another code
    GoA.tryHost(GoA.genCode());
  });

  GoA.socket.on('player_joined', p => GoA.handleHostMsg({ type: 'player_joined', payload: p }));
  GoA.socket.on('player_rejoined', p => GoA.handleHostMsg({ type: 'player_rejoined', payload: p }));
  GoA.socket.on('player_event', msg => GoA.handleHostMsg(msg));
  GoA.socket.on('player_disconnected', d => {
    if (d && d.id && GoA.state.players[d.id]) {
      const ts = d.timestamp || Date.now();
      GoA.state.players[d.id] = { ...GoA.state.players[d.id], isConnected: false, disconnectedAt: ts };
      GoA.broadcast({ type: 'state_sync', payload: GoA.serializeState() });
      GoA.render();
    }
  });

  GoA.socket.on('disconnect', () => { /* socket.io will auto-reconnect by default */ });
  GoA.socket.on('error', err => { GoA.setStatus('Error: ' + (err && err.message ? err.message : err), true); GoA.gameMode = null; });
};

// ── Player connection flow ───────────────────────────────────────────────────
GoA.joinGame = function(code, opts = {}) {
  GoA.setStatus('Connecting…');
  GoA.gameMode = 'player';
  if (GoA.socket) { try { GoA.socket.disconnect(); } catch (_) {} }
  GoA.socket = io(GoA.SERVER_URL);

  GoA.socket.on('connect', () => {
    // If we reconnected after a network hiccup, cancel the pending return-to-landing
    try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
    clearTimeout(joinTimeout);
    // Reuse existing myId/myName when reconnecting
    if (opts.reuseId && GoA.myId) {
      // keep myId/myName as-is
    } else {
      GoA.myId = GoA.genId();
      GoA.myName = (GoA.$('nameInput').value || 'Player').trim();
    }
    GoA.sessionCode = code.toUpperCase();

    GoA.state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {} };
    GoA.showApp();
    GoA.render();
    GoA.setStatus('');

    GoA.socket.emit('player_join', { code: GoA.sessionCode, player: {
      id: GoA.myId, name: GoA.myName, team: GoA.myTeam, character: GoA.myCharacter,
      submissionStatus: 'not-submitted', isConnected: true
    } });
    GoA.saveReconnectData();
  });

  GoA.socket.on('host_event', msg => GoA.handlePlayerMsg(msg));
  GoA.socket.on('session_closed', () => {
    // Host unexpectedly disconnected — preserve reconnect data so player can rejoin
    try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
    try { GoA.saveReconnectData(); } catch (_) {}
    GoA.toast('Host closed the session.');
    GoA.cleanup({ keepReconnect: true });
    GoA.showLanding();
  });
  GoA.socket.on('join_failed', (data) => {
    clearTimeout(joinTimeout);
    const reason = data && data.reason;
    if (reason === 'no_host') {
      GoA.setStatus('Could not connect — no host for that code.', true);
    } else if (reason === 'name_not_unique') {
      GoA.setStatus('Name not unique in this room — choose another name.', true);
    } else {
      GoA.setStatus('Could not connect — check the code and try again.', true);
    }
    GoA.gameMode = null;
  });
  GoA.socket.on('disconnect', () => {
    GoA.$('statusBadge').textContent = 'disconnected';
    GoA.$('statusBadge').className = 'badge badge-disconnected';
    GoA.toast('Connection to host lost.');
    // If we don't reconnect within a short window, assume host is gone and return to landing
    try { if (GoA.pendingReturnTimer) clearTimeout(GoA.pendingReturnTimer); } catch (_) {}
    GoA.pendingReturnTimer = setTimeout(() => {
      if (!GoA.socket || !GoA.socket.connected) {
        // Preserve reconnect info so the user can use the reconnect button on the landing page
        try { GoA.saveReconnectData(); } catch (_) {}
        GoA.toast('Host disconnected. Returning to main menu.');
        GoA.cleanup({ keepReconnect: true });
        GoA.showLanding();
      }
    }, 2500);
  });
  GoA.socket.on('error', err => { clearTimeout(joinTimeout); GoA.setStatus('Network error: ' + (err && err.message ? err.message : err), true); GoA.gameMode = null; });

  const joinTimeout = setTimeout(() => {
    if (!GoA.socket || !GoA.socket.connected) {
      GoA.setStatus('Connection timed out — check the code and try again.', true);
      GoA.gameMode = null;
    }
  }, 10000);
};

// ── Cleanup and disconnect ───────────────────────────────────────────────────
GoA.cleanup = function(opts = {}) {
  try {
    if (GoA.socket && GoA.socket.connected) {
      if (GoA.gameMode === 'host') GoA.socket.emit('host_close', { code: GoA.sessionCode });
      GoA.socket.disconnect();
    }
  } catch (_) {}
  try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
  // Only clear reconnect data when not explicitly preserving it
  if (!opts.keepReconnect) GoA.clearReconnectData();
  GoA.socket = null;
  GoA.hostConn = null;
  GoA.playerConns = {};
  GoA.gameMode = null;
  GoA.sessionCode = GoA.myId = GoA.myName = GoA.myTeam = '';
  GoA.myCharacter = '';
  GoA.updateSelectedCharDisplay();
  GoA.offlinePlayers = [];
  GoA.offlineInitIdx = 0;
  GoA.offlineTokenChoice = 'blue';
  GoA.hostManagesTurns = false;
  if (GoA.$('chkHostTurns')) GoA.$('chkHostTurns').checked = false;
  GoA.state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
  GoA.resetInitPad();
  GoA.applyCharacterTheme();
  if (GoA.disconnectTimer) { clearInterval(GoA.disconnectTimer); GoA.disconnectTimer = null; }
};
