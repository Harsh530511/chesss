const express = require("express");
const path = require("path");
const app = express();

// Serve all files in your project directory
app.use(express.static(path.join(__dirname)));

// Create HTTP server with Socket.IO
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["*"]
  }

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
    const foreachloop = [1, 15, 30];
    foreachloop.forEach(element => {
        const index = waiting[element].indexOf(socket.id);
        if (index > -1) {
            waiting[element].splice(index, 1);
        }

    });


}
// function removesocketfrommatch(socket,timer) {
//     if (matches[timer].includes(socket.id)) {
//         const foreachloop = [10, 15, 30];
//     foreachloop.forEach(element => {
//         const index = matches[element].indexOf(socket.id);
//         if (index > -1) {
//             matches[element].splice(index, 1);
//         }
//     });
//     }
// }





function fireTotalPlayers() {
    io.emit('total_players_count_change', totalPlayers);
}
function ondisconnect(socket) {
    removesocketfromwaiting(socket);
    // removesocketfrommatch(socket);
    totalPlayers--;
    fireTotalPlayers();
}
function setmatch(oppid, socketid, timer) {
     console.log(`Match created: ${oppid} vs ${socketid} for ${timer} min`);
  

    players[oppid].emit("match_made", "w", timer);
    players[socketid].emit("match_made", "b", timer);
    players[oppid].on("sync_state", function (fen, turn) {
        players[socketid].emit("sync_state_from_server", fen, turn);
    });
    players[socketid].on("sync_state", function (fen, turn) {
        players[oppid].emit("sync_state_from_server", fen, turn);
    });


    players[oppid].on("game_over", function (winner) {

        players[socketid].emit("game_over_from_server", winner);
    });
    players[socketid].on("game_over", function (winner) {

        players[oppid].emit("game_over_from_server", winner);
    });

}
function debugWaiting() {
    console.log("⏱ Waiting queues:", waiting);
}

function playreq(socket, timer) {
    if (waiting[timer].length > 0) {
        const oppid = waiting[timer].splice(0, 1)[0]
        matches[timer].push({
            [oppid]: socket.id,
        });
        setmatch(oppid, socket.id, timer);
        return;
    }
    if (!waiting[timer].includes(socket.id)) {
        waiting[timer].push(socket.id);
        debugWaiting();

    }

};


function onconnect(socket) {
    console.log(`Player connected: ${socket.id}`);

    socket.on('want_to_play', function (timer) {
         console.log(`Player ${socket.id} wants to play with timer ${timer}`);
        playreq(socket, timer);

    });
    totalPlayers++;
    fireTotalPlayers();
}

io.on("connection", (socket) => {
    console.log(`🟢 New socket connected: ${socket.id}`);
    onconnect(socket);
    players[socket.id] = socket

    socket.on('disconnect', () =>{
        console.log(`🔴 Socket disconnected: ${socket.id}`);
        ondisconnect(socket);
    }); 
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});


