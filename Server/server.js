const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();

// allow CORS from the GitHub Pages frontend
app.use(cors({ origin: 'https://hoeleboele.github.io', credentials: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://hoeleboele.github.io',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// Serve static files from project root
app.use(express.static(__dirname));

// Rooms structure: { [code]: { hostSocketId, players: { [playerId]: socketId } } }
const rooms = {};

io.on('connection', (socket) => {
  socket.on('host_create', ({ code }) => {
    code = (code || '').toUpperCase();
    if (!code) return socket.emit('host_create_failed', { reason: 'no_code' });
    if (rooms[code] && rooms[code].hostSocketId) {
      // code already in use
      socket.emit('host_create_failed', { reason: 'unavailable' });
      return;
    }
    // create room and set host
    rooms[code] = { hostSocketId: socket.id, players: {} };
    socket.join(code);
    socket._roomCode = code;
    socket.emit('host_created', { code });
    console.log(`Host created room ${code} (${socket.id})`);
  });

  socket.on('player_join', ({ code, player }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room || !room.hostSocketId) {
      socket.emit('join_failed', { reason: 'no_host' });
      return;
    }
    // ensure player name is unique within the room (case-insensitive)
    const name = (player && player.name ? String(player.name).trim() : '');
    const nameLower = name.toLowerCase();
    const duplicate = Object.values(room.players).some(p => ((p && p.name) || '').toLowerCase() === nameLower);
    if (duplicate) {
      socket.emit('join_failed', { reason: 'name_not_unique' });
      return;
    }
    // If this player ID already exists (reconnect), rebind socketId and notify host
    const existing = room.players[player.id];
    if (existing) {
      existing.socketId = socket.id;
      existing.name = name;
      existing.lastDisconnectedAt = undefined;
      room.players[player.id] = existing;
      socket.join(code);
      socket._roomCode = code;
      socket._playerId = player.id;
      // notify host that a player rejoined
      io.to(room.hostSocketId).emit('player_rejoined', player);
      console.log(`Player ${player.id} (${name}) rejoined room ${code}`);
    } else {
      // register player (store socketId and name)
      room.players[player.id] = { socketId: socket.id, name };
      socket.join(code);
      socket._roomCode = code;
      socket._playerId = player.id;
      // notify host of the new player
      io.to(room.hostSocketId).emit('player_joined', player);
      console.log(`Player ${player.id} (${name}) joined room ${code}`);
    }
  });

  socket.on('host_event', ({ code, msg, targetPlayerId }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) return;
    if (targetPlayerId) {
      const target = room.players[targetPlayerId];
      const targetSocket = target && target.socketId;
      if (targetSocket) io.to(targetSocket).emit('host_event', msg);
    } else {
      // broadcast to players in room (exclude host)
      socket.to(code).emit('host_event', msg);
    }
  });

  socket.on('player_event', ({ code, msg }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) return;
    // forward to host
    io.to(room.hostSocketId).emit('player_event', msg);
  });

  socket.on('host_close', ({ code }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) return;
    // notify players
    io.in(code).emit('session_closed');
    // cleanup
    delete rooms[code];
    console.log(`Host closed room ${code}`);
  });

  socket.on('disconnect', () => {
    const code = socket._roomCode;
    const playerId = socket._playerId;
    if (code && rooms[code]) {
      const room = rooms[code];
      if (room.hostSocketId === socket.id) {
        // host disconnected — notify players and remove room
        io.in(code).emit('session_closed');
        delete rooms[code];
        console.log(`Host disconnected, closed room ${code}`);
      } else if (playerId) {
        // player disconnected — keep their slot but clear socketId and timestamp
        const entry = room.players[playerId];
        if (entry) {
          entry.socketId = null;
          entry.lastDisconnectedAt = Date.now();
          room.players[playerId] = entry;
        }
        if (room.hostSocketId) io.to(room.hostSocketId).emit('player_disconnected', { id: playerId, timestamp: Date.now() });
        console.log(`Player ${playerId} disconnected from room ${code}`);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
