const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);
const SERVER_VERSION = "v1.0.0";

// ✅ Allow CORS from your deployed frontend
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

// ✅ Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// ✅ Player & Match tracking
let totalPlayers = 0;
let players = {};
let waiting = { 1: [], 15: [], 30: [] };
let matches = { 1: [], 15: [], 30: [] };

// 🧹 Remove socket from all waiting lists
function removesocketfromwaiting(socket) {
  [1, 15, 30].forEach(timer => {
    const index = waiting[timer].indexOf(socket.id);
    if (index > -1) waiting[timer].splice(index, 1);
  });
}

// 🔄 Update all clients with total player count
function fireTotalPlayers() {
  io.emit("total_players_count_change", totalPlayers);
}

// 🧨 Handle disconnects — give win to opponent if mid-match
function ondisconnect(socket) {
   // console.log(`🔴 Player disconnected: ${socket.id}`);

    const oppid = socket.opponent;
    if (oppid && players[oppid]) {
       // console.log(`💀 ${socket.id} disconnected mid-match. ${oppid} wins.`);

        // Get the remaining player's color
        const remainingPlayerColor = players[oppid].color;
        const disconnectedPlayerColor = remainingPlayerColor === 'White' ? 'Black' : 'White';
        
       // console.log(`🎯 Sending win to ${oppid} (${remainingPlayerColor})`);

        // Send proper OBJECT, not string
        const gameOverData = {
            reason: "disconnect",
            winner: remainingPlayerColor,
            message: `Opponent (${disconnectedPlayerColor}) disconnected — ${remainingPlayerColor} wins! 🏆`
        };
        
        // IMPORTANT: Send as object
        players[oppid].emit("game_over_from_server", gameOverData);

        // Clean up opponent reference
        players[oppid].opponent = null;
        players[oppid].color = null;
    }

    removesocketfromwaiting(socket);
    delete players[socket.id];
    totalPlayers--;
    fireTotalPlayers();
}

// ⚔️ Create a match between two players
function setmatch(oppid, socketid, timer) {
   // console.log(`⚔️ Match created: ${oppid} vs ${socketid} (${timer} min)`);

    // store opponent references
    players[oppid].opponent = socketid;
    players[socketid].opponent = oppid;

    // Assign colors and store them
    players[oppid].color = "White";
    players[socketid].color = "Black";
    
   // console.log(`🎨 Colors assigned: ${oppid} = White, ${socketid} = Black`);

    players[oppid].emit("match_made", "w", timer);
    players[socketid].emit("match_made", "b", timer);

    // ♻️ Relay board state (FEN + turn)
    players[oppid].on("sync_state", (fen, turn) => {
        if (players[socketid]) players[socketid].emit("sync_state_from_server", fen, turn);
    });
    
    players[socketid].on("sync_state", (fen, turn) => {
        if (players[oppid]) players[oppid].emit("sync_state_from_server", fen, turn);
    });

    // 🏁 Handle manual game over - FIXED VERSION
    players[oppid].on("game_over", (data) => {
       // console.log(`🎮 Game over from WHITE (${oppid}):`, data);
        if (players[socketid]) {
            // Ensure data is properly formatted
            const gameOverData = typeof data === "string" ? {
                winner: data,
                reason: "checkmate",
                message: `${data} won by checkmate! 🏆`
            } : data;
            
           // console.log(`📤 Forwarding to BLACK (${socketid}):`, gameOverData);
            players[socketid].emit("game_over_from_server", gameOverData);
        } else {
           // console.log(`❌ BLACK player (${socketid}) not found`);
        }
    });

    players[socketid].on("game_over", (data) => {
       // console.log(`🎮 Game over from BLACK (${socketid}):`, data);
        if (players[oppid]) {
            // Ensure data is properly formatted
            const gameOverData = typeof data === "string" ? {
                winner: data,
                reason: "checkmate", 
                message: `${data} won by checkmate! 🏆`
            } : data;
            
           // console.log(`📤 Forwarding to WHITE (${oppid}):`, gameOverData);
            players[oppid].emit("game_over_from_server", gameOverData);
        } else {
           // console.log(`❌ WHITE player (${oppid}) not found`);
        }
    });
}

// 🎯 Handle "Want to play" matchmaking
function playreq(socket, timer) {
  if (waiting[timer].length > 0) {
    const oppid = waiting[timer].shift();
    matches[timer].push({ [oppid]: socket.id });
    setmatch(oppid, socket.id, timer);
  } else {
    waiting[timer].push(socket.id);
    //console.log(`⏱ Player ${socket.id} waiting in ${timer}-min queue`);
  }
}

// ⚡ On each new connection
function onconnect(socket) {
  console.log(`🟢 Player connected: ${socket.id}`);
  socket.emit("server_version", SERVER_VERSION);
  players[socket.id] = socket;
  totalPlayers++;
  fireTotalPlayers();

  // Handle player count requests
  socket.on("get_player_count", () => {
    socket.emit("total_players_count_change", totalPlayers);
  });

  socket.on("want_to_play", (timer) => {
   // console.log(`🎮 ${socket.id} wants to play a ${timer}-min game`);
    playreq(socket, timer);
  });

  socket.on("cancel_matchmaking", () => {
    removesocketfromwaiting(socket);
   // console.log(`❌ Player ${socket.id} canceled matchmaking`);
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