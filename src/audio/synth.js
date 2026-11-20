/**
 * audio/synth.js — low-level Web Audio building blocks shared by every audio module.
 * Everything here takes an explicit (ctx, destination) and explicit start times, so the same code
 * runs on a live AudioContext and on an OfflineAudioContext (see src/dev/audiotest.js).
 *
 * Public API
 *   dbToGain(db), midiHz(midi)
 *   noiseBuffer(ctx, kind = 'white' | 'pink' | 'brown')  -> AudioBuffer (seamless loop, cached per ctx)
 *   noiseSource(ctx, kind, offset01?, rate?)             -> started looping AudioBufferSourceNode
 *   controlBuffer(ctx, seed, seconds, knotsPerSec)       -> slow smooth random signal in -1..1 (cached)
 *   controlSource(ctx, seed, rate, offset01)             -> started looping source of that signal;
 *                                                           connect through a GainNode to an AudioParam
 *   impulseResponse(ctx, opts)                           -> generated stereo reverb IR (cached)
 *   softClipCurve()                                      -> Float32Array for a WaveShaperNode
 *   synthStats                                           { voices (alive now), started (total) }
 *   oscVoice(ctx, dest, o) / fmVoice(ctx, dest, o) / noiseVoice(ctx, dest, o) -> end time (s)
 *       self-cleaning one-shot voices. Common options:
 *         t (start), peak, a (attack s), then EITHER d (exp decay time to -60 dB)
 *         OR hold (s at level, decaying to `sus` x peak) + r (release s);
 *         filter: spec | spec[]  with spec = { type, f, q, f1, glide, gain }; pan (-1..1)
 *       osc:   type, f, f1 (glide target), glide (s), detune (cents), vib { rate, depth (cents), delay }
 *       fm:    f, ratio, index, index1, idxDecay, f1, glide, detune, vib
 *       noise: kind, rate
 *   class Shot(ctx, dest, { gain, pan, send, reverb, seed })   one-shot bus for a multi-voice sound:
 *       .osc(o) .fm(o) .noise(o) -> end time;  .rng;  .seal() -> end time (bus disconnects itself
 *       after the last voice has ended)
 *   createMix(ctx, destination) -> { buses: { sfx, music, musicSend, ambience, motor },
 *       sends: { sfx, ambience } (reverb sends), master, output (last node before the destination),
 *       setVolume(v, at), setMuted(b, at), setPaused(b, at) }
 *       master chain: buses -> DC blocker (24 Hz) -> gentle compressor -> makeup trim -> soft clipper
 *       -> mute -> destination.
 */
import { RNG } from '../core/rng.js';

export const dbToGain = (db) => Math.pow(10, db / 20);
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const store = new WeakMap();
function cached(ctx, key, make) {
  let m = store.get(ctx);
  if (!m) store.set(ctx, (m = new Map()));
  let v = m.get(key);
  if (v === undefined) m.set(key, (v = make()));
  return v;
}

/** Seamlessly looping noise, RMS-normalised to 0.25 so the three colours are comparable. */
export function noiseBuffer(ctx, kind = 'white') {
  return cached(ctx, 'noise:' + kind, () => {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * (kind === 'white' ? 2.9 : 5.3));
    const x = Math.floor(sr * 0.3);
    const rng = new RNG('noise-' + kind);
    const raw = new Float32Array(n + x);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = rng.next() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let y = 0;
      for (let i = 0; i < raw.length; i++) {
        y = 0.995 * y + (rng.next() * 2 - 1) * 0.1;
        raw[i] = y;
      }
    } else {
      for (let i = 0; i < raw.length; i++) raw[i] = rng.next() * 2 - 1;
    }
    const out = new Float32Array(n);
    out.set(raw.subarray(0, n));
    // crossfade the overhang into the head so the loop point is continuous
    for (let i = 0; i < x; i++) {
      const a = i / x;
      out[i] = raw[i] * Math.sqrt(a) + raw[n + i] * Math.sqrt(1 - a);
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[i];
    mean /= n;
    let sq = 0;
    for (let i = 0; i < n; i++) { out[i] -= mean; sq += out[i] * out[i]; }
    const k = 0.25 / Math.sqrt(sq / n);
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i] * k));
    const buf = ctx.createBuffer(1, n, sr);
    buf.copyToChannel(out, 0);
    return buf;
  });
}

