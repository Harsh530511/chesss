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
// Enhanced Waiting Screen Variables
// ==========================
let searchStartTime = null;
let searchTimer = null;

// ==========================
// Timer
// ==========================
function startTimer(seconds, container, onComplete) {
    let startTime = Date.now();
    let remaining = seconds * 1000;
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
            
            // Consistent object format
            socket.emit("game_over", {
                reason: "timeout",
                winner: winner,
                message: `Time over — ${winner} wins! ⏰`
            });

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
// Enhanced Waiting Screen Functions
// ==========================
function showWaitingScreen(timer) {
    $('#main-ele').hide();
    $('#waitingScreen').show();
    
    // Update online players count
    socket.emit('get_player_count');
    
    // Start search timer
    searchStartTime = Date.now();
    updateSearchTime();
    
    console.log(`🔍 Searching for ${timer}-min game...`);
}

function hideWaitingScreen() {
    $('#waitingScreen').hide();
    $('#main-ele').show();
    
    // Clear search timer
    if (searchTimer) {
        clearInterval(searchTimer);
        searchTimer = null;
    }
}

function updateSearchTime() {
    if (searchTimer) clearInterval(searchTimer);
    
    searchTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - searchStartTime) / 1000);
        $('#searchTime').text(`${elapsed}s`);
    }, 1000);
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
        
        // Emit consistent object format
        socket.emit("game_over", {
            reason: "checkmate",
            winner: winner,
            message: `${winner} won by checkmate! 🏆`
        });
    } else if (game.game_over() && game.in_draw()) {
        socket.emit("game_over", {
            reason: "draw",
            winner: null,
            message: "Game ended in a draw! 🤝"
        });
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
    showWaitingScreen(timer);
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

socket.on("connect", () => {
    console.log("✅ Socket connected:", socket.id);
    // Request player count on connect
    socket.emit('get_player_count');
});

socket.on("disconnect", () => console.log("🔴 Socket disconnected"));

// Total players update
socket.on("total_players_count_change", (count) => {
    $('#total_players').html("Total Players: " + count);
    $('#onlinePlayers').text(count);
});

// Cancel match button
document.getElementById("cancelWait").addEventListener("click", () => {
    hideWaitingScreen();
    socket.emit("cancel_matchmaking");
    console.log("❌ Matchmaking cancelled");
});

// ==========================
// Professional Game Over Modal
// ==========================
function showGameOverPopup(data) {
    // Play game over sound
    if (gameOverSound) gameOverSound.play();
    
    const modal = document.createElement("div");
    modal.id = "professionalGameOverModal";
    modal.style = `
        position: fixed; 
        inset: 0; 
        background: rgba(0,0,0,0.95);
        display: flex; 
        align-items: center; 
        justify-content: center;
        z-index: 9999;
        font-family: 'Arial', sans-serif;
        backdrop-filter: blur(5px);
    `;
    
    // Determine if current player won
    let isWin = false;
    if (data.winner && c_player) {
        const currentPlayerColor = c_player === 'w' ? 'White' : 'Black';
        isWin = data.winner === currentPlayerColor;
    }
    
    // Special styling for different reasons
    let resultColor, resultText, icon;
    
    if (data.reason === "disconnect") {
        resultColor = '#4CAF50';
        resultText = 'Victory! 🏆';
        icon = '🏆';
    } else if (data.reason === "timeout") {
        if (isWin) {
            resultColor = '#4CAF50';
            resultText = 'Victory! ⏰';
            icon = '🏆';
        } else {
            resultColor = '#f44336';
            resultText = 'Time Out! 💔';
            icon = '⏰';
        }
    } else if (data.reason === "checkmate") {
        if (isWin) {
            resultColor = '#4CAF50';
            resultText = 'Checkmate! 🏆';
            icon = '🏆';
        } else {
            resultColor = '#f44336';
            resultText = 'Checkmated 💔';
            icon = '💔';
        }
    } else {
        resultColor = '#FF9800';
        resultText = 'Draw 🤝';
        icon = '🤝';
    }

    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            border: 2px solid #444;
            text-align: center;
            max-width: 500px;
            width: 90%;
            color: white;
            animation: popIn 0.3s ease-out;
        ">
            <div style="font-size: 4rem; margin-bottom: 20px;">${icon}</div>
            
            <h2 style="
                font-size: 2.5rem;
                margin: 0 0 10px 0;
                color: ${resultColor};
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            ">${resultText}</h2>
            
            <div style="
                background: rgba(255,255,255,0.1);
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
                border-left: 4px solid ${resultColor};
            ">
                <p style="font-size: 1.3rem; margin: 0; color: #fff;">${data.message}</p>
                ${data.winner ? `<p style="font-size: 1.1rem; margin: 10px 0 0 0; color: #ccc;">Winner: <strong style="color: ${resultColor};">${data.winner}</strong></p>` : ''}
                ${data.loser && !isWin ? `<p style="font-size: 1.1rem; margin: 10px 0 0 0; color: #ccc;">You ran out of time</p>` : ''}
            </div>
            
            <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px;">
                <button id="rematchBtn" style="
                    padding: 12px 30px;
                    border: none;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #4CAF50, #45a049);
                    color: white;
                    font-size: 1.1rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: bold;
                ">Play Again</button>
                
                <button id="closeBtn" style="
                    padding: 12px 30px;
                    border: 2px solid #666;
                    border-radius: 8px;
                    background: transparent;
                    color: #ccc;
                    font-size: 1.1rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">Main Menu</button>
            </div>
        </div>
        
        <style>
            @keyframes popIn {
                0% { transform: scale(0.8); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            
            #rematchBtn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(76, 175, 80, 0.4);
            }
            
            #closeBtn:hover {
                background: rgba(255,255,255,0.1) !important;
                border-color: #888 !important;
                color: white !important;
            }
        </style>
    `;
    
    document.body.appendChild(modal);

    // Button handlers
    document.getElementById("rematchBtn").onclick = () => {
        modal.remove();
        window.location.reload();
    };

    document.getElementById("closeBtn").onclick = () => {
        modal.remove();
        window.location.href = '/';
    };
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            window.location.reload();
        }
    };
}

// ==========================
// Socket Event Handlers
// ==========================

// Match made
socket.on("match_made", (color, timer) => {
    c_player = color;
    hideWaitingScreen();
    
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

// Game over event listener
socket.on("game_over_from_server", (data) => {
    if (timerInst) timerInst.pause();
    
    let processedData;
    
    if (typeof data === 'string') {
        processedData = {
            reason: "disconnect",
            winner: null,
            message: data
        };
    } else {
        processedData = {
            reason: data.reason || "unknown",
            winner: data.winner || null,
            loser: data.loser || null,
            message: data.message || "Game ended"
        };
    }
    
    showGameOverPopup(processedData);
});