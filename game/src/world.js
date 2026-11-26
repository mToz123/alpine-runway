// world.js: the valley, the flight model, the rings and the runway.
// Everything here is pure simulation — no drawing, no input — so the
// screenshot autopilot can run the exact same rules forward.

FG.mulberry32 = function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

FG.clamp = function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
};

FG.lerp = function lerp(a, b, t) {
  return a + (b - a) * t;
};

FG.smoothstep = function smoothstep(edge0, edge1, x) {
  const t = FG.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

FG.deg2rad = function deg2rad(d) {
  return (d * Math.PI) / 180;
};

// The river winds down the valley floor; the terrain dips toward it.
FG.riverX = function riverX(z) {
  return 130 * Math.sin(z * 0.0006) + 60 * Math.sin(z * 0.0017 + 1.3);
};

// A dirt road winds the other side of the valley, past the town.
FG.roadX = function roadX(z) {
  return -180 + 90 * Math.sin(z * 0.0009 + 2.0) + 40 * Math.sin(z * 0.0021 + 0.6);
};

// Terrain height in feet at world (x metres, z metres). The valley floor
// rolls gently; the walls rise steeply past |x| = 420m into snowy peaks.
FG.terrainHeight = function terrainHeight(x, z) {
  const ax = Math.abs(x);
  let h = 60
    + 40 * Math.sin(z * 0.0011)
    + 30 * Math.sin(z * 0.00037 + 1.7)
    + 25 * Math.sin(x * 0.004 + 0.5)
    + 18 * Math.sin((x + z) * 0.0013);
  const wall = FG.smoothstep(420, 950, ax);
  h += wall * (1500 + 900 * Math.sin(z * 0.002 + ax * 0.001) + 400 * Math.sin(z * 0.0009 + 2.1));
  // Dip toward the river.
  const dRiver = Math.abs(x - FG.riverX(z));
  h -= 28 * Math.max(0, 1 - dRiver / 90);
  // Flatten the landing runway.
  if (z >= FG.RUNWAY_Z0 - 120 && z <= FG.RUNWAY_Z1 + 120 && ax <= FG.RUNWAY_HALF_W + 60) {
    const edge = FG.smoothstep(FG.RUNWAY_HALF_W + 60, FG.RUNWAY_HALF_W, ax)
      * FG.smoothstep(FG.RUNWAY_Z0 - 120, FG.RUNWAY_Z0, z)
      * FG.smoothstep(FG.RUNWAY_Z1 + 120, FG.RUNWAY_Z1, z);
    h = FG.lerp(h, FG.RUNWAY_ELEV_FT, FG.clamp(edge, 0, 1));
  }
  return h;
};

// Ring positions for a seed. Rings weave across the valley and climb.
FG.buildRings = function buildRings(seed) {
  const rand = FG.mulberry32(seed);
  const rings = [];
  for (let i = 0; i < FG.RING_COUNT; i += 1) {
    rings.push({
      x: Math.round(200 * Math.sin(i * 1.7 + seed * 0.13) + (rand() - 0.5) * 60),
      y: Math.round(330 + 260 * Math.sin(i * 0.9 + 0.4) + rand() * 80),
      z: FG.RING_FIRST_Z + i * FG.RING_SPACING_Z,
      r: FG.RING_RADIUS_FT,
      passed: false,
      close: false,
    });
  }
  return rings;
};

FG.newState = function newState(seed) {
  return {
    seed,
    x: 0,
    alt: FG.START_ALT_FT,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: FG.START_SPEED_KT,
    throttle: 0.62,
    score: 0,
    scoreRings: 0, // points from rings flown through
    scoreClose: 0, // points from close passes
    scoreLanding: 0, // points from the touchdown
    scoreFuel: 0, // landing fuel bonus
    ringsPassed: 0,
    fuel: FG.FUEL_START,
    damage: 0,
    fuelOut: false,
    vs: 0, // vertical speed, ft/s (negative = descending)
    time: 0,
    status: 'title', // title | flying | crashed | landed | done
    statusReason: '',
    message: '',
    messageUntil: 0,
    flash: 0, // seconds left on the ring-pass flash
    stall: false,
    terrainWarn: false,
    rings: FG.buildRings(seed),
  };
};

// One fixed simulation step. `input` is { roll, pitch, throttle } with
// roll/pitch in [-1, 1] and throttle a delta in [-1, 1] per second.
FG.stepWorld = function stepWorld(s, dt, input) {
  if (s.status !== 'flying') return;
  s.time += dt;

  // Throttle and speed. Empty tank = engine out: the throttle is forced
  // to idle and the wing glides at minimum speed toward the runway.
  if (s.fuel <= 0) {
    s.fuelOut = true;
    s.throttle = 0;
  }
  if (!s.fuelOut) {
    s.throttle = FG.clamp(s.throttle + input.throttle * FG.THROTTLE_RATE * dt, 0, 1);
    s.fuel = Math.max(
      0,
      s.fuel - (FG.FUEL_IDLE_BURN + s.throttle * FG.FUEL_THROTTLE_BURN) * dt,
    );
    if (s.fuel <= 0) s.fuelOut = true;
  }
  const targetSpeed = s.fuelOut
    ? FG.MIN_SPEED_KT
    : FG.MIN_SPEED_KT + s.throttle * (FG.MAX_SPEED_KT - FG.MIN_SPEED_KT);
  s.speed += (targetSpeed - s.speed) * FG.SPEED_LERP * dt;
  s.stall = s.speed < FG.STALL_SPEED_KT;

  // Overspeed hurts the airframe.
  if (s.speed > FG.OVERSPEED_KT) {
    s.damage = Math.min(100, s.damage + FG.DAMAGE_OVERSPEED_RATE * dt);
  }

  // Pitch and roll. Roll levels itself when the stick is centred.
  const pitchAuthority = s.stall ? 0.4 : 1;
  s.pitch = FG.clamp(
    s.pitch + input.pitch * FG.PITCH_RATE * pitchAuthority * dt,
    FG.PITCH_MIN,
    FG.PITCH_MAX,
  );
  if (input.roll === 0) {
    const level = FG.ROLL_LEVEL_RATE * dt;
    s.roll = Math.abs(s.roll) <= level ? 0 : s.roll - Math.sign(s.roll) * level;
  } else {
    s.roll = FG.clamp(s.roll + input.roll * FG.ROLL_RATE * dt, -FG.ROLL_MAX, FG.ROLL_MAX);
  }

  // Banked turn: heading follows the bank, scaled by speed. Right bank
  // (positive roll) turns right, toward +x.
  s.heading += s.roll * FG.TURN_RATE * (s.speed / FG.TURN_REF_SPEED_KT) * dt;
  if (s.heading > 180) s.heading -= 360;
  if (s.heading < -180) s.heading += 360;

  // Move. Altitude is feet, x/z are metres: convert the speed for each.
  const speedFps = s.speed * FG.KT_TO_FPS;
  const speedMps = s.speed * FG.KT_TO_MPS;
  const pitchRad = FG.deg2rad(s.pitch);
  const headingRad = FG.deg2rad(s.heading);
  s.z += speedMps * Math.cos(pitchRad) * Math.cos(headingRad) * dt;
  s.x += speedMps * Math.sin(headingRad) * dt;
  let vs = speedFps * Math.sin(pitchRad);
  if (s.stall) vs -= FG.STALL_SINK_FPS;
  if (s.pitch < 0) vs *= 1.15; // dives bite a little harder
  s.vs = vs;
  s.alt += vs * dt;
  if (s.alt > FG.CEILING_FT) s.alt = FG.CEILING_FT;

  // Terrain warning when close to the ground — but not on final, where
  // being low over the runway corridor is the whole point of landing.
  const ground = FG.terrainHeight(s.x, s.z);
  const onFinal = Math.abs(s.x) <= FG.RUNWAY_HALF_W + 6
    && s.z >= FG.RUNWAY_Z0 - 400 && s.z <= FG.RUNWAY_Z1;
  s.terrainWarn = !onFinal && s.alt - ground < 120 && s.alt - ground > 0;
  if (!onFinal && s.alt - ground < FG.SCRAPE_CLEARANCE_FT && s.speed > 120) {
    s.damage = Math.min(100, s.damage + FG.DAMAGE_SCRAPE_RATE * dt);
  }
  if (s.damage >= 100) {
    s.status = 'crashed';
    s.statusReason = s.speed > FG.OVERSPEED_KT ? 'OVERSPEED — AIRFRAME FAILURE' : 'AIRFRAME FAILURE';
    return;
  }

  // Rings: crossing a ring's z-plane inside its circle scores.
  const prevZ = s.z - speedMps * Math.cos(pitchRad) * Math.cos(headingRad) * dt;
  for (let i = 0; i < s.rings.length; i += 1) {
    const ring = s.rings[i];
    if (ring.passed || ring.close) continue;
    if (prevZ < ring.z && s.z >= ring.z) {
      const dx = (s.x - ring.x) * FG.FT_PER_M;
      const dy = s.alt - ring.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < ring.r) {
        ring.passed = true;
        s.ringsPassed += 1;
        s.score += FG.RING_POINTS;
        s.scoreRings += FG.RING_POINTS;
        s.fuel = Math.min(FG.FUEL_MAX, s.fuel + FG.FUEL_RING_BONUS);
        s.flash = 0.9;
        s.message = `RING ${s.ringsPassed}/${FG.RING_COUNT}  +${FG.RING_POINTS}   FUEL +${FG.FUEL_RING_BONUS}%`;
        s.messageUntil = s.time + 1.6;
      } else if (d < ring.r * 1.6) {
        ring.close = true;
        s.score += FG.CLOSE_POINTS;
        s.scoreClose += FG.CLOSE_POINTS;
        s.message = `CLOSE!  +${FG.CLOSE_POINTS}`;
        s.messageUntil = s.time + 1.2;
      }
    }
  }
  if (s.flash > 0) s.flash -= dt;

  // Landing: on the runway, slow, level, aligned, near the ground.
  const onRunway = Math.abs(s.x) <= FG.RUNWAY_HALF_W + 6
    && s.z >= FG.RUNWAY_Z0 && s.z <= FG.RUNWAY_Z1;
  if (onRunway && s.alt - FG.RUNWAY_ELEV_FT <= 6 && s.speed < 135
    && Math.abs(s.heading) < 12 && Math.abs(s.roll) < 18) {
    s.status = 'landed';
    const hard = s.vs < FG.HARD_LANDING_VS_FPS || s.speed > 130 || Math.abs(s.roll) > 12;
    s.scoreLanding = hard ? FG.LANDING_POINTS_HARD : FG.LANDING_POINTS;
    s.score += s.scoreLanding;
    if (hard) {
      s.damage = Math.min(100, s.damage + FG.HARD_LANDING_DAMAGE);
      s.statusReason = 'HARD LANDING — AIRFRAME DAMAGED';
    } else {
      s.statusReason = 'LANDED CLEAN';
    }
    // Fuel left is worth points: throttle discipline pays.
    s.scoreFuel = Math.round(s.fuel * FG.FUEL_BONUS_PER_POINT);
    s.score += s.scoreFuel;
    s.message = `TOUCHDOWN  +${s.scoreLanding}`;
    s.messageUntil = s.time + 3;
    return;
  }

  // Crash: terrain, or out of the valley.
  if (s.alt <= ground + 4) {
    s.status = 'crashed';
    if (s.fuelOut) s.statusReason = 'FUEL OUT — ENGINE DEAD';
    else s.statusReason = onRunway ? 'TOO FAST TO LAND' : 'TERRAIN IMPACT';
    return;
  }
  if (Math.abs(s.x) > 1150) {
    s.status = 'crashed';
    s.statusReason = 'MOUNTAIN IMPACT';
    return;
  }
  if (s.z >= FG.COURSE_END_Z) {
    s.status = 'done';
    s.statusReason = s.ringsPassed === FG.RING_COUNT ? 'COURSE COMPLETE' : 'OUT OF COURSE';
  }
};

