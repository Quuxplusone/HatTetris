
function hide(id)       { document.getElementById(id).style.visibility = 'hidden'; }
function show(id)       { document.getElementById(id).style.visibility = null;     }
function html(id, html) { document.getElementById(id).innerHTML = html;            }

function random(min, max)      { return (min + (Math.random() * (max - min)));            }
function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }

let KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
let DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 };
let canvas  = null;
let ctx     = null;
let ucanvas = null;
let uctx    = null;
let speed   = { start: 0.6, decrement: 0.005, min: 0.1 }; // how long before piece drops by 1 row (seconds)
let nx      = 10; // width of tetris court (in blocks)
let ny      = 20; // height of tetris court (in blocks)
let nu      = 5;  // width/height of upcoming preview (in blocks)

//-------------------------------------------------------------------------
// game variables (initialized during reset)
//-------------------------------------------------------------------------

var dx, dy,        // pixel size of a single tetris block
    blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
    actions,       // queue of user actions (inputs)
    playing,       // true|false - game is in progress
    dt,            // time since starting this game
    current,       // the current piece
    next,          // the next piece
    score,         // the current score
    vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
    rows,          // number of completed rows in the current game
    step;          // how long before current piece drops by 1 row

//-------------------------------------------------------------------------
// tetris pieces
//
// blocks: each element represents a rotation of the piece (0, 90, 180, 270)
//         each element is a 16 bit integer where the 16 bits represent
//         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
//
//             0100 = 0x4 << 3 = 0x4000
//             0100 = 0x4 << 2 = 0x0400
//             1100 = 0xC << 1 = 0x00C0
//             0000 = 0x0 << 0 = 0x0000
//                               ------
//                               0x44C0
//
//-------------------------------------------------------------------------

var i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
var j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
var l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
var o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
var s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
var t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
var z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };

//------------------------------------------------
// do the bit manipulation and iterate through each
// occupied block (x,y) for a given piece
//------------------------------------------------
function eachblock(type, x, y, dir, fn) {
  var result, row = 0, col = 0, blocks = type.blocks[dir];
  for (let bit = 0x8000 ; bit > 0 ; bit = bit >> 1) {
    if (blocks & bit) {
      fn(x + col, y + row);
    }
    if (++col === 4) {
      col = 0;
      ++row;
    }
  }
}

//-----------------------------------------------------
// check if a piece can fit into a position in the grid
//-----------------------------------------------------
function occupied(type, x, y, dir) {
  var result = false;
  eachblock(type, x, y, dir, function(x, y) {
    if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y))
      result = true;
  });
  return result;
}

function unoccupied(type, x, y, dir) {
  return !occupied(type, x, y, dir);
}

//-----------------------------------------
// start with 4 instances of each piece and
// pick randomly until the 'bag is empty'
//-----------------------------------------
var pieces = [];
function randomPiece() {
  if (pieces.length == 0) {
    pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
  }
  var type = pieces.splice(random(0, pieces.length-1), 1)[0];
  return { type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
}


//-------------------------------------------------------------------------
// GAME LOOP
//-------------------------------------------------------------------------

function addEvents() {
  document.addEventListener('keydown', keydown, false);
  window.addEventListener('resize', resize, false);
}

function resize(event) {
  canvas.width   = canvas.clientWidth;  // set canvas logical size equal to its physical size
  canvas.height  = canvas.clientHeight; // (ditto)
  ucanvas.width  = ucanvas.clientWidth;
  ucanvas.height = ucanvas.clientHeight;
  dx = canvas.width  / nx; // pixel size of a single tetris block
  dy = canvas.height / ny; // (ditto)
  invalidate();
  invalidateNext();
}

function keydown(ev) {
  var handled = false;
  if (playing) {
    switch(ev.keyCode) {
      case KEY.LEFT:   actions.push('left');   handled = true; break;
      case KEY.RIGHT:  actions.push('right');  handled = true; break;
      case KEY.UP:     actions.push('rotate'); handled = true; break;
      case KEY.DOWN:   actions.push('drop');   handled = true; break;
      case KEY.ESC:    lose();                 handled = true; break;
    }
  } else if (ev.keyCode == KEY.SPACE) {
    play();
    handled = true;
  }
  if (handled) {
    ev.preventDefault();
  }
}

//-------------------------------------------------------------------------
// GAME LOGIC
//-------------------------------------------------------------------------

function play() { hide('start'); reset();          playing = true;  }
function lose() { show('start'); setVisualScore(); playing = false; }

function setVisualScore(n)      { vscore = n || score; invalidateScore(); }
function setScore(n)            { score = n; setVisualScore(n);  }
function addScore(n)            { score = score + n;   }
function clearScore()           { setScore(0); }
function clearRows()            { setRows(0); }
function setRows(n)             { rows = n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); invalidateRows(); }
function addRows(n)             { setRows(rows + n); }
function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); }
function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidate(); }
function clearBlocks()          { blocks = []; invalidate(); }
function clearActions()         { actions = []; }
function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate();     }
function setNextPiece(piece)    { next    = piece || randomPiece(); invalidateNext(); }

