import { orders, start, bunFacade } from './orders.js';

const pharmacy = orders.find(order => order.id === 'pharmacy');
const buns = orders.find(order => order.id === 'buns');
const parked = x => ({ bikeX: x, bikeZ: start.z, yaw: Math.PI });
const atCounter = order => ({
  order, mode: 'shop', phase: 'pickup', x: order.room.counter.x, z: .42, ...parked(order.door.x),
});
const bakeryFront = {
  order: buns, mode: 'walk', phase: 'pickup', x: bunFacade.x + 1.55, z: .16, ...parked(buns.door.x + 1),
};

// State overrides are applied to a fresh delivery. Optional camera presets are cleared on movement.
export const sceneJumps = {
  street: { title: '老街起点' },
  pharmacy: { title: '药店门口', state: { order: pharmacy, mode: 'walk', phase: 'pickup',
    x: pharmacy.door.x, z: -.32, ...parked(pharmacy.door.x) } },
  counter: { title: '药店柜台', state: atCounter(pharmacy) },
  home: { title: '猫婆婆家', state: { order: pharmacy, mode: 'walk', phase: 'delivery', cargo: 'hand',
    x: pharmacy.customer.point.x, z: -.25, ...parked(pharmacy.customer.point.x) } },
  buns: { title: '包子铺门面', state: bakeryFront,
    camera: { height: 4.9, width: 7.05, focus: [bunFacade.x, 2.26, -1.74], offset: [1.3, 2, 10] } },
  bunCounter: { title: '包子铺柜台', state: atCounter(buns) },
  steamers: { title: '包子铺蒸笼', state: bakeryFront,
    camera: { height: 2.1, width: 3.65, focus: [bunFacade.x - 1.07, 1.54, -1.74], offset: [1.8, 4.8, 10] } },
};

export function setupSceneDebug(reset, renderer) {
  const panel = document.getElementById('scene-debug');
  const params = new URLSearchParams(location.search);
  const enabled = import.meta.env.DEV || import.meta.env.VITE_SCENE_DEBUG === '1' || params.get('debug') === '1';
  panel.hidden = !enabled;
  if (enabled) {
    for (const scene of Object.values(sceneJumps)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = scene.title;
      button.addEventListener('click', () => {
        reset(scene);
        panel.open = false;
        panel.querySelector('summary').focus({ preventScroll: true });
      });
      panel.querySelector('[role=group]').append(button);
    }
  }
  const id = params.get('scene');
  reset(enabled && Object.hasOwn(sceneJumps, id) ? sceneJumps[id] : sceneJumps.street);

  const readout = document.getElementById('scene-perf');
  let since, frames = 0;
  return function updateStats(now) {
    if (!panel.open || !enabled || document.hidden) {
      since = undefined;
      return;
    }
    if (since === undefined) {
      since = now;
      frames = 0;
      return;
    }
    frames++;
    const elapsed = now - since;
    if (elapsed >= 500) {
      readout.textContent = Math.round(frames * 1000 / elapsed) + ' FPS · ' + renderer.info.render.calls + ' draw calls';
      since = now;
      frames = 0;
    }
  };
}
