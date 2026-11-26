// render.js: everything the player sees — sky, mountains, terrain mesh,
// runway, rings, clouds, the chase-view aircraft and the HUD. Pure canvas 2D,
// no images, no network. All world points go through FG.project, a small
// perspective projector with yaw / pitch / roll.

FG.projector = function projector(s) {
  // Speed-based FOV kick: the view widens a touch at top speed.
  const fov = FG.FOV_DEG
    + FG.clamp((s.speed - FG.FOV_KICK_SPEED_KT) / 100, 0, 1) * FG.FOV_KICK_DEG;
  const f = (FG.VIEW_H / 2) / Math.tan(FG.deg2rad(fov) / 2);
  const cx = FG.VIEW_W / 2;
  const pitchCam = s.pitch * 0.35;
  const yaw = FG.deg2rad(s.heading);
  const pitch = FG.deg2rad(pitchCam);
  const roll = FG.deg2rad(s.roll);
  const cy = FG.VIEW_H * 0.52 - f * Math.tan(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const camX = s.x;
  const camY = s.alt / FG.FT_PER_M;
  const camZ = s.z;
  return function project(px, pyFt, pz) {
    const dx = px - camX;
    const dy = pyFt / FG.FT_PER_M - camY;
    const dz = pz - camZ;
    // World -> camera: yaw, then pitch, then roll.
    const x1 = dx * cosY - dz * sinY;
    const z1 = dx * sinY + dz * cosY;
    const y2 = dy * cosP + z1 * sinP;
    const z2 = -dy * sinP + z1 * cosP;
    const x3 = x1 * cosR + y2 * sinR;
    const y3 = -x1 * sinR + y2 * cosR;
    if (z2 < 3) return null;
    return { x: cx + (f * x3) / z2, y: cy - (f * y3) / z2, d: z2, scale: f / z2 };
  };
};

// Parse '#rrggbb' or 'rgb(r,g,b)' into [r, g, b]; lerp returns '#rrggbb'.
FG.parseColor = function parseColor(c) {
  if (c.charAt(0) === '#') {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/(\d+)[, ]+(\d+)[, ]+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
};

FG.hexLerp = function hexLerp(a, b, t) {
  const pa = FG.parseColor(a);
  const pb = FG.parseColor(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  const hex = (v) => FG.clamp(v, 0, 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
};

// Deterministic 1D ridge noise for the far mountain silhouettes.
FG.ridgeNoise = function ridgeNoise(seed, t) {
  const n = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

FG.drawSky = function drawSky(ctx, s, project) {
  // A proper vertical sunset all around: deep indigo overhead, violet,
  // then a warm band at the horizon that fades into haze below it.
  const g = ctx.createLinearGradient(0, 0, 0, FG.VIEW_H);
  g.addColorStop(0, FG.SKY_TOP);
  g.addColorStop(0.3, FG.SKY_MID);
  g.addColorStop(0.48, '#c96a8a');
  g.addColorStop(0.55, FG.SKY_HORIZON);
  g.addColorStop(0.62, FG.SKY_HAZE);
  g.addColorStop(1, '#3a2c26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FG.VIEW_W, FG.VIEW_H);
  // Warm haze hugging the horizon.
  const horizonY = FG.VIEW_H * 0.52 - ((FG.VIEW_H / 2) / Math.tan(FG.deg2rad(FG.FOV_DEG) / 2)) * Math.tan(FG.deg2rad(s.pitch * 0.35));
  const haze = ctx.createLinearGradient(0, horizonY - 30, 0, horizonY + 40);
  haze.addColorStop(0, 'rgba(255,179,122,0)');
  haze.addColorStop(0.5, 'rgba(255,179,122,0.22)');
  haze.addColorStop(1, 'rgba(255,179,122,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - 30, FG.VIEW_W, 70);
};

// The sun sits low ahead of the course and drifts with the heading, so
// it is always the sunset the pilot flies into. Drawn after the ridges
// so it clears their crests instead of hiding behind them.
FG.drawSun = function drawSun(ctx, s) {
  const horizonY = FG.VIEW_H * 0.52 - ((FG.VIEW_H / 2) / Math.tan(FG.deg2rad(FG.FOV_DEG) / 2)) * Math.tan(FG.deg2rad(s.pitch * 0.35));
  const sunX = FG.VIEW_W / 2 - s.heading * 6;
  const sunY = horizonY - 92;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 170);
  glow.addColorStop(0, 'rgba(255,217,160,0.9)');
  glow.addColorStop(0.3, 'rgba(255,170,90,0.45)');
  glow.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FG.SUN_COLOR;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();
};

// Two far ridge silhouettes, parallaxed by heading, each shaded from a
// pale snow-lit crest down to a dark base so they read as mountains,
// not flat cutouts.
FG.drawRidges = function drawRidges(ctx, s) {
  const horizonY = FG.VIEW_H * 0.52 - ((FG.VIEW_H / 2) / Math.tan(FG.deg2rad(FG.FOV_DEG) / 2)) * Math.tan(FG.deg2rad(s.pitch * 0.35));
  const layers = [
    { parallax: 0.12, base: 96, amp: 84, top: '#8a97b5', bottom: '#4a5878' },
    { parallax: 0.3, base: 58, amp: 118, top: '#6d7c9e', bottom: '#2c3850' },
  ];
  ctx.save();
  ctx.translate(FG.VIEW_W / 2, horizonY);
  ctx.rotate(FG.deg2rad(-s.roll * 0.6));
  ctx.translate(-FG.VIEW_W / 2, -horizonY);
  for (let li = 0; li < layers.length; li += 1) {
    const L = layers[li];
    const grad = ctx.createLinearGradient(0, horizonY - L.base - L.amp, 0, horizonY + 2);
    grad.addColorStop(0, L.top);
    grad.addColorStop(0.55, L.bottom);
    grad.addColorStop(1, L.bottom);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-40, horizonY + 2);
    for (let x = -40; x <= FG.VIEW_W + 40; x += 16) {
      const t = x / FG.VIEW_W + s.heading * 0.004 * L.parallax + li * 3.7;
      const n = FG.ridgeNoise(s.seed + li * 7, Math.floor(t * 9) / 9);
      const n2 = FG.ridgeNoise(s.seed + li * 13, Math.floor(t * 23) / 23);
      const peak = L.base + n * L.amp + n2 * 40;
      ctx.lineTo(x, horizonY - peak);
    }
    ctx.lineTo(FG.VIEW_W + 40, horizonY + 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

// The valley floor as a projected grid of quads, far to near: a patchwork
// of real fields (not a checkerboard), a river with a sun glint, a dirt
// road, tree clusters and a small town by the runway, all fogged toward
// the horizon. Trees are collected per row and painted after the mesh so
// they stand on the ground in the right order.
FG.drawGround = function drawGround(ctx, s, project) {
  const rows = [];
  let z = s.z + 25;
  let step = 30;
  while (z < s.z + 3400 && rows.length < 30) {
    rows.push(z);
    z += step;
    step *= 1.22;
  }
  const xs = [];
  for (let x = -880; x <= 880; x += 80) xs.push(x);
  const fields = [FG.FIELD_A, FG.FIELD_B, FG.FIELD_WHEAT, FG.FIELD_PLOWED, FG.FIELD_MEADOW];
  const trees = [];
  for (let ri = rows.length - 1; ri > 0; ri -= 1) {
    const z0 = rows[ri - 1];
    const z1 = rows[ri];
    const fog = FG.clamp((z1 - s.z) / 3400, 0, 1);
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const h00 = FG.terrainHeight(x0, z0);
      const h10 = FG.terrainHeight(x1, z0);
      const h11 = FG.terrainHeight(x1, z1);
      const h01 = FG.terrainHeight(x0, z1);
      const p00 = project(x0, h00, z0);
      const p10 = project(x1, h10, z0);
      const p11 = project(x1, h11, z1);
      const p01 = project(x0, h01, z1);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const midH = (h00 + h10 + h11 + h01) / 4;
      let color;
      if (midH > 1500) color = FG.SNOW;
      else if (midH > 700) color = FG.hexLerp(FG.ROCK, FG.SNOW, FG.smoothstep(700, 1500, midH));
      else if (midH > 260) color = FG.hexLerp(FG.GRASS_DARK, FG.ROCK, (midH - 260) / 440);
      else {
        // Big field patches: the hash groups 2x2 cells into one field.
        const fx = Math.floor(x0 / 160);
        const fz = Math.floor(z0 / 160);
        const fi = Math.floor(FG.ridgeNoise(s.seed, fx * 0.61 + fz * 0.37) * fields.length);
        color = fields[fi];
      }
      // Slope shading: steep faces fall into shadow, so the valley walls
      // read as mountains instead of flat slabs.
      const slope = Math.abs(h11 - h00) + Math.abs(h10 - h01);
      const shade = FG.clamp(slope / 260, 0, 0.45);
      color = FG.hexLerp(color, '#000000', shade);
      // A whisper of variation so the mesh never looks flat.
      const vary = FG.ridgeNoise(s.seed, Math.floor(x0 / 80) * 0.37 + Math.floor(z0 / 80) * 0.11) - 0.5;
      color = FG.hexLerp(color, vary > 0 ? '#ffffff' : '#000000', Math.abs(vary) * 0.08);
      color = FG.hexLerp(color, FG.SKY_HORIZON, fog * 0.35);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
      // Tree clusters on the valley floor, away from river, road and runway.
      const cxm = (x0 + x1) / 2;
      const czm = (z0 + z1) / 2;
      const th = FG.ridgeNoise(s.seed + 5, Math.floor(cxm / 80) * 0.53 + Math.floor(czm / 80) * 0.29);
      const nearRiver = Math.abs(cxm - FG.riverX(czm)) < 60;
      const nearRoad = Math.abs(cxm - FG.roadX(czm)) < 40;
      const nearRunway = czm > FG.RUNWAY_Z0 - 160 && czm < FG.RUNWAY_Z1 + 160 && Math.abs(cxm) < 140;
      if (midH < 260 && th < 0.14 && !nearRiver && !nearRoad && !nearRunway) {
        trees.push({ x: cxm, z: czm, h: FG.terrainHeight(cxm, czm), n: 2 + Math.floor(th * 40) });
      }
    }
    // River ribbon on this row, with a bright sun glint down its middle.
    const rx = FG.riverX(z0);
    const r0 = project(rx - 14, FG.terrainHeight(rx, z0) + 2, z0);
    const r1 = project(rx + 14, FG.terrainHeight(rx, z0) + 2, z0);
    const r2 = project(FG.riverX(z1) + 14, FG.terrainHeight(FG.riverX(z1), z1) + 2, z1);
    const r3 = project(FG.riverX(z1) - 14, FG.terrainHeight(FG.riverX(z1), z1) + 2, z1);
    if (r0 && r1 && r2 && r3) {
      ctx.fillStyle = FG.hexLerp('#3f7fb8', FG.SKY_HORIZON, fog * 0.5);
      ctx.beginPath();
      ctx.moveTo(r0.x, r0.y);
      ctx.lineTo(r1.x, r1.y);
      ctx.lineTo(r2.x, r2.y);
      ctx.lineTo(r3.x, r3.y);
      ctx.closePath();
      ctx.fill();
      const g0 = project(rx - 3, FG.terrainHeight(rx, z0) + 3, z0);
      const g1 = project(rx + 3, FG.terrainHeight(rx, z0) + 3, z0);
      const g2 = project(FG.riverX(z1) + 3, FG.terrainHeight(FG.riverX(z1), z1) + 3, z1);
      const g3 = project(FG.riverX(z1) - 3, FG.terrainHeight(FG.riverX(z1), z1) + 3, z1);
      if (g0 && g1 && g2 && g3) {
        ctx.fillStyle = 'rgba(255,232,190,0.55)';
        ctx.beginPath();
        ctx.moveTo(g0.x, g0.y);
        ctx.lineTo(g1.x, g1.y);
        ctx.lineTo(g2.x, g2.y);
        ctx.lineTo(g3.x, g3.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Dirt road ribbon on this row.
    const dx = FG.roadX(z0);
    const d0 = project(dx - 7, FG.terrainHeight(dx, z0) + 2, z0);
    const d1 = project(dx + 7, FG.terrainHeight(dx, z0) + 2, z0);
    const d2 = project(FG.roadX(z1) + 7, FG.terrainHeight(FG.roadX(z1), z1) + 2, z1);
    const d3 = project(FG.roadX(z1) - 7, FG.terrainHeight(FG.roadX(z1), z1) + 2, z1);
    if (d0 && d1 && d2 && d3) {
      ctx.fillStyle = FG.hexLerp(FG.ROAD_COLOR, FG.SKY_HORIZON, fog * 0.5);
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y);
      ctx.lineTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.lineTo(d3.x, d3.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Trees, far to near, as small conifers standing on the ground.
  for (let i = 0; i < trees.length; i += 1) {
    const t = trees[i];
    const p = project(t.x, t.h, t.z);
    if (!p) continue;
    const size = Math.max(2, p.scale * 14);
    if (size > 60) continue;
    for (let j = 0; j < t.n; j += 1) {
      const off = (FG.ridgeNoise(s.seed + j, t.x * 0.13 + t.z * 0.07 + j) - 0.5) * size * 3;
      const px = p.x + off;
      const py = p.y;
      const hgt = size * (0.8 + FG.ridgeNoise(s.seed + j + 3, t.x + j) * 0.6);
      ctx.fillStyle = '#1d4a26';
      ctx.beginPath();
      ctx.moveTo(px, py - hgt);
      ctx.lineTo(px - size * 0.45, py);
      ctx.lineTo(px + size * 0.45, py);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2e6b34';
      ctx.beginPath();
      ctx.moveTo(px, py - hgt);
      ctx.lineTo(px - size * 0.28, py - hgt * 0.35);
      ctx.lineTo(px + size * 0.28, py - hgt * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }
};

// A small town by the runway: warm roofs and a few trees, so the landing
// strip sits in a place that reads as somewhere, not nowhere.
FG.drawTown = function drawTown(ctx, s, project) {
  const rand = FG.mulberry32(s.seed * 7 + 3);
  const roofs = ['#a34d2e', '#8a5a30', '#6e4a3a', '#b07a45', '#7d3b2e'];
  for (let i = 0; i < 26; i += 1) {
    const hx = -230 + rand() * 170;
    const hz = 8560 + rand() * 380;
    if (hz < s.z + 25 || hz > s.z + 3400) continue;
    const hh = FG.terrainHeight(hx, hz);
    const w = 9 + rand() * 7;
    const d = 7 + rand() * 6;
    const c1 = project(hx - w / 2, hh + 5, hz - d / 2);
    const c2 = project(hx + w / 2, hh + 5, hz - d / 2);
    const c3 = project(hx + w / 2, hh + 5, hz + d / 2);
    const c4 = project(hx - w / 2, hh + 5, hz + d / 2);
    if (!c1 || !c2 || !c3 || !c4) continue;
    ctx.fillStyle = roofs[Math.floor(rand() * roofs.length)];
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.lineTo(c4.x, c4.y);
    ctx.closePath();
    ctx.fill();
  }
};

FG.drawRunway = function drawRunway(ctx, s, project) {
  if (s.z > FG.RUNWAY_Z1 + 200) return;
  const z0 = FG.RUNWAY_Z0;
  const z1 = FG.RUNWAY_Z1;
  const w = FG.RUNWAY_HALF_W;
  const e = FG.RUNWAY_ELEV_FT;
  const corners = [
    project(-w, e, z0), project(w, e, z0), project(w, e, z1), project(-w, e, z1),
  ];
  if (corners.some((p) => p === null)) return;
  ctx.fillStyle = FG.RUNWAY_ASPHALT;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = '#e8e8e8';
  for (let z = z0 + 30; z < z1; z += 90) {
    const a = project(-2.5, e + 0.5, z);
    const b = project(2.5, e + 0.5, z);
    const c = project(2.5, e + 0.5, z + 45);
    const d = project(-2.5, e + 0.5, z + 45);
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  ctx.fillStyle = '#ffffff';
  [z0 + 8, z1 - 8].forEach((z) => {
    for (let i = -3; i <= 3; i += 1) {
      const a = project(i * 5 - 2, e + 0.5, z);
      const b = project(i * 5 + 2, e + 0.5, z);
      const c = project(i * 5 + 2, e + 0.5, z + 14);
      const d = project(i * 5 - 2, e + 0.5, z + 14);
      if (!a || !b || !c || !d) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  });
  // Amber edge lights.
  ctx.fillStyle = FG.HUD_AMBER;
  for (let z = z0; z <= z1; z += 120) {
    [-w, w].forEach((x) => {
      const p = project(x, e + 2, z);
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, 260 / p.d), 0, Math.PI * 2);
      ctx.fill();
    });
  }
};

FG.drawRings = function drawRings(ctx, s, project) {
  const next = FG.nextTarget(s);
  for (let i = 0; i < s.rings.length; i += 1) {
    const ring = s.rings[i];
    if (ring.z < s.z - 60 || ring.z > s.z + 3600) continue;
    const c = project(ring.x, ring.y, ring.z);
    if (!c) continue;
    const isNext = next.ring && ring.z === next.z;
    const r = c.scale * (ring.r / FG.FT_PER_M);
    if (r < 2) continue;
    ctx.save();
    ctx.strokeStyle = ring.passed ? FG.HUD_GREEN : isNext ? FG.RING_NEXT : FG.RING_OTHER;
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = isNext ? 22 : 10;
    ctx.globalAlpha = ring.passed ? 0.45 : 0.95;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Chequer ticks around the ring.
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    for (let a = 0; a < 8; a += 1) {
      const ang = (a / 8) * Math.PI * 2;
      const x1 = c.x + Math.cos(ang) * r * 0.88;
      const y1 = c.y + Math.sin(ang) * r * 0.88 * 0.94;
      const x2 = c.x + Math.cos(ang) * r * 1.06;
      const y2 = c.y + Math.sin(ang) * r * 1.06 * 0.94;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }
};

FG.drawClouds = function drawClouds(ctx, s, project) {
  const rand = FG.mulberry32(s.seed * 31 + 7);
  // Two layers: high thin streaks far away, and a few mid puffs. Long,
  // flat and warm underneath — sunset clouds, not cotton blobs.
  for (let i = 0; i < 14; i += 1) {
    const high = i < 8;
    const cx = (rand() - 0.5) * 3000;
    const cy = high ? 2400 + rand() * 1400 : 1500 + rand() * 900;
    const cz = s.z + 500 + rand() * 9000;
    const p = project(cx, cy, cz);
    if (!p || p.d < 100) continue;
    const r = p.scale * (high ? 260 : 200);
    if (r < 4 || r > 700) continue;
    const stretch = high ? 2.6 : 1.7;
    const alpha = high ? 0.4 : 0.55;
    const puffs = high
      ? [[0, 0, 1]]
      : [[0, 0, 1], [-0.6, 0.12, 0.6], [0.6, 0.1, 0.55]];
    for (let j = 0; j < puffs.length; j += 1) {
      const px = p.x + puffs[j][0] * r;
      const py = p.y + puffs[j][1] * r;
      const pr = r * puffs[j][2];
      const g = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
      g.addColorStop(0, `rgba(255,244,230,${alpha})`);
      g.addColorStop(0.7, `rgba(255,236,220,${alpha * 0.5})`);
      g.addColorStop(1, 'rgba(255,236,220,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(stretch, 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Warm sunset light on the underside.
      const warm = ctx.createRadialGradient(px, py + pr * 0.35, pr * 0.1, px, py + pr * 0.35, pr * 0.8);
      warm.addColorStop(0, `rgba(255,170,110,${alpha * 0.5})`);
      warm.addColorStop(1, 'rgba(255,170,110,0)');
      ctx.fillStyle = warm;
      ctx.save();
      ctx.translate(px, py + pr * 0.35);
      ctx.scale(stretch, 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, pr * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
};

// The plane's soft shadow on the terrain below, in screen space: the
// ground under a chase-view camera sits below the aircraft in the frame,
// so the shadow hangs under the plane — tight and dark near the ground,
// wide and faint up high. It is what makes a landing readable.
FG.drawPlaneShadow = function drawPlaneShadow(ctx, s) {
  if (s.status !== 'flying' && s.status !== 'landed') return;
  const ground = FG.terrainHeight(s.x, s.z);
  const clearance = Math.max(0, s.alt - ground);
  const cx = FG.VIEW_W / 2 + s.roll * 1.1;
  const cy = FG.VIEW_H * 0.68 + s.pitch * 1.2;
  const alpha = FG.clamp(0.34 - clearance / 4500, 0.05, 0.34);
  const rx = 58 + clearance * 0.03;
  const ry = rx * 0.42;
  const sy = Math.min(FG.VIEW_H - 12, cy + 92 + clearance * 0.08);
  ctx.fillStyle = `rgba(8,12,20,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(cx + 24, sy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

// The chase-view aircraft, drawn in screen space, banked with the roll.
// A jet seen from behind and slightly above, built to look built: a
// shaded fuselage with a specular stripe, wings whose underside shows
// dark in a bank, lit canopy, engine glow and nav lights.
FG.drawPlane = function drawPlane(ctx, s) {
  const cx = FG.VIEW_W / 2 + s.roll * 1.1;
  const cy = FG.VIEW_H * 0.68 + s.pitch * 1.2 + (s.status === 'title' ? 62 : 0);
  const blink = Math.floor(s.time * 2) % 2 === 0;
  const downRight = s.roll > 8; // right wing is the low one in a right bank
  const downLeft = s.roll < -8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(FG.deg2rad(s.roll * 0.85));
  ctx.scale(FG.PLANE_SCALE, FG.PLANE_SCALE);
  // Main wings: gradient from a lit root to a dark tip, swept back.
  const wingL = ctx.createLinearGradient(0, 0, -152, 0);
  wingL.addColorStop(0, '#5a6b8c');
  wingL.addColorStop(1, '#2c3850');
  const wingR = ctx.createLinearGradient(0, 0, 152, 0);
  wingR.addColorStop(0, '#5a6b8c');
  wingR.addColorStop(1, '#2c3850');
  const wingPath = (side) => {
    ctx.beginPath();
    ctx.moveTo(side * 12, -6);
    ctx.lineTo(side * 152, 26);
    ctx.lineTo(side * 146, 46);
    ctx.lineTo(side * 10, 22);
    ctx.closePath();
  };
  ctx.fillStyle = wingL;
  wingPath(-1);
  ctx.fill();
  ctx.fillStyle = wingR;
  wingPath(1);
  ctx.fill();
  // The low wing shows its underside: dark, so a bank reads at a glance.
  ctx.fillStyle = 'rgba(8,14,26,0.5)';
  if (downLeft) {
    wingPath(-1);
    ctx.fill();
  }
  if (downRight) {
    wingPath(1);
    ctx.fill();
  }
  // Tailplane.
  ctx.fillStyle = '#2e3a50';
  ctx.beginPath();
  ctx.moveTo(-8, 44);
  ctx.lineTo(-62, 66);
  ctx.lineTo(-56, 78);
  ctx.lineTo(0, 60);
  ctx.lineTo(56, 78);
  ctx.lineTo(62, 66);
  ctx.lineTo(8, 44);
  ctx.closePath();
  ctx.fill();
  // Fin, seen edge-on above the tail.
  const fin = ctx.createLinearGradient(0, 4, 0, 40);
  fin.addColorStop(0, '#5a6b8c');
  fin.addColorStop(1, '#2e3a50');
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(-8, 40);
  ctx.lineTo(0, 4);
  ctx.lineTo(8, 40);
  ctx.closePath();
  ctx.fill();
  // Fuselage: shaded top to bottom, nose away from the viewer.
  const body = ctx.createLinearGradient(0, -62, 0, 60);
  body.addColorStop(0, '#f2f6fb');
  body.addColorStop(0.45, '#c9d6e8');
  body.addColorStop(1, '#6f7f9e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.quadraticCurveTo(13, -44, 14, -8);
  ctx.lineTo(13, 42);
  ctx.quadraticCurveTo(10, 58, 0, 60);
  ctx.quadraticCurveTo(-10, 58, -13, 42);
  ctx.lineTo(-14, -8);
  ctx.quadraticCurveTo(-13, -44, 0, -62);
  ctx.closePath();
  ctx.fill();
  // Specular stripe down the sunlit side of the fuselage.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-5, -14, 3.5, 26, 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Canopy: dark glass with a bright glint.
  const canopy = ctx.createLinearGradient(-8, -48, 8, -14);
  canopy.addColorStop(0, '#2c4a6b');
  canopy.addColorStop(1, '#0c1626');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(0, -30, 8, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,225,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-3, -36, 3, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Twin engine glow, small and warm.
  const glow = ctx.createRadialGradient(0, 58, 1, 0, 58, 14);
  glow.addColorStop(0, 'rgba(255,190,90,0.85)');
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 58, 14, 0, Math.PI * 2);
  ctx.fill();
  // Nav lights: red left, green right, white strobe on the tail.
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(-150, 34, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#44ff88';
  ctx.beginPath();
  ctx.arc(150, 34, 4, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

FG.panel = function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,16,28,0.62)';
  ctx.strokeStyle = 'rgba(143,245,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  // Glass: a soft highlight across the top of the panel.
  const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.45);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h * 0.45, 7);
  ctx.fill();
};

FG.text = function text(ctx, str, x, y, size, color, align, weight) {
  ctx.font = `${weight || 'bold'} ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
};

FG.pad = function pad(n, len) {
  return String(Math.max(0, Math.round(n))).padStart(len, '0');
};

FG.drawHUD = function drawHUD(ctx, s) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  // Top-left: altitude, speed, vertical speed, wind.
  FG.panel(ctx, 18, 16, 218, 132);
  FG.text(ctx, 'ALT', 34, 38, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(s.alt, 5)} FT`, 34, 66, 26, '#ffffff');
  FG.text(ctx, 'SPD', 34, 96, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(s.speed, 3)} KT`, 118, 96, 20, '#ffffff');
  FG.text(ctx, 'WIND', 34, 124, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(Math.round(s.windKt), 2)} KT →`, 118, 124, 20, '#ffffff');
  // Top-centre: compass tape on the left, current heading on the right.
  FG.panel(ctx, W / 2 - 220, 16, 440, 56);
  const hdg = ((s.heading % 360) + 360) % 360;
  const tapeCx = W / 2 - 60;
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 220, 16, 320, 56);
  ctx.clip();
  for (let d = -45; d <= 45; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const off = (deg - hdg) * 3.2;
    const x = tapeCx + off;
    const major = deg % 15 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 26);
    ctx.lineTo(x, major ? 44 : 36);
    ctx.stroke();
    if (major) FG.text(ctx, FG.pad(((deg % 360) + 360) % 360, 3), x, 58, 12, FG.HUD_CYAN, 'center');
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(143,245,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 + 100, 24);
  ctx.lineTo(W / 2 + 100, 64);
  ctx.stroke();
  FG.text(ctx, 'HDG', W / 2 + 118, 30, 13, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(hdg, 3)}°`, W / 2 + 160, 50, 22, '#ffffff', 'center');
  ctx.fillStyle = FG.HUD_AMBER;
  ctx.beginPath();
  ctx.moveTo(tapeCx - 7, 18);
  ctx.lineTo(tapeCx + 7, 18);
  ctx.lineTo(tapeCx, 30);
  ctx.closePath();
  ctx.fill();
  // Top-right: throttle + fuel + damage + score.
  FG.panel(ctx, W - 236, 16, 218, 190);
  FG.text(ctx, 'THR', W - 220, 38, 15, FG.HUD_CYAN);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 220, 52, 186, 12);
  ctx.fillStyle = s.throttle > 0.85 ? FG.HUD_RED : FG.HUD_GREEN;
  ctx.fillRect(W - 220, 52, 186 * s.throttle, 12);
  FG.text(ctx, `${Math.round(s.throttle * 100)}%`, W - 220, 82, 16, '#ffffff');
  FG.text(ctx, 'FUEL', W - 220, 104, 15, FG.HUD_CYAN);
  FG.text(ctx, `${Math.round(s.fuel)}%`, W - 148, 104, 16, s.fuel < FG.FUEL_LOW ? FG.HUD_RED : '#ffffff');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 220, 116, 186, 10);
  ctx.fillStyle = s.fuel < FG.FUEL_LOW ? FG.HUD_RED : s.fuel < 50 ? FG.HUD_AMBER : FG.HUD_GREEN;
  ctx.fillRect(W - 220, 116, 186 * FG.clamp(s.fuel / 100, 0, 1), 10);
  FG.text(ctx, 'DMG', W - 220, 146, 15, FG.HUD_CYAN);
  FG.text(ctx, `${Math.round(s.damage)}%`, W - 148, 146, 16, s.damage > 70 ? FG.HUD_RED : '#ffffff');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 220, 158, 186, 10);
  ctx.fillStyle = s.damage > 70 ? FG.HUD_RED : s.damage > 30 ? FG.HUD_AMBER : FG.HUD_GREEN;
  ctx.fillRect(W - 220, 158, 186 * FG.clamp(s.damage / 100, 0, 1), 10);
  FG.text(ctx, 'SCORE', W - 220, 188, 15, FG.HUD_CYAN);
  FG.text(ctx, String(s.score), W - 148, 188, 20, '#ffffff');
  // Bottom-left: attitude indicator (lit instruments), bigger, with a
  // pitch ladder and a glass dome. In cockpit view the big panel ball
  // replaces it, so the same instrument is never drawn twice.
  if (!FG.cockpit) {
    FG.drawAttitude(ctx, 86, H - 94, 70, s);
    FG.text(ctx, 'ATT', 86, H - 94 + 70 + 16, 12, FG.HUD_CYAN, 'center');
  }
  // Bottom-right: mission + rings + time. On Time Trial the clock counts
  // down instead of the elapsed time, and turns red under 30 seconds.
  FG.panel(ctx, W - 236, H - 122, 218, 104);
  FG.text(ctx, 'MISSION', W - 220, H - 100, 15, FG.HUD_CYAN);
  FG.text(ctx, s.missionDef.name, W - 148, H - 100, 15, FG.HUD_AMBER);
  FG.text(ctx, 'RINGS', W - 220, H - 74, 15, FG.HUD_CYAN);
  FG.text(ctx, `${s.ringsPassed}/${s.ringCount}`, W - 148, H - 74, 20, '#ffffff');
  if (s.clock !== null) {
    const cmins = Math.floor(s.clock / 60);
    const csecs = Math.floor(s.clock % 60);
    FG.text(ctx, 'CLOCK', W - 220, H - 42, 15, FG.HUD_CYAN);
    FG.text(ctx, `${FG.pad(cmins, 2)}:${FG.pad(csecs, 2)}`, W - 148, H - 42, 20, s.clock < 30 ? FG.HUD_RED : '#ffffff');
  } else {
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    FG.text(ctx, 'TIME', W - 220, H - 42, 15, FG.HUD_CYAN);
    FG.text(ctx, `${FG.pad(mins, 2)}:${FG.pad(secs, 2)}`, W - 148, H - 42, 20, '#ffffff');
  }
  // Next-target readout + edge chevron, only while flying.
  if (s.status === 'flying') {
    const target = FG.nextTarget(s);
  const project = FG.projector(s);
  const tp = project(target.x, target.y, target.z);
  const distM = Math.max(0, Math.round(target.z - s.z));
  if (tp && tp.x > 60 && tp.x < W - 60 && tp.y > 90 && tp.y < H - 120) {
    ctx.strokeStyle = FG.RING_NEXT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tp.x - 34, tp.y);
    ctx.lineTo(tp.x - 20, tp.y);
    ctx.moveTo(tp.x + 20, tp.y);
    ctx.lineTo(tp.x + 34, tp.y);
    ctx.moveTo(tp.x, tp.y - 34);
    ctx.lineTo(tp.x, tp.y - 20);
    ctx.moveTo(tp.x, tp.y + 20);
    ctx.lineTo(tp.x, tp.y + 34);
    ctx.stroke();
  } else if (tp) {
    const ex = FG.clamp(tp.x, 80, W - 80);
    const ey = FG.clamp(tp.y, 120, H - 140);
    const ang = Math.atan2(tp.y - ey, tp.x - ex);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = FG.RING_NEXT;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  FG.text(
    ctx,
    target.ring ? `NEXT RING  ${distM} M` : `RUNWAY  ${distM} M — LAND!`,
    W / 2,
    // In cockpit view the panel attitude sits at the bottom centre, so
    // the readout moves up above the glareshield instead of behind it.
    FG.cockpit ? H - 180 : H - 34,
    17,
    target.ring ? FG.HUD_CYAN : FG.HUD_GREEN,
    'center',
  );
  }
  // Flash message.
  if (s.flash > 0 || s.time < s.messageUntil) {
    ctx.globalAlpha = FG.clamp(s.flash * 1.4, 0.25, 1);
    FG.text(ctx, s.message, W / 2, H * 0.3, 34, FG.HUD_AMBER, 'center');
    ctx.globalAlpha = 1;
  }
  // Warnings, most urgent first.
  if (s.status === 'flying') {
    const blink = Math.floor(s.time * 4) % 2 === 0;
    if (s.speed > FG.OVERSPEED_KT && blink) {
      FG.text(ctx, '!! OVERSPEED — AIRFRAME TAKING DAMAGE !!', W / 2, 96, 22, FG.HUD_RED, 'center');
    } else if (s.damage > 70 && blink) {
      FG.text(ctx, '!! DAMAGE CRITICAL !!', W / 2, 96, 22, FG.HUD_RED, 'center');
    } else if (s.fuelOut) {
      FG.text(ctx, 'FUEL OUT — ENGINE DEAD, GLIDE TO THE RUNWAY', W / 2, 96, 22, FG.HUD_RED, 'center');
    } else if (s.fuel < FG.FUEL_LOW) {
      FG.text(ctx, 'FUEL LOW — RINGS REFUEL +3%', W / 2, 96, 22, FG.HUD_AMBER, 'center');
    } else if (s.stall && blink) {
      FG.text(ctx, '!! STALL — NOSE DOWN, THROTTLE UP !!', W / 2, 96, 22, FG.HUD_RED, 'center');
    } else if (s.terrainWarn) {
      FG.text(ctx, 'TERRAIN — PULL UP', W / 2, 96, 22, FG.HUD_AMBER, 'center');
    }
  }
};

// Speed lines at high throttle: faint streaks near the screen edges,
// so speed is felt as well as read.
FG.drawSpeedLines = function drawSpeedLines(ctx, s) {
  if (s.status !== 'flying' || s.speed < FG.SPEED_LINES_KT) return;
  const strength = FG.clamp((s.speed - FG.SPEED_LINES_KT) / 55, 0, 1);
  const cx = FG.VIEW_W / 2;
  const cy = FG.VIEW_H * 0.52;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${(0.28 * strength).toFixed(3)})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    const seed = i * 97 + Math.floor(s.time * 24);
    const ang = FG.ridgeNoise(s.seed, seed * 0.31) * Math.PI * 2;
    const r0 = 330 + FG.ridgeNoise(s.seed + 1, seed * 0.17) * 180;
    const len = 26 + FG.ridgeNoise(s.seed + 2, seed * 0.23) * 60 * strength;
    const x0 = cx + Math.cos(ang) * r0;
    const y0 = cy + Math.sin(ang) * r0 * 0.7;
    const x1 = cx + Math.cos(ang) * (r0 + len);
    const y1 = cy + Math.sin(ang) * (r0 + len) * 0.7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
};

// Full frame: world then HUD, plus the title / end screens. In cockpit
// view the chase aircraft and its shadow are gone: the cockpit frame goes
// under the HUD and the panel instruments on top of it.
FG.drawFrame = function drawFrame(ctx, s) {
  const project = FG.projector(s);
  FG.drawSky(ctx, s, project);
  FG.drawRidges(ctx, s);
  FG.drawSun(ctx, s);
  FG.drawGround(ctx, s, project);
  FG.drawTown(ctx, s, project);
  FG.drawRunway(ctx, s, project);
  FG.drawWindsock(ctx, s, project);
  FG.drawClouds(ctx, s, project);
  FG.drawRings(ctx, s, project);
  if (!FG.cockpit) FG.drawPlaneShadow(ctx, s);
  FG.drawSmoke(ctx, s, project);
  FG.drawSpeedLines(ctx, s);
  if (FG.cockpit) FG.drawCockpitFrame(ctx, s);
  else FG.drawPlane(ctx, s);
  FG.drawHUD(ctx, s);
  if (FG.cockpit) FG.drawCockpitPanel(ctx, s);
  if (s.status === 'title') FG.drawTitle(ctx, s);
  else if (s.status === 'crashed') FG.drawEnd(ctx, s, 'CRASHED', s.statusReason, FG.HUD_RED);
  else if (s.status === 'landed') FG.drawEnd(ctx, s, s.statusReason === 'HARD LANDING — AIRFRAME DAMAGED' ? 'HARD LANDING' : 'TOUCHDOWN!', s.statusReason, FG.HUD_GREEN);
  else if (s.status === 'done') FG.drawEnd(ctx, s, s.statusReason, 'PRESS R TO FLY AGAIN', FG.HUD_CYAN);
};

// The windsock by the runway threshold: a pole with an orange sock that
// streams downwind and droops when the air is calm, so the crosswind the
// flight model applies is visible before the pilot commits to final.
FG.drawWindsock = function drawWindsock(ctx, s, project) {
  const wx = -FG.RUNWAY_HALF_W - 18;
  const wz = FG.RUNWAY_Z0 + 80;
  if (wz < s.z - 60 || wz > s.z + 3400) return;
  const base = project(wx, FG.RUNWAY_ELEV_FT, wz);
  const top = project(wx, FG.RUNWAY_ELEV_FT + 40, wz);
  if (!base || !top) return;
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = Math.max(1, 200 / top.d);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  // Downwind on screen: project a point 24 m downwind of the pole top.
  const down = project(wx + 24, FG.RUNWAY_ELEV_FT + 40, wz);
  if (!down) return;
  let dx = down.x - top.x;
  let dy = down.y - top.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  dx /= len;
  dy /= len;
  // The sock streams out with the wind and droops when it is calm.
  const lift = FG.clamp(s.windKt / 24, 0.15, 1);
  const sockLen = 8 * top.scale * (0.4 + 0.6 * lift);
  const tipX = top.x + dx * sockLen;
  const tipY = top.y + dy * sockLen + (1 - lift) * sockLen * 0.45;
  // A tapered sock, orange with a white band, fat at the pole.
  const perpX = -dy;
  const perpY = dx;
  ctx.fillStyle = '#ff7a2e';
  ctx.beginPath();
  ctx.moveTo(top.x + perpX * 3, top.y + perpY * 3);
  ctx.lineTo(tipX + perpX * 1, tipY + perpY * 1);
  ctx.lineTo(tipX - perpX * 1, tipY - perpY * 1);
  ctx.lineTo(top.x - perpX * 3, top.y - perpY * 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(top.x + dx * sockLen * 0.45 + perpX * 2.4, top.y + dy * sockLen * 0.45 + perpY * 2.4);
  ctx.lineTo(tipX + perpX * 1, tipY + perpY * 1);
  ctx.lineTo(tipX - perpX * 1, tipY - perpY * 1);
  ctx.lineTo(top.x + dx * sockLen * 0.45 - perpX * 2.4, top.y + dy * sockLen * 0.45 - perpY * 2.4);
  ctx.closePath();
  ctx.fill();
};

// Touchdown and crash smoke: grey puffs that hang in the air where the
// wheels met the ground, growing and fading, so a landing reads.
FG.drawSmoke = function drawSmoke(ctx, s, project) {
  for (let i = 0; i < s.smoke.length; i += 1) {
    const p = s.smoke[i];
    const age = 1 - p.life / p.maxLife;
    const q = project(p.x, p.y, p.z);
    if (!q) continue;
    const r = Math.max(2, q.scale * p.size * (0.6 + age));
    ctx.fillStyle = `rgba(210,205,195,${(0.5 * (1 - age)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

FG.drawTitle = function drawTitle(ctx, s) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  ctx.fillStyle = 'rgba(6,12,24,0.45)';
  ctx.fillRect(0, 0, W, H);
  FG.text(ctx, 'ALPINE RUNWAY', W / 2, H * 0.24, 64, '#ffffff', 'center');
  FG.text(ctx, 'FLY THE VALLEY  •  THREAD THE RINGS  •  LAND ON THE RUNWAY', W / 2, H * 0.24 + 52, 20, FG.HUD_AMBER, 'center');
  // Mission menu: three missions, picked with 1/2/3 or a click. The
  // selected one is lit; its rects are kept for the click handler.
  const menuY = H * 0.36;
  const menuH = 178;
  FG.panel(ctx, W / 2 - 330, menuY, 660, menuH);
  FG.titleMenu = [];
  FG.MISSIONS.forEach((m, i) => {
    const rowY = menuY + 12 + i * 56;
    const selected = FG.selectedMission === m.id;
    if (selected) {
      ctx.fillStyle = 'rgba(255,176,46,0.14)';
      ctx.fillRect(W / 2 - 318, rowY, 636, 48);
      ctx.fillStyle = FG.HUD_AMBER;
      ctx.fillRect(W / 2 - 318, rowY, 5, 48);
    }
    FG.text(ctx, `${m.num}`, W / 2 - 296, rowY + 24, 22, selected ? FG.HUD_AMBER : '#ffffff', 'center');
    FG.text(ctx, m.name, W / 2 - 268, rowY + 16, 19, selected ? FG.HUD_AMBER : '#ffffff');
    FG.text(ctx, m.tagline, W / 2 - 268, rowY + 38, 14, FG.HUD_CYAN);
    FG.titleMenu.push({ id: m.id, x: W / 2 - 330, y: rowY, w: 660, h: 48 });
  });
  // Controls. On a touch device the keys do not exist, so the panel
  // names the touch controls instead — same panel, same place.
  FG.panel(ctx, W / 2 - 330, menuY + menuH + 14, 660, 118);
  if (FG.isTouch) {
    FG.text(ctx, 'DRAG — STEER      HOLD THR+ / THR- — THROTTLE', W / 2, menuY + menuH + 46, 18, '#ffffff', 'center');
    FG.text(ctx, 'BUTTONS BELOW: PAUSE  •  RESTART  •  COCKPIT VIEW', W / 2, menuY + menuH + 78, 18, '#ffffff', 'center');
    FG.text(ctx, 'TAP A MISSION TO FLY — PUTAR HP KE LANDSCAPE', W / 2, menuY + menuH + 108, 18, '#ffffff', 'center');
  } else {
    FG.text(ctx, 'ARROWS / WASD — PITCH & BANK      MOUSE — STEER', W / 2, menuY + menuH + 46, 18, '#ffffff', 'center');
    FG.text(ctx, 'SHIFT / CTRL — THROTTLE UP / DOWN      WHEEL — THROTTLE', W / 2, menuY + menuH + 78, 18, '#ffffff', 'center');
    FG.text(ctx, 'R — RESTART      P — PAUSE      M — SOUND      C — COCKPIT VIEW', W / 2, menuY + menuH + 108, 18, '#ffffff', 'center');
  }
  if (FG.bestScore > 0) {
    FG.text(ctx, `BEST SCORE  ${FG.bestScore}`, W / 2, menuY + menuH + 148, 18, FG.HUD_AMBER, 'center');
  }
  const pulse = 0.65 + 0.35 * Math.sin(s.time * 4);
  ctx.globalAlpha = pulse;
  FG.text(ctx, FG.isTouch ? 'TAP A MISSION TO FLY' : 'CLICK A MISSION OR PRESS ENTER TO FLY', W / 2, H * 0.92, 26, '#ffffff', 'center');
  ctx.globalAlpha = 1;
};

// The end card says what happened: the reason, the score broken down so
// every decision is visible, and the restart prompt.
FG.drawEnd = function drawEnd(ctx, s, title, sub, color) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  ctx.fillStyle = 'rgba(6,12,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  FG.text(ctx, title, W / 2, H * 0.26, 56, color, 'center');
  FG.text(ctx, sub, W / 2, H * 0.26 + 46, 20, '#ffffff', 'center');
  FG.text(ctx, `${s.missionDef.name}  •  WIND ${Math.round(s.windKt)} KT`, W / 2, H * 0.26 + 76, 16, FG.HUD_CYAN, 'center');
  FG.panel(ctx, W / 2 - 250, H * 0.38, 500, 210);
  const rows = [
    ['RINGS', `${s.ringsPassed} × ${FG.RING_POINTS}`, `+${s.scoreRings}`],
    ['CLOSE PASSES', '', `+${s.scoreClose}`],
    ['LANDING', '', `+${s.scoreLanding}`],
    [s.bonusLabel, s.missionDef.clockStart !== null ? `${Math.round(s.clock)} S LEFT` : `${Math.round(s.fuel)}% LEFT`, `+${s.scoreBonus}`],
    ['DAMAGE', `${Math.round(s.damage)}%`, ''],
  ];
  let y = H * 0.38 + 28;
  rows.forEach((row) => {
    FG.text(ctx, row[0], W / 2 - 226, y, 16, FG.HUD_CYAN);
    FG.text(ctx, row[1], W / 2 - 40, y, 16, '#ffffff', 'right');
    FG.text(ctx, row[2], W / 2 + 226, y, 16, '#ffffff', 'right');
    y += 30;
  });
  FG.text(ctx, `TOTAL  ${s.score}`, W / 2, H * 0.38 + 28 + 30 * 5 + 6, 24, FG.HUD_AMBER, 'center');
  if (s.newBest) {
    FG.text(ctx, '★ NEW BEST! ★', W / 2, H * 0.38 + 28 + 30 * 5 + 36, 20, FG.HUD_AMBER, 'center');
  } else if (FG.bestScore > 0) {
    FG.text(ctx, `BEST  ${FG.bestScore}`, W / 2, H * 0.38 + 28 + 30 * 5 + 36, 18, FG.HUD_CYAN, 'center');
  }
  FG.text(ctx, `TIME ${FG.pad(Math.floor(s.time / 60), 2)}:${FG.pad(Math.floor(s.time % 60), 2)}`, W / 2, H * 0.72, 20, FG.HUD_CYAN, 'center');
  // A touch device has no R key: the restart is the on-screen button.
  FG.text(ctx, FG.isTouch ? 'TAP RESTART BELOW TO FLY AGAIN' : 'PRESS R TO FLY AGAIN', W / 2, H * 0.8, 24, '#ffffff', 'center');
};
