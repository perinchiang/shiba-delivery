// Keyboard input mapped to game actions. Supports virtual input so automated playtests
// (tools/playtest.mjs, window.__game.input.setVirtual) can drive the game without real key events.

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  horn: ['KeyH', 'KeyF'],
  interact: ['KeyE', 'Enter'],
  phone: ['Tab', 'KeyQ'],
  map: ['KeyM'],
  camera: ['KeyC'],
  lookBack: ['KeyV'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyN'],
  // menu navigation (phone / title / results)
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  confirm: ['Enter', 'KeyE', 'Space'],
  back: ['Escape', 'Backspace'],
  n1: ['Digit1'], n2: ['Digit2'], n3: ['Digit3'], n4: ['Digit4'],
};

export class Input {
  constructor(target = window, bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    this.codes = new Set();      // physical keys currently held
    this.justCodes = new Set();  // keys pressed since last endFrame()
    this.virtual = new Map();    // action -> analog value (0..1) held by a bot
    this.virtualJust = new Set();
    this.enabled = true;
    this._down = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this._isBound(e.code)) e.preventDefault();
      if (!e.repeat) this.justCodes.add(e.code);
      this.codes.add(e.code);
    };
    this._up = (e) => { this.codes.delete(e.code); };
    this._blur = () => { this.codes.clear(); };
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    this._target = target;
    this._bound = new Set(Object.values(bindings).flat());
  }
  _isBound(code) { return this._bound.has(code); }

  /** Is the action currently held? */
  down(action) {
    if (!this.enabled) return false;
    if ((this.virtual.get(action) || 0) > 0.5) return true;
    const b = this.bindings[action];
    if (!b) return false;
    for (const c of b) if (this.codes.has(c)) return true;
    return false;
  }
  /** Was the action pressed this frame (edge)? */
  pressed(action) {
    if (!this.enabled) return false;
    if (this.virtualJust.has(action)) return true;
    const b = this.bindings[action];
    if (!b) return false;
    for (const c of b) if (this.justCodes.has(c)) return true;
    return false;
  }
  /** Analog value 0..1. Keys give 0 or 1; a bot's virtual value is passed through as is. */
  value(action) {
    if (!this.enabled) return 0;
    const v = this.virtual.get(action) || 0;
    let key = 0;
    const b = this.bindings[action];
    if (b) for (const c of b) if (this.codes.has(c)) { key = 1; break; }
    return Math.max(v, key);
  }
  /** -1..1: positive = `pos` action. */
  axis(neg, pos) { return this.value(pos) - this.value(neg); }

  /** Bots: hold an action at an analog value (0 releases). */
  setVirtual(action, v = 1) {
    const was = this.virtual.get(action) || 0;
    if (v > 0.5 && was <= 0.5) this.virtualJust.add(action);
    if (v) this.virtual.set(action, v); else this.virtual.delete(action);
  }
  /** Bots: one-frame press. */
  tap(action) { this.virtualJust.add(action); }
  clearVirtual() { this.virtual.clear(); this.virtualJust.clear(); }

  /** Call once at the end of every frame. */
  endFrame() { this.justCodes.clear(); this.virtualJust.clear(); }

  dispose() {
    this._target.removeEventListener('keydown', this._down);
    this._target.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}
