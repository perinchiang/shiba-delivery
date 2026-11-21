import { beginSequence } from './sequence.js';
import { orders, start } from './orders.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function initialState() {
  return {
    order: orders[0], phase: 'offer', mode: 'ride', cargo: 'none', dialog: null, sequence: null,
    ...start, bikeX: start.x, bikeZ: start.z, bikeYaw: Math.PI / 2, yaw: Math.PI / 2,
    throttle: 0, brakePressure: 0, reverseHold: 0, steerInput: 0,
    speed: 0, bank: 0, steer: 0, returnToBike: false, tiptoe: 0, reach: 0, stand: 1, lift: 0, braking: false,
  };
}

export function createDelivery(state) {
  const bike = () => ({ x: state.bikeX, z: state.bikeZ });
  const parkedAtHome = () => Math.abs(state.bikeX - state.order.customer.point.x) < 4.1;
  function availableAction() {
    if (state.sequence || state.braking) return '';
    if (state.phase === 'free' && state.mode === 'walk') {
      return distance(state, bike()) < 1.82 ? 'mount' : '';
    }
    if (state.phase === 'done') return 'statement';
    if (state.dialog === 'shopkeeper') return 'collect';
    if (state.dialog === 'customer') return 'sign';
    if (state.phase === 'offer') return 'phone';
    if (state.mode === 'ride') return Math.abs(state.speed) > 0.85 ? 'brake' : 'park';
    if (state.mode === 'shop') {
      if (state.phase === 'pickup' && distance(state, state.order.room.counter) < 1.03) return 'talk';
      if (distance(state, state.order.room.exit) < 0.95) return 'exit';
      return '';
    }
    if (state.phase === 'pickup' && distance(state, state.order.door) < 1.02) return 'enter';
    if (state.cargo === 'hand' && !state.returnToBike && distance(state, state.order.customer.point) < 1.04) return 'deliver';
    if (distance(state, bike()) < 1.82) {
      if (state.cargo === 'hand') return state.returnToBike || !parkedAtHome() ? 'pack' : '';
      if (state.cargo === 'box' && parkedAtHome()) return 'unpack';
      return 'mount';
    }
    return '';
  }

  function navigate() {
    if (state.phase === 'free') return { name: '自由骑行', point: state };
    if (state.mode === 'shop') return state.phase === 'pickup'
      ? { name: state.order.actions.talk, point: state.order.room.counter }
      : { name: '回到老街', point: state.order.room.exit };
    if (state.phase === 'delivery' || state.phase === 'done') {
      if (state.mode === 'walk' && state.phase !== 'done' && (state.returnToBike || state.cargo === 'box')) {
        const name = state.returnToBike ? '回车旁装' + state.order.item : (parkedAtHome() ? state.order.actions.unpack : state.order.actions.mount);
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
      case 'enter':
      case 'exit':
      case 'pack':
      case 'unpack':
        beginSequence(state, action);
        break;
      case 'talk':
        state.dialog = 'shopkeeper';
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
        Object.assign(state, { dialog: null, phase: 'done', cargo: 'delivered' });
        break;
    }

  }
  return { availableAction, navigate, interact };
}
