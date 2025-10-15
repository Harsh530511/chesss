// socket.js
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static frontend files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Player management
let totalPlayers = 0;
let players = {};
let waiting = { 1: [], 15: [], 30: [] };
let matches = { 1: [], 15: [], 30: [] };

// Utility functions
function removeSocketFromWaiting(socket) {
  [1, 15, 30].forEach(timer => {
    const index = waiting[timer].indexOf(socket.id);
    if (index > -1) waiting[timer].splice(index, 1);
  });
}

function fireTotalPlayers() {
  io.emit("total_players_count_change", totalPlayers);
}

// Create match and relay game events
function setMatch(oppId, socketId, timer) {
  console.log(`Match created: ${oppId} vs ${socketId} for ${timer} min`);

  players[oppId].emit("match_made", "w", timer);
  players[socketId].emit("match_made", "b", timer);

  // Sync moves
  players[oppId].on("sync_state", (fen, turn) => {
    players[socketId].emit("sync_state_from_server", fen, turn);
  });
  players[socketId].on("sync_state", (fen, turn) => {
    players[oppId].emit("sync_state_from_server", fen, turn);
  });

  // Game over events
  players[oppId].on("game_over", winner => {
    players[socketId].emit("game_over_from_server", winner);
  });
  players[socketId].on("game_over", winner => {
    players[oppId].emit("game_over_from_server", winner);
  });
}

// Debug waiting queues
function debugWaiting() {
  console.log("⏱ Waiting queues:", waiting);
}

// Handle play requests
function playRequest(socket, timer) {
  if (waiting[timer].length > 0) {
    const oppId = waiting[timer].splice(0, 1)[0];
    matches[timer].push({ [oppId]: socket.id });
    setMatch(oppId, socket.id, timer);
    return;
  }

  if (!waiting[timer].includes(socket.id)) {
    waiting[timer].push(socket.id);
    debugWaiting();
  }
}

// Handle new connections
function onConnect(socket) {
  console.log(`🟢 Player connected: ${socket.id}`);
  totalPlayers++;
  fireTotalPlayers();

  socket.on("want_to_play", timer => {
    console.log(`Player ${socket.id} wants to play with timer ${timer}`);
    playRequest(socket, timer);
  });

  socket.on("disconnect", () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    removeSocketFromWaiting(socket);
    totalPlayers--;
    fireTotalPlayers();
    delete players[socket.id]; // Clean up
  });
}

// Socket.IO connection
io.on("connection", socket => {
  players[socket.id] = socket;
  onConnect(socket);
});

// Start server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
