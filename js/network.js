// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Network module — Socket.IO connection, server-authoritative game actions

window.GoA = window.GoA || {};

// ── Send a game action to the server ─────────────────────────────────────
GoA.sendAction = function(type, payload) {
  if (GoA.gameMode === 'offline') return; // offline handles locally
  if (GoA.socket && GoA.socket.connected) {
    GoA.socket.emit('game_action', { code: GoA.sessionCode, action: { type, payload } });
  }
};

// ── Apply server game_state broadcast to local state ──────────────────────
GoA.handleServerMsg = function(gs) {
  var wasNotInitiative = GoA.state.phase !== 'initiative';
  var nowInitiative = gs.phase === 'initiative';
  
  GoA.state.phase            = gs.phase;
  GoA.state.players          = gs.players;
  GoA.state.turns            = gs.turns || [];
  GoA.state.currentTurnIndex = gs.currentTurnIndex || 0;
  GoA.state.initiativeToken  = gs.initiativeToken || GoA.state.initiativeToken;
  GoA.state.hostPlayerId     = gs.hostPlayerId || null;
  GoA.state.mixedTies        = gs.mixedTies || {};
  GoA.state.reverseInitiative = gs.reverseInitiative || false;
  GoA.usedAbilitiesThisTurn  = new Set(gs.usedAbilities || []);
  
  // Reset initiative pad when transitioning to initiative phase
  if (wasNotInitiative && nowInitiative) {
    GoA.resetInitPad();
  }
  
  GoA.render();
};

// ── Create a new room (replaces "host a game") ────────────────────────────
GoA.createRoom = function() {
  GoA.setStatus('Creating room…');
  GoA.gameMode = 'player';
  GoA.myId   = GoA.genId();
  GoA.myName = (GoA.$('nameInput').value || '').trim();

  if (GoA.socket) { try { GoA.socket.disconnect(); } catch (_) {} }
  GoA.socket = io(GoA.SERVER_URL);

  GoA.socket.on('connect', () => {
    GoA.socket.emit('create_room', {
      player: {
        id: GoA.myId,
        name: GoA.myName,
        team: GoA.myTeam,
        character: GoA.myCharacter,
      },
    });
  });

  GoA.socket.on('room_created', (data) => {
    GoA.sessionCode = (data.code || '').toUpperCase();
    GoA.state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0,
      initiativeToken: 'blue', hostPlayerId: GoA.myId, mixedTies: {}, reverseInitiative: false };
    GoA.saveReconnectData();
    GoA.showApp();
    GoA.render();
    GoA.setStatus('');
  });

  GoA.socket.on('room_create_failed', () => {
    GoA.setStatus('Could not create room — server error.', true);
    GoA.gameMode = null;
  });

  GoA._bindCommonSocketEvents();
};

// ── Join an existing room ─────────────────────────────────────────────────
GoA.joinGame = function(code, opts = {}) {
  GoA.setStatus('Connecting…');
  GoA.gameMode = 'player';
  if (GoA.socket) { try { GoA.socket.disconnect(); } catch (_) {} }
  GoA.socket = io(GoA.SERVER_URL);

  const joinTimeout = setTimeout(() => {
    if (!GoA.socket || !GoA.socket.connected) {
      GoA.setStatus('Connection timed out — check the code and try again.', true);
      GoA.gameMode = null;
    }
  }, 10000);

  GoA.socket.on('connect', () => {
    try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
    clearTimeout(joinTimeout);
    if (!(opts.reuseId && GoA.myId)) {
      GoA.myId   = GoA.genId();
      GoA.myName = (GoA.$('nameInput').value || 'Player').trim();
    }
    GoA.sessionCode = code.toUpperCase();
    GoA.state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0,
      initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
    GoA.showApp();
    GoA.render();
    GoA.setStatus('');
    GoA.socket.emit('join_room', {
      code: GoA.sessionCode,
      player: {
        id: GoA.myId, name: GoA.myName, team: GoA.myTeam, character: GoA.myCharacter,
        submissionStatus: 'not-submitted', isConnected: true,
      },
    });
    GoA.saveReconnectData();
  });

  GoA.socket.on('join_failed', (data) => {
    clearTimeout(joinTimeout);
    const reason = data && data.reason;
    if (reason === 'not_found') {
      GoA.setStatus('Could not connect — no room with that code.', true);
    } else if (reason === 'name_not_unique') {
      GoA.setStatus('Name already taken in this room — choose another name.', true);
    } else {
      GoA.setStatus('Could not connect — check the code and try again.', true);
    }
    GoA.gameMode = null;
  });

  GoA._bindCommonSocketEvents();
};

