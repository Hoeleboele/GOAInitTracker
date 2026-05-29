const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const ORIGIN = process.env.ORIGIN || 'https://hoeleboele.github.io';

app.use(cors({ origin: ORIGIN, credentials: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN, methods: ['GET', 'POST'], credentials: true },
});

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));

// ── Helpers ────────────────────────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeGameState() {
  return {
    phase: 'lobby',
    players: {},
    turns: [],
    currentTurnIndex: 0,
    initiativeToken: 'blue',
    hostPlayerId: null,
    hostCanEndTurn: false,
    mixedTies: {},
    reverseInitiative: false,
    usedAbilities: [],
  };
}

// Disconnect grace period — same as client constant (5 minutes)
const DISCONNECT_GRACE_MS = 10 * 60 * 1000;

// rooms[code] = { gameState, expiryTimer }
const rooms = {};

function broadcastState(code) {
  if (!rooms[code]) return;
  io.in(code).emit('game_state', rooms[code].gameState);
}

// ── Turn Logic ─────────────────────────────────────────────────────────────

function buildMixedSlot(gs, initiative, teamTurn, order) {
  const tie = gs.mixedTies[initiative] || {};
  const otherTeam = teamTurn === 'blue' ? 'orange' : 'blue';
  const otherHasPlayers = (tie[`${otherTeam}Pool`] || []).length > 0;
  return {
    order,
    players: (tie[`${teamTurn}Pool`] || []).map(p => ({ id: p.id, name: p.name, team: p.team })),
    initiative,
    status: 'pending',
    doneIds: [],
    mixedTieSlot: true,
    teamTurn,
    tokenAfter: otherHasPlayers ? otherTeam : undefined,
  };
}

function revealTurns(gs) {
  const now = Date.now();
  const considered = Object.values(gs.players).filter(p =>
    p.isConnected || (p.disconnectedAt && (now - p.disconnectedAt) < DISCONNECT_GRACE_MS)
  );

  const byVal = {};
  considered.forEach(p => {
    const v = p.initiative || 0;
    if (!byVal[v]) byVal[v] = [];
    byVal[v].push(p);
  });
  const sortedVals = Object.keys(byVal).map(Number)
    .sort((a, b) => gs.reverseInitiative ? a - b : b - a);

  gs.mixedTies = {};
  const turns = [];
  let order = 1;

  for (const val of sortedVals) {
    const group = byVal[val];
    const blue = group.filter(p => p.team === 'blue');
    const orange = group.filter(p => p.team === 'orange');

    if (blue.length === 0 || orange.length === 0) {
      turns.push({
        order: order++,
        players: group.map(p => ({ id: p.id, name: p.name, team: p.team || '' })),
        initiative: val,
        status: 'pending',
        doneIds: [],
      });
    } else {
      gs.mixedTies[val] = { bluePool: [...blue], orangePool: [...orange] };
      turns.push(buildMixedSlot(gs, val, gs.initiativeToken, order++));
    }
  }

  if (turns.length > 0) turns[0].status = 'active';
  gs.turns = turns;
  gs.currentTurnIndex = 0;
  gs.phase = 'turns';
}

function purgePlayerFromUpcoming(gs, targetId) {
  const cur = gs.currentTurnIndex;
  for (let i = gs.turns.length - 1; i > cur; i--) {
    const t = gs.turns[i];
    if (!(t.players || []).some(p => p.id === targetId)) continue;
    t.players = t.players.filter(p => p.id !== targetId);
    if (t.players.length === 0) {
      gs.turns.splice(i, 1);
      if (t.mixedTieSlot) {
        const tie = gs.mixedTies[t.initiative];
        if (tie) {
          const otherTeam = t.teamTurn === 'blue' ? 'orange' : 'blue';
          const rescued = (tie[`${otherTeam}Pool`] || []).filter(p => p.id !== targetId);
          if (rescued.length > 0) {
            gs.turns.splice(i, 0, {
              order: 0,
              players: rescued.map(p => ({ id: p.id, name: p.name, team: p.team })),
              initiative: t.initiative,
              status: 'pending',
              doneIds: [],
            });
          }
          delete gs.mixedTies[t.initiative];
        }
      }
    }
  }
  Object.keys(gs.mixedTies).forEach(init => {
    const initNum = +init;
    const tie = gs.mixedTies[initNum];
    tie.bluePool = (tie.bluePool || []).filter(p => p.id !== targetId);
    tie.orangePool = (tie.orangePool || []).filter(p => p.id !== targetId);
    if (tie.bluePool.length === 0 || tie.orangePool.length === 0) {
      const remaining = tie.bluePool.length > 0 ? tie.bluePool : tie.orangePool;
      const slotIdx = gs.turns.findIndex(t => t.initiative === initNum && t.mixedTieSlot);
      if (slotIdx > cur) {
        if (remaining.length > 0) {
          gs.turns[slotIdx] = {
            order: gs.turns[slotIdx].order,
            players: remaining.map(p => ({ id: p.id, name: p.name, team: p.team })),
            initiative: initNum,
            status: 'pending',
            doneIds: [],
          };
        } else {
          gs.turns.splice(slotIdx, 1);
        }
        delete gs.mixedTies[initNum];
      }
    }
  });
}

