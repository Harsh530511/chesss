// ==========================
// script.js
// ==========================

// Initialize chessboard and game
var board = null;
var game = new Chess();
var $status = $('#status');
var $fen = $('#fen');
var $pgn = $('#pgn');
let c_player = null;
let timerInst = null;
let currentMatchTime = null;

const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const gameOverSound = document.getElementById('gameOverSound');

// ==========================
// Timer
// ==========================
function startTimer(seconds, container, onComplete) {
    let startTime = Date.now();
    let remaining = seconds * 1000; // in ms
    const display = document.getElementById(container);
    let timer = null;

    function update() {
        const now = Math.max(0, remaining - (Date.now() - startTime));
        const m = Math.floor(now / 60000);
        const s = Math.floor(now / 1000) % 60;
        display.innerHTML = `${m}:${s < 10 ? '0' : ''}${s}`;

        if (now <= 0) {
            clearInterval(timer);
            const winner = game.turn() === 'b' ? 'White' : 'Black';
            alert(winner + " Won The Match");
            socket.emit("game_over", winner);
            if (onComplete) onComplete();
        }
    }

    timer = setInterval(update, 250);

    return {
        pause: () => {
            remaining = Math.max(0, remaining - (Date.now() - startTime));
            clearInterval(timer);
        },
        resume: () => {
            startTime = Date.now();
            timer = setInterval(update, 250);
        }
    };
}


// ==========================
// Drag & Drop
// ==========================
function onDragStart(source, piece) {
    if (game.turn() !== c_player) return false;
    if (game.game_over()) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';

    if (move.captured) captureSound.play();
    else moveSound.play();

    socket.emit('sync_state', game.fen(), game.turn());
    updateStatus();

    if (timerInst) timerInst.pause();
}

// Called after every change
function onChange() {
    if (game.game_over() && game.in_checkmate()) {
        const winner = game.turn() === 'b' ? 'White' : 'Black';
        socket.emit("game_over", winner);
    }
}

function onSnapEnd() { board.position(game.fen()); }

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) status = `Game over, ${moveColor} is in checkmate.`;
    else if (game.in_draw()) status = 'Game over, drawn position';
    else status = `${moveColor} to move${game.in_check() ? ', in check' : ''}`;

    $status.html(status);
    $fen.html(game.fen());
    $pgn.html(game.pgn());
}

// ==========================
// Chessboard config
// ==========================
var config = {
    draggable: true,
    position: 'start',
    onDragStart,
    onDrop,
    onChange,
    onSnapEnd
};
board = Chessboard('myBoard', config);
updateStatus();

// ==========================
// Timer Buttons
// ==========================
function handleButtonClick(event) {
    const timer = event.target.dataset.time;
    socket.emit('want_to_play', timer);
    $('#main-ele').hide();
    $('#waiting_para').show();
}

document.addEventListener("DOMContentLoaded", function () {
    const buttons = document.getElementsByClassName("timer-button");
    for (let button of buttons) {
        button.addEventListener('click', handleButtonClick);
    }
});

// ==========================
// Socket.IO connection
// ==========================
// Auto-detect server URL based on environment
const socket = io(
  window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : window.location.origin
);

// ✅ Auto-reload when new version deployed
socket.on("server_version", (serverVersion) => {
  const localVersion = localStorage.getItem("server_version");
  if (localVersion && localVersion !== serverVersion) {
    alert("New update available — refreshing!");
    localStorage.setItem("server_version", serverVersion);
    location.reload();
  } else {
    localStorage.setItem("server_version", serverVersion);
  }
});

socket.on("connect", () => console.log("✅ Socket connected:", socket.id));
socket.on("disconnect", () => console.log("🔴 Socket disconnected"));

// Total players update
socket.on("total_players_count_change", (count) => {
    $('#total_players').html("Total Players : " + count);
});

// Match made
socket.on("match_made", (color, timer) => {
    c_player = color;
    $('#main-ele').show();
    $('#waiting_para').hide();

    const currentPlayer = color === 'b' ? 'BLACK' : 'WHITE';
    $('#btn-parent').html(`
        <p id='youare'>${currentPlayer}</p>
        <p id='timerDis'></p>
    `);

    game.reset();
    board.clear();
    board.start();
    board.orientation(currentPlayer.toLowerCase());
    currentMatchTime = timer;

    if (game.turn() === c_player) {
        timerInst = startTimer(timer * 60, "timerDis", () => {});
    } else {
        timerInst = null;
        $("#timerDis").html(`${timer}:00`);
    }
});

// Sync game state
socket.on('sync_state_from_server', (fen, turn) => {
    game.load(fen);
    game.setTurn(turn);
    board.position(fen);

    if (timerInst) timerInst.resume();
    else timerInst = startTimer(currentMatchTime * 60, "timerDis", () => {});
});

// Game over
socket.on("game_over_from_server", (winner) => {
    gameOverSound.play();
    alert(`${winner} Won The Match`);
    if (timerInst) timerInst.pause();
    window.location.reload();
});




