// render.js: everything the player sees — sky, mountains, terrain mesh,
// runway, rings, clouds, the chase-view aircraft and the HUD. Pure canvas 2D,
// no images, no network. All world points go through FG.project, a small
// perspective projector with yaw / pitch / roll.

FG.projector = function projector(s) {
  const f = (FG.VIEW_H / 2) / Math.tan(FG.deg2rad(FG.FOV_DEG) / 2);
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
  const g = ctx.createLinearGradient(0, 0, 0, FG.VIEW_H);
  g.addColorStop(0, FG.SKY_TOP);
  g.addColorStop(0.42, FG.SKY_MID);
  g.addColorStop(0.55, FG.SKY_HORIZON);
  g.addColorStop(1, '#274028');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FG.VIEW_W, FG.VIEW_H);
  // Low sun ahead, slightly left.
  const sun = project(s.x - 260, s.alt + 900, s.z + 6000);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    glow.addColorStop(0, 'rgba(255,217,160,0.95)');
    glow.addColorStop(0.35, 'rgba(255,170,90,0.55)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FG.SUN_COLOR;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
};

// Two far ridge silhouettes, parallaxed by heading.
FG.drawRidges = function drawRidges(ctx, s) {
  const horizonY = FG.VIEW_H * 0.52 - ((FG.VIEW_H / 2) / Math.tan(FG.deg2rad(FG.FOV_DEG) / 2)) * Math.tan(FG.deg2rad(s.pitch * 0.35));
  const layers = [
    { parallax: 0.12, base: 150, amp: 120, color: '#5d6f96' },
    { parallax: 0.3, base: 90, amp: 170, color: '#3c4a68' },
  ];
  ctx.save();
  ctx.translate(FG.VIEW_W / 2, horizonY);
  ctx.rotate(FG.deg2rad(-s.roll * 0.6));
  ctx.translate(-FG.VIEW_W / 2, -horizonY);
  for (let li = 0; li < layers.length; li += 1) {
    const L = layers[li];
    ctx.fillStyle = L.color;
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

// The valley floor as a projected grid of quads, far to near, with a
// patchwork of fields, a river and fog toward the horizon.
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
  for (let ri = rows.length - 1; ri > 0; ri -= 1) {
    const z0 = rows[ri - 1];
    const z1 = rows[ri];
    const fog = FG.clamp((z1 - s.z) / 3400, 0, 1);
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const p00 = project(x0, FG.terrainHeight(x0, z0), z0);
      const p10 = project(x1, FG.terrainHeight(x1, z0), z0);
      const p11 = project(x1, FG.terrainHeight(x1, z1), z1);
      const p01 = project(x0, FG.terrainHeight(x0, z1), z1);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const midH = FG.terrainHeight((x0 + x1) / 2, (z0 + z1) / 2);
      let color;
      if (midH > 1500) color = FG.SNOW;
      else if (midH > 700) color = FG.hexLerp(FG.ROCK, FG.SNOW, (midH - 700) / 800);
      else if (midH > 260) color = FG.hexLerp(FG.GRASS_DARK, FG.ROCK, (midH - 260) / 440);
      else {
        const patch = (Math.floor(x0 / 80) + Math.floor(z0 / 80)) % 2 === 0;
        color = patch ? FG.FIELD_A : FG.FIELD_B;
      }
      // A whisper of variation so the mesh never looks flat.
      const vary = FG.ridgeNoise(s.seed, Math.floor(x0 / 80) * 0.37 + Math.floor(z0 / 80) * 0.11) - 0.5;
      color = FG.hexLerp(color, vary > 0 ? '#ffffff' : '#000000', Math.abs(vary) * 0.12);
      color = FG.hexLerp(color, FG.SKY_HORIZON, fog * 0.35);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
    // River ribbon on this row.
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
    }
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
  for (let i = 0; i < 26; i += 1) {
    const cx = (rand() - 0.5) * 2600;
    const cy = 1800 + rand() * 1600;
    const cz = s.z + 400 + rand() * 9000;
    const p = project(cx, cy, cz);
    if (!p || p.d < 100) continue;
    const r = p.scale * 220;
    if (r < 4 || r > 700) continue;
    // Soft sunset-lit puffs: radial gradients, never hard-edged.
    const puffs = [
      [0, 0, 1],
      [-0.55, 0.1, 0.62],
      [0.55, 0.08, 0.58],
    ];
    for (let j = 0; j < puffs.length; j += 1) {
      const px = p.x + puffs[j][0] * r;
      const py = p.y + puffs[j][1] * r;
      const pr = r * puffs[j][2];
      const g = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
      g.addColorStop(0, 'rgba(255,244,230,0.85)');
      g.addColorStop(0.7, 'rgba(255,236,220,0.45)');
      g.addColorStop(1, 'rgba(255,236,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// The chase-view aircraft, drawn in screen space, banked with the roll.
// A compact jet seen from behind and slightly above: short foreshortened
// fuselage, wide swept wings, tailplane and fin, lit canopy and nav lights.
FG.drawPlane = function drawPlane(ctx, s) {
  const cx = FG.VIEW_W / 2 + s.roll * 1.1;
  const cy = FG.VIEW_H * 0.68 + s.pitch * 1.2;
  const blink = Math.floor(s.time * 2) % 2 === 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(FG.deg2rad(s.roll * 0.85));
  // Main wings: wide, swept back a touch, dark slate.
  ctx.fillStyle = '#3d4a63';
  ctx.beginPath();
  ctx.moveTo(-12, -6);
  ctx.lineTo(-152, 26);
  ctx.lineTo(-146, 46);
  ctx.lineTo(-10, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, -6);
  ctx.lineTo(152, 26);
  ctx.lineTo(146, 46);
  ctx.lineTo(10, 22);
  ctx.closePath();
  ctx.fill();
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
  ctx.fillStyle = '#46587a';
  ctx.beginPath();
  ctx.moveTo(-8, 40);
  ctx.lineTo(0, 4);
  ctx.lineTo(8, 40);
  ctx.closePath();
  ctx.fill();
  // Fuselage: short and tapered, nose away from the viewer.
  const body = ctx.createLinearGradient(-14, 0, 14, 0);
  body.addColorStop(0, '#8fa3c4');
  body.addColorStop(0.5, '#e8eef7');
  body.addColorStop(1, '#7c8dab');
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
  // Canopy.
  ctx.fillStyle = '#101c2e';
  ctx.beginPath();
  ctx.ellipse(0, -30, 8, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.75)';
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
  // Top-left: altitude, speed, vertical speed.
  FG.panel(ctx, 18, 16, 218, 108);
  FG.text(ctx, 'ALT', 34, 38, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(s.alt, 5)} FT`, 34, 66, 26, '#ffffff');
  FG.text(ctx, 'SPD', 34, 96, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(s.speed, 3)} KT`, 118, 96, 20, '#ffffff');
  // Top-centre: compass tape.
  FG.panel(ctx, W / 2 - 190, 16, 380, 56);
  const hdg = ((s.heading % 360) + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 190, 16, 380, 56);
  ctx.clip();
  for (let d = -45; d <= 45; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const off = (deg - hdg) * 3.2;
    const x = W / 2 + off;
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
  FG.text(ctx, 'HDG', W / 2 - 178, 30, 13, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(hdg, 3)}°`, W / 2 + 148, 44, 18, '#ffffff', 'right');
  ctx.fillStyle = FG.HUD_AMBER;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7, 18);
  ctx.lineTo(W / 2 + 7, 18);
  ctx.lineTo(W / 2, 30);
  ctx.closePath();
  ctx.fill();
  // Top-right: throttle + score.
  FG.panel(ctx, W - 236, 16, 218, 108);
  FG.text(ctx, 'THR', W - 220, 38, 15, FG.HUD_CYAN);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 220, 52, 186, 12);
  ctx.fillStyle = s.throttle > 0.85 ? FG.HUD_RED : FG.HUD_GREEN;
  ctx.fillRect(W - 220, 52, 186 * s.throttle, 12);
  FG.text(ctx, `${Math.round(s.throttle * 100)}%`, W - 220, 82, 16, '#ffffff');
  FG.text(ctx, 'SCORE', W - 220, 106, 15, FG.HUD_CYAN);
  FG.text(ctx, String(s.score), W - 148, 106, 20, '#ffffff');
  // Bottom-left: attitude indicator (lit instruments).
  const ax = 78;
  const ay = H - 78;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, 56, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#274b7a';
  ctx.fillRect(ax - 56, ay - 56, 112, 112);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(FG.deg2rad(-s.roll));
  ctx.translate(0, FG.clamp(s.pitch, -20, 20) * 1.6);
  ctx.fillStyle = '#274b7a';
  ctx.fillRect(-60, -60, 120, 60);
  ctx.fillStyle = '#7a5a2e';
  ctx.fillRect(-60, 0, 120, 60);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-60, 0);
  ctx.lineTo(60, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = FG.HUD_AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax - 26, ay);
  ctx.lineTo(ax - 8, ay);
  ctx.moveTo(ax + 8, ay);
  ctx.lineTo(ax + 26, ay);
  ctx.beginPath();
  ctx.arc(ax, ay + 4, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(143,245,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, 56, 0, Math.PI * 2);
  ctx.stroke();
  FG.text(ctx, 'ATT', ax, ay + 72, 12, FG.HUD_CYAN, 'center');
  // Bottom-right: rings + time.
  FG.panel(ctx, W - 236, H - 96, 218, 78);
  FG.text(ctx, 'RINGS', W - 220, H - 74, 15, FG.HUD_CYAN);
  FG.text(ctx, `${s.ringsPassed}/${FG.RING_COUNT}`, W - 148, H - 74, 20, '#ffffff');
  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60);
  FG.text(ctx, 'TIME', W - 220, H - 42, 15, FG.HUD_CYAN);
  FG.text(ctx, `${FG.pad(mins, 2)}:${FG.pad(secs, 2)}`, W - 148, H - 42, 20, '#ffffff');
  // Next-target readout + edge chevron.
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
    H - 34,
    17,
    target.ring ? FG.HUD_CYAN : FG.HUD_GREEN,
    'center',
  );
  // Flash message.
  if (s.flash > 0 || s.time < s.messageUntil) {
    ctx.globalAlpha = FG.clamp(s.flash * 1.4, 0.25, 1);
    FG.text(ctx, s.message, W / 2, H * 0.3, 34, FG.HUD_AMBER, 'center');
    ctx.globalAlpha = 1;
  }
  // Warnings.
  if (s.stall && s.status === 'flying') {
    const on = Math.floor(s.time * 4) % 2 === 0;
    if (on) FG.text(ctx, '!! STALL — NOSE DOWN, THROTTLE UP !!', W / 2, 96, 22, FG.HUD_RED, 'center');
  } else if (s.terrainWarn && s.status === 'flying') {
    FG.text(ctx, 'TERRAIN — PULL UP', W / 2, 96, 22, FG.HUD_AMBER, 'center');
  }
};

// Full frame: world then HUD, plus the title / end screens.
FG.drawFrame = function drawFrame(ctx, s) {
  const project = FG.projector(s);
  FG.drawSky(ctx, s, project);
  FG.drawRidges(ctx, s);
  FG.drawGround(ctx, s, project);
  FG.drawRunway(ctx, s, project);
  FG.drawClouds(ctx, s, project);
  FG.drawRings(ctx, s, project);
  FG.drawPlane(ctx, s);
  FG.drawHUD(ctx, s);
  if (s.status === 'title') FG.drawTitle(ctx, s);
  else if (s.status === 'crashed') FG.drawEnd(ctx, s, 'CRASHED', s.statusReason, FG.HUD_RED);
  else if (s.status === 'landed') FG.drawEnd(ctx, s, 'TOUCHDOWN!', `RUNWAY LANDING  +${FG.LANDING_POINTS} PTS`, FG.HUD_GREEN);
  else if (s.status === 'done') FG.drawEnd(ctx, s, s.statusReason, 'PRESS R TO FLY AGAIN', FG.HUD_CYAN);
};

FG.drawTitle = function drawTitle(ctx, s) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  ctx.fillStyle = 'rgba(6,12,24,0.45)';
  ctx.fillRect(0, 0, W, H);
  FG.text(ctx, 'ALPINE RUNWAY', W / 2, H * 0.3, 64, '#ffffff', 'center');
  FG.text(ctx, 'FLY THE VALLEY  •  THREAD 10 RINGS  •  LAND ON THE RUNWAY', W / 2, H * 0.3 + 52, 20, FG.HUD_AMBER, 'center');
  FG.panel(ctx, W / 2 - 330, H * 0.46, 660, 150);
  FG.text(ctx, 'ARROWS / WASD — PITCH & BANK      MOUSE — STEER', W / 2, H * 0.46 + 34, 18, '#ffffff', 'center');
  FG.text(ctx, 'SHIFT / CTRL — THROTTLE UP / DOWN      WHEEL — THROTTLE', W / 2, H * 0.46 + 66, 18, '#ffffff', 'center');
  FG.text(ctx, 'R — RESTART      P — PAUSE      M — SOUND', W / 2, H * 0.46 + 98, 18, '#ffffff', 'center');
  FG.text(ctx, 'FLY THROUGH EVERY RING, THEN SET HER DOWN GENTLY', W / 2, H * 0.46 + 128, 16, FG.HUD_CYAN, 'center');
  const pulse = 0.65 + 0.35 * Math.sin(s.time * 4);
  ctx.globalAlpha = pulse;
  FG.text(ctx, 'PRESS ENTER OR CLICK TO FLY', W / 2, H * 0.78, 26, '#ffffff', 'center');
  ctx.globalAlpha = 1;
};

FG.drawEnd = function drawEnd(ctx, s, title, sub, color) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  ctx.fillStyle = 'rgba(6,12,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  FG.text(ctx, title, W / 2, H * 0.36, 56, color, 'center');
  FG.text(ctx, sub, W / 2, H * 0.36 + 48, 20, '#ffffff', 'center');
  FG.text(ctx, `SCORE ${s.score}   •   RINGS ${s.ringsPassed}/${FG.RING_COUNT}   •   TIME ${FG.pad(Math.floor(s.time / 60), 2)}:${FG.pad(Math.floor(s.time % 60), 2)}`, W / 2, H * 0.52, 22, FG.HUD_CYAN, 'center');
  FG.text(ctx, 'PRESS R TO FLY AGAIN', W / 2, H * 0.66, 24, '#ffffff', 'center');
};