function insertPlayerAtInitiative(gs, id, name, team, newInit) {
  const cur = gs.currentTurnIndex;
  const player = gs.players[id] || {};
  let mergeIdx = -1;
  for (let j = cur + 1; j < gs.turns.length; j++) {
    if (gs.turns[j].initiative === newInit && gs.turns[j].status !== 'completed') {
      mergeIdx = j; break;
    }
  }
  if (mergeIdx === -1) {
    let insertAt = gs.turns.length;
    for (let j = cur + 1; j < gs.turns.length; j++) {
      const before = gs.reverseInitiative
        ? gs.turns[j].initiative > newInit
        : gs.turns[j].initiative < newInit;
      if (before) { insertAt = j; break; }
    }
    gs.turns.splice(insertAt, 0, {
      order: 0, players: [{ id, name, team }], initiative: newInit, status: 'pending', doneIds: [],
    });
  } else {
    const slot = gs.turns[mergeIdx];
    const existingTeams = new Set((slot.players || []).map(p => p.team));
    if (existingTeams.size === 0 || existingTeams.has(team) || slot.mixedTieSlot) {
      if (!slot.players.some(p => p.id === id)) slot.players.push({ id, name, team });
      if (slot.mixedTieSlot && gs.mixedTies[newInit]) {
        const pool = gs.mixedTies[newInit][`${team}Pool`];
        if (pool && !pool.some(p => p.id === id))
          pool.push({ ...player, id, name, team });
      }
    } else {
      const existing = (slot.players || []).map(p =>
        ({ ...(gs.players[p.id] || {}), id: p.id, name: p.name, team: p.team }));
      const incoming = [{ ...player, id, name, team }];
      const bluePool = team === 'blue' ? incoming : existing;
      const orangePool = team === 'orange' ? incoming : existing;
      gs.mixedTies[newInit] = { bluePool, orangePool };
      const firstTeam = gs.initiativeToken;
      const otherTeam = firstTeam === 'blue' ? 'orange' : 'blue';
      gs.turns[mergeIdx] = {
        order: slot.order,
        players: gs.mixedTies[newInit][`${firstTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
        initiative: newInit,
        status: 'pending',
        doneIds: [],
        mixedTieSlot: true,
        teamTurn: firstTeam,
        tokenAfter: otherTeam,
      };
      gs.turns.splice(mergeIdx + 1, 0, {
        order: slot.order + 1,
        players: gs.mixedTies[newInit][`${otherTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
        initiative: newInit,
        status: 'pending',
        doneIds: [],
        mixedTieSlot: true,
        teamTurn: otherTeam,
        tokenAfter: undefined,
      });
    }
  }
  gs.turns.forEach((t, i) => { t.order = i + 1; });
}

function advanceTurn(code) {
  const gs = rooms[code].gameState;
  gs.usedAbilities = [];
  const cur = gs.currentTurnIndex;
  const currentTurn = gs.turns[cur];

  if (currentTurn && currentTurn.tokenAfter !== undefined) {
    gs.initiativeToken = currentTurn.tokenAfter;
  }

  if (currentTurn && currentTurn.mixedTieSlot) {
    const initiative = currentTurn.initiative;
    const takenTeam = currentTurn.teamTurn;
    const otherTeam = takenTeam === 'blue' ? 'orange' : 'blue';
    const takenById = currentTurn.doneIds[0];
    const tie = gs.mixedTies[initiative];

    if (tie) {
      tie[`${takenTeam}Pool`] = tie[`${takenTeam}Pool`].filter(p => p.id !== takenById);
      const takenRemaining = tie[`${takenTeam}Pool`].length;
      const otherRemaining = tie[`${otherTeam}Pool`].length;
      const nextOrder = cur + 2;

      let nextSlot = null;
      if (otherRemaining > 0) {
        nextSlot = buildMixedSlot(gs, initiative, gs.initiativeToken, nextOrder);
      } else if (takenRemaining > 0) {
        nextSlot = {
          order: nextOrder,
          players: tie[`${takenTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
          initiative,
          status: 'pending',
          doneIds: [],
        };
      }

      if (nextSlot) {
        gs.turns.splice(cur + 1, 0, nextSlot);
        for (let i = cur + 1; i < gs.turns.length; i++) gs.turns[i].order = i + 1;
      }
    }
  }

  const next = cur + 1;
  if (next >= gs.turns.length) {
    startNewRound(code);
    return;
  }
  gs.turns[cur].status = 'completed';
  gs.turns[next].status = 'active';
  gs.turns[next].doneIds = [];
  gs.currentTurnIndex = next;
  broadcastState(code);
}

function startNewRound(code) {
  const gs = rooms[code].gameState;
  gs.phase = 'initiative';
  gs.turns = [];
  gs.currentTurnIndex = 0;
  gs.mixedTies = {};
  gs.reverseInitiative = false;
  gs.usedAbilities = [];
  Object.keys(gs.players).forEach(id => {
    gs.players[id] = { ...gs.players[id], submissionStatus: 'not-submitted', initiative: undefined };
  });
  broadcastState(code);
}

// ── Ability Effects ────────────────────────────────────────────────────────

function applyHurryUp(gs, targetId) {
  const target = gs.players[targetId];
  if (!target) return null;
  const NEW_INIT = 11;
  purgePlayerFromUpcoming(gs, targetId);
  gs.players[targetId] = { ...target, initiative: NEW_INIT };
  insertPlayerAtInitiative(gs, targetId, target.name, target.team, NEW_INIT);
  gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'hurryUp'])];
  return `\u26A1 ${target.name} rushes to initiative 11!`;
}

function applyPoison(gs, targetId, penalty) {
  const target = gs.players[targetId];
  if (!target) return null;
  const newInit = (target.initiative || 0) - penalty;
  const cur = gs.currentTurnIndex;
  gs.players[targetId] = { ...target, initiative: newInit };
  purgePlayerFromUpcoming(gs, targetId);
  const currentInit = gs.turns[cur] ? gs.turns[cur].initiative : null;
  const stillFuture = currentInit === null || (
    gs.reverseInitiative ? newInit > currentInit : newInit < currentInit
  );
  if (stillFuture) insertPlayerAtInitiative(gs, targetId, target.name, target.team, newInit);
  gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'poison'])];
  return `\u2620\uFE0F ${target.name} poisoned! -${penalty} initiative (now ${newInit})`;
}

function applyWarlordOrder(gs, targetId, newInit) {
  const target = gs.players[targetId];
  if (!target) return null;
  gs.players[targetId] = { ...target, initiative: newInit };
  purgePlayerFromUpcoming(gs, targetId);
  insertPlayerAtInitiative(gs, targetId, target.name, target.team, newInit);
  gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'warlordOrder'])];
  return `\u2694\uFE0F ${target.name}'s initiative changed to ${newInit}!`;
}

function applyIceBarrier(gs, targetId, penalty) {
  const target = gs.players[targetId];
  if (!target) return null;
  const newInit = (target.initiative || 0) - penalty;
  const cur = gs.currentTurnIndex;
  const hadFutureTurn =
    gs.turns.slice(cur + 1).some(t =>
      t.status !== 'completed' && (t.players || []).some(p => p.id === targetId)
    ) ||
    Object.values(gs.mixedTies).some(tie =>
      [...(tie.bluePool || []), ...(tie.orangePool || [])].some(p => p.id === targetId)
    );
  gs.players[targetId] = { ...target, initiative: newInit };
  purgePlayerFromUpcoming(gs, targetId);
  const currentInit = gs.turns[cur] ? gs.turns[cur].initiative : null;
  const stillFuture = currentInit === null || (
    gs.reverseInitiative ? newInit > currentInit : newInit < currentInit
  );
  if (hadFutureTurn && stillFuture) insertPlayerAtInitiative(gs, targetId, target.name, target.team, newInit);
  gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'iceBarrier'])];
  return `\u{1F9CA} ${target.name} frozen! -${penalty} initiative (now ${newInit})`;
}

function applyReverseTime(gs) {
  gs.reverseInitiative = !gs.reverseInitiative;
  if (gs.phase === 'turns') {
    const cur = gs.currentTurnIndex;
    const pending = gs.turns.slice(cur + 1);
    pending.sort((a, b) => gs.reverseInitiative ? a.initiative - b.initiative : b.initiative - a.initiative);
    gs.turns.splice(cur + 1, gs.turns.length - cur - 1, ...pending);
    gs.turns.forEach((t, i) => { t.order = i + 1; });
  }
  gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'reverseTime'])];
  return gs.reverseInitiative ? '\u23EA Reverse Time: now low \u2192 high' : '\u23EA Time restored: high \u2192 low';
}

