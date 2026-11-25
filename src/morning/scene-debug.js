import { rideTuning, trialLimitsKmh } from './free-ride.js';
import { HERO_HAIKAZE, heroLocalToWorld } from './coastal-town.js';
import { orders, start } from './orders.js';
import { TOD_ORDER, TOD_PRESETS } from './time-of-day.js';
import { STYLE_ORDER, STYLE_LABELS, getRendererControls } from './render-style.js';

function rideAt(x, z, yaw = 0, extra = {}) {
  return { phase: 'free', mode: 'ride', x, z, bikeX: x, bikeZ: z, yaw, bikeYaw: yaw, ...extra };
}

const shopWalkPt = heroLocalToWorld(1.8, -5.2);
const stairs2FPt = heroLocalToWorld(3.35, -0.80);

export const sceneJumps = {
  haikazeHero: {
    title: '海风庄·全景街角',
    state: rideAt(2.4, 14.0, 0.42, { stand: 1 }),
    camera: {
      fov: 44,
      focus: [8.6, 5.1, 19.8],
      offset: [-11.8, 1.35, -14.6],
    },
  },
  haikazePlay: {
    title: '海风庄·立即骑行',
    state: rideAt(start.x, start.z, start.yaw, { stand: 1 }),
  },
  haikazeShopClose: {
    title: '海风拉面·1F 门面近景',
    state: {
      phase: 'free',
      mode: 'walk',
      x: shopWalkPt.x,
      z: shopWalkPt.z,
      yaw: 0.22,
      bikeX: 2.4,
      bikeZ: 14.0,
      bikeYaw: 0.42,
      stand: 1,
    },
    camera: {
      fov: 42,
      focus: [HERO_HAIKAZE.x - 0.2, 3.85, HERO_HAIKAZE.z - 3.6],
      offset: [-2.0, 0.25, -8.8],
    },
  },
  haikazeStairs2F: {
    title: '海风庄·外挂铁楼梯与 2F 走廊',
    state: {
      phase: 'free',
      mode: 'walk',
      x: stairs2FPt.x,
      z: stairs2FPt.z,
      yaw: -Math.PI * 0.65,
      bikeX: 2.4,
      bikeZ: 14.0,
      bikeYaw: 0.42,
      stand: 1,
    },
    camera: {
      fov: 44,
      focus: [HERO_HAIKAZE.x - 3.6, 5.4, HERO_HAIKAZE.z - 0.2],
      offset: [-6.8, 1.35, -6.2],
    },
  },
  coastalSlope: {
    title: '榕湾观海坡道·下坡看海',
    state: rideAt(0.8, -19.0, 0),
  },
  seawall: {
    title: '海滨观海大道·海岸栈台',
    state: rideAt(2.5, 47.0, Math.PI * 0.46),
  },
  ramenOrder: {
    title: '试玩派单·海风拉面送 201 室',
    state: {
      ...rideAt(2.4, 14.0, 0.42, { stand: 1 }),
      order: orders[0],
      phase: 'pickup',
      mode: 'walk',
      x: shopWalkPt.x,
      z: shopWalkPt.z,
      yaw: 0.1,
    },
  },
  shibaFront: {
    title: '阿柴正面·站姿',
    state: {
      phase: 'free',
      mode: 'walk',
      x: 1.5,
      z: 14.8,
      yaw: Math.PI,
      bikeX: -2.0,
      bikeZ: 14.5,
      bikeYaw: 0.25,
      stand: 1,
    },
    camera: { fov: 36, focus: [1.5, 2.72, 14.8], offset: [0.18, 0.20, -2.75] },
  },
  shibaRide: {
    title: '阿柴骑姿·近景',
    state: rideAt(2.4, 14.0, 0.42, { stand: 1 }),
    camera: { fov: 38, focus: [2.4, 2.84, 14.0], offset: [-2.25, 0.45, -2.35] },
  },
};

