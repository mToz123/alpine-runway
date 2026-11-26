// main.js: the loop, the screens and the deterministic screenshot scenes.
// ?shot=title|cover|ring|approach&seed=N stages one scene from the real
// rules and paints it synchronously, then sets window.__shotReady — the
// frame a screenshot takes is the game itself, never a mockup.

FG.canvas = document.getElementById('game');
FG.ctx = FG.canvas.getContext('2d');
FG.state = FG.newState(1);
FG.paused = false;
FG.lastFrame = 0;
FG.accumulator = 0;
FG.STEP = 1 / 60;
FG.shake = 0; // camera shake after a touchdown or crash, decays per frame

FG.resizeCanvas = function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = FG.canvas.clientWidth || window.innerWidth;
  const h = FG.canvas.clientHeight || window.innerHeight;
  FG.canvas.width = Math.round(w * dpr);
  FG.canvas.height = Math.round(h * dpr);
};

// Draw the logical 1280x720 frame scaled to the real canvas.
FG.paint = function paint() {
  const ctx = FG.ctx;
  const scale = Math.min(FG.canvas.width / FG.VIEW_W, FG.canvas.height / FG.VIEW_H);
  const ox = (FG.canvas.width - FG.VIEW_W * scale) / 2;
  const oy = (FG.canvas.height - FG.VIEW_H * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, FG.canvas.width, FG.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  if (FG.shake > 0.01) {
    ctx.translate((Math.random() - 0.5) * FG.shake * 9, (Math.random() - 0.5) * FG.shake * 9);
  }
  try {
    FG.drawFrame(ctx, FG.state);
  } catch (err) {
    FG.drawError(ctx, err);
  }
};

FG.drawError = function drawError(ctx, err) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ff5a5a';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`ERROR: ${err && err.message ? err.message : err}`, 20, 40);
  document.title = `ERROR: ${err && err.message ? err.message : err}`;
};

window.addEventListener('error', (e) => {
  FG.drawError(FG.ctx, e.error || e.message);
});

FG.resetFlight = function resetFlight() {
  FG.state = FG.newState(FG.state.seed);
  FG.state.status = 'flying';
};

FG.frame = function frame(now) {
  requestAnimationFrame(FG.frame);
  if (FG.paused) {
    FG.lastFrame = now;
    return;
  }
  const dt = Math.min(0.1, (now - FG.lastFrame) / 1000 || 0);
  FG.lastFrame = now;
  const s = FG.state;
  if (s.status === 'title') {
    // Attract mode: the autopilot flies the valley behind the title.
    const saved = s.status;
    s.status = 'flying';
    FG.stepWorld(s, dt, FG.autopilot(s));
    if (s.status !== 'flying') {
      FG.state = FG.newState(s.seed);
    } else {
      s.status = saved;
    }
    FG.audioEngine(s);
  } else if (s.status === 'flying') {
    const input = FG.inputRead();
    const ringsBefore = s.ringsPassed;
    FG.stepWorld(s, dt, input);
    if (s.status === 'landed' || s.status === 'crashed') FG.shake = 1;
    if (s.ringsPassed > ringsBefore) FG.audioRing();
    if (s.status === 'crashed') FG.audioCrash();
    if (s.status === 'landed') FG.audioLand();
    FG.audioEngine(s);
  }
  if (FG.shake > 0) FG.shake = Math.max(0, FG.shake - dt * 1.6);
  FG.paint();
};

FG.startGame = function startGame() {
  FG.audioInit();
  if (FG.state.status === 'title') FG.resetFlight();
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') FG.startGame();
  else if (e.code === 'KeyR') FG.resetFlight();
  else if (e.code === 'KeyP') FG.paused = !FG.paused;
  else if (e.code === 'KeyM') FG.audioToggleMute();
});
FG.canvas.addEventListener('mousedown', () => {
  if (FG.state.status === 'title') FG.startGame();
});

// --- Screenshot scenes ----------------------------------------------------
// Run the real rules forward with the autopilot and paint the frame.
// Each scene is deterministic for a seed: same seed, same frame.
FG.stageShot = function stageShot(name, seed) {
  const s = FG.newState(seed);
  s.status = 'flying';
  const step = FG.STEP;
  if (name === 'title') {
    for (let i = 0; i < 5 / step; i += 1) FG.stepWorld(s, step, FG.autopilot(s));
    s.status = 'title';
    s.time = 1.2;
  } else if (name === 'ring') {
    for (let i = 0; i < 240 / step; i += 1) {
      FG.stepWorld(s, step, FG.autopilot(s));
      const target = FG.nextTarget(s);
      if (s.status !== 'flying') break;
      if (target.ring && target.z - s.z < 260) break;
    }
  } else if (name === 'approach') {
    // Final approach: the rings are done, the plane is on the glide path
    // to the runway with the course behind it.
    s.rings.forEach((ring) => { ring.passed = true; });
    s.ringsPassed = FG.RING_COUNT;
    s.score = FG.RING_COUNT * FG.RING_POINTS;
    s.scoreRings = FG.RING_COUNT * FG.RING_POINTS;
    s.fuel = 55;
    s.damage = 0;
    s.time = 85;
    s.z = FG.RUNWAY_Z0 - 500;
    s.x = 40;
    s.alt = 220;
    s.speed = 125;
    s.throttle = 0.35;
    s.heading = -2;
    for (let i = 0; i < 5 / step; i += 1) {
      FG.stepWorld(s, step, FG.autopilot(s));
      if (s.status !== 'flying') break;
    }
  } else {
    // cover: mid-flight, a ring ahead and the valley below.
    for (let i = 0; i < 14 / step; i += 1) {
      FG.stepWorld(s, step, FG.autopilot(s));
      if (s.status !== 'flying') break;
    }
  }
  FG.state = s;
  FG.paint();
  FG.paint();
  window.__shotReady = true;
};

FG.boot = function boot() {
  FG.resizeCanvas();
  window.addEventListener('resize', FG.resizeCanvas);
  FG.inputAttach(FG.canvas);
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1') || 1;
  FG.state = FG.newState(seed);
  if (shot) {
    FG.stageShot(shot, seed);
    return; // static frame for the screenshot; no loop
  }
  FG.lastFrame = performance.now();
  requestAnimationFrame(FG.frame);
};

FG.boot();