// The next ring the pilot should aim for (or the runway once rings are done).
FG.nextTarget = function nextTarget(s) {
  for (let i = 0; i < s.rings.length; i += 1) {
    if (!s.rings[i].passed) return { x: s.rings[i].x, y: s.rings[i].y, z: s.rings[i].z, ring: true };
  }
  return { x: 0, y: FG.RUNWAY_ELEV_FT + 40, z: (FG.RUNWAY_Z0 + FG.RUNWAY_Z1) / 2, ring: false };
};

// A simple autopilot: steer toward the next target. Used for the
// deterministic screenshot scenes and the attract mode on the title screen.
FG.autopilot = function autopilot(s) {
  const target = FG.nextTarget(s);
  const dx = target.x - s.x;
  const dz = Math.max(50, target.z - s.z);
  const wantHeading = FG.clamp((Math.atan2(dx, dz) * 180) / Math.PI, -30, 30);
  let headingErr = wantHeading - s.heading;
  if (headingErr > 180) headingErr -= 360;
  if (headingErr < -180) headingErr += 360;
  const wantRoll = FG.clamp(headingErr * 2.2, -1, 1);
  // Rings: aim just above the ring. Runway: hold 170 ft until 500 m out,
  // glide down to 100 ft at the threshold (20 ft above the 80 ft deck),
  // then flare — ease the nose up so the sink bleeds off before the
  // wheels touch. Altitudes are absolute: the runway deck is 80 ft up.
  const wantAlt = target.ring
    ? target.y + 40
    : s.z < FG.RUNWAY_Z0 - 500
      ? 170
      : s.z < FG.RUNWAY_Z0
        ? 170 - (s.z - (FG.RUNWAY_Z0 - 500)) * 0.14
        : FG.RUNWAY_ELEV_FT + 4;
  const altErr = wantAlt - s.alt;
  let wantPitch = FG.clamp(altErr * 0.02, -0.8, 0.8);
  if (!target.ring && s.z >= FG.RUNWAY_Z0 && s.alt - FG.RUNWAY_ELEV_FT < 28) {
    // Flare: close to the deck, never dive and never climb — ease down
    // at a sink the wheels can take.
    wantPitch = FG.clamp(wantPitch, -0.12, 0.1);
  }
  let throttle = 0;
  if (target.ring) throttle = s.speed < 150 ? 0.6 : s.speed > 190 ? -0.6 : 0;
  else throttle = s.speed > 125 ? -1 : s.speed < 112 ? 0.5 : 0;
  return {
    roll: FG.clamp(wantRoll - s.roll * 0.02, -1, 1),
    pitch: FG.clamp(wantPitch - s.pitch * 0.05, -1, 1),
    throttle,
  };
};
