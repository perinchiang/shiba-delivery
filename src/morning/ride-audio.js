import { noiseSource, oscVoice, fmVoice, midiHz } from '../audio/synth.js';
import { maxTrialSpeed } from './free-ride.js';
import { clamp, smoothstep } from '../core/mathx.js';

export function createRideAudio() {
  let ctx, master, wind, tires, waves, filter;
  let enabled = true, active = false, nextBird = 0, nextNote = 0, beat = 0;
  const melody = [62, 69, 0, 66, 64, 0, 59, 0, 62, 0, 67, 69, 66, 64, 0, 0];
  function noise(kind, hz, type) {
    const gain = ctx.createGain(), tone = ctx.createBiquadFilter();
    gain.gain.value = 0; tone.type = type; tone.frequency.value = hz;
    noiseSource(ctx, kind).connect(tone).connect(gain).connect(master);
    return { gain, tone };
  }
  function wake() {
    if (!active || !enabled || document.hidden || !window.AudioContext) return;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain(); master.gain.value = 0.60; master.connect(ctx.destination);
      const air = noise('pink', 420, 'bandpass'); wind = air.gain; filter = air.tone;
      tires = noise('brown', 890, 'lowpass').gain;
      waves = noise('pink', 680, 'bandpass').gain;
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  function sync() {
    if (active && enabled && !document.hidden) wake();
    else if (ctx) ctx.suspend().catch(() => {});
  }
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  return {
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; sync(); },
    setActive(on) {
      active = on;
      if (!on || navigator.userActivation?.hasBeenActive) sync();
    },
    update(state, modal) {
      if (!active || !enabled || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime, speed = clamp(Math.abs(state.speed) / maxTrialSpeed, 0, 1);
      const seaProximity = smoothstep(10, 52, state.z);
      const hillProximity = 1 - smoothstep(-32, 14, state.z);
      master.gain.setTargetAtTime(modal ? 0.25 : 0.60, t, 0.2);
      wind.gain.setTargetAtTime(0.018 + 0.16 * speed * speed, t, 0.18);
      filter.frequency.setTargetAtTime(340 + speed * 720, t, 0.18);
      tires.gain.setTargetAtTime(speed * 0.11, t, 0.13);
      waves.gain.setTargetAtTime(0.018 + seaProximity * 0.10, t, 0.35);
      if (t >= nextBird) {
        if (hillProximity > 0.2) {
          oscVoice(ctx, master, { t, type: 'sine', f: 1180, f1: 760, glide: 0.15, peak: 0.014 * hillProximity, a: 0.01, d: 0.25 });
        } else if (seaProximity > 0.35) {
          oscVoice(ctx, master, { t, type: 'sine', f: 1420, f1: 1080, glide: 0.22, peak: 0.010 * seaProximity, a: 0.015, d: 0.32 });
        }
        nextBird = t + 3.1 + 0.65 * Math.sin(beat);
      }
      if (t >= nextNote) {
        const note = melody[beat % melody.length];
        if (note) fmVoice(ctx, master, { t, f: midiHz(note), ratio: 2, index: 0.8, index1: 0.05, idxDecay: 0.4, peak: 0.025, a: 0.018, d: 1.35 });
        beat++; nextNote = t + 0.69;
      }
    },
  };
}
