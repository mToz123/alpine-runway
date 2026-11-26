// input.js: keyboard, mouse and touch, merged into one { roll, pitch,
// throttle } frame. Arrow keys / WASD steer; Shift / Ctrl (or + / -)
// work the throttle; the mouse steers by position and the wheel works
// the throttle. On a touch device a finger drag steers exactly like the
// mouse (same mouseX / mouseY path), and the on-screen THR buttons hold
// the throttle like Shift / Ctrl. Nothing here touches the world —
// main.js applies the result.

// A touch device is one that reports touch input. The page adds a
// `touch` class to <html> from this flag, so the touch buttons and the
// rotate hint only ever exist on touch devices — a desktop browser
// never sees them.
FG.isTouch = (typeof window !== 'undefined')
  && (('ontouchstart' in window)
    || (window.navigator && window.navigator.maxTouchPoints > 0));

FG.input = {
  keys: {},
  mouseX: 0.5,
  mouseY: 0.5,
  mouseActive: false,
  wheelDelta: 0,
  // Touch state. The steering finger is tracked by its identifier so a
  // second finger (for example on a THR button) never hijacks the steer.
  steerTouchId: null,
  // -1 / 0 / +1 while a THR button is held — the same magnitude the
  // keyboard Shift / Ctrl keys feed in, so the throttle rate matches.
  touchThrottle: 0,
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
  // A long press on the canvas must never open the mobile context menu.
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  // Touch steering: a finger drag on the canvas sets the same steer
  // position the mouse uses, so dragging steers exactly like moving the
  // mouse — no fork of the flight model, no second steer path. The
  // preventDefault (passive: false) stops the page scrolling or zooming
  // under the finger, and also suppresses the synthesized mouse events,
  // so a tap is handled exactly once, here, not twice.
  const steerFromTouch = (t) => {
    const rect = canvas.getBoundingClientRect();
    FG.input.mouseX = (t.clientX - rect.left) / rect.width;
    FG.input.mouseY = (t.clientY - rect.top) / rect.height;
    FG.input.mouseActive = true;
  };
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    // A tap on the title screen picks a mission, exactly like a click;
    // the same finger then keeps steering once the flight starts.
    if (FG.state.status === 'title') FG.pickMission(t.clientX, t.clientY);
    if (FG.input.steerTouchId === null) {
      FG.input.steerTouchId = t.identifier;
      steerFromTouch(t);
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (FG.input.steerTouchId === null) return;
    const touches = e.changedTouches || [];
    for (let i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === FG.input.steerTouchId) {
        steerFromTouch(touches[i]);
        return;
      }
    }
  }, { passive: false });
  const endSteerTouch = (e) => {
    if (FG.input.steerTouchId === null) return;
    const touches = e.changedTouches || [];
    for (let i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === FG.input.steerTouchId) {
        FG.input.steerTouchId = null;
        if (!e.touches || e.touches.length === 0) FG.input.mouseActive = false;
        return;
      }
    }
  };
  canvas.addEventListener('touchend', endSteerTouch, { passive: false });
  canvas.addEventListener('touchcancel', endSteerTouch, { passive: false });
};

// The on-screen touch buttons (THR+, THR-, pause, restart, cockpit).
// They only exist in the page on touch devices — input.js's FG.isTouch
// gate plus the CSS `.touch` class keep them out of desktop entirely.
// Pointer events cover touch and mouse alike, so the same buttons work
// under touch emulation in a desktop browser too.
FG.inputAttachTouchButtons = function inputAttachTouchButtons() {
  const bind = (id, down, up) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      down();
    });
    if (up) {
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
        el.addEventListener(ev, () => { up(); });
      });
    }
    // A long press must never open the mobile context menu.
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  };
  bind('btn-thr-up', () => { FG.input.touchThrottle = 1; },
    () => { FG.input.touchThrottle = 0; });
  bind('btn-thr-down', () => { FG.input.touchThrottle = -1; },
    () => { FG.input.touchThrottle = 0; });
  bind('btn-pause', () => { FG.paused = !FG.paused; });
  bind('btn-restart', () => { FG.resetFlight(); });
  bind('btn-cockpit', () => { FG.cockpit = !FG.cockpit; });
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
  // A held THR button feeds the same ±1 as Shift / Ctrl, so the
  // throttle moves at the keyboard's rate.
  throttle += FG.input.touchThrottle || 0;
  if (FG.input.wheelDelta !== 0) {
    throttle += FG.clamp(FG.input.wheelDelta, -1, 1) * 0.5;
    FG.input.wheelDelta = 0;
  }
  return { roll, pitch, throttle };
};
