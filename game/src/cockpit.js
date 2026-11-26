// cockpit.js: the cockpit view — one job: the inside of the airplane.
// Toggle with C. The world is the same valley, rings and runway, seen
// through the windshield from the pilot's seat: the chase-view aircraft
// is gone, and the panel carries the instruments. It is genuinely
// playable — same flight model, same controls, same HUD readouts.

FG.cockpit = false;

// One attitude indicator, drawn wherever an instrument belongs: the HUD's
// bottom-left ball and the big one on the cockpit panel are the same
// instrument. Sky above the horizon, ground below it, a pitch ladder, and
// fixed amber wings that never move with the airplane.
FG.drawAttitude = function drawAttitude(ctx, x, y, r, s) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#274b7a';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(FG.deg2rad(-s.roll));
  ctx.translate(0, FG.clamp(s.pitch, -20, 20) * (r / 33));
  ctx.fillStyle = '#274b7a';
  ctx.fillRect(-r - 10, -r - 10, (r + 10) * 2, r + 10);
  ctx.fillStyle = '#7a5a2e';
  ctx.fillRect(-r - 10, 0, (r + 10) * 2, r + 10);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r - 10, 0);
  ctx.lineTo(r + 10, 0);
  ctx.stroke();
  // Pitch ladder: 10° and 20° rungs above and below the horizon.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  [-20, -10, 10, 20].forEach((deg) => {
    const ry = (-deg * r) / 33;
    const half = deg % 20 === 0 ? r * 0.37 : r * 0.23;
    ctx.beginPath();
    ctx.moveTo(-half, ry);
    ctx.lineTo(half, ry);
    ctx.stroke();
  });
  ctx.restore();
  // Fixed wings: the airplane's own wings, which never bank with the ball.
  ctx.strokeStyle = FG.HUD_AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.46, y);
  ctx.lineTo(x - r * 0.14, y);
  ctx.moveTo(x + r * 0.14, y);
  ctx.lineTo(x + r * 0.46, y);
  ctx.beginPath();
  ctx.arc(x, y + 5, 6, 0, Math.PI * 2);
  ctx.stroke();
  // Glass dome: light falling across the top of the instrument.
  const dome = ctx.createRadialGradient(x - r * 0.34, y - r * 0.37, 4, x - r * 0.34, y - r * 0.37, r * 1.2);
  dome.addColorStop(0, 'rgba(255,255,255,0.22)');
  dome.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = dome;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(143,245,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
};

// The cockpit frame: windshield pillars, glare strip, top bar and the
// glareshield the instruments sit in. Drawn BEFORE the HUD, so the lit
// panels paint over the frame instead of hiding behind it.
FG.drawCockpitFrame = function drawCockpitFrame(ctx, s) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  // Sun glare across the top of the windshield.
  const glare = ctx.createLinearGradient(0, 0, 0, 90);
  glare.addColorStop(0, 'rgba(255,190,120,0.20)');
  glare.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, W, 90);
  // Windshield pillars: dark posts slanting out toward the panel, with a
  // thin warm edge where the sunset catches them.
  ctx.fillStyle = '#0a0e16';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(46, 0);
  ctx.lineTo(138, H - 150);
  ctx.lineTo(84, H - 150);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W - 46, 0);
  ctx.lineTo(W - 138, H - 150);
  ctx.lineTo(W - 84, H - 150);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,170,100,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46, 0);
  ctx.lineTo(138, H - 150);
  ctx.moveTo(W - 46, 0);
  ctx.lineTo(W - 138, H - 150);
  ctx.stroke();
  // Top bar of the windshield frame.
  ctx.fillStyle = '#0a0e16';
  ctx.fillRect(0, 0, W, 12);
  // Glareshield: the dark panel the instruments sit in.
  const shield = ctx.createLinearGradient(0, H - 150, 0, H);
  shield.addColorStop(0, '#1a2230');
  shield.addColorStop(0.12, '#10151f');
  shield.addColorStop(1, '#05070c');
  ctx.fillStyle = shield;
  ctx.fillRect(0, H - 150, W, 150);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - 150);
  ctx.lineTo(W, H - 150);
  ctx.stroke();
};

// The panel instruments, drawn AFTER the HUD on the glareshield: the big
// attitude indicator, the throttle quadrant and the mission name.
FG.drawCockpitPanel = function drawCockpitPanel(ctx, s) {
  const W = FG.VIEW_W;
  const H = FG.VIEW_H;
  // The big attitude indicator, centre of the panel.
  FG.drawAttitude(ctx, W / 2, H - 80, 56, s);
  FG.text(ctx, 'ATT', W / 2, H - 12, 11, FG.HUD_CYAN, 'center');
  // Throttle quadrant, right of the panel: a slot with a lever that sits
  // where the throttle sits.
  const qx = W - 300;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(qx, H - 128, 12, 104);
  ctx.fillStyle = FG.HUD_GREEN;
  ctx.fillRect(qx, H - 128 + (1 - s.throttle) * 104, 12, 10);
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.arc(qx + 6, H - 128 + (1 - s.throttle) * 104 + 5, 9, 0, Math.PI * 2);
  ctx.fill();
  FG.text(ctx, 'THR', qx - 8, H - 132, 13, FG.HUD_CYAN, 'right');
  FG.text(ctx, `${Math.round(s.throttle * 100)}%`, qx + 26, H - 132, 13, '#ffffff');
  // Mission name, left of the panel, and the way back to chase view.
  FG.text(ctx, s.missionDef.name, 30, H - 108, 20, FG.HUD_AMBER);
  FG.text(ctx, 'C — CHASE VIEW', 30, H - 80, 14, FG.HUD_CYAN);
  FG.text(ctx, s.missionDef.tagline, 30, H - 56, 13, 'rgba(255,255,255,0.65)');
};
