
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
let ny      = 40; // height of tetris court (in blocks)
let nu      = 5;  // width/height of upcoming preview (in blocks)

//-------------------------------------------------------------------------
// game variables (initialized during reset)
//-------------------------------------------------------------------------

let dx = 0;  // pixel width of a single trig
let dy = 0;  // pixel height of a single trig

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
let yCourtOffset = false;  // is there a completed row half-hidden at the bottom of the court

//-------------------------------------------------------------------------
// tetris pieces
//
// blocks: each element represents one of the six rotations of the piece (0, 2, 4, 6, 8, 10 o'clock)
//         as a 15-bit integer where the 15 bits represent the 15 kites that could
//         possibly be part of this hat. The three kites in a triangular cell are numbered
//         0,1,2 vertically downward; triangles are numbered in (x,y) order.
// For example, the default 0-o'clock shirt (centered on a right-facing triangle)
// hits these kites: 2, 8,9,10, 11,12, 7,14.
// When you shift the piece left or right, it is briefly 0.5 steps out of phase,
// and therefore will step down only 0.5 steps the next time it moves down.
//
//
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
  for (let row = 0; row < 5; ++row) {
    for (let col = 0; col < 5; ++col) {
      if (blocks[5*row + col] !== '.') {
        fn(x + col, y + row);
      }
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
    let i = { size: 4, color: 'cyan', blocks: [
        '...X....X....X....X....X.',
        '...X...XX..XX............',
        '.......X....XX....XX.....',
        '...X....X....X....X....X.',
        '........XX..XX...X.......',
        '.XX....XX....X...........',
    ]};
    let j = { size: 4, color: 'blue', blocks: [
        '..X....X....X...XX.......',
        '............XXX..XX......',
        '......X....X....XX....X..',
        '.......XX...X....X....X..',
        '......XX..XXX............',
        '......X....XX....X....X..',
    ]};
    let l = { size: 4, color: 'orange', blocks: [
        '...X....X....X....XX.....',
        '...X...XX...X....X.......',
        '............XX...XXX.....',
        '.......XX....X....X....X.',
        '.........X....X...XX...X.',
        '.................XXX...XX',
    ]};
    let o = { size: 2, color: 'yellow', blocks: [
        '.......X....XX...X.......',
        '.......X...XX....X.......',
        '.......X....XX...X.......',
        '.......X...XX....X.......',
        '.......X....XX...X.......',
        '.......X...XX....X.......',
    ]};
    let s = { size: 4, color: 'green', blocks: [
        '.....XX...XX....X........',
        '.X....X....XX...X........',
        '......XX..XX....X........',
        'X....XX...XX.............',
        '......X...XX....X....X...',
        '......X....XX..XX........',
    ]};
    let t = { size: 4, color: 'purple', blocks: [
        '.....XX...XX....XX.......',
        '.X....X....XX...X....X...',
        '......XX..XX...XX........',
        '.XX....XX...XX...........',
        '.X....X...XX....X....X...',
        '......XX...XX..XX........',
    ]};
    let z = { size: 4, color: 'red', blocks: [
        '......X...XX....XX.......',
        '......X....XX...X....X...',
        '......X...XX...XX........',
        '.....XX....XX...X........',
        '.X....X...XX....X........',
        '......XX...XX...X........',
    ]};

    pieces = [i,i,i,j,j,j,l,l,l,o,o,o,s,s,s,z,z,z];
  }
  let type = pieces.splice(random(0, pieces.length-1), 1)[0];
  let x = 2;
  if (x % 2 == 1) {
    x += 1;
  }
  return { type: type, dir: 0, x: x, y: yCourtOffset ? 1 : 0, halfstep: yCourtOffset };
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
  for (let x = 0; x < nx; ++x) {
    setBlock(x, ny, {color: 'gray'});
  }
  yCourtOffset = false;
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
    if (current.halfstep) {
      if (unoccupied(current.type, x-1, y, current.dir)) {
        current.x -= 1;
        current.halfstep = false;
        invalidateCourt();
      }
    } else {
      if (occupied(current.type, x-1, y+1, current.dir)) {
        // can't move left at all
      } else if (unoccupied(current.type, x-1, y-1, current.dir)) {
        // plenty of room; go left and halfstep
        current.x -= 1;
        current.halfstep = true;
        invalidateCourt();
      } else {
        // go left and down
        current.x -= 1;
        current.y += 1;
        invalidateCourt();
      }
    }
  } else if (action == 'right') {
    if (current.halfstep) {
      if (unoccupied(current.type, x+1, y, current.dir)) {
        current.x += 1;
        current.halfstep = false;
        invalidateCourt();
      }
    } else {
      if (occupied(current.type, x+1, y+1, current.dir)) {
        // can't move right at all
      } else if (unoccupied(current.type, x+1, y-1, current.dir)) {
        // plenty of room; go right and halfstep
        current.x += 1;
        current.halfstep = true;
        invalidateCourt();
      } else {
        // go right and down
        current.x += 1;
        current.y += 1;
        invalidateCourt();
      }
    }
  } else if (action == 'drop') {
    invalidateCourt();
    drop();
  } else if (action == 'rotate') {
    invalidateCourt();
    rotate();
  }
}