// Map ability type → required character id
const ABILITY_CHARACTERS = {
  hurry_up: 'hanu',
  chaos_incarnate: 'ignatia',
  poison: 'tigerclaw',
  warlord_order: 'takahide',
  ice_barrier: 'tali',
  reverse_time: 'emmit',
};

function validateAbilityActor(gs, actorId, abilityType) {
  if (!actorId) return true;
  const actor = gs.players[actorId];
  if (!actor) return false;
  const required = ABILITY_CHARACTERS[abilityType];
  return !required || actor.character === required;
}

// ── Socket.IO ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── Create Room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ player }) => {
    let code;
    let attempts = 0;
    do { code = genCode(); attempts++; } while (rooms[code] && attempts < 30);
    if (rooms[code]) { socket.emit('room_create_failed', { reason: 'server_full' }); return; }

    const gs = makeGameState();
    gs.hostPlayerId = player.id;
    gs.players[player.id] = {
      id: player.id,
      socketId: socket.id,
      name: (player.name || '').trim(),
      team: player.team || '',
      character: player.character || '',
      submissionStatus: 'not-submitted',
      isConnected: true,
    };
    rooms[code] = { gameState: gs, expiryTimer: null };
    socket.join(code);
    socket._roomCode = code;
    socket._playerId = player.id;
    socket.emit('room_created', { code });
    broadcastState(code);
    console.log(`Player ${player.id} (${player.name}) created room ${code}`);
  });

  // ── Join Room ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ code, player }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) { socket.emit('join_failed', { reason: 'not_found' }); return; }

    const gs = room.gameState;
    const name = (player && player.name ? String(player.name).trim() : '');

    // Reconnect: existing player ID
    const existing = gs.players[player.id];
    if (existing) {
      existing.socketId = socket.id;
      existing.isConnected = true;
      existing.disconnectedAt = undefined;
      // Cancel any pending room expiry since someone reconnected
      const roomObj = rooms[code];
      if (roomObj && roomObj.expiryTimer) {
        clearTimeout(roomObj.expiryTimer);
        roomObj.expiryTimer = null;
        console.log(`Expiry timer cleared for room ${code} due to reconnect`);
      }
      socket.join(code);
      socket._roomCode = code;
      socket._playerId = player.id;
      broadcastState(code);
      console.log(`Player ${player.id} (${name}) rejoined room ${code}`);
      return;
    }

    // Name uniqueness
    const nameLower = name.toLowerCase();
    const duplicate = Object.values(gs.players).some(p => ((p && p.name) || '').toLowerCase() === nameLower);
    if (duplicate) { socket.emit('join_failed', { reason: 'name_not_unique' }); return; }

    gs.players[player.id] = {
      id: player.id,
      socketId: socket.id,
      name,
      team: player.team || '',
      character: player.character || '',
      submissionStatus: 'not-submitted',
      isConnected: true,
    };
    socket.join(code);
    socket._roomCode = code;
    socket._playerId = player.id;
    socket.to(code).emit('player_joined', { name });
    // New join cancels expiry as well
    if (room && room.expiryTimer) {
      clearTimeout(room.expiryTimer);
      room.expiryTimer = null;
      console.log(`Expiry timer cleared for room ${code} due to new join`);
    }
    broadcastState(code);
    console.log(`Player ${player.id} (${name}) joined room ${code}`);
  });

  // ── Game Action ──────────────────────────────────────────────────────────
  socket.on('game_action', ({ code, action }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) return;
    const gs = room.gameState;
    const { type, payload } = action || {};

    switch (type) {

      case 'start_game': {
        if (socket._playerId !== gs.hostPlayerId) break;
        gs.phase = 'initiative';
        gs.initiativeToken = (payload && payload.initiativeToken) || 'blue';
        gs.hostCanEndTurn = !!(payload && payload.hostCanEndTurn);
        gs.reverseInitiative = false;
        gs.usedAbilities = [];
        Object.keys(gs.players).forEach(id => {
          gs.players[id] = { ...gs.players[id], submissionStatus: 'not-submitted', initiative: undefined };
        });
        broadcastState(code);
        break;
      }

      case 'lock_initiative': {
        const { playerId, initiative, reverseTime } = payload || {};
        if (!playerId || !gs.players[playerId]) break;
        if (reverseTime) gs.reverseInitiative = true;
        gs.players[playerId] = { ...gs.players[playerId], initiative: +initiative, submissionStatus: 'locked' };
        const now = Date.now();
        const blocking = Object.values(gs.players).filter(p =>
          p.isConnected || (p.disconnectedAt && (now - p.disconnectedAt) < DISCONNECT_GRACE_MS)
        );
        const allLocked = blocking.length > 0 && blocking.every(p => p.submissionStatus === 'locked');
        if (allLocked) revealTurns(gs);
        broadcastState(code);
        break;
      }

      case 'end_turn': {
        const { playerId } = payload || {};
        const turn = gs.turns[gs.currentTurnIndex];
        if (!turn || !turn.doneIds) break;
        const eligible = (turn.players || []).some(p => p.id === playerId);
        if (!eligible || turn.doneIds.includes(playerId)) break;
        turn.doneIds.push(playerId);
        const required = turn.mixedTieSlot ? 1 : (turn.players || []).length;
        if (turn.doneIds.length >= required) {
          advanceTurn(code);
        } else {
          broadcastState(code);
        }
        break;
      }

      case 'use_ability': {
        const { abilityType, actorId, targetId, penalty, newInit } = payload || {};
        if (!validateAbilityActor(gs, actorId, abilityType)) break;
        let toastMsg = null;
        switch (abilityType) {
          case 'hurry_up':       toastMsg = applyHurryUp(gs, targetId); break;
          case 'poison':         toastMsg = applyPoison(gs, targetId, +penalty); break;
          case 'warlord_order':  toastMsg = applyWarlordOrder(gs, targetId, +newInit); break;
          case 'ice_barrier':    toastMsg = applyIceBarrier(gs, targetId, +penalty); break;
          case 'chaos_incarnate':
            gs.initiativeToken = gs.initiativeToken === 'blue' ? 'orange' : 'blue';
            gs.usedAbilities = [...new Set([...(gs.usedAbilities || []), 'chaos'])];
            toastMsg = `\u{1F300} Chaos Incarnate! Token flipped to ${gs.initiativeToken}.`;
            break;
          case 'reverse_time': toastMsg = applyReverseTime(gs); break;
        }
        if (toastMsg) io.in(code).emit('ability_toast', { message: toastMsg });
        broadcastState(code);
        break;
      }

      case 'kill_player': {
        if (socket._playerId !== gs.hostPlayerId) break;
        const { targetId } = payload || {};
        if (targetId && gs.players[targetId]) {
          purgePlayerFromUpcoming(gs, targetId);
          gs.players[targetId] = { ...gs.players[targetId], isConnected: false };
          broadcastState(code);
        }
        break;
      }

      case 'flip_token': {
        if (socket._playerId !== gs.hostPlayerId) break;
        gs.initiativeToken = gs.initiativeToken === 'blue' ? 'orange' : 'blue';
        broadcastState(code);
        break;
      }

      case 'start_new_round': {
        startNewRound(code);
        break;
      }

      case 'close_room': {
        if (socket._playerId !== gs.hostPlayerId) break;
        // Clear any expiry timer before deleting
        if (rooms[code] && rooms[code].expiryTimer) {
          clearTimeout(rooms[code].expiryTimer);
          rooms[code].expiryTimer = null;
        }
        io.in(code).emit('session_closed');
        delete rooms[code];
        console.log(`Room ${code} closed by host ${socket._playerId}`);
        break;
      }
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket._roomCode;
    const playerId = socket._playerId;
    if (!code || !rooms[code]) return;
    const gs = rooms[code].gameState;
    const player = gs.players[playerId];
    if (player) {
      player.socketId = null;
      player.isConnected = false;
      player.disconnectedAt = Date.now();
      socket.to(code).emit('player_disconnected', { id: playerId, name: player.name });
      broadcastState(code);
      console.log(`Player ${playerId} (${player.name}) disconnected from room ${code}`);
      // If everyone is disconnected, schedule room expiry/removal
      const anyConnected = Object.values(gs.players).some(p => p.isConnected);
      if (!anyConnected) {
        const roomObj = rooms[code];
        if (roomObj && !roomObj.expiryTimer) {
          roomObj.expiryTimer = setTimeout(() => {
            io.in(code).emit('session_closed');
            delete rooms[code];
            console.log(`Room ${code} expired and was removed due to inactivity`);
          }, DISCONNECT_GRACE_MS);
          console.log(`Room ${code} scheduled to expire in ${DISCONNECT_GRACE_MS}ms`);
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
