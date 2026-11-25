#!/usr/bin/env node
/** Verify Clean-Slate Rongwan Haikaze-so order catalog, curbside pickup, 2F stair guard & earnings. */
import assert from 'node:assert/strict';
import { createDelivery, initialState } from '../src/morning/delivery.js';
import { formatPay, nextOrder, orders } from '../src/morning/orders.js';

assert.ok(orders.length >= 2, 'at least two Rongwan Haikaze-so orders exist');
assert.equal(orders[0].id, 'ramen201');
assert.equal(nextOrder(orders[0]).id, 'ramenSeawall');
assert.equal(nextOrder(orders[orders.length - 1]), orders[0]);
assert.equal(formatPay(420), '¥4.20');

// 1) Order 1: Haikaze Ramen 1F -> 2F 201 hook (requires actually climbing to 2F!)
const state = initialState();
const delivery = createDelivery(state);
assert.equal(state.phase, 'free');
assert.equal(delivery.availableAction(), 'park');

// Accept Order 1 and dismount at Haikaze Ramen 1F door
state.phase = 'pickup';
state.mode = 'walk';
state.x = orders[0].door.x;
state.z = orders[0].door.z;
assert.equal(delivery.availableAction(), 'talk');
delivery.interact('talk');
assert.equal(state.dialog, 'shopkeeper');
assert.equal(delivery.availableAction(), 'collect');
delivery.interact('collect');
assert.equal(state.phase, 'delivery');
assert.equal(state.cargo, 'hand');
assert.equal(state.returnToBike, false, 'upstairs delivery carries directly up stairs without repacking');

// Arrive at 2F 201 door hook (which sits inside elevated 2F corridor!)
state.x = orders[0].customer.point.x;
state.z = orders[0].customer.point.z;
assert.equal(delivery.availableAction(), 'deliver');
delivery.interact('deliver');
assert.equal(state.dialog, 'customer');
assert.equal(delivery.availableAction(), 'sign');
delivery.interact('sign');
assert.equal(state.phase, 'done');
assert.equal(state.completedCount, 1);
assert.equal(state.totalEarnedCents, 420);

// 2) Order 2: Seawall ride order sets returnToBike=true so courier packs in delivery box
state.order = orders[1];
state.phase = 'pickup';
state.cargo = 'none';
state.x = orders[1].door.x;
state.z = orders[1].door.z;
delivery.interact('talk');
delivery.interact('collect');
assert.equal(state.returnToBike, true, 'coastal ride order prompts packing into delivery box');

console.log('PASS: Rongwan Haikaze-so orders, 2F hook delivery, seawall packing & earnings.');
