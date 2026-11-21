import assert from 'node:assert/strict';
import { createDelivery, initialState } from '../src/morning/delivery.js';
import { nextOrder, orders, formatPay } from '../src/morning/orders.js';
import { doorFrame } from '../src/morning/sequence.js';

const third = {
  ...orders[0], id: 'fixture', label: '测试单', feeCents: 545, insuranceCents: 95,
  door: { x: 14, z: -.61 }, room: { ...orders[0].room, counter: { x: -1.6, z: .4 } },
  customer: { ...orders[0].customer, point: { x: 20, z: -.4 }, address: '测试地址' },
};
const catalog = [...orders, third];
assert.equal(nextOrder(orders.at(-1), catalog), third);
assert.equal(nextOrder(third, catalog), orders[0]);
assert.equal(formatPay(third.feeCents - third.insuranceCents), '¥4.50');
const state = { ...initialState(), order: third, phase: 'pickup', mode: 'walk', ...third.door };
const flow = createDelivery(state);
assert.equal(flow.navigate().point, third.door);
const door = { rotation: { y: 0 } };
function interact(expected) {
  assert.equal(flow.availableAction(), expected);
  flow.interact(expected);
}
interact('enter');
doorFrame(state, 2, door);
assert.equal(state.mode, 'shop');
assert.equal(flow.navigate().point, third.room.counter);
Object.assign(state, third.room.counter);
interact('talk');
interact('collect');
Object.assign(state, third.room.exit);
interact('exit');
assert.equal(state.x, third.door.x);
doorFrame(state, 3, door);
assert.equal(state.mode, 'walk');
Object.assign(state, { bikeX: third.customer.point.x, returnToBike: false, ...third.customer.point });
assert.deepEqual(flow.navigate(), { name: third.customer.address, point: third.customer.point });
interact('deliver');
interact('sign');
assert.equal(flow.availableAction(), 'statement');
console.log('PASS: a third order reuses a room, cycles, enters/exits and delivers to its configured customer.');
