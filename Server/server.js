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
    // register player
    room.players[player.id] = socket.id;
    socket.join(code);
    socket._roomCode = code;
    socket._playerId = player.id;
    // notify host of the new player
    io.to(room.hostSocketId).emit('player_joined', player);
    console.log(`Player ${player.id} joined room ${code}`);
  });

  socket.on('host_event', ({ code, msg, targetPlayerId }) => {
    code = (code || '').toUpperCase();
    const room = rooms[code];
    if (!room) return;
    if (targetPlayerId) {
      const targetSocket = room.players[targetPlayerId];
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
        // player disconnected — remove from mapping and notify host
        delete room.players[playerId];
        if (room.hostSocketId) io.to(room.hostSocketId).emit('player_disconnected', { id: playerId });
        console.log(`Player ${playerId} disconnected from room ${code}`);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