function rotate() {
  let newdir = (current.dir + 1) % 6;
  if (unoccupied(current.type, current.x, current.y + !current.halfstep, newdir)) {
    current.dir = newdir;
    current.halfstep = !current.halfstep;
    invalidateCourt();
  }
}

function drop() {
  if (unoccupied(current.type, current.x, current.y + 2 - current.halfstep, current.dir)) {
    // The piece moves down.
    current.y += 2 - current.halfstep;
    current.halfstep = false;
    invalidateCourt();
  } else {
    // The piece has landed.
    console.assert(!current.halfstep);
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

  let linesToRemove = [];
  while (completedLines.length) {
    let yy = completedLines.shift();
    if (yy == ny-1 && !yCourtOffset) {
      linesToRemove.push(yy);
    } else if (completedLines[0] == yy+1) {
      linesToRemove.push(yy);
      linesToRemove.push(yy+1);
      completedLines.shift();
    } else {
      // this completed line won't actually be removed
    }
  }

  if (linesToRemove.length) {
    // Flash the removed rows.
    removalAnimationIsHappening = 1;
    removalAnimationLines = linesToRemove;
  }
}

function reallyDestroyLines(linesToRemove) {
  let removalsMade = 0;
  while (linesToRemove.length) {
    let yy = linesToRemove.shift();
    if (yy == ny-1 && !yCourtOffset) {
      // Hide the bottom row!
      // But if we've already hidden it, then you don't
      // get anything until you've completed row ny-2,
      // in which case you'd have fallen into the
      // `else if` below on the previous loop iteration.
      removalsMade += 1;
      yCourtOffset = true;
      for (let x = 0; x < nx; ++x) {
        setBlock(x, ny-1, {color: 'gray'});
      }
    } else if (yy == ny-2 && linesToRemove[0] == ny-1) {
      linesToRemove.shift();
      // Slide everything down by 2.
      for (let y = ny-1; y >= 1; --y) {
        for (let x = 0; x < nx; ++x) {
          setBlock(x, y, getBlock(x, y-2));
        }
      }
      removalsMade += (yCourtOffset ? 1 : 2);
      yCourtOffset = false;
    } else if (linesToRemove[0] == yy+1) {
      linesToRemove.shift();
      // Slide everything down by 2.
      for (let y = yy+1; y >= 1; --y) {
        for (let x = 0; x < nx; ++x) {
          setBlock(x, y, getBlock(x, y-2));
        }
      }
      removalsMade += 2;
    } else {
      // do nothing
    }
  }

  if (removalsMade >= 1) {
    console.assert(removalsMade <= 5); // with an "i" block
    addRows(removalsMade);
    let points = [0, 100, 300, 600, 1000, 1500];
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
          if (y == ny - yCourtOffset) {
            color = 'gray';  // never flash the bottom half-line
          } else if (removalAnimationIsHappening && removalAnimationLines.includes(y)) {
            color = (removalAnimationIsHappening % 2) ? 'black' : 'white';
          }
          drawTrig(ctx, x, y + yCourtOffset, color, yCourtOffset);
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
      drawTrig(uctx, x, y, next.type.color, false);
    });
  }
  invalid.next = false;
}

function drawCurrentPiece(ctx) {
  let p = current;
  eachblock(p.type.blocks[p.dir], p.x, p.y, function(x, y) {
    drawTrig(ctx, x, y - yCourtOffset, p.type.color, p.halfstep != yCourtOffset);
  });
}

function drawTrig(ctx, x, y, color, halfstep) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if ((y + halfstep) % 2 == x % 2) {
    // draw a left-pointing triangle
    ctx.moveTo(x*dx, y*dy);
    ctx.lineTo(x*dx + dx, y*dy + dy);
    ctx.lineTo(x*dx + dx, y*dy - dy);
  } else {
    // draw a right-pointing triangle
    ctx.moveTo(x*dx + dx, y*dy);
    ctx.lineTo(x*dx, y*dy + dy);
    ctx.lineTo(x*dx, y*dy - dy);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
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