export function noiseSource(ctx, kind = 'white', offset01 = 0, rate = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(0, offset01 * (src.buffer.duration - 0.05));
  return src;
}

/** Smooth random control signal (value noise) in -1..1, loopable, stored at 8 kHz. */
export function controlBuffer(ctx, seed = 'a', seconds = 23, knotsPerSec = 5) {
  return cached(ctx, `ctl:${seed}:${seconds}:${knotsPerSec}`, () => {
    const sr = 8000, n = Math.floor(sr * seconds), k = Math.round(seconds * knotsPerSec);
    const rng = new RNG('ctl-' + seed);
    const knots = new Float32Array(k);
    for (let i = 0; i < k; i++) knots[i] = rng.next() * 2 - 1;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = (i / n) * k, i0 = Math.floor(p), f = p - i0;
      const a = knots[i0 % k], b = knots[(i0 + 1) % k];
      data[i] = a + (b - a) * f * f * (3 - 2 * f);
    }
    const buf = ctx.createBuffer(1, n, sr);
    buf.copyToChannel(data, 0);
    return buf;
  });
}

export function controlSource(ctx, seed = 'a', rate = 1, offset01 = 0, knotsPerSec = 5) {
  const src = ctx.createBufferSource();
  src.buffer = controlBuffer(ctx, seed, 23, knotsPerSec);
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(0, offset01 * (src.buffer.duration - 0.05));
  return src;
}

/** Generated reverb impulse: exponentially decaying noise that darkens over time + a few early taps. */
export function impulseResponse(ctx, { seconds = 1.7, bright = 5200, dark = 800, seed = 'street' } = {}) {
  return cached(ctx, `ir:${seed}:${seconds}:${bright}:${dark}`, () => {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const rng = new RNG(`${seed}-${ch}`);
      const d = buf.getChannelData(ch);
      const pre = Math.floor(sr * (0.007 + ch * 0.0013));
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, u = t / seconds;
        const env = Math.exp(-6.9 * u) * Math.min(1, t / 0.006) * Math.min(1, (1 - u) * 20);
        const fc = dark + (bright - dark) * Math.exp(-3.5 * u);
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        lp += a * (rng.next() * 2 - 1 - lp);
        d[i] = lp * env;
      }
      for (let k = 0; k < 6; k++) {
        const i = pre + Math.floor(sr * (0.003 + rng.next() * 0.05));
        d[i] += rng.sign() * 0.35 * (1 - k / 8);
      }
    }
    return buf;
  });
}

