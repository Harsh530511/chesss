// ==========================
// script.js - With Performance Optimizations
// ==========================

// Initialize chessboard and game
var board = null;
var game = new Chess();
var $status = $('#status');
var $fen = $('#fen');
var $pgn = $('#pgn');
let c_player = null;
let playerTimerInst = null;
let opponentTimerInst = null;
let currentMatchTime = null;

// Control method variables
let currentControlMethod = localStorage.getItem('chessControlMethod') || 'dragdrop'; // Default: drag & drop
let selectedPiece = null;
let selectedSquare = null;

const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const gameOverSound = document.getElementById('gameOverSound');

// ==========================
// Enhanced Waiting Screen Variables
// ==========================
let searchStartTime = null;
let searchTimer = null;

// ==========================
// Performance Optimizations
// ==========================

// Debounce function for resize events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Optimized resize handler
const handleResize = debounce(() => {
    if (board && !game.game_over()) {
        board.resize();
    }
}, 250);

// Memory optimization - clean up event listeners
function cleanupEventListeners() {
    window.removeEventListener('resize', handleResize);
    const boardElement = document.getElementById('myBoard');
    if (boardElement) {
        boardElement.removeEventListener('click', handleBoardClick);
    }
}

// Optimized timer functions with reduced frequency
function createOptimizedTimer(displayElement, containerElement, seconds, onComplete) {
    let startTime = Date.now();
    let remaining = seconds * 1000;
    let timer = null;
    let isPaused = false;
    let lastUpdate = 0;

    function update() {
        if (game.game_over()) {
            clearInterval(timer);
            return;
        }
        
        if (isPaused) return;
        
        const now = Math.max(0, remaining - (Date.now() - startTime));
        const currentTime = Math.floor(now / 1000);
        
        // Only update DOM if time actually changed
        if (currentTime !== lastUpdate) {
            const m = Math.floor(now / 60000);
            const s = Math.floor(now / 1000) % 60;
            const formattedTime = `${m}:${s < 10 ? '0' : ''}${s}`;
            displayElement.textContent = formattedTime;
            lastUpdate = currentTime;

            // Optimized class updates
            containerElement.classList.remove('timer-low', 'timer-critical');
            
            if (now <= 30000) {
                containerElement.classList.add('timer-critical');
            } else if (now <= 60000) {
                containerElement.classList.add('timer-low');
            }
        }

        if (now <= 0) {
            clearInterval(timer);
            if (onComplete) onComplete();
        }
    }

    // Use slower interval when time is high for better performance
    const interval = remaining > 60000 ? 1000 : 250;
    timer = setInterval(update, interval);

    return {
        pause: () => {
            isPaused = true;
            remaining = Math.max(0, remaining - (Date.now() - startTime));
            clearInterval(timer);
        },
        resume: () => {
            if (game.game_over()) return;
            isPaused = false;
            startTime = Date.now();
            const newInterval = remaining > 60000 ? 1000 : 250;
            timer = setInterval(update, newInterval);
        },
        stop: () => {
            clearInterval(timer);
            isPaused = true;
        },
        getRemaining: () => remaining
    };
}

// Replace existing timer functions with optimized versions
function startPlayerTimer(seconds, onComplete) {
    const display = document.getElementById('playerTimer');
    const container = document.getElementById('playerTimerContainer');
    return createOptimizedTimer(display, container, seconds, onComplete);
}

function startOpponentTimer(seconds) {
    const display = document.getElementById('opponentTimer');
    const container = document.getElementById('opponentTimerContainer');
    return createOptimizedTimer(display, container, seconds);
}

// Optimized click handler with event delegation
function initializeClickToMove() {
    const boardElement = document.getElementById('myBoard');
    if (!boardElement) return;
    
    boardElement.removeEventListener('click', handleBoardClick);
    boardElement.addEventListener('click', handleBoardClick, { passive: true });
}