export function setupSceneDebug(reset, renderer, state) {
  const panel = document.getElementById('scene-debug');
  const params = new URLSearchParams(location.search);
  const enabled = import.meta.env.DEV || import.meta.env.VITE_SCENE_DEBUG === '1' || params.get('debug') === '1';
  panel.hidden = !enabled;
  const controls = getRendererControls(renderer);
  const timeOfDay = controls?.timeOfDay;
  const renderStyle = controls?.renderStyle;

  if (enabled) {
    if (!document.getElementById('scene-debug-render-css')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'scene-debug-render-css';
      styleEl.textContent = `
        #scene-debug .dbg-heading { display:block; padding:4px 10px 3px; font-size:11px; opacity:.82; letter-spacing:.04em; }
        #scene-debug .dbg-row { display:grid; grid-template-columns:repeat(2,1fr); gap:5px; padding:0 8px 6px; }
        #scene-debug .dbg-row.cols-4 { grid-template-columns:repeat(4,1fr); }
        #scene-debug .dbg-row button { min-height:32px; padding:4px 6px; font-size:12px; font-weight:600; }
        #scene-debug .dbg-row button[aria-pressed="true"] { background:#f7c52a; color:#2b2116; box-shadow:inset 0 0 0 2px #473a30; }
        #scene-debug .dbg-slider { display:flex; align-items:center; gap:6px; padding:0 10px 8px; font-size:11px; font-variant-numeric:tabular-nums; }
        #scene-debug .dbg-slider input { flex:1; accent-color:#f7c52a; }
      `;
      document.head.append(styleEl);
    }

    const groupEl = panel.querySelector('[role=group]');
    if (renderStyle && timeOfDay) {
      const styleHeading = document.createElement('span');
      styleHeading.className = 'dbg-heading';
      styleHeading.textContent = '渲染风格';
      const styleRow = document.createElement('div');
      styleRow.className = 'dbg-row';
      styleRow.setAttribute('aria-label', '选择渲染风格');
      const styleButtons = new Map();
      for (const id of STYLE_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.styleId = id;
        btn.textContent = STYLE_LABELS[id];
        btn.addEventListener('click', () => renderStyle.setStyle(id));
        styleRow.append(btn);
        styleButtons.set(id, btn);
      }

      const todHeading = document.createElement('span');
      todHeading.className = 'dbg-heading';
      todHeading.textContent = '时段光照 (日/夜实时切换)';
      const todRow = document.createElement('div');
      todRow.className = 'dbg-row cols-4';
      todRow.setAttribute('aria-label', '选择时段');
      const todButtons = new Map();
      for (const id of TOD_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.todId = id;
        btn.textContent = TOD_PRESETS[id].label;
        btn.addEventListener('click', () => timeOfDay.setPreset(id));
        todRow.append(btn);
        todButtons.set(id, btn);
      }

      const sliderRow = document.createElement('label');
      sliderRow.className = 'dbg-slider';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.005';
      slider.value = String(timeOfDay.getValue());
      slider.setAttribute('aria-label', '时段连续插值');
      const sliderVal = document.createElement('span');
      sliderVal.textContent = '0.00';
      slider.addEventListener('input', () => timeOfDay.setValue(Number(slider.value)));
      sliderRow.append(slider, sliderVal);

      const syncStyleButtons = active => {
        for (const [id, btn] of styleButtons) btn.setAttribute('aria-pressed', String(id === active));
      };
      const syncTodControls = cur => {
        for (const [id, btn] of todButtons) btn.setAttribute('aria-pressed', String(id === cur.presetId));
        slider.value = String(cur.t.toFixed(3));
        sliderVal.textContent = cur.t.toFixed(2);
      };
      renderStyle.onChange(syncStyleButtons);
      timeOfDay.onChange(syncTodControls);

      const sceneHeading = document.createElement('span');
      sceneHeading.className = 'dbg-heading';
      sceneHeading.textContent = '场景瞬移';
      groupEl.before(styleHeading, styleRow, todHeading, todRow, sliderRow, sceneHeading);

      const qStyle = params.get('style')?.toLowerCase();
      if (qStyle && STYLE_ORDER.includes(qStyle)) renderStyle.setStyle(qStyle);
      const qTod = params.get('tod')?.toLowerCase();
      if (qTod) {
        if (Object.hasOwn(TOD_PRESETS, qTod)) timeOfDay.setPreset(qTod);
        else if (Number.isFinite(Number(qTod))) timeOfDay.setValue(Number(qTod));
      }
      syncStyleButtons(renderStyle.getStyle());
      syncTodControls(timeOfDay.current);
    }

    for (const scene of Object.values(sceneJumps)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = scene.title;
      button.addEventListener('click', () => {
        reset(scene);
        panel.open = false;
        panel.querySelector('summary').focus({ preventScroll: true });
      });
      groupEl.append(button);
    }
  } else if (timeOfDay) {
    // Allow ?tod=night|dusk|noon|morning even in production preview links!
    const qTod = params.get('tod')?.toLowerCase();
    if (qTod && Object.hasOwn(TOD_PRESETS, qTod)) timeOfDay.setPreset(qTod);
  }

  const id = params.get('scene');
  reset(enabled && Object.hasOwn(sceneJumps, id) ? sceneJumps[id] : sceneJumps.haikazeHero);

  const speedButton = document.getElementById('test-speed');
  let speedIndex = 0;
  const showLimit = () => { speedButton.textContent = '切换试骑限速 · ' + trialLimitsKmh[speedIndex] + ' km/h'; };
  showLimit();
  speedButton.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % trialLimitsKmh.length;
    rideTuning.topSpeed = trialLimitsKmh[speedIndex] / 3.6;
    showLimit();
  });

  const readout = document.getElementById('scene-perf');
  let since, frames = 0;
  return function updateStats(now) {
    if (!panel.open || !enabled || document.hidden) {
      since = undefined;
      return;
    }
    speedButton.hidden = state.phase !== 'free';
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
