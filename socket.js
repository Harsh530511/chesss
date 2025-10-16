const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);

// ✅ Allow CORS from your deployed frontend
const io = new Server(httpServer, {
  cors: {
    origin: "https://chesss-production.up.railway.app",
    methods: ["GET", "POST"],
  },
});


// ✅ Serve all frontend files from the same server
app.use(express.static(path.join(__dirname)));

// ✅ Variables to track players and matches
let totalPlayers = 0;
let players = {};
let waiting = {
  1: [],
  15: [],
  30: [],
};
let matches = {
  1: [],
  15: [],
  30: [],
};

function removesocketfromwaiting(socket) {
  [1, 15, 30].forEach(timer => {
    const index = waiting[timer].indexOf(socket.id);
    if (index > -1) waiting[timer].splice(index, 1);
  });
}

function fireTotalPlayers() {
  io.emit('total_players_count_change', totalPlayers);
}

function ondisconnect(socket) {
  removesocketfromwaiting(socket);
  totalPlayers--;
  fireTotalPlayers();
  delete players[socket.id];
}

function setmatch(oppid, socketid, timer) {
  console.log(`⚔️ Match created: ${oppid} vs ${socketid} (${timer} min)`);

  players[oppid].emit("match_made", "w", timer);
  players[socketid].emit("match_made", "b", timer);

  // Relay move updates
  players[oppid].on("sync_state", (fen, turn) => {
    players[socketid].emit("sync_state_from_server", fen, turn);
  });
  players[socketid].on("sync_state", (fen, turn) => {
    players[oppid].emit("sync_state_from_server", fen, turn);
  });

  // Handle game over
  players[oppid].on("game_over", winner => {
    players[socketid].emit("game_over_from_server", winner);
  });
  players[socketid].on("game_over", winner => {
    players[oppid].emit("game_over_from_server", winner);
  });
}

function playreq(socket, timer) {
  if (waiting[timer].length > 0) {
    const oppid = waiting[timer].shift();
    matches[timer].push({ [oppid]: socket.id });
    setmatch(oppid, socket.id, timer);
  } else {
    waiting[timer].push(socket.id);
    console.log(`⏱ Player ${socket.id} waiting for opponent in ${timer}-min queue`);
  }
}

function onconnect(socket) {
  console.log(`🟢 Player connected: ${socket.id}`);
  players[socket.id] = socket;
  totalPlayers++;
  fireTotalPlayers();

  socket.on("want_to_play", timer => {
    console.log(`Player ${socket.id} wants to play ${timer} min game`);
    playreq(socket, timer);
  });

  socket.on("disconnect", () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    ondisconnect(socket);
  });
}

io.on("connection", onconnect);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
