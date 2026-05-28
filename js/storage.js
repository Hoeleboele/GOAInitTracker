// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Storage module — LocalStorage reconnect persistence

window.GoA = window.GoA || {};

// ── Reconnect data persistence ────────────────────────────────────────────
GoA.saveReconnectData = function(savedState) {
  try {
    const existing = GoA.loadReconnectData() || {};
    const data = {
      ...existing,
      role: GoA.gameMode === 'host' ? 'host' : 'player',
      code: GoA.sessionCode,
      name: GoA.myName,
      team: GoA.myTeam,
      character: GoA.myCharacter,
      myId: GoA.myId,
      timestamp: Date.now(),
    };
    if (savedState !== undefined) data.savedState = savedState;
    localStorage.setItem(GoA.RECONNECT_KEY, JSON.stringify(data));
    GoA.updateReconnectButton();
  } catch (_) {}
};

GoA.clearReconnectData = function() {
  try { localStorage.removeItem(GoA.RECONNECT_KEY); } catch (_) {}
  GoA.updateReconnectButton();
};

GoA.loadReconnectData = function() {
  try {
    const raw = localStorage.getItem(GoA.RECONNECT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > GoA.RECONNECT_MAX_AGE) {
      GoA.clearReconnectData();
      return null;
    }
    return data;
  } catch (_) {
    return null;
  }
};

GoA.updateReconnectButton = function() {
  const btn = GoA.$('btnReconnect');
  if (!btn) return;
  const data = GoA.loadReconnectData();
  if (!data) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.textContent = data.role === 'host'
    ? `↩ Reconnect as Host (${data.code})`
    : `↩ Rejoin Session (${data.code})`;
};

GoA.doReconnect = function() {
  const data = GoA.loadReconnectData();
  if (!data) return;

  GoA.myName = data.name || '';
  GoA.myTeam = data.team || '';
  GoA.myCharacter = data.character || '';
  GoA.myId = data.myId || '';

  // The server now uses Socket.IO (not PeerJS). Reuse Socket.IO flow for reconnects.
  if (data.role === 'host') {
    GoA.setStatus('Reconnecting session…');
    GoA.gameMode = 'host';

    // Restore saved game state (if any) and mark other players disconnected
    if (data.savedState) {
      GoA.state = {
        phase: data.savedState.phase || 'lobby',
        players: data.savedState.players || {},
        turns: data.savedState.turns || [],
        currentTurnIndex: data.savedState.currentTurnIndex || 0,
        initiativeToken: data.savedState.initiativeToken || 'blue',
        mixedTies: data.savedState.mixedTies || {},
        hostManagesTurns: data.savedState.hostManagesTurns || false,
        reverseInitiative: data.savedState.reverseInitiative || false,
      };
      GoA.usedAbilitiesThisTurn = new Set(data.savedState.usedAbilities || []);
      Object.keys(GoA.state.players).forEach(id => {
        if (id !== GoA.myId) {
          GoA.state.players[id] = { ...GoA.state.players[id], isConnected: false };
        }
      });
    }

    // Use Socket.IO host flow and reuse saved session code / IDs
    try {
      if (GoA.socket && GoA.socket.connected) GoA.socket.disconnect();
    } catch (_) {}
    // tryHost will detect restore mode by seeing existing state and myId
    GoA.tryHost(data.code, { restore: true });
    // showApp/render will be driven from tryHost's 'host_created' handler
  } else {
    // Player reconnecting via Socket.IO
    GoA.setStatus('Reconnecting to session…');
    GoA.gameMode = 'player';

    try {
      if (GoA.socket && GoA.socket.connected) GoA.socket.disconnect();
    } catch (_) {}
    // joinGame will reuse `myId` when provided (opts.reuseId)
    GoA.joinGame(data.code, { reuseId: true });
  }
};
