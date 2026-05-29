// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Storage module — LocalStorage reconnect persistence

window.GoA = window.GoA || {};

// ── Reconnect data persistence ────────────────────────────────────────────
GoA.saveReconnectData = function() {
  try {
    const data = {
      code: GoA.sessionCode,
      playerId: GoA.myId,
      name: GoA.myName,
      team: GoA.myTeam,
      character: GoA.myCharacter,
      timestamp: Date.now(),
    };
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
  btn.textContent = `↩ Rejoin Session (${data.code})`;
};

GoA.doReconnect = function() {
  const data = GoA.loadReconnectData();
  if (!data) return;

  GoA.myName = data.name || '';
  GoA.myTeam = data.team || '';
  GoA.myCharacter = data.character || '';
  GoA.myId = data.playerId || '';

  GoA.setStatus('Reconnecting to session…');
  try {
    if (GoA.socket && GoA.socket.connected) GoA.socket.disconnect();
  } catch (_) {}
  GoA.joinGame(data.code, { reuseId: true });
};
