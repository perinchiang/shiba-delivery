import { $, write } from './dom.js';
import { oscVoice } from '../audio/synth.js';
import { clamp } from '../core/mathx.js';
import { CURB_H, CURB_Z } from './town.js';
import { isStandSequence } from './sequence.js';
import { distance } from './delivery.js';
import { rideMinZ } from './movement.js';
import { formatPay, nextOrder } from './orders.js';
import { drawRouteMap } from './route-map.js';
import { distanceAlong, roadEnd, roadPlace, routeDistances } from './country-route.js';
import { drawStreetMap } from './street-map.js';

export function createHUD(state, delivery, view, { shiba, marker }, { input, stick, releaseStick }, reset, rideAudio) {
  const { availableAction, navigate } = delivery;
  const debug = $('scene-debug');
  let lastMode = '';
  let audio;
  function bell(notes) {
    if (!window.AudioContext) return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    notes.forEach((f, i) => oscVoice(audio, audio.destination, {
      type: 'sine', t: audio.currentTime + i * 0.075, f, peak: 0.042, a: 0.008, d: 0.29,
    }));
  }

  const phone = $('phone'), phoneToggle = $('phone-toggle');
  const map = $('street-map');
  function paintMap() {
    if (!map.open) return;
    if (state.phase === 'free') drawRouteMap($('street-plan'), state);
    else drawStreetMap($('street-plan'), state, navigate().point);
  }
  new ResizeObserver(paintMap).observe($('street-plan'));
  function openMap() {
    if (map.open || phoneExpanded || state.sequence || state.dialog || state.braking) return;
    debug.open = false;
    state.speed = 0;
    releaseStick();
    input.clearVirtual();
    map.showModal();
    write('map-pickup', state.order.name);
    write('map-delivery', state.order.customer.address);
    const where = state.mode === 'shop' ? state.order.room.name : '榕湾老街';
    write('map-location', '当前位置 · ' + where + '　　目标 · ' + navigate().name);
    const free = state.phase === 'free';
    write('map-title', free ? '榕湾村道' : '榕湾老街');
    $('map-stops').hidden = free;
    if (free) write('map-location', '当前位置 · ' + roadPlace(state.x) + '　全长 ' + (distanceAlong(roadEnd)/1000).toFixed(2) + ' km');
    paintMap();
  }
  $('map-open').addEventListener('click', openMap);
  $('map-close').addEventListener('click', () => map.close());
  let phoneExpanded = false;
  function look() {
    if (!state.dialog && !state.sequence && !phoneExpanded && !map.open) {
      view.toggleCloseUp();
    }
  }
  $('look').addEventListener('click', look);
  function setPhoneExpanded(expanded) {
    if (expanded === phoneExpanded || (expanded && (state.sequence || state.dialog || state.braking))) return;
    phoneExpanded = expanded;
    if (expanded) debug.open = false;
    if (expanded) state.speed = 0;
    releaseStick();
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
  $('switch-order').addEventListener('click', () => {
    if (state.phase !== 'offer') return;
    state.order = nextOrder(state.order);
    syncHUD();
  });
  $('phone-main').addEventListener('click', () => {
    if (state.phase === 'offer') {
      state.phase = 'pickup';
      shiba.greet();
      view.clearInspection();
      bell([659, 784]);
    }
    setPhoneExpanded(false);
  });
  $('free-ride').addEventListener('click', () => {
    if (state.phase === 'offer') reset({ state: { phase: 'free' } });
    else if (state.phase === 'free') reset();
  });
  $('ride-sound').addEventListener('click', () => {
    rideAudio.toggle();
    $('ride-sound').setAttribute('aria-pressed', String(rideAudio.enabled));
    write('ride-sound', rideAudio.enabled ? '声音已开启' : '声音已关闭');
  });
  $('replay').addEventListener('click', () => { setPhoneExpanded(false); reset(); syncHUD(); });

  function perform() {
    if (phoneExpanded || map.open) return;
    const action = availableAction();
    if (!action) return;
    view.clearInspection();
    if (action === 'phone' || action === 'statement') {
      setPhoneExpanded(true);
      return;
    }
    delivery.interact(action);
    if (state.braking) input.clearVirtual();
    if (action === 'sign') {
      shiba.greet();
      write('announcement', '已签收，手机收到到账通知。');
    }
    bell(action === 'sign' ? [523, 659, 784] : [action === 'enter' || action === 'exit' ? 740 : 587]);
    syncHUD();
  }
  $('action').addEventListener('click', perform);
  // Some touch browsers only synthesize a click for the first finger. Let the
  // other thumb tap a control while the stick still owns the first pointer.
  for (const button of [$('action'), phoneToggle]) {
    let secondaryTap = false;
    button.addEventListener('pointerdown', () => { secondaryTap = false; });
    button.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch' || event.isPrimary || button.disabled) return;
      if (!button.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
      secondaryTap = true;
      button.click();
    });
    button.addEventListener('click', event => {
      if (secondaryTap && event.detail > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
  window.addEventListener('keydown', e => {
    if (map.open) {
      if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); map.close(); }
      return;
    }
    if (debug.contains(e.target) && ['Tab', 'Enter', 'Space', 'Escape'].includes(e.code)) {
      if (e.code === 'Escape') {
        debug.open = false;
        debug.querySelector('summary').focus();
      }
      return;
    }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyM') { e.preventDefault(); openMap(); return; }
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

  function guidance(target, action) {
    if (state.braking) return state.speed ? '正在减速停车' : '正在放下侧撑';
    if (state.sequence?.approaching) return '正在走到车旁';
    if (isStandSequence(state.sequence)) return state.sequence.kind === 'park'
      ? (state.sequence.hop > 0 ? '正在轻跳落地' : '正在跨座下车') : '正在跨座上车';
    if (state.phase === 'done') return state.order.customer.name + '已签收';
    const dx = target.point.x - state.x, dz = target.point.z - state.z;
    if (state.mode === 'ride') {
      if (Math.abs(dx) < 1.35) return '到了，靠边停车';
      const bearing = Math.atan2(dx, clamp(state.z, rideMinZ, 5.8) - state.z);
      const angle = Math.atan2(Math.sin(bearing - state.bikeYaw), Math.cos(bearing - state.bikeYaw));
      let turn = angle > 0 ? '← 向左转' : '向右转 →';
      if (Math.abs(angle) < 0.24) turn = '↑ 沿街直行';
      if (Math.abs(angle) > Math.PI * .8) turn = '↶ 沿街掉头';
      return turn + '　' + Math.ceil(Math.abs(dx)) + ' m';
    }
    if (state.sequence) return { enter: '正在进店', exit: '正在出门', pack: '正在装进保温箱', unpack: '正在取出' + state.order.item }[state.sequence.kind];
    if (action === 'talk') return '已到柜台';
    if (action && !['mount', 'exit', 'enter'].includes(action)) return state.order.actions[action];
    if (action === 'enter' || (action === 'exit' && state.phase === 'delivery') ||
        (action === 'mount' && target.name === state.order.actions.mount)) return state.order.actions[action];
    const arrow = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? '← 往左走' : '往右走 →') : (dz < 0 ? '↑ 往里走' : '↓ 往外走');
    return arrow + '　' + Math.max(1, Math.ceil(distance(state, target.point))) + ' m';
  }

  function syncHUD() {
    const task = navigate(), action = availableAction();
    const free = state.phase === 'free', offer = state.phase === 'offer', done = state.phase === 'done', riding = state.mode === 'ride';
    $('stage').setAttribute('aria-busy', String(!!state.sequence || state.braking));
    if (phone.dataset.phase !== state.phase) phone.dataset.phase = state.phase;
    write('order-kind', free ? '自由骑行' : offer ? '附近来单' : done ? '订单完成' : '当前订单');
    $('switch-order').hidden = !offer;
    write('switch-order', '换成' + nextOrder(state.order).label);
    write('pickup-store', state.order.name);
    write('pickup-person', '榕湾老街 · 找' + state.order.staff);
    write('order-note', '备注　' + state.order.note);
    $('free-ride').hidden = !offer && !free;
    write('free-ride', free ? '回老街接单' : '自由骑行');
    $('ride-info').hidden = !free;
    if (free) {
      const metres = routeDistances(state.x, state.z);
      write('ride-distance', '距老街 ' + Math.round(metres.town) + ' m　距村口 ' + Math.round(metres.village) + ' m');
    }
    write('phase', { free: '骑行', offer: '待接单', pickup: state.order.pickupPhase, delivery: '去送达', done: '已签收' }[state.phase]);
    write('goal', free ? roadPlace(state.x) : done ? state.order.customer.name + '已签收' : task.name);
    const hint = offer || done || free ? '' : guidance(task, action);
    write('directions', hint);
    $('directions').hidden = !riding || !hint || hint.startsWith('↑') || !!state.sequence || state.braking || phoneExpanded;
    $('map-open').disabled = !!state.dialog || !!state.sequence || state.braking;
    const fee = formatPay(state.order.feeCents), net = formatPay(state.order.feeCents - state.order.insuranceCents);
    write('order-fee', fee);
    write('delivery-address', state.order.customer.address);
    write('delivery-person', state.order.customer.instructions);
    write('receipt-fee', '+ ' + fee);
    write('receipt-insurance', '− ' + formatPay(state.order.insuranceCents));
    write('receipt-net', net);
    write('receipt-note', state.order.receiptNote);
    write('order-summary', free ? Math.round(Math.abs(state.speed)*3.6) + (state.speed < 0 ? ' km/h · 倒车' : ' km/h · 自由骑行') : done ? '实际到账 ' + net : '送往' + state.order.customer.address);
    write('place', free ? '榕湾村道' : state.mode === 'shop' ? state.order.room.name : '榕湾老街');
    write('clock', free ? '清晨' : state.order.clock[state.phase]);
    $('action').hidden = !action || action === 'phone' || action === 'statement' || phoneExpanded;
    $('dialogue').hidden = !state.dialog;
    $('look').hidden = !!state.dialog || !!state.sequence || state.braking;
    phoneToggle.disabled = !!state.dialog || !!state.sequence || state.braking;
    $('order-screen').hidden = done || free;
    $('receipt').hidden = !done;
    $('phone-main').hidden = done;
    $('replay').hidden = !done;
    write('phone-main', offer ? state.order.accept : '收起手机');
    if (state.dialog) {
      const fromShop = state.dialog === 'shopkeeper';
      write('speaker', fromShop ? state.order.staff : state.order.customer.name);
      write('line', fromShop ? state.order.line : state.order.customer.line);
    }
    write('action-text', state.order.actions[action] || '');
    if (state.mode !== lastMode) {
      write('keys', riding ? 'W/S 油门与刹车　 A/D 转向　 E 互动' : '方向键 / WASD 步行　 E 互动');
      stick.setAttribute('aria-label', riding ? '骑行摇杆，上推加速，下拉刹车或倒车，左右转向' : '步行摇杆，向任意方向拖动');
      lastMode = state.mode;
    }
    const stickDisabled = offer || done || !!state.dialog || !!state.sequence || state.braking || phoneExpanded;
    if (stick.getAttribute('aria-disabled') !== String(stickDisabled)) {
      stick.setAttribute('aria-disabled', String(stickDisabled));
      if (stickDisabled) releaseStick();
    }
    marker.visible = !free && !offer && !done && !state.dialog && !state.sequence;
    const point = task.point;
    const onSidewalk = state.mode !== 'shop' && point.z < CURB_Z;
    marker.position.set(point.x, (onSidewalk ? CURB_H : 0) + 0.028, point.z);
    if (task.name !== $('announcement').dataset.target && !done) {
      $('announcement').dataset.target = task.name;
      write('announcement', (offer ? '附近来单，' : '目的地，') + task.name);
    }
  }

  return { sync: syncHUD, get modalOpen() { return phoneExpanded || map.open; }, close() {
    setPhoneExpanded(false);
    if (map.open) map.close();
  } };
}
