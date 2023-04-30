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
    requestAnimationFrame(frame, canvas);
  }

  resize(); // setup all our sizing information
  reset();  // reset the per-game variables
  frame();  // start the first frame
};