// Optimized game over check with throttling
let lastGameOverCheck = 0;
function checkGameOver() {
    const now = Date.now();
    if (now - lastGameOverCheck < 500) return; // Throttle checks
    
    lastGameOverCheck = now;
    
    if (game.game_over()) {
        let gameOverData = {};
        
        if (game.in_checkmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            const loser = game.turn() === 'w' ? 'White' : 'Black';
            
            gameOverData = {
                reason: "checkmate",
                winner: winner,
                loser: loser,
                message: `${winner} won by checkmate! 🏆`
            };
        } else if (game.in_draw()) {
            gameOverData = {
                reason: "draw",
                winner: null,
                message: "Game ended in a draw! 🤝"
            };
        } else if (game.in_stalemate()) {
            gameOverData = {
                reason: "stalemate", 
                winner: null,
                message: "Game ended in stalemate! 🤝"
            };
        }
        
        if (gameOverData.reason) {
            if (playerTimerInst) playerTimerInst.stop();
            if (opponentTimerInst) opponentTimerInst.stop();
            
            socket.emit("game_over", gameOverData);
            showGameOverPopup(gameOverData);
        }
    }
}

// ==========================
// CONTROL METHOD TOGGLE SYSTEM
// ==========================
function initializeControlMethod() {
    updateControlUI();
    setupControlToggle();
    
    if (currentControlMethod === 'clickmove') {
        initializeClickToMove();
    }
    // Drag & drop is handled by chessboard.js config
}

function updateControlUI() {
    const controlText = document.getElementById('controlMethodText');
    const controlIcon = document.getElementById('controlMethodIcon');
    
    if (currentControlMethod === 'dragdrop') {
        controlText.textContent = 'Drag & Drop';
        controlIcon.textContent = '🖱️';
    } else {
        controlText.textContent = 'Click to Move';
        controlIcon.textContent = '👆';
    }
}

function setupControlToggle() {
    const controlToggle = document.getElementById('controlMethodToggle');
    const controlDropdown = document.getElementById('controlMethodDropdown');
    
    // Toggle dropdown visibility
    controlToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        controlDropdown.style.display = controlDropdown.style.display === 'block' ? 'none' : 'block';
    });
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', function() {
        controlDropdown.style.display = 'none';
    });
    
    // Handle method selection
    document.querySelectorAll('.control-option').forEach(option => {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            const method = this.getAttribute('data-method');
            switchControlMethod(method);
            controlDropdown.style.display = 'none';
        });
    });
}

function switchControlMethod(method) {
    if (method === currentControlMethod) return;
    
    currentControlMethod = method;
    localStorage.setItem('chessControlMethod', method);
    
    updateControlUI();
    
    // Reinitialize board with new control method
    if (board) {
        board.destroy();
    }
    
    initializeChessboard();
    
    console.log(`🔄 Switched to ${method === 'dragdrop' ? 'Drag & Drop' : 'Click to Move'}`);
}

// ==========================
// DRAG & DROP FUNCTIONS
// ==========================
function onDragStart(source, piece, position, orientation) {
    // Only process if drag & drop is enabled and it's player's turn
    if (currentControlMethod !== 'dragdrop' || game.game_over() || game.turn() !== c_player) {
        return false;
    }
    
    // Only allow dragging of player's own pieces
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
    
    return true;
}

function onDrop(source, target, piece, newPos, oldPos, orientation) {
    // Only process if drag & drop is enabled
    if (currentControlMethod !== 'dragdrop') return 'snapback';
    
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (!move) return 'snapback';

    if (move.captured) {
        captureSound.play();
    } else {
        moveSound.play();
    }

    socket.emit('sync_state', game.fen(), game.turn());
    updateStatus();
    updateTimerActivity();
    
    checkGameOver();
    
    return true;
}

function onSnapEnd() {
    board.position(game.fen());
}

// ==========================
// CLICK-TO-MOVE FUNCTIONS
// ==========================
function handleBoardClick(event) {
    // Only process if click-to-move is enabled
    if (currentControlMethod !== 'clickmove') return;
    
    // Don't process if game is over
    if (game.game_over()) {
        clearSelection();
        return;
    }

    // Don't process if it's not the player's turn
    if (game.turn() !== c_player) {
        clearSelection();
        return;
    }

    // Find the square that was clicked
    let target = event.target;
    let squareElement = null;
    
    // Traverse up to find the square element
    while (target && target !== this) {
        if (target.classList && target.classList.contains('square-55d63')) {
            squareElement = target;
            break;
        }
        target = target.parentElement;
    }
    
    if (!squareElement) return;
    
    // Get the square coordinates
    const square = squareElement.getAttribute('data-square');
    if (!square) return;
    
    handleSquareClick(square);
}

