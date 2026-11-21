import { Input } from '../core/input.js';
import { clamp } from '../core/mathx.js';
import { $ } from './dom.js';

export function createControls() {
  const input = new Input(window, {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  });
  const stick = $('joystick'), thumb = stick.querySelector('.stick-thumb');
  let stickPointer = null;
  function releaseStick() {
    if (stickPointer === null) return;
    const id = stickPointer;
    stickPointer = null;
    if (stick.hasPointerCapture(id)) stick.releasePointerCapture(id);
    thumb.style.transform = '';
    for (const action of ['up', 'down', 'left', 'right']) input.setVirtual(action, 0);
  }
  function dragStick(event) {
    if (event.pointerId !== stickPointer) return;
    const rect = stick.getBoundingClientRect();
    const radius = (rect.width - thumb.offsetWidth) / 2;
    if (radius <= 0) return releaseStick();
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = (event.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(x, y);
    const limit = Math.max(1, distance);
    thumb.style.transform = `translate(${radius * x / limit}px, ${radius * y / limit}px)`;
    // A small central dead zone lets the thumb rest without creeping.
    const power = clamp((distance - .14) / .86, 0, 1) / (distance || 1);
    input.setVirtual('left', Math.max(0, -x * power));
    input.setVirtual('right', Math.max(0, x * power));
    input.setVirtual('up', Math.max(0, -y * power));
    input.setVirtual('down', Math.max(0, y * power));
  }
  stick.addEventListener('pointerdown', event => {
    if (event.button !== 0 || stickPointer !== null || stick.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture(stickPointer);
    dragStick(event);
  });
  stick.addEventListener('pointermove', dragStick);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, event => { if (stickPointer === event.pointerId) releaseStick(); });
  }
  window.addEventListener('blur', releaseStick);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseStick(); });
  for (const type of ['contextmenu', 'selectstart']) {
    $('game').addEventListener(type, event => event.preventDefault());
  }
  return { input, stick, releaseStick };
}
