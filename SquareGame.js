
function hide(id)       { document.getElementById(id).style.visibility = 'hidden'; }
function show(id)       { document.getElementById(id).style.visibility = null;     }
function html(id, html) { document.getElementById(id).innerHTML = html;            }

function random(min, max)      { return (min + (Math.random() * (max - min)));            }
function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }

let KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
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

let dx = 0;  // pixel width of a single block
let dy = 0;  // pixel height of a single block

let removalAnimationIsHappening = 0;
let removalAnimationLines = [];

let blocks = [];  // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
let actions = [];  // queue of user actions (inputs)
let playing = false;  // game is in progress
let dt = 0;  // countdown to next step downward of the current piece
let current = null;  // current piece
let next = null;  // next piece
let score = 0;  // current score (in reality)
let vscore = 0;  // currently displayed score (it catches up in small chunks)
let rows = 0;  // number of rows completed so far in this game
let step = 0;  // how long before current piece drops by 1 row

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

//------------------------------------------------
// do the bit manipulation and iterate through each
// occupied block (x,y) for a given piece
//------------------------------------------------
function eachblock(blocks, x, y, fn) {
  let row = 0;
  let col = 0;
  for (let bit = 0x8000; bit > 0; bit = bit >> 1) {
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
  let result = false;
  eachblock(type.blocks[dir], x, y, function(x, y) {
    if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y)) {
      result = true;
    }
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
    let i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
    let j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
    let l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
    let o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
    let s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
    let t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
    let z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };

    pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
  }

  let type = pieces.splice(random(0, pieces.length-1), 1)[0];
  return { type: type, dir: 0, x: Math.round(random(0, nx - type.size)), y: 0 };
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
  invalidateCourt();
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

function play() { hide('start'); reset();        playing = true;  }
function lose() { show('start'); vscore = score; playing = false; }

function addRows(n)             { rows += n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); }
function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); }
function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidateCourt(); }

function reset() {
  dt = 0;
  actions = [];
  blocks = [];
  rows = 0;
  step = speed.start;
  score = 0;
  vscore = 0;
  current = next;
  next = randomPiece();
  invalidateCourt();
  invalidateNext();
}

function update(idt) {
  if (removalAnimationIsHappening) {
    removalAnimationIsHappening += 1;
    invalid.court = true;
    drawCourt();
    if (removalAnimationIsHappening == 20) {
      reallyDestroyLines(removalAnimationLines);
      removalAnimationIsHappening = 0;
    }
  }

  if (playing) {
    if (vscore < score) {
      vscore += 1;
    }
    if (!removalAnimationIsHappening) {
      if (actions.length) {
        handle(actions.shift());
      }
      dt = dt + idt;
      if (dt > step) {
        dt = dt - step;
        drop();
      }
    }
  }
}

function handle(action) {
  let x = current.x;
  let y = current.y;
  if (action == 'left') {
    move('left');
  } else if (action == 'right') {
    move('right');
  } else if (action == 'drop') {
    drop();
  } else if (action == 'rotate') {
    rotate();
  }
}

function move(dir) {
  let x = current.x;
  let y = current.y;
  if (dir == 'right') {
    x += 1;
  } else if (dir == 'left') {
    x -= 1;
  } else if (dir == 'down') {
    y += 1;
  }
  if (unoccupied(current.type, x, y, current.dir)) {
    current.x = x;
    current.y = y;
    invalidateCourt();
    return true;
  } else {
    return false;
  }
}

function rotate() {
  let newdir = (current.dir + 1) % 4;
  if (unoccupied(current.type, current.x, current.y, newdir)) {
    current.dir = newdir;
    invalidateCourt();
  }
}

function drop() {
  if (!move('down')) {
    // The piece has landed.
    score += 10;
    eachblock(current.type.blocks[current.dir], current.x, current.y, function(x, y) {
      setBlock(x, y, current.type);
    });
    removeLines();
    current = next;
    next = randomPiece();
    invalidateCourt();
    invalidateNext();
    actions = [];
    if (occupied(current.type, current.x, current.y, current.dir)) {
      lose();
    }
  }
}

function removeLines() {
  let completedLines = [];
  for (let y = 0; y < ny; ++y) {
    let complete = true;
    for (let x = 0; x < nx; ++x) {
      if (!getBlock(x, y)) {
        complete = false;
      }
    }
    if (complete) {
      completedLines.push(y);
    }
  }

  if (completedLines.length) {
    // Flash the removed rows.
    removalAnimationIsHappening = 1;
    removalAnimationLines = completedLines;
  }
}

function reallyDestroyLines(linesToRemove) {
  let removalsMade = 0;
  while (linesToRemove.length) {
    let yy = linesToRemove.shift();
    // Slide everything down by 1.
    for (let y = yy; y >= 1; --y) {
      for (let x = 0; x < nx; ++x) {
        setBlock(x, y, getBlock(x, y-1));
      }
    }
    removalsMade += 1;
  }
  if (removalsMade >= 1) {
    console.assert(removalsMade <= 4); // with an "i" block
    addRows(removalsMade);
    let points = [0, 100, 400, 900, 1600];
    score += points[removalsMade];
  }
}

//-------------------------------------------------------------------------
// RENDERING
//-------------------------------------------------------------------------

var invalid = {};

function invalidateCourt() { invalid.court = true; }
function invalidateNext() { invalid.next = true; }

function draw() {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.translate(0.5, 0.5); // for crisp 1px black lines
  drawCourt();
  drawNext();
  html('score', ("00000" + Math.floor(vscore)).slice(-5));
  html('rows', rows);
  ctx.restore();
}

function drawCourt() {
  if (invalid.court) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (playing) {
      drawCurrentPiece(ctx);
    }
    for (let y = 0; y <= ny; ++y) {
      for (let x = 0; x < nx; ++x) {
        let block = getBlock(x,y);
        if (block) {
          let color = block.color;
          if (removalAnimationIsHappening && removalAnimationLines.includes(y)) {
            color = (removalAnimationIsHappening % 2) ? 'black' : 'white';
          }
          drawBlock(ctx, x, y, color);
        }
      }
    }
    ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
  }
  invalid.court = false;
}

function drawNext() {
  if (invalid.next) {
    uctx.clearRect(0, 0, uctx.canvas.width, uctx.canvas.height);
    eachblock(next.type.blocks[0], 0, 0, function(x, y) {
      drawBlock(uctx, x, y, next.type.color);
    });
  }
  invalid.next = false;
}

function drawCurrentPiece(ctx) {
  let p = current;
  eachblock(p.type.blocks[p.dir], p.x, p.y, function(x, y) {
    drawBlock(ctx, x, y, p.type.color);
  });
}

function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x*dx, y*dy, dx, dy);
  ctx.strokeRect(x*dx, y*dy, dx, dy)
}

window.onload = function () {
  addEvents();

  canvas  = document.getElementById('canvas');
  ctx     = canvas.getContext('2d');
  ucanvas = document.getElementById('upcoming');
  uctx    = ucanvas.getContext('2d');

  let last = new Date().getTime();
  function frame() {
    let now = new Date().getTime();
    update(Math.min(1, (now - last) / 1000.0));
    draw();
    last = now;
    window.requestAnimationFrame(frame);
  }

  resize(); // setup all our sizing information
  reset();  // reset the per-game variables
  frame();  // start the first frame
};
