// input.js: keyboard and mouse, merged into one { roll, pitch, throttle }
// frame. Arrow keys / WASD steer; Shift / Ctrl (or + / -) work the throttle;
// the mouse steers by position and the wheel works the throttle. Nothing
// here touches the world — main.js applies the result.

FG.input = {
  keys: {},
  mouseX: 0.5,
  mouseY: 0.5,
  mouseActive: false,
  wheelDelta: 0,
};

FG.inputAttach = function inputAttach(canvas) {
  window.addEventListener('keydown', (e) => {
    FG.input.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    FG.input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    FG.input.keys = {};
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    FG.input.mouseX = (e.clientX - rect.left) / rect.width;
    FG.input.mouseY = (e.clientY - rect.top) / rect.height;
    FG.input.mouseActive = true;
  });
  canvas.addEventListener('mouseleave', () => {
    FG.input.mouseActive = false;
  });
  canvas.addEventListener('wheel', (e) => {
    FG.input.wheelDelta += e.deltaY < 0 ? 1 : -1;
    e.preventDefault();
  }, { passive: false });
};

FG.inputRead = function inputRead() {
  const k = FG.input.keys;
  let roll = 0;
  let pitch = 0;
  if (k.ArrowLeft || k.KeyA) roll -= 1;
  if (k.ArrowRight || k.KeyD) roll += 1;
  if (k.ArrowUp || k.KeyW) pitch += 1;
  if (k.ArrowDown || k.KeyS) pitch -= 1;
  // Mouse steers when no keys are held: position off-centre banks and pitches.
  if (FG.input.mouseActive && roll === 0 && pitch === 0) {
    roll = FG.clamp((FG.input.mouseX - 0.5) * 2.4, -1, 1);
    pitch = FG.clamp((0.5 - FG.input.mouseY) * 2.0, -1, 1);
    if (Math.abs(roll) < 0.06) roll = 0;
    if (Math.abs(pitch) < 0.06) pitch = 0;
  }
  let throttle = 0;
  if (k.ShiftLeft || k.ShiftRight || k.Equal || k.NumpadAdd) throttle += 1;
  if (k.ControlLeft || k.ControlRight || k.Minus || k.NumpadSubtract) throttle -= 1;
  if (FG.input.wheelDelta !== 0) {
    throttle += FG.clamp(FG.input.wheelDelta, -1, 1) * 0.5;
    FG.input.wheelDelta = 0;
  }
  return { roll, pitch, throttle };
};
