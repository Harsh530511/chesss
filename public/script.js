var board1 = Chessboard('myBoard', 'start')
var board = null
var game = new Chess()
var $status = $('#status')
var $fen = $('#fen')
var $pgn = $('#pgn')
let c_player = null;
let timerinst = null;
let currentmatchtime = null;
const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const gameOverSound = document.getElementById('gameOverSound');

function startTimer(seconds, container, oncomplete) {
  let startTime, timer, obj, ms = seconds * 1000,
    display = document.getElementById(container);
  obj = {};
  obj.resume = function () {
    startTime = new Date().getTime();
    timer = setInterval(obj.step, 250); // adjust this number to affect granularity
    // lower numbers are more accurate, but more CPU-expensive
  };
  obj.pause = function () {
    ms = obj.step();
    clearInterval(timer);
  };
  obj.step = function () {
    let now = Math.max(0, ms - (new Date().getTime() - startTime)),
      m = Math.floor(now / 60000), s = Math.floor(now / 1000) % 60;
    s = (s < 10 ? "0" : "") + s;
    display.innerHTML = m + ":" + s;
    if (now == 0) {
      const winner = game.turn() === 'b' ? 'White' : 'Black';
      alert(winner + " Won The Match");
      window.location.reload();
      socket.emit("game_over", winner);

      clearInterval(timer);
      obj.resume = function () { };
      if (oncomplete) oncomplete();
    }
    return now;
  };
  obj.resume();
  return obj;
}

function onDragStart(source, piece, position, orientation) {
  if (game.turn() != c_player) {
    return false;
  }
  // do not pick up pieces if the game is over
  if (game.game_over()) return false

  // only pick up pieces for the side to move
  if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
    (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
    return false
  }
}

function onDrop(source, target) {
  // see if the move is legal
  var move = game.move({
    from: source,
    to: target,
    promotion: 'q' // NOTE: always promote to a queen for example simplicity
  })

  // illegal move
  if (move === null) return 'snapback'
  if (move.captured) {
  captureSound.play();
} else {
  moveSound.play();
}

  console.log(game.fen());
  socket.emit('sync_state', game.fen(), game.turn());
  if (timerinst) {

    timerinst.pause();

  } else {
    timerinst = startTimer(Number(currentmatchtime) * 60, "timerDis", function () {
      socket.on("game_over_from_server", function (winner) {
        gameOverSound.play();
        alert(winner + " Won The Match");
        window.location.reload();
      });
    });

  }
  updateStatus()
}
function onChange() {
  if (game.game_over()) {
    

    if (game.in_checkmate()) {
      const winner = game.turn() === 'b' ? 'White' : 'Black';
      socket.emit("game_over", winner);
    }
  }
}
// update the board position after the piece snap
// for castling, en passant, pawn promotion
function onSnapEnd() {
  board.position(game.fen())
}

function updateStatus() {
  var status = ''

  var moveColor = 'White'
  if (game.turn() === 'b') {
    moveColor = 'Black'
  }

  // checkmate?
  if (game.in_checkmate()) {
    status = 'Game over, ' + moveColor + ' is in checkmate.'
  }

  // draw?
  else if (game.in_draw()) {
    status = 'Game over, drawn position'
  }

  // game still on
  else {
    status = moveColor + ' to move'

    // check?
    if (game.in_check()) {
      status += ', ' + moveColor + ' is in check'
    }
  }

  $status.html(status)
  $fen.html(game.fen())
  $pgn.html(game.pgn())
}

var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onChange: onChange,
  onSnapEnd: onSnapEnd
}
board = Chessboard('myBoard', config)

updateStatus()
function handlebuttonclick(event) {
  const timer = event.target.getAttribute('data-time');
  socket.emit('want_to_play', timer);
  $('#main-ele').hide();
  $('#waiting_para').show();
}
document.addEventListener("DOMContentLoaded", function () {
  const buttons = document.getElementsByClassName("timer-button");
  for (let index = 0; index < buttons.length; index++) {
    const button = buttons[index];
    button.addEventListener('click', handlebuttonclick)

  }

});
const socket = io();


socket.on("total_players_count_change", function (totalplayersCount) {
  $('#total_players').html("Total Players : " + totalplayersCount);
});
socket.on("match_made", (color, timer) => {
  c_player = color;

  $('#main-ele').show();
  $('#waiting_para').hide();
  const currentplayer = color === 'b' ? "BLACK" : "WHITE";
  $('#btn-parent').html("<p id='youare'>" + currentplayer +
    "</p><p id='timerDis'> </p>"

  )

  game.reset();
  board.clear();
  board.start();
  board.orientation(currentplayer.toLowerCase());
  currentmatchtime = timer;
  if (game.turn() === c_player) {
    timerinst = startTimer(Number(timer) * 60, "timerDis", function () {
      socket.on("game_over_from_server", function (winner) {
        gameOverSound.play();
        alert(winner + " Won The Match");
        window.location.reload();
      });
    });
  }
  else {
    timerinst = null;
    $("#timerDis").html(timer + ":00");

  }




});
socket.on('sync_state_from_server', function (fen, turn) {
  game.load(fen);
  game.setTurn(turn);
  board.position(fen);
  if (timerinst) {

    timerinst.resume();

  } else {
    timerinst = startTimer(Number(currentmatchtime) * 60, "timerDis", function () {
      socket.on("game_over_from_server", function (winner) {
        gameOverSound.play();
        alert(winner + " Won The Match");
        window.location.reload();
      });
    });

  }
});
socket.on("game_over_from_server", function (winner) {
  gameOverSound.play();
  alert(winner + " Won The Match");
  timerinst.pause();
  window.location.reload();

  

});