/** Transparent below |x| = 0.6, then tanh knee; output never exceeds ~0.9 (no digital clipping). */
export function softClipCurve(n = 4097) {
  const c = new Float32Array(n);
  const knee = 0.6, room = 0.37;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ------------------------------------------------------------------------------------------------
// one-shot voices

/** Live one-shot voice count (debug / leak check: must fall back to 0 when nothing is sounding). */
export const synthStats = { voices: 0, started: 0 };

/** Schedule an amplitude envelope on gain param g; returns the time the voice is fully silent. */
function applyEnv(g, o, t) {
  const a = Math.max(0.001, o.a ?? 0.004);
  const peak = Math.max(1e-5, o.peak ?? 0.2);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  if (o.hold !== undefined) {
    const r = Math.max(0.01, o.r ?? 0.06), sus = o.sus ?? 1;
    const t1 = t + a + Math.max(0.001, o.hold);
    if (sus < 0.999) g.exponentialRampToValueAtTime(Math.max(peak * sus, 1e-5), t1);
    else g.setValueAtTime(peak, t1);
    g.exponentialRampToValueAtTime(Math.max(peak * sus * 0.003, 1e-6), t1 + r);
    g.linearRampToValueAtTime(0, t1 + r + 0.008);
    return t1 + r + 0.008;
  }
  const d = Math.max(0.01, o.d ?? 0.2);
  g.exponentialRampToValueAtTime(peak * 0.001, t + a + d);
  g.linearRampToValueAtTime(0, t + a + d + 0.008);
  return t + a + d + 0.008;
}

function buildFilters(ctx, spec, t, nodes) {
  const list = Array.isArray(spec) ? spec : [spec];
  let first = null, last = null;
  for (const s of list) {
    const f = ctx.createBiquadFilter();
    f.type = s.type || 'lowpass';
    f.frequency.setValueAtTime(s.f, t);
    if (s.f1) f.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? 0.2));
    f.Q.value = s.q ?? 0.707;
    if (s.gain !== undefined) f.gain.value = s.gain;
    if (last) last.connect(f); else first = f;
    last = f;
    nodes.push(f);
  }
  return { first, last };
}

/** Wire src -> [filters] -> env gain -> [pan] -> dest and arrange cleanup when src ends. */
function finishVoice(ctx, dest, src, o, t, nodes, extraSources) {
  const g = ctx.createGain();
  const end = applyEnv(g.gain, o, t);
  nodes.push(g);
  let tail = src;
  if (o.filter) {
    const f = buildFilters(ctx, o.filter, t, nodes);
    tail.connect(f.first);
    tail = f.last;
  }
  tail.connect(g);
  tail = g;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail.connect(p);
    tail = p;
    nodes.push(p);
  }
  tail.connect(dest);
  const stopAt = end + 0.01;
  synthStats.voices++;
  synthStats.started++;
  src.onended = () => {
    synthStats.voices--;
    for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    try { src.disconnect(); } catch { /* already gone */ }
    if (o.onended) o.onended();
  };
  for (const s of extraSources) { s.start(t); s.stop(stopAt); }
  src.stop(stopAt);
  return end;
}

function addVibrato(ctx, o, t, targets, nodes, extra) {
  if (!o.vib) return;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = o.vib.rate ?? 5;
  const depth = ctx.createGain();
  const dly = o.vib.delay ?? 0;
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + dly);
  depth.gain.linearRampToValueAtTime(o.vib.depth ?? 10, t + dly + 0.15);
  lfo.connect(depth);
  for (const p of targets) depth.connect(p);
  nodes.push(depth, lfo);
  extra.push(lfo);
}

export function oscVoice(ctx, dest, o) {
  const t = o.t ?? ctx.currentTime;
  const src = ctx.createOscillator();
  src.type = o.type || 'sine';
  src.frequency.setValueAtTime(o.f, t);
  if (o.f1) src.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? o.d ?? 0.2));
  if (o.detune) src.detune.value = o.detune;
  const nodes = [], extra = [];
  addVibrato(ctx, o, t, [src.detune], nodes, extra);
  src.start(t);
  return finishVoice(ctx, dest, src, o, t, nodes, extra);
}

/** Two-operator FM: sine carrier at f, sine modulator at f * ratio, index decays index -> index1. */
export function fmVoice(ctx, dest, o) {
  const t = o.t ?? ctx.currentTime;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  const ratio = o.ratio ?? 1, fm = o.f * ratio;
  car.frequency.setValueAtTime(o.f, t);
  mod.frequency.setValueAtTime(fm, t);
  if (o.f1) {
    car.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? 0.2));
    mod.frequency.exponentialRampToValueAtTime(o.f1 * ratio, t + (o.glide ?? 0.2));
  }
  if (o.detune) { car.detune.value = o.detune; mod.detune.value = o.detune; }
  const i0 = Math.max(0.001, o.index ?? 1.5), i1 = Math.max(0.001, o.index1 ?? 0.1);
  mg.gain.setValueAtTime(i0 * fm, t);
  mg.gain.exponentialRampToValueAtTime(i1 * fm, t + (o.idxDecay ?? 0.2));
  mod.connect(mg);
  mg.connect(car.frequency);
  const nodes = [mg, mod], extra = [mod];
  addVibrato(ctx, o, t, [car.detune, mod.detune], nodes, extra);
  car.start(t);
  return finishVoice(ctx, dest, car, o, t, nodes, extra);
}