function handleSquareClick(square) {
    const piece = game.get(square);
    
    // If no piece is selected yet
    if (selectedPiece === null) {
        // Check if the clicked square has a piece that belongs to the current player
        if (piece && piece.color === c_player) {
            selectedPiece = piece;
            selectedSquare = square;
            addSelectionHighlight(square);
        }
    }
    // If a piece is already selected
    else {
        // If clicking on the same piece, deselect it
        if (square === selectedSquare) {
            clearSelection();
            return;
        }
        
        // If clicking on another piece of the same color, select that piece instead
        if (piece && piece.color === c_player) {
            clearSelection();
            selectedPiece = piece;
            selectedSquare = square;
            addSelectionHighlight(square);
            return;
        }
        
        // Try to move the selected piece to the clicked square
        const move = game.move({
            from: selectedSquare,
            to: square,
            promotion: 'q'
        });
        
        if (move) {
            // Legal move - update board and play sound
            board.position(game.fen());
            
            if (move.captured) {
                captureSound.play();
            } else {
                moveSound.play();
            }
            
            // Sync with opponent
            socket.emit('sync_state', game.fen(), game.turn());
            updateStatus();
            updateTimerActivity();
            
            // Check for game over after move
            checkGameOver();
            
            // Clear selection after successful move
            clearSelection();
        }
        // If illegal move, the piece stays selected (no action needed)
    }
}

function addSelectionHighlight(square) {
    clearSelectionHighlight();
    
    const squareElement = document.querySelector(`[data-square="${square}"]`);
    if (squareElement) {
        squareElement.classList.add('selected-piece');
    }
}

function clearSelectionHighlight() {
    const squares = document.querySelectorAll('.square-55d63');
    squares.forEach(square => {
        square.classList.remove('selected-piece');
    });
}

function clearSelection() {
    clearSelectionHighlight();
    selectedPiece = null;
    selectedSquare = null;
}

// ==========================
// CHESSBOARD INITIALIZATION
// ==========================
function initializeChessboard() {
    try {
        if (board) {
            board.destroy();
        }
        
        const config = {
            draggable: currentControlMethod === 'dragdrop',
            position: 'start',
            pieceTheme: '/lib/chessboardjs/img/chesspieces/wikipedia/{piece}.png',
            orientation: 'white',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            sparePieces: false,
            showNotation: true
        };
        
        board = Chessboard('myBoard', config);
        updateStatus();
        
        if (currentControlMethod === 'clickmove') {
            setTimeout(initializeClickToMove, 100);
        }
    } catch (error) {
        console.error('Chessboard initialization failed:', error);
    }
}

// ==========================
// Timer Activity Management
// ==========================
function updateTimerActivity() {
    if (game.game_over()) {
        if (playerTimerInst) playerTimerInst.stop();
        if (opponentTimerInst) opponentTimerInst.stop();
        return;
    }
    
    document.getElementById('playerTimerContainer').classList.remove('timer-active');
    document.getElementById('opponentTimerContainer').classList.remove('timer-active');
    
    if (game.turn() === c_player) {
        document.getElementById('playerTimerContainer').classList.add('timer-active');
        if (playerTimerInst) playerTimerInst.resume();
        if (opponentTimerInst) opponentTimerInst.pause();
    } else {
        document.getElementById('opponentTimerContainer').classList.add('timer-active');
        if (opponentTimerInst) opponentTimerInst.resume();
        if (playerTimerInst) playerTimerInst.pause();
    }
}

// ==========================
// Enhanced Waiting Screen Functions
// ==========================
function showWaitingScreen(timer) {
    $('#main-ele').hide();
    $('#waitingScreen').show();

    
    $('.timer-container').hide();
    $('#gameStatus').hide();
    
    socket.emit('get_player_count');
    searchStartTime = Date.now();
    updateSearchTime();
}

