// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// State module — all mutable shared state

window.GoA = window.GoA || {};

// ── Session variables ──────────────────────────────────────────────────────
GoA.gameMode = null;      // 'player' | 'offline'
GoA.socket = null;         // Socket.IO client connection
GoA.peer = null;           // Legacy PeerJS reference (unused)
GoA.hostConn = null;       // Legacy PeerJS connection to host (unused)
GoA.playerConns = {};      // Legacy PeerJS player connections (unused)

// ── Session code & identity ────────────────────────────────────────────────
GoA.sessionCode = '';
GoA.myId = '';
GoA.myName = '';
GoA.myTeam = '';            // 'blue' | 'orange'
GoA.myCharacter = '';       // character id or empty

// ── Token choice for lobby ─────────────────────────────────────────────────
GoA.tokenChoice = 'blue';    // which team starts with token (set in lobby)

// ── Game state ─────────────────────────────────────────────────────────────
GoA.state = {
  phase: 'lobby',              // 'lobby'|'initiative'|'turns'|'round-complete'
  players: {},                 // { [id]: Player }
  turns: [],
  currentTurnIndex: 0,
  initiativeToken: 'blue',     // 'blue' | 'orange'
  mixedTies: {},               // { [initiative]: { bluePool, orangePool } }
  reverseInitiative: false,    // Emmit: sort low→high instead of high→low
};

// ── Initiative pad state ────────────────────────────────────────────────────
GoA.initValue = '';
GoA.initLocked = false;

// ── Notification tracking ──────────────────────────────────────────────────
GoA.lastNotifiedTurnIndex = -1;   // tracks last turn we fired the notification for
GoA.usedAbilitiesThisTurn = new Set(); // abilities used this turn (each can only fire once)

// ── Offline mode state ─────────────────────────────────────────────────────
GoA.offlinePlayers = [];     // [{ id, name, team, initiative }]
GoA.offlineInitIdx = 0;      // which player is currently entering initiative
GoA.offlineTokenChoice = 'blue';

// ── Timer references ────────────────────────────────────────────────────────
GoA.disconnectTimer = null;      // disconnect grace period timer
GoA.pendingReturnTimer = null;   // return to landing timer
GoA.toastTimer = null;           // toast notification timer
