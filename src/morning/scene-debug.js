import { rideTuning, trialLimitsKmh } from './free-ride.js';
import { centerZ, roadYaw, landmarks } from './country-route.js';
import { COASTAL_SAMPLE, hillRoadPoint } from './coastal-sample.js';
import { COASTAL_TOWN } from './coastal-town.js';
import { streetTreeXs, treePitZ } from './street-layout.js';
import { orders, start, bunFacade } from './orders.js';
import { TOD_ORDER, TOD_PRESETS } from './time-of-day.js';
import { STYLE_ORDER, STYLE_LABELS, getRendererControls } from './render-style.js';

const pharmacy = orders.find(order => order.id === 'pharmacy');
const buns = orders.find(order => order.id === 'buns');
const parked = x => ({ bikeX: x, bikeZ: start.z, yaw: Math.PI });
const atCounter = order => ({
  order, mode: 'shop', phase: 'pickup', x: order.room.counter.x, z: .42, ...parked(order.door.x),
});
const bakeryFront = {
  order: buns, mode: 'walk', phase: 'pickup', x: bunFacade.x + 1.55, z: .16, ...parked(buns.door.x + 1),
};

function onCountryRoad(x, laneOffset = 0) {
  const z = centerZ(x) + laneOffset, yaw = roadYaw(x);
  return { phase: 'free', mode: 'ride', x, z, bikeX: x, bikeZ: z, yaw, bikeYaw: yaw };
}

function onHillRoad(s) {
  const pt = hillRoadPoint(s);
  return { phase: 'free', mode: 'ride', x: pt.x, z: pt.z, bikeX: pt.x, bikeZ: pt.z, yaw: pt.yaw, bikeYaw: pt.yaw };
}

const coastalStart = onHillRoad(10);
const coastalPlaza = onHillRoad(170);

function inHub(dx, dz, yaw = 0, extra = {}) {
  const x = COASTAL_TOWN.x + dx;
  const z = COASTAL_TOWN.z + dz;
  return { phase: 'free', mode: 'ride', x, z, bikeX: x, bikeZ: z, yaw, bikeYaw: yaw, ...extra };
}