// ── Shared socket event listeners (used by both createRoom and joinGame) ──
GoA._bindCommonSocketEvents = function() {
  GoA.socket.on('game_state', (gs) => {
    GoA.handleServerMsg(gs);
    GoA.$('statusBadge').textContent = 'connected';
    GoA.$('statusBadge').className = 'badge badge-connected';
  });

  GoA.socket.on('ability_toast', (data) => {
    if (data && data.message) GoA.toast(data.message);
  });

  GoA.socket.on('player_joined', (data) => {
    if (data && data.name) GoA.toast(`${data.name} joined the room.`);
  });

  GoA.socket.on('player_disconnected', (data) => {
    if (data && data.name) GoA.toast(`${data.name} disconnected.`);
  });

  GoA.socket.on('session_closed', () => {
    try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
    try { GoA.saveReconnectData(); } catch (_) {}
    GoA.toast('The room was closed.');
    GoA.cleanup({ keepReconnect: true });
    GoA.showLanding();
  });

  GoA.socket.on('disconnect', () => {
    GoA.$('statusBadge').textContent = 'disconnected';
    GoA.$('statusBadge').className = 'badge badge-disconnected';
    GoA.toast('Connection lost.');
    try { if (GoA.pendingReturnTimer) clearTimeout(GoA.pendingReturnTimer); } catch (_) {}
    GoA.pendingReturnTimer = setTimeout(() => {
      if (!GoA.socket || !GoA.socket.connected) {
        try { GoA.saveReconnectData(); } catch (_) {}
        GoA.toast('Connection lost. Returning to main menu.');
        GoA.cleanup({ keepReconnect: true });
        GoA.showLanding();
      }
    }, 2500);
  });

  GoA.socket.on('error', (err) => {
    GoA.setStatus('Network error: ' + (err && err.message ? err.message : err), true);
    GoA.gameMode = null;
  });
};

// ── Cleanup and disconnect ───────────────────────────────────────────────────
GoA.cleanup = function(opts = {}) {
  try {
    if (GoA.socket && GoA.socket.connected) {
      if (GoA.gameMode === 'player' && GoA.state.hostPlayerId === GoA.myId) GoA.socket.emit('game_action', { code: GoA.sessionCode, action: { type: 'close_room' } });
      GoA.socket.disconnect();
    }
  } catch (_) {}
  try { if (GoA.pendingReturnTimer) { clearTimeout(GoA.pendingReturnTimer); GoA.pendingReturnTimer = null; } } catch (_) {}
  if (!opts.keepReconnect) GoA.clearReconnectData();
  GoA.socket = null;
  GoA.gameMode = null;
  GoA.sessionCode = GoA.myId = GoA.myName = GoA.myTeam = '';
  GoA.myCharacter = '';
  GoA.updateSelectedCharDisplay();
  GoA.offlinePlayers = [];
  GoA.offlineInitIdx = 0;
  GoA.offlineTokenChoice = 'blue';
  GoA.tokenChoice = 'blue';
  GoA.state = { phase: 'lobby', players: {}, turns: [], currentTurnIndex: 0, initiativeToken: 'blue', hostPlayerId: null, mixedTies: {}, reverseInitiative: false };
  GoA.resetInitPad();
  GoA.applyCharacterTheme();
  if (GoA.disconnectTimer) { clearInterval(GoA.disconnectTimer); GoA.disconnectTimer = null; }
};
