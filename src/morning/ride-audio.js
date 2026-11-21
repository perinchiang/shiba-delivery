import { noiseSource, oscVoice, fmVoice, midiHz } from '../audio/synth.js';
import { clamp, smoothstep } from '../core/mathx.js';

// Unlock inside a gesture. The mixer is shared for the entire ride and suspended
// when leaving it or hiding the tab, including its continuously looping sources.
export function createRideAudio() {
  let ctx, master, wind, tires, water, filter;
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
      master = ctx.createGain(); master.gain.value = .62; master.connect(ctx.destination);
      const air = noise('pink', 420, 'bandpass'); wind = air.gain; filter = air.tone;
      tires = noise('brown', 890, 'lowpass').gain;
      water = noise('pink', 1450, 'bandpass').gain;
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  function sync() {
    if (active && enabled && !document.hidden) wake();
    else if (ctx) ctx.suspend().catch(() => {});
  }
  document.addEventListener('visibilitychange', sync);
  // Deep-linked debug scenes may start before the browser has a user gesture.
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
      const t = ctx.currentTime, speed = clamp(Math.abs(state.speed)/9, 0, 1);
      const river = smoothstep(820, 902, state.x)*(1-smoothstep(945, 1010, state.x));
      const field = smoothstep(165, 242, state.x)*(1-smoothstep(820, 907, state.x));
      master.gain.setTargetAtTime(modal ? .25 : .62,t,.2);
      wind.gain.setTargetAtTime(.018+.17*speed*speed,t,.18);
      filter.frequency.setTargetAtTime(340+speed*740,t,.18);
      tires.gain.setTargetAtTime(speed*(.11 + river*.05),t,.13);
      water.gain.setTargetAtTime(river*.16,t,.35);
      if (t >= nextBird) {
        if (field > .05) {
          for (let i=0;i<3;i++) fmVoice(ctx,master,{t:t+i*.125,f:390+i*18,ratio:1.5,index:1.2,peak:.025*field,a:.012,d:.09});
        } else if (state.x < 170) {
          oscVoice(ctx,master,{t,type:'sine',f:1170,f1:740,glide:.15,peak:.013,a:.01,d:.25});
        }
        nextBird=t+2.8+.65*Math.sin(beat);
      }
      if (t >= nextNote) {
        const note = melody[beat%melody.length];
        if (note) fmVoice(ctx,master,{t,f:midiHz(note),ratio:2,index:.8,index1:.05,idxDecay:.4,peak:.027,a:.018,d:1.35});
        beat++; nextNote=t+.69;
      }
    },
  };
}