// State overrides are applied to a fresh delivery. Optional camera presets are cleared on movement.
export const sceneJumps = {
  hubSlope: {
    title: '榕湾坡道镇·下坡看海',
    state: inHub(0.9, -26.0, 0),
  },
  hubCrossing: {
    title: '榕湾坡道镇·电车道口',
    state: inHub(1.2, 37.5, 0),
  },
  hubPlaza: {
    title: '榕湾坡道镇·十字小广场',
    state: inHub(-4.5, 25.0, Math.PI * 0.36),
  },
  hubUphill: {
    title: '榕湾坡道镇·坡上住宅巷',
    state: inHub(-14.0, -58.0, Math.PI * 0.35),
  },
  hubOverview: {
    title: '榕湾坡道镇·全景鸟瞰',
    state: inHub(0.9, -12.0, 0),
    camera: {
      fov: 46,
      focus: [COASTAL_TOWN.x, 4.5, COASTAL_TOWN.z + 10],
      offset: [-68, 56, -82],
    },
  },
  street: { title: '旧老街起点（历史）' },
  shibaFront: {
    title: '阿柴正面·站姿',
    state: { phase: 'free', mode: 'walk', x: 2.0, z: 0.4, yaw: 0, bikeX: -2.2, bikeZ: start.z, bikeYaw: Math.PI / 2, stand: 1 },
    camera: { fov: 36, focus: [2.0, 0.78, 0.4], offset: [0.18, 0.22, 2.75] },
  },
  shibaSide: {
    title: '阿柴侧面·斜视',
    state: { phase: 'free', mode: 'walk', x: 2.0, z: 0.4, yaw: 0, bikeX: -2.2, bikeZ: start.z, bikeYaw: Math.PI / 2, stand: 1 },
    camera: { fov: 36, focus: [2.0, 0.78, 0.4], offset: [2.45, 0.28, 1.35] },
  },
  shibaBack: {
    title: '阿柴背面·站姿',
    state: { phase: 'free', mode: 'walk', x: 2.0, z: 0.4, yaw: Math.PI, bikeX: -2.2, bikeZ: start.z, bikeYaw: Math.PI / 2, stand: 1 },
    camera: { fov: 36, focus: [2.0, 0.78, 0.4], offset: [0.18, 0.24, 2.75] },
  },
  shibaRide: {
    title: '阿柴骑姿·近景',
    state: { phase: 'free', mode: 'ride', x: 2.0, z: start.z, yaw: Math.PI / 2, bikeX: 2.0, bikeZ: start.z, bikeYaw: Math.PI / 2, stand: 1 },
    camera: { fov: 38, focus: [2.0, 0.92, start.z], offset: [2.25, 0.45, 2.35] },
  },
  banyan: { title: '街边小榕树', state: bakeryFront,
    camera: { height: 4.9, width: 5.8, focus: [-2.4, 1.23, .86], offset: [2.2, 3.5, 8] } },
  bark: { title: '近看树干', state: { ...bakeryFront, ...parked(bunFacade.x - 2) },
    camera: { height: 1.9, width: 1.85, focus: [streetTreeXs[1], 1.02, treePitZ], offset: [-4.1, .65, 4.7] } },
  willow: { title: '桥头阔叶树', state: onCountryRoad(892),
    camera: { fov: 40, fitWidth: true, focus: [891.5, 3.6, centerZ(891.5) + 11.2], offset: [-10, 2.4, -13] } },
  crossing: { title: '城市十字路口', state: onCountryRoad(70, 2.2) },
  cityIce: { title: '城区单·冰室取茶', state: { ...onCountryRoad(68, 2.0), order: orders.find(o => o.id === 'ice'), phase: 'pickup', mode: 'ride' } },
  cityTea: { title: '城区单·茶行送北街', state: { ...onCountryRoad(68, 2.0), order: orders.find(o => o.id === 'tea'), phase: 'pickup', mode: 'ride' } },
  cityEdge: {
    title: '城市边角·路缘细节', state: onCountryRoad(79, 2.5),
    camera: { fov: 46, focus: [95.5, 1.4, 10.8], offset: [-14.2, 2.1, -4.8] },
  },
  cityAvenue: {
    title: '城市大道·榕湾方向', state: onCountryRoad(89, 1.8),
    camera: { fov: 50, focus: [112, 3.6, 4.17], offset: [-26, 2.2, 2.6] },
  },
  openPaddy: { title: '开阔水田', state: onCountryRoad(340) },
  riceBend: { title: '稻浪到石桥', state: onCountryRoad(792) },
  harvestView: {
    title: '稻田风景', state: onCountryRoad(748),
    camera: { fov: 46, focus: [767, 1.85, centerZ(767) + 12], offset: [-20, .28, -8] },
  },
  riceClose: {
    title: '田埂看稻穗', state: onCountryRoad(835),
    camera: { fov: 48, focus: [843, 0.92, centerZ(843) + 5.6], offset: [-4.6, 0.76, -2.5] },
  },
  sampleRide: {
    title: '路肩样板·骑行', state: onCountryRoad(780),
  },
  sampleEdge: {
    title: '路肩样板·斜视', state: onCountryRoad(780),
    camera: { fov: 48, focus: [780, 0.15, centerZ(780) + 3.0], offset: [-6.4, 1.45, -3.6] },
  },
  sampleWalk: {
    title: '路肩样板·田边下车',
    state: { ...onCountryRoad(780), mode: 'walk', z: centerZ(780) + 3.05 },
    camera: { fov: 46, focus: [780, 0.48, centerZ(780) + 2.55], offset: [-4.2, 1.1, -4.8] },
  },
  meadowRide: {
    title: '草地小样·骑行', state: onCountryRoad(1118),
  },
  meadowWide: {
    title: '草地小样·广角坡地', state: onCountryRoad(1130),
    camera: { fov: 46, focus: [1148, 1.4, centerZ(1148) + 18], offset: [-24, 5.2, -16] },
  },
  meadowClose: {
    title: '草地小样·草叶近景', state: onCountryRoad(1132),
    camera: { fov: 44, focus: [1138, 0.35, centerZ(1138) + 7.2], offset: [-5.5, 0.95, -2.8] },
  },
  meadowTree: {
    title: '树木小样·村口乔木', state: onCountryRoad(1124),
    camera: { fov: 42, focus: [1131.5, 2.75, 5.91], offset: [-8.5, 0.85, -5.2] },
  },
  pharmacy: { title: '药店门口', state: { order: pharmacy, mode: 'walk', phase: 'pickup',
    x: pharmacy.door.x, z: -.32, ...parked(pharmacy.door.x) } },
  counter: { title: '药店柜台', state: atCounter(pharmacy) },
  home: { title: '猫婆婆家', state: { order: pharmacy, mode: 'walk', phase: 'delivery', cargo: 'hand',
    x: pharmacy.customer.point.x, z: -.25, ...parked(pharmacy.customer.point.x) } },
  buns: { title: '包子铺门面', state: bakeryFront,
    camera: { height: 4.9, width: 7.05, focus: [bunFacade.x, 2.26, -1.74], offset: [1.3, 2, 10] } },
  signKit: {
    title: '老街招牌·图集近景',
    state: { phase: 'free', mode: 'walk', x: 5.5, z: 0.6, yaw: Math.PI, bikeX: -2.2, bikeZ: start.z, bikeYaw: Math.PI / 2, stand: 1 },
    camera: { fov: 44, focus: [4.8, 3.25, -2.0], offset: [-2.4, 0.45, 9.8] },
  },
  bunCounter: { title: '包子铺柜台', state: atCounter(buns) },
  steamers: { title: '包子铺蒸笼', state: bakeryFront,
    camera: { height: 2.1, width: 3.65, focus: [bunFacade.x - 1.07, 1.54, -1.74], offset: [1.8, 4.8, 10] } },
  coastalCorner: {
    title: '海风坡道·谷底起骑',
    state: coastalStart,
  },
  coastalGate: {
    title: '海风坡道·民居近景',
    state: { ...coastalPlaza, mode: 'walk', stand: 1 },
    camera: {
      fov: 40,
      focus: [COASTAL_SAMPLE.x - 28, 14.3, COASTAL_SAMPLE.z - 42],
      offset: [8.8, 1.9, 11.4],
    },
  },
  coastalOverview: {
    title: '海风坡道·全景鸟瞰',
    state: coastalStart,
    camera: {
      fov: 46,
      focus: [COASTAL_SAMPLE.x + 2, 7.5, COASTAL_SAMPLE.z - 12],
      offset: [-48, 38, 92],
    },
  },
  coastalHill: {
    title: '海风坡道·坡顶风车村',
    state: coastalPlaza,
    camera: {
      fov: 46,
      focus: [COASTAL_SAMPLE.x - 16, 15.8, COASTAL_SAMPLE.z - 50],
      offset: [26, 7.2, 34],
    },
  },
};

for (const { id, name, x } of landmarks.slice(1)) {
  sceneJumps[id] ??= { title: name, state: onCountryRoad(x) };
}

export function setupSceneDebug(reset, renderer, state) {
  const panel = document.getElementById('scene-debug');
  const params = new URLSearchParams(location.search);
  const enabled = import.meta.env.DEV || import.meta.env.VITE_SCENE_DEBUG === '1' || params.get('debug') === '1';
  panel.hidden = !enabled;
  const controls = getRendererControls(renderer);
  const timeOfDay = controls?.timeOfDay;
  const renderStyle = controls?.renderStyle;

  if (enabled) {
    // Inject minimal scoped styles for style/TOD controls inside #scene-debug.
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
      styleHeading.textContent = '渲染风格 (S1)';
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
      todHeading.textContent = '时段光照 (0–1 可插值)';
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

      // Apply URL query overrides when debug is enabled (?style=a|off&tod=morning|noon|dusk|night|0..1)
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
  }
  const id = params.get('scene');
  reset(enabled && Object.hasOwn(sceneJumps, id) ? sceneJumps[id] : sceneJumps.hubSlope);

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
