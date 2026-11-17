// Synthesized smoke-detector "low battery" chirp: a single short, piercing
// piezo chirp (~3.3 kHz, ~60 ms, fast decay). A real detector chirps once
// every ~40 s; the alert is one chirp, just like the real thing. No audio file needed.
let ctx;

function playAlarm(volume = 0.7) {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume)) * 0.45;
  // Piezo buzzers resonate in a narrow band; a bandpass gives that hard "chirp" edge.
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3300;
  bp.Q.value = 4;
  bp.connect(out).connect(ctx.destination);

  const start = ctx.currentTime + 0.05;
  const chirp = 0.06, spacing = 1.4, count = 1;
  for (let i = 0; i < count; i++) {
    const t = start + i * spacing;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(3350, t);
    osc.frequency.linearRampToValueAtTime(3250, t + chirp); // tiny droop, like a real piezo
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.004);
    env.gain.setValueAtTime(1, t + chirp * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, t + chirp);
    osc.connect(env).connect(bp);
    osc.start(t);
    osc.stop(t + chirp + 0.02);
  }
}

window.playAlarm = playAlarm;