let noiseSeq = 0;
export function noiseVoice(ctx, dest, o) {
  const t = o.t ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.kind || 'white');
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const off = o.offset01 ?? ((noiseSeq = (noiseSeq * 0.618034 + 0.3819) % 1));
  src.start(t, off * (src.buffer.duration - 0.05));
  return finishVoice(ctx, dest, src, o, t, [], []);
}

/**
 * A bus for one multi-voice sound: local gain (+ pan, + reverb send). Voices are created through
 * .osc/.fm/.noise; after seal() the bus disconnects itself when its last voice has ended.
 */
export class Shot {
  constructor(ctx, dest, { gain = 1, pan = 0, send = 0, reverb = null, seed = 1 } = {}) {
    this.ctx = ctx;
    this.rng = new RNG(seed);
    this.in = ctx.createGain();
    this.in.gain.value = gain;
    this._nodes = [this.in];
    let tail = this.in;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p);
      tail = p;
      this._nodes.push(p);
    }
    tail.connect(dest);
    if (send > 0 && reverb) {
      const s = ctx.createGain();
      s.gain.value = send;
      tail.connect(s);
      s.connect(reverb);
      this._nodes.push(s);
    }
    this.pending = 0;
    this.sealed = false;
    this.end = 0;
    this._done = () => { if (--this.pending <= 0 && this.sealed) this.dispose(); };
  }
  _add(fn, o) {
    this.pending++;
    const end = fn(this.ctx, this.in, { ...o, onended: this._done });
    if (end > this.end) this.end = end;
    return end;
  }
  osc(o) { return this._add(oscVoice, o); }
  fm(o) { return this._add(fmVoice, o); }
  noise(o) { return this._add(noiseVoice, { offset01: this.rng.next(), ...o }); }
  seal() {
    this.sealed = true;
    if (this.pending <= 0) this.dispose();
    return this.end;
  }
  dispose() {
    for (const n of this._nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    this._nodes.length = 0;
  }
}

// ------------------------------------------------------------------------------------------------
// master mix

/**
 * Chrome/WebKit/Gecko DynamicsCompressorNode adds automatic make-up gain that depends on the
 * settings; COMP_TRIM cancels it for the settings below (measured offline in audiotest: a quiet
 * 1 kHz tone must come out at the level it went in - see the 'calib' entry of the report).
 */
const COMP = { threshold: -9, knee: 7, ratio: 6, attack: 0.004, release: 0.2 };
export const COMP_TRIM = 0.704;
const MUSIC_OPEN_HZ = 16000, MUSIC_PAUSED_HZ = 650;

