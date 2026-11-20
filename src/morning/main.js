/** One morning delivery. Keyboard and touch both operate the same movement and interaction loop. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from '../core/input.js';
import { approach, clamp, damp, dampAngle } from '../core/mathx.js';
import { glowMaterial } from '../core/materials.js';
import { oscVoice } from '../audio/synth.js';
import { createShiba, createScooter, parcel } from './rider.js';
import { createStreet, createPharmacy, STOPS, CURB_H, CURB_Z } from './town.js';
import { beginSequence, boxFrame, doorFrame, isBoxSequence, positionParcel } from './sequence.js';
import { frameRide, resizeRideCamera } from './ride-camera.js';
import './style.css';

const $ = id => document.getElementById(id);
const actionNames = {
  phone: '查看新单', brake: '减速停车', pack: '把药袋放进箱子', unpack: '从箱里取药袋', statement: '查看到账', park: '停车下车', mount: '骑上小摩托', enter: '推门进店', exit: '推门出去',
  talk: '找兔药师取件', collect: '收好药袋', deliver: '递给猫婆婆', sign: '确认签收',
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function run(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 3.5, -3.5, 0.1, 82);
  const chase = new THREE.PerspectiveCamera(52, 1, 0.12, 100);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  $('stage').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0xb2afa4, 1.65));
  const sun = new THREE.DirectionalLight(0xffe5c2, 2.42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 11, bottom: -9, near: 0.5, far: 45 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const street = createStreet(), room = createPharmacy();
  const loader = new GLTFLoader();
  const [courier, motorcycle] = await Promise.all([
    loader.loadAsync(new URL('../../art/morning/shiba-courier.glb', import.meta.url).href),
    loader.loadAsync(new URL('../../art/morning/monkey-delivery.glb', import.meta.url).href),
  ]);
  const shiba = createShiba(courier), scooter = createScooter(motorcycle);
  scene.add(street.root, room.root, shiba.root, scooter.root);
  const looseBag = parcel(scene, 0, 0, 0);
  const courierScale = scooter.root.scale.y;
  for (const bag of [room.bag, looseBag]) bag.scale.copy(shiba.root.scale);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.54, 48),
    glowMaterial({ color: 0xffdf8a, intensity: 1, transparent: true, opacity: 0.86, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d');
  const shade = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  shade.addColorStop(0, 'rgba(70,54,39,.34)');
  shade.addColorStop(1, 'rgba(70,54,39,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    glowMaterial({ map: shadowTexture, intensity: 1, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  scene.add(contact);

  const input = new Input(window, {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  });
  const pad = [...document.querySelectorAll('[data-move]')];
  for (const button of pad) {
    const action = button.dataset.move;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input.setVirtual(action, 1);
    });
    const release = () => input.setVirtual(action, 0);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerup', release);
  }
  window.addEventListener('blur', () => input.clearVirtual());
  let audio;
  function bell(notes) {
    if (!window.AudioContext) return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    notes.forEach((f, i) => oscVoice(audio, audio.destination, {
      type: 'sine', t: audio.currentTime + i * 0.075, f, peak: 0.042, a: 0.008, d: 0.29,
    }));
  }

  const state = {};
  const phone = $('phone'), phoneToggle = $('phone-toggle');
  let phoneExpanded = false;
  const focus = new THREE.Vector3();
  const eyeOffset = new THREE.Vector3();
  let time = 0, stride = 0, walking = 0, headTurn = 0, lastMode = '', lastAction = '';
  let aspect = 1, view = '', closeUp = false, followYaw = Math.PI / 2;
  const portraitStart = Math.atan2(3.68, 2);
  let portraitAngle = portraitStart, dragX;
  const stage = $('stage');
  function setCloseUp(value) {
    closeUp = value;
    portraitAngle = portraitStart;
    dragX = undefined;
    stage.classList.toggle('turntable', value && state.mode === 'ride');
    $('look').setAttribute('aria-pressed', String(value));
    $('look').querySelector('span').textContent = value ? '返回街景' : '近看阿柴';
  }
  stage.addEventListener('pointerdown', event => {
    if (!closeUp || state.mode !== 'ride' || !event.isPrimary || event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    dragX = event.clientX;
  });
  stage.addEventListener('pointermove', event => {
    if (dragX === undefined || !stage.hasPointerCapture(event.pointerId)) return;
    portraitAngle = clamp(portraitAngle + (dragX - event.clientX) * 2.5 / stage.clientWidth, 0.30, 1.95);
    dragX = event.clientX;
  });
  stage.addEventListener('lostpointercapture', () => { dragX = undefined; });
  function look() {
    if (!state.dialog && !state.sequence && !phoneExpanded) setCloseUp(!closeUp);
  }
  $('look').addEventListener('click', look);
  function reset() {
    shiba.resetTail();
    Object.assign(state, { phase: 'offer', mode: 'ride', dialog: null, x: STOPS.start.x, z: STOPS.start.z,
      bikeX: STOPS.start.x, bikeZ: STOPS.start.z, bikeYaw: Math.PI / 2, yaw: Math.PI / 2, speed: 0, steer: 0, returnToBike: false, sequence: null, cargo: 'none', stepHeight: 0, lift: 0, braking: false });
    shiba.root.rotation.y = scooter.root.rotation.y = state.yaw;
    headTurn = -0.75;
    stride = walking = 0;
    street.pharmacyDoor.rotation.y = scooter.lid.rotation.z = 0;
    setCloseUp(false);
    view = '';
    input.clearVirtual();
    $('receipt').hidden = true;
    $('announcement').textContent = '阿柴快送。第一单，便民药店取件。';
  }

  const bike = () => ({ x: state.bikeX, z: state.bikeZ });
  const parkedAtHome = () => Math.abs(state.bikeX - STOPS.home.x) < 4.1;
  function availableAction() {
    if (state.sequence || state.braking) return '';
    if (state.phase === 'done') return 'statement';
    if (state.dialog === 'pharmacist') return 'collect';
    if (state.dialog === 'customer') return 'sign';
    if (state.phase === 'offer') return 'phone';
    if (state.mode === 'ride') return Math.abs(state.speed) > 0.85 ? 'brake' : 'park';
    if (state.mode === 'shop') {
      if (state.phase === 'pickup' && distance(state, STOPS.counter) < 1.03) return 'talk';
      if (distance(state, STOPS.exit) < 0.95) return 'exit';
      return '';
    }
    if (state.phase === 'pickup' && distance(state, STOPS.pharmacy) < 1.02) return 'enter';
    if (state.cargo === 'hand' && !state.returnToBike && distance(state, STOPS.home) < 1.04) return 'deliver';
    if (distance(state, bike()) < 1.82) {
      if (state.cargo === 'hand') return state.returnToBike || !parkedAtHome() ? 'pack' : '';
      if (state.cargo === 'box' && parkedAtHome()) return 'unpack';
      return 'mount';
    }
    return '';
  }

  function setPhoneExpanded(expanded) {
    if (expanded === phoneExpanded || (expanded && (state.sequence || state.dialog || state.braking))) return;
    phoneExpanded = expanded;
    if (expanded) state.speed = 0;
    input.clearVirtual();
    phone.dataset.expanded = String(expanded);
    phone.setAttribute('role', expanded ? 'dialog' : 'region');
    if (expanded) phone.setAttribute('aria-modal', 'true');
    else phone.removeAttribute('aria-modal');
    phoneToggle.setAttribute('aria-expanded', String(expanded));
    phoneToggle.setAttribute('aria-label', expanded ? '收起手机' : '展开骑手手机');
    // Move focus outside the details before they become inert.
    if (!expanded) phoneToggle.focus({ preventScroll: true });
    $('phone-details').inert = !expanded;
    $('phone-details').setAttribute('aria-hidden', String(!expanded));
    if (!expanded) phone.querySelector('.phone-scroll').scrollTop = 0;
    $('street-controls').inert = expanded;
    $('phone-shade').hidden = !expanded;
    syncHUD();
    if (expanded) (state.phase === 'done' ? $('replay') : $('phone-main')).focus({ preventScroll: true });
  }

  function park() {
    state.mode = 'walk';
    state.speed = 0;
    state.steer = 0;
    state.braking = false;
    state.z = Math.max(CURB_Z - 0.15, state.bikeZ - 0.85);
    state.yaw = Math.PI;
  }
  let startY, gestureSurface, swiped = false;
  phone.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || phoneToggle.disabled) return;
    if (phoneExpanded && !phoneToggle.contains(event.target)) return;
    startY = event.clientY;
    swiped = false;
    gestureSurface = phoneToggle.contains(event.target) ? phoneToggle : phone;
    gestureSurface.setPointerCapture(event.pointerId);
  });
  phone.addEventListener('lostpointercapture', () => { startY = undefined; });
  phone.addEventListener('pointerup', event => {
    if (startY === undefined || !gestureSurface.hasPointerCapture(event.pointerId)) return;
    const delta = event.clientY - startY;
    startY = undefined;
    if (Math.abs(delta) < 26) return;
    swiped = true;
    setPhoneExpanded(delta < 0);
  });
  phone.addEventListener('click', event => {
    if (!phoneToggle.contains(event.target) && event.target !== phone) return;
    if (phoneToggle.disabled) return;
    if (!swiped || event.detail === 0) setPhoneExpanded(!phoneExpanded);
    swiped = false;
  });
  $('phone-shade').addEventListener('click', () => setPhoneExpanded(false));
  $('phone-main').addEventListener('click', () => {
    if (state.phase === 'offer') {
      state.phase = 'pickup';
      shiba.greet();
      setCloseUp(false);
      bell([659, 784]);
    }
    setPhoneExpanded(false);
  });
  $('replay').addEventListener('click', () => { setPhoneExpanded(false); reset(); syncHUD(); });
  function perform() {
    if (phoneExpanded) return;
    const action = availableAction();
    if (!action) return;
    if (closeUp) setCloseUp(false);
    switch (action) {
      case 'phone':
      case 'statement':
        setPhoneExpanded(true);
        return;
      case 'brake':
        state.braking = true;
        break;
      case 'park':
        park();
        break;
      case 'mount':
        Object.assign(state, bike(), { mode: 'ride', yaw: state.bikeYaw, returnToBike: false });
        break;
      case 'enter':
      case 'exit':
      case 'pack':
      case 'unpack':
        beginSequence(state, action);
        break;
      case 'talk':
        state.dialog = 'pharmacist';
        state.yaw = Math.PI;
        break;
      case 'collect':
        Object.assign(state, { dialog: null, phase: 'delivery', cargo: 'hand', returnToBike: true });
        break;
      case 'deliver':
        state.dialog = 'customer';
        state.yaw = Math.PI;
        break;
      case 'sign':
        shiba.greet();
        Object.assign(state, { dialog: null, phase: 'done', cargo: 'delivered' });
        $('announcement').textContent = '已签收，手机收到到账通知。';
        break;
    }
    bell(action === 'sign' ? [523, 659, 784] : [action === 'enter' || action === 'exit' ? 740 : 587]);
    syncHUD();
  }
  $('action').addEventListener('click', perform);
  window.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyQ' || (e.code === 'Tab' && !phoneExpanded && !e.shiftKey && e.target.tagName !== 'BUTTON')) {
      e.preventDefault();
      setPhoneExpanded(!phoneExpanded);
      return;
    }
    if (phoneExpanded) {
      const primary = state.phase === 'done' ? $('replay') : $('phone-main');
      if (e.code === 'Escape') { e.preventDefault(); setPhoneExpanded(false); }
      else if (e.code === 'KeyE' && state.phase === 'offer') { e.preventDefault(); primary.click(); }
      else if (e.code === 'Tab' && ((!e.shiftKey && e.target === primary) || (e.shiftKey && e.target === phoneToggle))) {
        e.preventDefault();
        (e.shiftKey ? primary : phoneToggle).focus();
      }
      return;
    }
    if (e.code === 'KeyV') { e.preventDefault(); look(); }
    if (e.code === 'KeyE' || (e.code === 'Enter' && e.target.tagName !== 'BUTTON')) {
      e.preventDefault(); perform();
    }
  });

  function navigate() {
    if (state.mode === 'shop') return state.phase === 'pickup'
      ? { name: '找兔药师取件', point: STOPS.counter }
      : { name: '回到老街', point: STOPS.exit };
    if (state.phase === 'delivery' || state.phase === 'done') {
      if (state.mode === 'walk' && state.phase !== 'done' && (state.returnToBike || state.cargo === 'box')) {
        const name = state.returnToBike ? '回车旁装药袋' : (parkedAtHome() ? '从箱里取药袋' : actionNames.mount);
        return { name, point: bike() };
      }
      return { name: '榕树里 3 号', point: STOPS.home };
    }
    return { name: '便民药店', point: STOPS.pharmacy };
  }
  function write(id, value) {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  }
  function guidance(target, action) {
    if (state.phase === 'done') return '猫婆婆已签收';
    const dx = target.point.x - state.x, dz = target.point.z - state.z;
    if (state.mode === 'ride') {
      if (Math.abs(dx) < 1.35) return '到了，靠边停车';
      const bearing = Math.atan2(dx, clamp(state.z, 1.85, 5.8) - state.z);
      const angle = Math.atan2(Math.sin(bearing - state.bikeYaw), Math.cos(bearing - state.bikeYaw));
      const turn = Math.abs(angle) < 0.24 ? '↑ 沿街直行' : (angle > 0 ? '← 向左转' : '向右转 →');
      return turn + '　' + Math.ceil(Math.abs(dx)) + ' m';
    }
    if (state.sequence) return { enter: '正在进店', exit: '正在出门', pack: '正在装进保温箱', unpack: '正在取出药袋' }[state.sequence.kind];
    if (action && !['mount', 'exit', 'enter'].includes(action)) return actionNames[action];
    if (action === 'enter' || (action === 'exit' && state.phase === 'delivery') ||
        (action === 'mount' && target.name === actionNames.mount)) return actionNames[action];
    const arrow = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? '← 往左走' : '往右走 →') : (dz < 0 ? '↑ 往里走' : '↓ 往外走');
    return arrow + '　' + Math.max(1, Math.ceil(distance(state, target.point))) + ' m';
  }

  function syncHUD() {
    const task = navigate(), action = availableAction();
    const offer = state.phase === 'offer', done = state.phase === 'done', riding = state.mode === 'ride';
    $('stage').setAttribute('aria-busy', String(!!state.sequence));
    if (phone.dataset.phase !== state.phase) phone.dataset.phase = state.phase;
    write('order-kind', offer ? '附近来单' : done ? '订单完成' : '当前订单');
    write('phase', { offer: '待接单', pickup: '去取件', delivery: '去送达', done: '已签收' }[state.phase]);
    write('goal', done ? '猫婆婆已签收' : task.name);
    write('directions', offer ? '送往榕树里 3 号' : done ? '实际到账 ¥0.10' : guidance(task, action));
    write('place', state.mode === 'shop' ? '药店内堂' : '榕湾老街');
    write('clock', { offer: '07:12', pickup: '07:14', delivery: '07:20', done: '07:24' }[state.phase]);
    $('action').hidden = !action || action === 'phone' || action === 'statement' || phoneExpanded;
    $('dialogue').hidden = !state.dialog;
    $('look').hidden = !!state.dialog || !!state.sequence || state.braking;
    phoneToggle.disabled = !!state.dialog || !!state.sequence || state.braking;
    $('order-screen').hidden = done;
    $('receipt').hidden = !done;
    $('phone-main').hidden = done;
    $('replay').hidden = !done;
    write('phone-main', offer ? '接下第一单' : '收起手机');
    if (state.dialog) {
      const fromShop = state.dialog === 'pharmacist';
      write('speaker', fromShop ? '兔药师' : '猫婆婆');
      write('line', fromShop ? '阿柴，榕树里三号的药袋。猫婆婆在楼下等你呢。' : '到啦？辛苦你起这么早。来，歇口气再走。');
    }
    if (action !== lastAction) {
      write('action-text', actionNames[action] || '');
      lastAction = action;
    }
    if (state.mode !== lastMode) {
      write('keys', riding ? 'W/S 油门与刹车　 A/D 转向　 E 互动' : '方向键 / WASD 步行　 E 互动');
      const labels = riding ? { up: '油门', down: '刹车与倒车', left: '向左转', right: '向右转' }
        : { up: '往里走', down: '往外走', left: '往左走', right: '往右走' };
      for (const b of pad) b.setAttribute('aria-label', labels[b.dataset.move]);
      lastMode = state.mode;
    }
    for (const b of pad) {
      const disabled = offer || done || !!state.dialog || !!state.sequence || state.braking || phoneExpanded;
      if (b.disabled !== disabled) b.disabled = disabled;
    }
    marker.visible = !offer && !done && !state.dialog && !state.sequence;
    const point = task.point;
    const onSidewalk = state.mode !== 'shop' && point.z < CURB_Z;
    marker.position.set(point.x, (onSidewalk ? CURB_H : 0) + 0.028, point.z);
    if (task.name !== $('announcement').dataset.target && !done) {
      $('announcement').dataset.target = task.name;
      write('announcement', (offer ? '附近来单，' : '目的地，') + task.name);
    }
  }

  function move(dt) {
    walking = 0;
    if (dt <= 0) return;
    if (state.sequence) {
      const travel = isBoxSequence(state.sequence) ? boxFrame(state, dt, scooter) : doorFrame(state, dt, street.pharmacyDoor);
      walking = Math.min(1, travel / (2.4 * dt || 1));
      stride += travel * 5.4;
      return;
    }
    if (state.phase === 'offer' || state.phase === 'done' || state.dialog || phoneExpanded) return;
    const dx = input.axis('left', 'right'), dz = input.axis('up', 'down');
    if (closeUp && (dx || dz)) setCloseUp(false);
    if (state.mode === 'ride') {
      const throttle = state.braking ? 0 : -dz;
      const targetSpeed = throttle > 0 ? 5.6 : (throttle < 0 ? -1.9 : 0);
      const deceleration = state.braking || throttle * state.speed < 0 ? 12 : (throttle ? 6.7 : 4.4);
      state.speed = approach(state.speed, targetSpeed, deceleration * dt);
      state.steer = damp(state.steer, state.braking ? 0 : -dx * 0.31, 12, dt);
      state.bikeYaw += Math.tan(state.steer) * state.speed / (scooter.wheelbase * courierScale) * dt;
      const sx = state.x, sz = state.z;
      state.x = clamp(sx + Math.sin(state.bikeYaw) * state.speed * dt, -7.2, 36.6);
      state.z = clamp(sz + Math.cos(state.bikeYaw) * state.speed * dt, 1.62, 6.45);
      const travel = Math.hypot(state.x - sx, state.z - sz);
      if (travel < 0.00001) state.speed = 0;
      state.bikeX = state.x;
      state.bikeZ = state.z;
      state.yaw = state.bikeYaw;
      scooter.roll(Math.sign(state.speed) * travel);
      stride += travel * 3.4;
      if (state.braking && Math.abs(state.speed) < 0.12) park();
    } else if (dx || dz) {
      const length = Math.hypot(dx, dz), step = 2.45 * dt / length;
      const inside = state.mode === 'shop';
      const oldX = state.x, oldZ = state.z;
      state.x = clamp(state.x + dx * step, inside ? -2.75 : -8.3, inside ? 2.75 : 37.7);
      state.z = clamp(state.z + dz * step, inside ? -0.18 : -0.72, inside ? 2.66 : 7.1);
      state.yaw = Math.atan2(dx, dz);
      const travel = Math.hypot(state.x - oldX, state.z - oldZ);
      walking = Math.min(1, travel / (2.45 * dt || 1));
      stride += travel * 5.4;
    }
  }

  const desiredFocus = new THREE.Vector3(), eye = new THREE.Vector3();
  function draw(dt) {
    const inside = state.mode === 'shop', riding = state.mode === 'ride';
    const packing = isBoxSequence(state.sequence);
    const nextView = state.sequence ? (packing ? 'box' : 'door') :
      (closeUp ? 'portrait' : inside ? 'shop' : !riding ? 'street' : state.phase === 'offer' ? 'intro' : 'chase');
    const snap = nextView !== view;
    room.root.visible = inside;
    room.bag.visible = state.phase === 'pickup';
    street.root.visible = !inside;
    // The reverse-shot camera occupies the far side of the street in the close-ups.
    street.opposite.visible = nextView === 'chase';
    scooter.root.visible = !inside;
    if (inside) room.update(time); else street.update(time);
    let height = !inside && state.z < CURB_Z ? CURB_H : 0;
    if (packing) height = Math.max(height, state.stepHeight);
    const facing = closeUp && !riding ? 0.45 : state.yaw;
    shiba.root.rotation.y = riding || snap ? facing : dampAngle(shiba.root.rotation.y, facing, 15, dt);
    scooter.root.rotation.y = state.bikeYaw;
    scooter.root.position.set(state.bikeX, 0, state.bikeZ);
    scooter.steer(state.steer);
    shiba.root.position.set(state.x, riding ? 0 : height, state.z);
    const posed = nextView === 'portrait' || nextView === 'intro';
    headTurn = damp(headTurn, riding ? (posed ? (Math.sin(state.bikeYaw) >= 0 ? -0.78 : 0.78) : -0.12) : 0, 10, dt);
    shiba.pose({ time, dt, stride, walking, headTurn, speed: state.speed, lift: state.lift,
      mount: riding ? scooter.mount : null, carrying: packing || state.cargo === 'hand' });
    positionParcel(state, shiba, scooter, looseBag);
    contact.position.set(state.x, (!inside && state.z < CURB_Z ? CURB_H : 0) + 0.025, state.z);
    contact.scale.set(riding ? 1.9 : 0.90, riding ? 0.84 : 0.65, 1).multiplyScalar(courierScale);
    contact.rotation.z = riding ? state.bikeYaw - Math.PI / 2 : 0;
    marker.scale.setScalar(1 + 0.065 * Math.sin(time * 3.4));
    if (snap) {
      scene.background = new THREE.Color(inside ? 0xe2cfaa : 0xc1dcd8);
      scene.fog = new THREE.FogExp2(inside ? 0xe2cfaa : 0xd9dfc9, inside ? 0.014 : 0.031);
      followYaw = state.bikeYaw;
      const heights = { portrait: 3.30, intro: 4.8, door: 4.05, box: 3.6, shop: 5.56, street: 6.15 };
      const widths = { portrait: 3.2, intro: 4.0, door: 3.25, box: 3.2, shop: 7.1, street: 5.2 };
      if (nextView !== 'chase') {
        const detailScale = nextView === 'portrait' || nextView === 'box' ? courierScale : 1;
        const h = Math.max(heights[nextView], Math.min(11.4, widths[nextView] / aspect)) * detailScale;
        camera.left = -h * aspect / 2; camera.right = -camera.left;
        camera.top = h / 2; camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
      }
    }
    if (nextView === 'chase') {
      followYaw = dampAngle(followYaw, state.bikeYaw, 5.4, dt);
      frameRide(chase, state, followYaw, focus);
    } else {
      if (nextView === 'box') {
        scooter.root.localToWorld(desiredFocus.set(-0.24, 1.07, scooter.cargo.floor.z + 0.15));
        scooter.root.localToWorld(eye.set(0.84, 3.21, 4.52));
        eye.z = Math.max(eye.z, 0.70);
        eyeOffset.copy(eye).sub(desiredFocus);
      } else if (nextView === 'door') {
        desiredFocus.set(STOPS.pharmacy.x, 1.27, -1.48);
        eyeOffset.set(1.55, 2.05, 8.7);
      } else if (posed) {
        desiredFocus.set(state.x, (riding ? 1.21 : 1.10) * courierScale, state.z);
        if (riding) {
          const side = Math.sin(state.bikeYaw) >= 0 ? -1 : 1;
          scooter.root.localToWorld(eye.set(side * 4.19 * Math.sin(portraitAngle), 2.18, 4.19 * Math.cos(portraitAngle)));
          eye.z = Math.max(eye.z, 0.65);
          eyeOffset.copy(eye).sub(desiredFocus);
        } else eyeOffset.set(0.8, 2.5, 9.2);
      } else {
        desiredFocus.set(inside ? 0 : state.x, inside ? 1.50 : 1.74, inside ? -0.12 : state.z - 0.63);
        eyeOffset.set(inside ? -3.3 : 2.95, inside ? 4.60 : 3.9, 11);
      }
      if (snap) focus.copy(desiredFocus); else focus.lerp(desiredFocus, 1 - Math.exp(-7 * dt));
      camera.position.copy(focus).add(eyeOffset);
      camera.lookAt(focus);
    }
    const lightX = Math.round(focus.x * 2) / 2;
    sun.target.position.set(lightX, 0.3, 0);
    sun.position.set(lightX - 6, 11.5, 7.5);
    view = nextView;
    renderer.render(scene, view === 'chase' ? chase : camera);
  }

  function resize() {
    const w = $('stage').clientWidth, h = Math.max(1, $('stage').clientHeight);
    aspect = w / h;
    resizeRideCamera(chase, aspect);
    renderer.setSize(w, h, false);
    view = '';
  }
  window.addEventListener('resize', resize);
  reset();
  resize();
  let previous;
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - (previous ?? now)) / 1000, 0.05);
    previous = now;
    time += dt;
    move(dt);
    syncHUD();
    draw(dt);
    input.endFrame();
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
