import { $, write } from './dom.js';
import { oscVoice } from '../audio/synth.js';
import { isStandSequence } from './sequence.js';
import { distance } from './delivery.js';
import { formatPay, nextOrder } from './orders.js';
import { coastalTownSurfaceHeight, townPlace } from './coastal-town.js';
import { drawTownMap } from './town-map.js';

export function createHUD(state, delivery, view, { shiba, marker, timeOfDay }, { input, stick, releaseStick }, reset, rideAudio) {
  const { availableAction, navigate } = delivery;
  const debug = $('scene-debug');
  const dialogue = $('dialogue');
  const actionButton = $('action');
  let lastMode = '';
  let lastAudioActive = null;
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
    drawTownMap($('street-plan'), state, navigate().point);
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
    const free = state.phase === 'free';
    const where = townPlace(state.x, state.z);
    write('map-location', free
      ? '当前位置 · ' + where + '　（在骑手手机中可随时接取海风拉面订单）'
      : '当前位置 · ' + where + '　　目标 · ' + navigate().name);
    write('map-title', '榕湾海风街角');
    $('map-stops').hidden = free;
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
    if (!expanded) phoneToggle.focus({ preventScroll: true });
    $('phone-details').inert = !expanded;
    $('phone-details').setAttribute('aria-hidden', String(!expanded));
    if (!expanded) phone.querySelector('.phone-scroll').scrollTop = 0;
    $('street-controls').inert = expanded;
    $('phone-shade').hidden = !expanded;
    syncHUD();
    if (expanded) (state.phase === 'done' ? $('next-order') : $('phone-main')).focus({ preventScroll: true });
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
    if (state.phase !== 'offer' && state.phase !== 'free') return;
    state.order = nextOrder(state.order);
    syncHUD();
  });
  $('phone-main').addEventListener('click', () => {
    if (state.phase === 'offer' || state.phase === 'free') {
      state.phase = 'pickup';
      state.cargo = 'none';
      state.returnToBike = false;
      shiba.greet();
      view.clearInspection();
      bell([659, 784]);
    }
    setPhoneExpanded(false);
  });
  $('ride-sound').addEventListener('click', () => {
    rideAudio.toggle();
    $('ride-sound').setAttribute('aria-pressed', String(rideAudio.enabled));
    write('ride-sound', rideAudio.enabled ? '声音已开启' : '声音已关闭');
  });
  $('next-order').addEventListener('click', () => {
    if (state.phase !== 'done') return;
    const next = nextOrder(state.order);
    Object.assign(state, { order: next, phase: 'offer', cargo: 'none', returnToBike: false, dialog: null });
    phone.querySelector('.phone-scroll').scrollTop = 0;
    syncHUD();
    $('phone-main').focus({ preventScroll: true });
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
    bell(action === 'sign' ? [523, 659, 784] : [587]);
    syncHUD();
  }
  actionButton.addEventListener('click', perform);

  for (const button of [actionButton, phoneToggle]) {
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
      else if (e.code === 'KeyE' && (state.phase === 'offer' || state.phase === 'free')) { e.preventDefault(); primary.click(); }
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
    if (isStandSequence(state.sequence)) {
      return state.sequence.kind === 'park'
        ? (state.sequence.hop > 0 ? '正在轻跳落地' : '正在跨座下车') : '正在跨座上车';
    }
    if (state.phase === 'done') return state.order.customer.name + '已签收';
    const dist = distance(state, target.point);
    if (state.mode === 'ride') {
      if (dist < 4.5) return '到了，按 E 停车下车';
      const bearing = Math.atan2(target.point.x - state.x, target.point.z - state.z);
      const angle = Math.atan2(Math.sin(bearing - state.bikeYaw), Math.cos(bearing - state.bikeYaw));
      let turn = angle > 0 ? '← 向左转' : '向右转 →';
      if (Math.abs(angle) < 0.24) turn = '↑ 向前骑行';
      if (Math.abs(angle) > Math.PI * 0.8) turn = '↶ 掉头';
      return turn + ' ' + Math.ceil(dist) + ' m';
    }
    if (state.sequence) return { pack: '正在装进保温箱', unpack: '正在取出' + state.order.item }[state.sequence.kind] || '';
    if (action && action !== 'mount') return state.order.actions[action] || '';
    if (state.order.customer.onUpperFloor && state.phase === 'delivery') {
      return '走西侧外挂楼梯上二楼　' + Math.max(1, Math.ceil(dist)) + ' m';
    }
    const dx = target.point.x - state.x, dz = target.point.z - state.z;
    const arrow = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? '← 往西走' : '往东走 →') : (dz < 0 ? '↑ 往北走' : '↓ 往南走');
    return arrow + '　' + Math.max(1, Math.ceil(dist)) + ' m';
  }

  function syncHUD() {
    const task = navigate(), action = availableAction();
    const free = state.phase === 'free', offer = state.phase === 'offer', done = state.phase === 'done', riding = state.mode === 'ride';
    $('stage').setAttribute('aria-busy', String(!!state.sequence || state.braking));
    if (phone.dataset.phase !== state.phase) phone.dataset.phase = state.phase;
    write('order-kind', free ? '海风街角' : offer ? '附近来单' : done ? '订单完成' : '当前订单');
    $('switch-order').hidden = !(offer || free);
    write('switch-order', '换成' + nextOrder(state.order).label);
    write('pickup-store', state.order.name);
    write('pickup-person', (state.order.pickupArea || '海风庄 1F') + ' · 找' + state.order.staff);
    write('order-note', '备注　' + state.order.note);
    $('ride-info').hidden = !free;
    if (free) {
      write('ride-distance', '可骑车逛海滨坡道，或按 E 下车走西侧铁楼梯上海风庄二楼；点击下方按钮即可开始派单。');
    }

    const wantAudio = true;
    if (wantAudio !== lastAudioActive) {
      lastAudioActive = wantAudio;
      rideAudio.setActive(wantAudio);
    }

    const place = townPlace(state.x, state.z);
    write('phase', { free: '探索', offer: '待接单', pickup: state.order.pickupPhase, delivery: '去送达', done: '已签收' }[state.phase]);
    write('goal', free ? place : done ? state.order.customer.name + '已签收' : task.name);
    const hint = offer || done || free ? '' : guidance(task, action);
    write('directions', hint);
    $('directions').hidden = !hint || !!state.sequence || state.braking || phoneExpanded;
    $('map-open').disabled = !!state.dialog || !!state.sequence || state.braking;

    const fee = formatPay(state.order.feeCents), net = formatPay(state.order.feeCents - state.order.insuranceCents);
    write('order-fee', fee);
    write('delivery-address', state.order.customer.address);
    write('delivery-person', state.order.customer.instructions);
    write('receipt-fee', '+ ' + fee);
    write('receipt-insurance', '− ' + formatPay(state.order.insuranceCents));
    write('receipt-net', net);
    write('receipt-note', state.order.receiptNote);
    const hasShift = done && state.completedCount > 0;
    $('shift-summary').hidden = !hasShift;
    if (hasShift) write('shift-summary', '今日已完成 ' + state.completedCount + ' 单　·　累计到手 ' + formatPay(state.totalEarnedCents || 0));
    write('order-summary', free
      ? Math.round(Math.abs(state.speed) * 3.6) + (state.speed < 0 ? ' km/h · 倒车' : riding ? ' km/h · 自由骑行' : ' · 步行探索')
      : done ? '实际到账 ' + net : '送往' + state.order.customer.address);
    write('place', place);
    const todT = timeOfDay?.current?.t ?? 0;
    const todLabel = todT < 0.20 ? '海风清晨' : todT < 0.52 ? '海风正午' : todT < 0.84 ? '海风傍晚' : '海风夜晚';
    write('clock', free ? todLabel : state.order.clock[state.phase]);

    actionButton.hidden = !action || action === 'phone' || action === 'statement' || phoneExpanded;
    dialogue.hidden = !state.dialog;
    $('look').hidden = !!state.dialog || !!state.sequence || state.braking;
    phoneToggle.disabled = !!state.dialog || !!state.sequence || state.braking;
    $('order-screen').hidden = done;
    $('receipt').hidden = !done;
    $('phone-main').hidden = done;
    $('next-order').hidden = !done;
    if (done) write('next-order', '继续接' + nextOrder(state.order).label);
    $('replay').hidden = !done;
    write('phone-main', offer || free ? state.order.accept : '收起手机');
    if (state.dialog) {
      const fromShop = state.dialog === 'shopkeeper';
      write('speaker', fromShop ? state.order.staff : state.order.customer.name);
      write('line', fromShop ? state.order.line : state.order.customer.line);
    }
    write('action-text', state.order.actions[action] || '');

    if (state.mode !== lastMode) {
      write('keys', riding ? 'W/S 油门刹车　A/D 转向　拖动转视角　E 下车互动' : 'WASD 步行上楼梯　拖动转视角　R 回正　E 互动');
      stick.setAttribute('aria-label', riding ? '骑行摇杆，上推加速，下拉刹车或倒车，左右转向' : '步行摇杆，向任意方向拖动');
      lastMode = state.mode;
    }
    const stickDisabled = !!state.dialog || !!state.sequence || state.braking || phoneExpanded;
    if (stick.getAttribute('aria-disabled') !== String(stickDisabled)) {
      stick.setAttribute('aria-disabled', String(stickDisabled));
      if (stickDisabled) releaseStick();
    }

    marker.visible = !free && !offer && !done && !state.dialog && !state.sequence;
    if (marker.visible) {
      const pt = task.point;
      const my = coastalTownSurfaceHeight(pt.x, pt.z, true);
      marker.position.set(pt.x, my + 0.04, pt.z);
    }
    if (task.name !== $('announcement').dataset.target && !done) {
      $('announcement').dataset.target = task.name;
      write('announcement', (offer ? '附近来单，' : '目的地，') + task.name);
    }
  }

  return {
    sync: syncHUD,
    get modalOpen() { return phoneExpanded || map.open; },
    close() {
      lastAudioActive = null;
      setPhoneExpanded(false);
      if (map.open) map.close();
    },
  };
}