export function createMix(ctx, destination, { dynamics = true } = {}) {
  const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const master = gain(1);
  const mute = gain(1);
  if (dynamics) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMP.threshold;
    comp.knee.value = COMP.knee;
    comp.ratio.value = COMP.ratio;
    comp.attack.value = COMP.attack;
    comp.release.value = COMP.release;
    const trim = gain(COMP_TRIM);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    // DC blocker: ratio-1 FM voices (e-piano, bass) carry a small DC term
    const dcBlock = ctx.createBiquadFilter();
    dcBlock.type = 'highpass'; dcBlock.frequency.value = 24; dcBlock.Q.value = 0.707;
    master.connect(dcBlock);
    dcBlock.connect(comp);
    comp.connect(trim);
    trim.connect(clip);
    clip.connect(mute);
  } else {
    master.connect(mute);
  }
  mute.connect(destination);

  // user volumes (bus input gains) and pause ducks (second stage) are separate so they never fight
  const buses = { sfx: gain(1), music: gain(1), musicSend: gain(1), ambience: gain(1), motor: gain(1) };
  const duck = { music: gain(1), ambience: gain(1), motor: gain(1) };
  const musicLP = ctx.createBiquadFilter();
  const sendLP = ctx.createBiquadFilter();
  for (const f of [musicLP, sendLP]) { f.type = 'lowpass'; f.frequency.value = MUSIC_OPEN_HZ; f.Q.value = 0.6; }

  // one shared reverb; every bus has its own send so volume sliders and pause ducks also apply
  // to the reverb tails (a silenced bus must not leave a ghost in the reverb)
  const conv = ctx.createConvolver();
  conv.buffer = impulseResponse(ctx);
  const reverbReturn = gain(0.9);
  conv.connect(reverbReturn);
  reverbReturn.connect(master);
  const sends = { sfx: gain(1), ambience: gain(1) };
  const duckAmbSend = gain(1);
  sends.sfx.connect(conv);
  sends.ambience.connect(duckAmbSend); duckAmbSend.connect(conv);

  buses.sfx.connect(master);
  buses.motor.connect(duck.motor); duck.motor.connect(master);
  buses.ambience.connect(duck.ambience); duck.ambience.connect(master);
  buses.music.connect(musicLP); musicLP.connect(duck.music); duck.music.connect(master);
  buses.musicSend.connect(sendLP); sendLP.connect(conv);

  const vol = { master: 1, sfx: 1, music: 1, ambience: 1 };
  let muted = false;
  const now = (at) => (at === undefined ? ctx.currentTime : at);
  return {
    ctx, buses, sends, master, output: mute,
    setVolume(v = {}, at) {
      for (const k of Object.keys(vol)) if (Number.isFinite(v[k])) vol[k] = Math.max(0, Math.min(1.5, v[k]));
      const t = now(at);
      master.gain.setTargetAtTime(vol.master, t, 0.03);
      buses.sfx.gain.setTargetAtTime(vol.sfx, t, 0.03);
      sends.sfx.gain.setTargetAtTime(vol.sfx, t, 0.03);
      sends.ambience.gain.setTargetAtTime(vol.ambience, t, 0.03);
      buses.motor.gain.setTargetAtTime(vol.sfx, t, 0.03);
      buses.music.gain.setTargetAtTime(vol.music, t, 0.03);
      buses.musicSend.gain.setTargetAtTime(vol.music, t, 0.03);
      buses.ambience.gain.setTargetAtTime(vol.ambience, t, 0.03);
    },
    setMuted(b, at) {
      muted = !!b;
      mute.gain.setTargetAtTime(muted ? 0 : 1, now(at), 0.02);
    },
    /** Phone open: motor fades out, ambience ducks, music goes muffled; sfx stay for the UI. */
    setPaused(b, at) {
      const t = now(at);
      duck.motor.gain.setTargetAtTime(b ? 0 : 1, t, b ? 0.05 : 0.12);
      duck.ambience.gain.setTargetAtTime(b ? 0.12 : 1, t, b ? 0.07 : 0.2);
      duckAmbSend.gain.setTargetAtTime(b ? 0.12 : 1, t, b ? 0.07 : 0.2);
      duck.music.gain.setTargetAtTime(b ? 0.75 : 1, t, 0.1);
      for (const f of [musicLP, sendLP]) f.frequency.setTargetAtTime(b ? MUSIC_PAUSED_HZ : MUSIC_OPEN_HZ, t, b ? 0.08 : 0.15);
    },
    get volume() { return { ...vol }; },
    get muted() { return muted; },
  };
}
