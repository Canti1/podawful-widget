// Synthesized smoke-detector alarm: piercing ~3.1 kHz tone in the classic
// "three beeps, pause" pattern, played twice. No audio file needed.
let ctx;

function playAlarm(volume = 0.7) {
  ctx = ctx || new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume)) * 0.35; // square waves are loud
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6000;
  lp.connect(out).connect(ctx.destination);

  const start = ctx.currentTime + 0.05;
  const beep = 0.5, gap = 0.25, roundGap = 1.2;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 3; i++) {
      const t = start + round * (3 * (beep + gap) + roundGap) + i * (beep + gap);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 3100;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.01);
      env.gain.setValueAtTime(1, t + beep - 0.01);
      env.gain.linearRampToValueAtTime(0, t + beep);
      osc.connect(env).connect(lp);
      osc.start(t);
      osc.stop(t + beep + 0.02);
    }
  }
}

window.playAlarm = playAlarm;
