import * as THREE from 'three';
import { $ } from './dom.js';
import { createWorld } from './world.js';
import { createRideAudio } from './ride-audio.js';
import { createView } from './view.js';
import { createDelivery, initialState } from './delivery.js';
import { createControls } from './controls.js';
import { createMovement } from './movement.js';
import { createHUD } from './hud.js';
import { setupSceneDebug } from './scene-debug.js';
import './style.css';

async function run(renderer) {
  const world = await createWorld(renderer);
  const state = initialState();
  const view = createView(renderer, state, world);
  const controls = createControls();
  const movement = createMovement(state, world, controls.input);
  const delivery = createDelivery(state);
  const rideAudio = createRideAudio();
  const hud = createHUD(state, delivery, view, world, controls, reset, rideAudio);

  function reset(scene) {
    hud.close();
    Object.assign(state, initialState(), scene?.state);
    rideAudio.setActive(state.phase === 'free');
    controls.releaseStick();
    controls.input.clearVirtual();
    movement.reset();
    view.reset(scene?.camera);
    hud.sync();
  }
  const updateStats = setupSceneDebug(reset, renderer, state);
  window.addEventListener('resize', () => { controls.releaseStick(); view.resize(); });
  view.resize();

  let previous, time = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - (previous ?? now)) / 1000, .05);
    previous = now;
    time += dt;
    movement.move(dt, hud.modalOpen, view.clearInspection);
    hud.sync();
    rideAudio.update(state, hud.modalOpen);
    view.draw(dt, time, movement);
    updateStats(now);
    controls.input.endFrame();
    if (!window.__ready) {
      $('loading').hidden = true;
      $('hud').hidden = false;
      window.__ready = true;
    }
  });
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').textContent = '这个 3D 小样需要 WebGL 2。请开启浏览器硬件加速，再刷新页面。';
}
if (renderer) run(renderer).catch(error => {
  console.error(error);
  $('loading').textContent = '游戏资源加载失败，请刷新重试。';
});
