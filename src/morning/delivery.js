import { beginSequence } from './sequence.js';
import { orders, start } from './orders.js';
import { coastalTownSurfaceHeight, HERO_HAIKAZE } from './coastal-town.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function initialState() {
  return {
    order: orders[0], phase: 'free', mode: 'ride', cargo: 'none', dialog: null, sequence: null,
    x: start.x, z: start.z, bikeX: start.x, bikeZ: start.z, bikeYaw: start.yaw, yaw: start.yaw,
    throttle: 0, brakePressure: 0, reverseHold: 0, steerInput: 0,
    speed: 0, bank: 0, steer: 0, returnToBike: false, tiptoe: 0, reach: 0, stand: 1, lift: 0, braking: false,
    completedCount: 0, totalEarnedCents: 0,
  };
}

export function createDelivery(state) {
  const bike = () => ({ x: state.bikeX, z: state.bikeZ });
  const parkedNearCustomer = () => distance(bike(), state.order.customer.point) < 12.0;

  function availableAction() {
    if (state.sequence || state.braking) return '';
    if (state.dialog === 'shopkeeper') return 'collect';
    if (state.dialog === 'customer') return 'sign';
    if (state.phase === 'free') {
      if (state.mode === 'ride') return Math.abs(state.speed) > 0.85 ? 'brake' : 'park';
      return distance(state, bike()) < 1.85 ? 'mount' : '';
    }
    if (state.phase === 'done') {
      if (state.mode === 'ride') return Math.abs(state.speed) > 0.85 ? 'brake' : 'park';
      if (distance(state, bike()) < 1.85 && distance(state, state.order.customer.point) > 1.8) return 'mount';
      return 'statement';
    }
    if (state.phase === 'offer') {
      if (state.mode === 'ride') {
        if (Math.abs(state.speed) > 0.85) return 'brake';
        return distance(state, start) > 0.6 ? 'park' : 'phone';
      }
      return distance(state, bike()) < 1.85 ? 'mount' : 'phone';
    }
    if (state.mode === 'ride') return Math.abs(state.speed) > 0.85 ? 'brake' : 'park';

    if (state.phase === 'pickup' && distance(state, state.order.door) < 2.2) {
      return 'talk';
    }
    if (state.cargo === 'hand' && !state.returnToBike && distance(state, state.order.customer.point) < 1.95) {
      const custUpper = Boolean(state.order.customer.onUpperFloor);
      const onUpper = coastalTownSurfaceHeight(state.x, state.z, true) > HERO_HAIKAZE.baseY + 2.5;
      if (!custUpper || onUpper) return 'deliver';
    }
    if (distance(state, bike()) < 1.85) {
      if (state.cargo === 'hand') return state.returnToBike || !parkedNearCustomer() ? 'pack' : '';
      if (state.cargo === 'box' && parkedNearCustomer()) return 'unpack';
      return 'mount';
    }
    return '';
  }

  function navigate() {
    if (state.phase === 'free') return { name: '海风庄街角 · 自由探索', point: state };
    if (state.phase === 'delivery' || state.phase === 'done') {
      if (state.mode === 'walk' && state.phase !== 'done' && (state.returnToBike || state.cargo === 'box')) {
        const name = state.returnToBike
          ? '回车旁装' + state.order.item
          : (parkedNearCustomer() ? state.order.actions.unpack : state.order.actions.mount);
        return { name, point: bike() };
      }
      return { name: state.order.customer.address, point: state.order.customer.point };
    }
    return { name: state.order.name, point: state.order.door };
  }

  function interact(action) {
    switch (action) {
      case 'park':
      case 'brake':
        state.braking = true;
        break;
      case 'mount':
        beginSequence(state, 'mount');
        break;
      case 'pack':
      case 'unpack':
        beginSequence(state, action);
        break;
      case 'talk':
        state.dialog = 'shopkeeper';
        state.yaw = 0;
        break;
      case 'collect':
        // For upstairs 201/202 deliveries, carry straight up the exterior stairs! For distant rides, pack in box.
        Object.assign(state, {
          dialog: null,
          phase: 'delivery',
          cargo: 'hand',
          returnToBike: !state.order.customer.onUpperFloor,
        });
        break;
      case 'deliver':
        state.dialog = 'customer';
        state.yaw = state.order.customer.onUpperFloor ? Math.PI / 2 : 0;
        break;
      case 'sign':
        Object.assign(state, { dialog: null, phase: 'done', cargo: 'delivered' });
        state.completedCount = (state.completedCount || 0) + 1;
        state.totalEarnedCents = (state.totalEarnedCents || 0) + Math.max(0, state.order.feeCents - state.order.insuranceCents);
        break;
    }
  }

  return { availableAction, navigate, interact };
}