function hideWaitingScreen() {
    $('#waitingScreen').hide();
    $('#main-ele').show();
    
    
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
// Timer Buttons
// ==========================
function handleButtonClick(event) {
    const timer = event.target.dataset.time;
    socket.emit('want_to_play', timer);
    showWaitingScreen(timer);
}

// ==========================
// Socket.IO connection
// ==========================
const socket = io(
  window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : window.location.origin
);

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
    socket.emit('get_player_count');
});

socket.on("disconnect", () => console.log("🔴 Socket disconnected"));

socket.on("total_players_count_change", (count) => {
    $('#total_players').text(count);
    $('#onlinePlayers').text(count);
});

document.getElementById("cancelWait").addEventListener("click", () => {
    hideWaitingScreen();
    socket.emit("cancel_matchmaking");
});

// ==========================
// Professional Game Over Modal
// ==========================
function showGameOverPopup(data) {
    if (document.getElementById("professionalGameOverModal")) {
        return;
    }
    
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
    
    let isWin = false;
    if (data.winner && c_player) {
        const currentPlayerColor = c_player === 'w' ? 'White' : 'Black';
        isWin = data.winner === currentPlayerColor;
    }
    
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
        </style>
    `;
    
    document.body.appendChild(modal);

    document.getElementById("rematchBtn").onclick = () => {
        modal.remove();
        window.location.reload();
    };

    document.getElementById("closeBtn").onclick = () => {
        modal.remove();
        window.location.href = '/';
    };
    
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

socket.on("match_made", (color, timer) => {
    c_player = color;
    hideWaitingScreen();
    $('.control-toggle-container').hide();
    
    $('.timer-container').show();
    $('#gameStatus').show();
    
    $('#playerTimer').text(`${timer}:00`);
    $('#opponentTimer').text(`${timer}:00`);
    
    // Set proper board orientation based on player color
    const orientation = color === 'w' ? 'white' : 'black';
    if (board) {
        board.orientation(orientation);
    }
    
    $('#btn-parent').html(`<div>Playing as ${color === 'w' ? 'WHITE' : 'BLACK'}</div>`);

    // Reset game and board
    game.reset();
    if (board) {
        board.position('start');
    }
    currentMatchTime = timer;

    // Initialize timers
    const totalSeconds = timer * 60;
    playerTimerInst = startPlayerTimer(totalSeconds, () => {});
    opponentTimerInst = startOpponentTimer(totalSeconds);
    
    updateTimerActivity();
    updateStatus();
    clearSelection();
});

socket.on('sync_state_from_server', (fen, turn) => {
    game.load(fen);
    game.setTurn(turn);
    if (board) {
        board.position(fen);
    }
    updateStatus();
    updateTimerActivity();
    clearSelection();
    
    checkGameOver();
});

socket.on("game_over_from_server", (data) => {
    if (playerTimerInst) playerTimerInst.stop();
    if (opponentTimerInst) opponentTimerInst.stop();
    
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

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) {
        status = `Game over, ${moveColor} is in checkmate.`;
    } else if (game.in_draw()) {
        status = 'Game over, drawn position';
    } else {
        status = `${moveColor} to move${game.in_check() ? ', in check' : ''}`;
    }

    $status.html(status);
    $fen.html(game.fen());
    $pgn.html(game.pgn());
    
    $('#gameStatus').text(status);
}

// ==========================
// Initialization
// ==========================

document.addEventListener("DOMContentLoaded", function () {
    // Initialize button event listeners
    const buttons = document.getElementsByClassName("timer-button");
    for (let button of buttons) {
        button.addEventListener('click', handleButtonClick);
    }
    
    // Initialize control method system
    initializeControlMethod();
    
    // Initialize chessboard
    initializeChessboard();
    
    // Add resize listener for performance
    window.addEventListener('resize', handleResize);
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    cleanupEventListeners();
    if (playerTimerInst) playerTimerInst.stop();
    if (opponentTimerInst) opponentTimerInst.stop();
    if (socket) socket.disconnect();
});