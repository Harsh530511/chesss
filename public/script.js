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
    let startTime = new Date().getTime();
    let ms = seconds * 1000;
    const display = document.getElementById(container);

    const timer = setInterval(() => {
        let now = Math.max(0, ms - (new Date().getTime() - startTime));
        let m = Math.floor(now / 60000);
        let s = Math.floor(now / 1000) % 60;
        s = (s < 10 ? "0" : "") + s;
        display.innerHTML = `${m}:${s}`;

        if (now <= 0) {
            clearInterval(timer);
            const winner = game.turn() === 'b' ? 'White' : 'Black';
            alert(winner + " Won The Match");
            socket.emit("game_over", winner);
            if (onComplete) onComplete();
        }
    }, 250);

    return {
        pause: () => { ms -= new Date().getTime() - startTime; clearInterval(timer); },
        resume: () => { startTime = new Date().getTime(); startTimer(ms/1000, container, onComplete); }
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
const socket = io("https://chesss-production.up.railway.app/");

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
