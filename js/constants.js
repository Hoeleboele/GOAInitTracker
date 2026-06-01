// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Constants module

window.GoA = window.GoA || {};

// Server configuration
GoA.SERVER_URL = 'https://goainittracker.onrender.com';

// Reconnect constants
GoA.RECONNECT_KEY = 'goa_reconnect';
GoA.RECONNECT_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

// Disconnect grace period — how long a disconnected player still blocks the round (ms)
GoA.DISCONNECT_GRACE_MS = 15 * 60 * 1000; // 15 minutes

// Last name storage key
GoA.LAST_NAME_KEY = 'goa_last_player_name';

// Game view IDs
GoA.VIEWS = ['viewOfflineSetup', 'viewLobbyHost', 'viewInitiative', 'viewTurns', 'viewRoundComplete'];
