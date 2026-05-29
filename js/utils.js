// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Utils module — DOM helpers and utility functions

window.GoA = window.GoA || {};

// ── DOM helpers ────────────────────────────────────────────────────────────
GoA.$ = id => document.getElementById(id);
GoA.$$ = sel => document.querySelector(sel);

// ── ID and Code generation ─────────────────────────────────────────────────
GoA.genCode = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};

GoA.genId = function() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// ── HTML escaping ──────────────────────────────────────────────────────────
GoA.esc = function(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// ── Time formatting ────────────────────────────────────────────────────────
GoA.formatMs = function(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
};

// ── Toast notifications ────────────────────────────────────────────────────
GoA.toast = function(msg) {
  const el = GoA.$('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(GoA.toastTimer);
  GoA.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
};

// ── Landing status message ─────────────────────────────────────────────────
GoA.setStatus = function(msg, isErr = false) {
  const el = GoA.$('landingStatus');
  el.textContent = msg;
  el.className = 'status-msg' + (isErr ? ' err' : '');
};

// ── Build set of player IDs with pending turns (shared by all abilities) ──
GoA.buildFuturePlayerIds = function(curIdx) {
  const ids = new Set();
  for (let i = curIdx + 1; i < GoA.state.turns.length; i++) {
    const t = GoA.state.turns[i];
    if (t.status !== 'completed') (t.players || []).forEach(p => ids.add(p.id));
  }
  Object.values(GoA.state.mixedTies).forEach(tie => {
    (tie.bluePool || []).forEach(p => ids.add(p.id));
    (tie.orangePool || []).forEach(p => ids.add(p.id));
  });
  const currentTurn = GoA.state.turns[curIdx];
  if (currentTurn) {
    const doneSet = new Set(currentTurn.doneIds || []);
    (currentTurn.players || []).forEach(p => { if (!doneSet.has(p.id)) ids.add(p.id); });
  }
  return ids;
};

// ── Check if a character exists in a group of player IDs ────────────────────
GoA.hasCharacterInGroup = function(idArray, charId) {
  return idArray.some(id => GoA.state.players[id]?.character === charId);
};

// ── Convert player object to display format ────────────────────────────────
GoA.mapToDisplayPlayer = function(p) {
  return { id: p.id, name: p.name, team: p.team };
};
