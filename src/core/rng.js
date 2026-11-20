// Deterministic seeded randomness. Never use Math.random() in world generation:
// the same district description + seed must always produce the same neighborhood.

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9;
  }
  /** float in [0,1) */
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float in [a,b) */
  range(a = 0, b = 1) { return a + (b - a) * this.next(); }
  /** integer in [a,b] inclusive */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  /** roughly normal(0,1) */
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508; }
  /** pick index by weights */
  weightedIndex(weights) {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  }
  /** pick from [{w: weight, ...}] or with a weight accessor */
  weighted(items, getW = (it) => it.w ?? 1) { return items[this.weightedIndex(items.map(getW))]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** independent child stream; same label always gives the same stream for the same parent seed */
  fork(label) { return new RNG(hash2(this.s, hashStr(label))); }
}

/** Convenience: stable RNG from any mix of numbers/strings. */
export const rngFrom = (...parts) => new RNG(hashStr(parts.join('|')));
