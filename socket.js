const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);
const SERVER_VERSION = "v1.0.0";

const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://chesss-production.up.railway.app",
      "http://localhost:8080",
      "http://127.0.0.1:5000"
    ],
    methods: ["GET", "POST"]
  },
});

app.use(express.static(path.join(__dirname, "public")));

let totalPlayers = 0;
let players = {};
let waiting = { 1: [], 15: [], 30: [] };

function removesocketfromwaiting(socket) {
  [1, 15, 30].forEach(timer => {
    const index = waiting[timer].indexOf(socket.id);
    if (index > -1) waiting[timer].splice(index, 1);
  });
}

function fireTotalPlayers() {
  io.emit("total_players_count_change", totalPlayers);
}

function ondisconnect(socket) {
    console.log(`🔴 Player disconnected: ${socket.id}`);

    const oppid = socket.opponent;
    if (oppid && players[oppid]) {
        console.log(`💀 ${socket.id} disconnected mid-match. ${oppid} wins.`);

        const remainingPlayerColor = players[oppid].color;
        const disconnectedPlayerColor = remainingPlayerColor === 'White' ? 'Black' : 'White';
        
        players[oppid].emit("game_over_from_server", {
            reason: "disconnect",
            winner: remainingPlayerColor,
            message: `Opponent (${disconnectedPlayerColor}) disconnected — ${remainingPlayerColor} wins! 🏆`
        });

        players[oppid].opponent = null;
        players[oppid].color = null;
    }

    removesocketfromwaiting(socket);
    delete players[socket.id];
    totalPlayers--;
    fireTotalPlayers();
}

function setmatch(oppid, socketid, timer) {
    console.log(`⚔️ Match created: ${oppid} vs ${socketid} (${timer} min)`);

    players[oppid].opponent = socketid;
    players[socketid].opponent = oppid;

    players[oppid].color = "White";
    players[socketid].color = "Black";
    
    players[oppid].emit("match_made", "w", timer);
    players[socketid].emit("match_made", "b", timer);

    players[oppid].on("sync_state", (fen, turn) => {
        if (players[socketid]) players[socketid].emit("sync_state_from_server", fen, turn);
    });
    
    players[socketid].on("sync_state", (fen, turn) => {
        if (players[oppid]) players[oppid].emit("sync_state_from_server", fen, turn);
    });

    // 🎯 FIXED: Game over event forwarding
    players[oppid].on("game_over", (data) => {
        console.log(`🎮 Game over from WHITE (${oppid}):`, data);
        if (players[socketid]) {
            console.log(`📤 Forwarding to BLACK (${socketid}):`, data);
            players[socketid].emit("game_over_from_server", data);
        } else {
            console.log(`❌ BLACK player (${socketid}) not found`);
        }
    });

    players[socketid].on("game_over", (data) => {
        console.log(`🎮 Game over from BLACK (${socketid}):`, data);
        if (players[oppid]) {
            console.log(`📤 Forwarding to WHITE (${oppid}):`, data);
            players[oppid].emit("game_over_from_server", data);
        } else {
            console.log(`❌ WHITE player (${oppid}) not found`);
        }
    });
}

function playreq(socket, timer) {
  if (waiting[timer].length > 0) {
    const oppid = waiting[timer].shift();
    setmatch(oppid, socket.id, timer);
  } else {
    waiting[timer].push(socket.id);
    console.log(`⏱ Player ${socket.id} waiting in ${timer}-min queue`);
  }
}

function onconnect(socket) {
  console.log(`🟢 Player connected: ${socket.id}`);
  socket.emit("server_version", SERVER_VERSION);
  socket.on("get_player_count", () => {
    socket.emit("total_players_count_change", totalPlayers);
});
  players[socket.id] = socket;
  totalPlayers++;
  fireTotalPlayers();

  socket.on("want_to_play", (timer) => {
    console.log(`🎮 ${socket.id} wants to play ${timer} min`);
    playreq(socket, timer);
  });

  socket.on("cancel_matchmaking", () => {
    removesocketfromwaiting(socket);
    console.log(`❌ ${socket.id} canceled matchmaking`);
  });

  socket.on("disconnect", () => {
    ondisconnect(socket);
  });
}

io.on("connection", onconnect);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});