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
FG.selectedMission = 'ring-run'; // the mission the title screen has lit
FG.bestScore = 0; // best score ever, localStorage with an in-memory fallback
try {
  FG.bestScore = Number(window.localStorage.getItem('alpine-runway-best') || '0') || 0;
} catch (err) {
  FG.bestScore = 0;
}

// Best score: remember a new best across visits when storage allows,
// and always in memory for this visit.
FG.saveBest = function saveBest(s) {
  if (s.score > FG.bestScore) {
    FG.bestScore = s.score;
    s.newBest = true;
    try {
      window.localStorage.setItem('alpine-runway-best', String(s.score));
    } catch (err) {
      // No storage (file:// in some browsers): the in-memory best stands.
    }
  }
};

// Touchdown / crash smoke: grey puffs at the wheels that hang in the air.
FG.spawnSmoke = function spawnSmoke(s, n, spread) {
  for (let i = 0; i < n; i += 1) {
    s.smoke.push({
      x: s.x + (Math.random() - 0.5) * spread,
      y: FG.RUNWAY_ELEV_FT + 2,
      z: s.z - 4 - Math.random() * 10,
      life: 1.2,
      maxLife: 1.2,
      size: 5 + Math.random() * 5,
    });
  }
  if (s.smoke.length > 60) s.smoke.splice(0, s.smoke.length - 60);
};

FG.updateSmoke = function updateSmoke(s, dt) {
  for (let i = s.smoke.length - 1; i >= 0; i -= 1) {
    s.smoke[i].life -= dt;
    if (s.smoke[i].life <= 0) s.smoke.splice(i, 1);
  }
};

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
  FG.state = FG.newState(FG.state.seed, FG.state.mission);
  FG.state.status = 'flying';
};

// Pointer position in the logical 1280x720 frame, for the title menu.
FG.toLogical = function toLogical(clientX, clientY) {
  const rect = FG.canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (FG.canvas.width / rect.width);
  const py = (clientY - rect.top) * (FG.canvas.height / rect.height);
  const scale = Math.min(FG.canvas.width / FG.VIEW_W, FG.canvas.height / FG.VIEW_H);
  const ox = (FG.canvas.width - FG.VIEW_W * scale) / 2;
  const oy = (FG.canvas.height - FG.VIEW_H * scale) / 2;
  return { x: (px - ox) / scale, y: (py - oy) / scale };
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
    // It does not burn the Time Trial clock, and it keeps the mission
    // the player has lit when it resets.
    const saved = s.status;
    s.status = 'flying';
    s.attract = true;
    FG.stepWorld(s, dt, FG.autopilot(s));
    s.attract = false;
    if (s.status !== 'flying') {
      FG.state = FG.newState(s.seed, s.mission);
    } else {
      s.status = saved;
    }
    FG.audioEngine(s);
  } else if (s.status === 'flying') {
    const input = FG.inputRead();
    const ringsBefore = s.ringsPassed;
    FG.stepWorld(s, dt, input);
    if (s.status === 'landed' || s.status === 'crashed') {
      FG.shake = 1;
      FG.saveBest(s);
      if (s.status === 'landed') {
        s.rolloutT = 1.2;
        FG.spawnSmoke(s, 12, 12);
      } else {
        FG.spawnSmoke(s, 18, 20);
      }
    } else if (s.status === 'done') {
      FG.saveBest(s);
    }
    if (s.ringsPassed > ringsBefore) FG.audioRing();
    if (s.status === 'crashed') FG.audioCrash();
    if (s.status === 'landed') FG.audioLand();
    FG.audioEngine(s);
    // Stall buffet: the airframe shakes while the wing is not flying.
    if (s.status === 'flying' && s.stall) FG.shake = Math.max(FG.shake, 0.3);
  } else if (s.status === 'landed' && s.rolloutT > 0) {
    // Rollout: the wheels stay on the runway a moment after touchdown,
    // bleeding speed and puffing smoke, instead of freezing mid-air.
    s.rolloutT -= dt;
    s.z += Math.max(0, s.speed) * FG.KT_TO_MPS * dt;
    s.speed = Math.max(0, s.speed - 60 * dt);
    if (s.speed > 30 && Math.random() < 0.5) FG.spawnSmoke(s, 2, 10);
  }
  FG.updateSmoke(s, dt);
  if (FG.shake > 0) FG.shake = Math.max(0, FG.shake - dt * 1.6);
  FG.paint();
};

FG.startGame = function startGame(missionId) {
  FG.audioInit();
  if (FG.state.status === 'title') {
    FG.selectedMission = missionId || FG.selectedMission;
    FG.state = FG.newState(FG.state.seed, FG.selectedMission);
    FG.state.status = 'flying';
  }
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') FG.startGame();
  else if (e.code === 'KeyR') FG.resetFlight();
  else if (e.code === 'KeyP') FG.paused = !FG.paused;
  else if (e.code === 'KeyM') FG.audioToggleMute();
  else if (e.code === 'KeyC') FG.cockpit = !FG.cockpit;
  else if (FG.state.status === 'title' && e.code === 'Digit1') FG.startGame('ring-run');
  else if (FG.state.status === 'title' && e.code === 'Digit2') FG.startGame('time-trial');
  else if (FG.state.status === 'title' && e.code === 'Digit3') FG.startGame('fuel-run');
});
FG.canvas.addEventListener('mousedown', (e) => {
  if (FG.state.status === 'title') {
    // A click on a mission row flies that mission; anywhere else flies
    // the mission the title screen has lit.
    const p = FG.toLogical(e.clientX, e.clientY);
    const menu = FG.titleMenu || [];
    for (let i = 0; i < menu.length; i += 1) {
      const r = menu[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        FG.startGame(r.id);
        return;
      }
    }
    FG.startGame();
  }
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
    s.ringsPassed = s.ringCount;
    s.score = s.ringCount * FG.RING_POINTS;
    s.scoreRings = s.ringCount * FG.RING_POINTS;
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
    // ?view=cockpit stages the shot from the pilot's seat.
    if (params.get('view') === 'cockpit') FG.cockpit = true;
    FG.stageShot(shot, seed);
    return; // static frame for the screenshot; no loop
  }
  FG.lastFrame = performance.now();
  requestAnimationFrame(FG.frame);
};

FG.boot();
