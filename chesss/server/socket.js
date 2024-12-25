const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["*", "*"]
    },

});

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

    }

}
function onconnect(socket) {

    socket.on('want_to_play', function (timer) {

        playreq(socket, timer);

    });
    totalPlayers++;
    fireTotalPlayers();
}

io.on("connection", (socket) => {
    onconnect(socket);
    players[socket.id] = socket

    socket.on('disconnect', () => ondisconnect(socket))
});

httpServer.listen(3000);
