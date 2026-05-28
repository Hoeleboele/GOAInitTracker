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
