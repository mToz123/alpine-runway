// audio.js: every sound is synthesized with WebAudio — no audio files,
// no network. The context is created on the first user gesture.

FG.audio = {
  ctx: null,
  master: null,
  engineOsc: null,
  engineGain: null,
  muted: false,
};

FG.audioInit = function audioInit() {
  if (FG.audio.ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    FG.audio.ctx = ctx;
    FG.audio.master = master;
    FG.audio.engineOsc = osc;
    FG.audio.engineGain = gain;
  } catch (err) {
    FG.audio.ctx = null;
  }
};

FG.audioEngine = function audioEngine(s) {
  const a = FG.audio;
  if (!a.ctx || a.muted) return;
  const target = s.status === 'flying' ? 0.05 + s.throttle * 0.06 : 0;
  a.engineGain.gain.setTargetAtTime(target, a.ctx.currentTime, 0.1);
  // Pitch follows speed and throttle: spooling up is heard as well as seen.
  a.engineOsc.frequency.setTargetAtTime(45 + s.speed * 0.3 + s.throttle * 25, a.ctx.currentTime, 0.1);
};

FG.audioBeep = function audioBeep(freq, dur, type, vol, when) {
  const a = FG.audio;
  if (!a.ctx || a.muted) return;
  const t0 = a.ctx.currentTime + (when || 0);
  const osc = a.ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol || 0.25, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(a.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
};

FG.audioRing = function audioRing() {
  FG.audioBeep(880, 0.18, 'sine', 0.3, 0);
  FG.audioBeep(1318, 0.3, 'sine', 0.25, 0.09);
};

FG.audioCrash = function audioCrash() {
  FG.audioBeep(90, 0.5, 'sawtooth', 0.4, 0);
  FG.audioBeep(55, 0.7, 'square', 0.25, 0.05);
};

FG.audioLand = function audioLand() {
  [523, 659, 784, 1046].forEach((f, i) => FG.audioBeep(f, 0.25, 'triangle', 0.25, i * 0.12));
};

FG.audioToggleMute = function audioToggleMute() {
  const a = FG.audio;
  a.muted = !a.muted;
  if (a.master) a.master.gain.value = a.muted ? 0 : 0.5;
  return a.muted;
};