function reset() {
  dt = 0;
  clearActions();
  clearBlocks();
  clearRows();
  clearScore();
  setCurrentPiece(next);
  setNextPiece();
}

function update(idt) {
  if (playing) {
    if (vscore < score) {
      setVisualScore(vscore + 1);
    }
    handle(actions.shift());
    dt = dt + idt;
    if (dt > step) {
      dt = dt - step;
      drop();
    }
  }
}

function handle(action) {
  if (action == 'left') {
    move(-1, 0);
  } else if (action == 'right') {
    move(+1, 0);
  } else if (action == 'drop') {
    drop();
  } else if (action == 'rotate') {
    rotate();
  }
}

function move(dx, dy) {
  let x = current.x + dx;
  let y = current.y + dy;
  if (unoccupied(current.type, x, y, current.dir)) {
    current.x = x;
    current.y = y;
    invalidate();
    return true;
  } else {
    return false;
  }
}

function rotate() {
  let newdir = (current.dir == DIR.MAX ? DIR.MIN : current.dir + 1);
  if (unoccupied(current.type, current.x, current.y, newdir)) {
    current.dir = newdir;
    invalidate();
  }
}

function drop() {
  if (!move(0, +1)) {
    addScore(10);
    dropPiece();
    removeLines();
    setCurrentPiece(next);
    setNextPiece(randomPiece());
    clearActions();
    if (occupied(current.type, current.x, current.y, current.dir)) {
      lose();
    }
  }
}

function dropPiece() {
  eachblock(current.type, current.x, current.y, current.dir, function(x, y) {
    setBlock(x, y, current.type);
  });
}

function removeLines() {
  let n = 0;
  for (let y = ny ; y > 0 ; --y) {
    let complete = true;
    for (let x = 0 ; x < nx ; ++x) {
      if (!getBlock(x, y))
        complete = false;
    }
    if (complete) {
      removeLine(y);
      y = y + 1; // recheck same line
      n++;
    }
  }
  if (n > 0) {
    addRows(n);
    addScore(100*Math.pow(2,n-1)); // 1: 100, 2: 200, 3: 400, 4: 800
  }
}

function removeLine(n) {
  for (let y = n ; y >= 0 ; --y) {
    for (let x = 0 ; x < nx ; ++x)
      setBlock(x, y, (y == 0) ? null : getBlock(x, y-1));
  }
}

//-------------------------------------------------------------------------
// RENDERING
//-------------------------------------------------------------------------

var invalid = {};

function invalidate()         { invalid.court  = true; }
function invalidateNext()     { invalid.next   = true; }
function invalidateScore()    { invalid.score  = true; }
function invalidateRows()     { invalid.rows   = true; }

function draw() {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.translate(0.5, 0.5); // for crisp 1px black lines
  drawCourt();
  drawNext();
  drawScore();
  drawRows();
  ctx.restore();
}

function drawCourt() {
  if (invalid.court) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (playing)
      drawPiece(ctx, current.type, current.x, current.y, current.dir);
    for (let y = 0 ; y < ny ; y++) {
      for (let x = 0 ; x < nx ; x++) {
        let block = getBlock(x,y);
        if (block) {
          drawBlock(ctx, x, y, block.color);
        }
      }
    }
    ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
    invalid.court = false;
  }
}

function drawNext() {
  if (invalid.next) {
    let padding = (nu - next.type.size) / 2; // half-arsed attempt at centering next piece display
    uctx.save();
    uctx.translate(0.5, 0.5);
    uctx.clearRect(0, 0, nu*dx, nu*dy);
    drawPiece(uctx, next.type, padding, padding, next.dir);
    uctx.strokeStyle = 'black';
    uctx.strokeRect(0, 0, nu*dx - 1, nu*dy - 1);
    uctx.restore();
    invalid.next = false;
  }
}

function drawScore() {
  if (invalid.score) {
    html('score', ("00000" + Math.floor(vscore)).slice(-5));
    invalid.score = false;
  }
}

function drawRows() {
  if (invalid.rows) {
    html('rows', rows);
    invalid.rows = false;
  }
}

function drawPiece(ctx, type, x, y, dir) {
  eachblock(type, x, y, dir, function(x, y) {
    drawBlock(ctx, x, y, type.color);
  });
}

function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x*dx, y*dy, dx, dy);
  ctx.strokeRect(x*dx, y*dy, dx, dy)
}
