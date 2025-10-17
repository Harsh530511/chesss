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

// ==========================
// Performance Optimizations
// ==========================

// Performance optimization - batch player count updates
let playerCountUpdateQueue = [];
let playerCountUpdateTimer = null;

function schedulePlayerCountUpdate() {
    if (playerCountUpdateTimer) {
        clearTimeout(playerCountUpdateTimer);
    }
    
    playerCountUpdateTimer = setTimeout(() => {
        fireTotalPlayers();
        playerCountUpdateQueue = [];
    }, 100); // Batch updates every 100ms
}

// Optimized matchmaking with rate limiting
const matchmakingAttempts = new Map();
const PLAYER_CLEANUP_INTERVAL = 60000; // 1 minute
const MATCHMAKING_RATE_LIMIT = 1000; // 1 second

// Clean up matchmaking attempts periodically
setInterval(() => {
    const now = Date.now();
    for (const [socketId, timestamp] of matchmakingAttempts) {
        if (now - timestamp > 30000) { // Clean up after 30 seconds
            matchmakingAttempts.delete(socketId);
        }
    }
}, PLAYER_CLEANUP_INTERVAL);

// ==========================
// Core Game Functions
// ==========================

// 🧹 Remove socket from all waiting lists
function removesocketfromwaiting(socket) {
    const socketId = socket.id;
    [1, 15, 30].forEach(timer => {
        const index = waiting[timer].indexOf(socketId);
        if (index > -1) {
            waiting[timer].splice(index, 1);
        }
    });
}

// 🔄 Update all clients with total player count (optimized)
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
    
    // Use optimized player count update
    schedulePlayerCountUpdate();
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

    // Remove both players from waiting lists
    removesocketfromwaiting(players[oppid]);
    removesocketfromwaiting(players[socketid]);

    // ♻️ Relay board state (FEN + turn) - Optimized with error handling
    function createSyncHandler(sourceSocket, targetSocketId) {
        return (fen, turn) => {
            if (players[targetSocketId]) {
                players[targetSocketId].emit("sync_state_from_server", fen, turn);
            }
        };
    }

    players[oppid].on("sync_state", createSyncHandler(players[oppid], socketid));
    players[socketid].on("sync_state", createSyncHandler(players[socketid], oppid));

    // 🏁 Handle manual game over - FIXED VERSION
    function createGameOverHandler(sourceSocket, targetSocketId, sourceColor) {
        return (data) => {
            // console.log(`🎮 Game over from ${sourceColor} (${sourceSocket.id}):`, data);
            if (players[targetSocketId]) {
                // Ensure data is properly formatted
                const gameOverData = typeof data === "string" ? {
                    winner: data,
                    reason: "checkmate",
                    message: `${data} won by checkmate! 🏆`
                } : data;
                
                // console.log(`📤 Forwarding to opponent (${targetSocketId}):`, gameOverData);
                players[targetSocketId].emit("game_over_from_server", gameOverData);
            } else {
                // console.log(`❌ Opponent player (${targetSocketId}) not found`);
            }
        };
    }

    players[oppid].on("game_over", createGameOverHandler(players[oppid], socketid, "WHITE"));
    players[socketid].on("game_over", createGameOverHandler(players[socketid], oppid, "BLACK"));
}

// 🎯 Handle "Want to play" matchmaking
function playreq(socket, timer) {
    const socketId = socket.id;
    const now = Date.now();
    const lastAttempt = matchmakingAttempts.get(socketId) || 0;
    
    // Rate limiting: max 1 attempt per second
    if (now - lastAttempt < MATCHMAKING_RATE_LIMIT) {
        return;
    }
    
    matchmakingAttempts.set(socketId, now);
    
    if (waiting[timer].length > 0) {
        const oppid = waiting[timer].shift();
        matches[timer].push({ [oppid]: socketId });
        setmatch(oppid, socketId, timer);
    } else {
        waiting[timer].push(socketId);
        // console.log(`⏱ Player ${socketId} waiting in ${timer}-min queue`);
    }
}

// ==========================
// Connection Management
// ==========================

// ⚡ On each new connection
function onconnect(socket) {
    console.log(`🟢 Player connected: ${socket.id}`);
    socket.emit("server_version", SERVER_VERSION);
    players[socket.id] = socket;
    totalPlayers++;
    
    // Use optimized player count update
    schedulePlayerCountUpdate();

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

    // Error handling
    socket.on("error", (error) => {
        console.error(`❌ Socket error for ${socket.id}:`, error);
    });
}

// ==========================
// Server Initialization
// ==========================

io.on("connection", onconnect);

// Global error handling
io.engine.on("connection_error", (err) => {
    console.error("🚨 Socket.IO connection error:", err);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully');
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
});

// Memory leak detection (development only)
if (process.env.NODE_ENV === 'development') {
    const sessionMap = io.of("/").adapter.rooms;
    setInterval(() => {
        const playerCount = Object.keys(players).length;
        const waitingCount = Object.values(waiting).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`📊 Stats - Players: ${playerCount}, Waiting: ${waitingCount}, Rooms: ${sessionMap.size}`);
    }, 30000); // Log every 30 seconds
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🚀 Server Version: ${SERVER_VERSION}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export for testing purposes
module.exports = {
    app,
    io,
    players,
    waiting,
    matches,
    totalPlayers
};