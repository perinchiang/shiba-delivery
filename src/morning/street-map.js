import { CURB_Z, rideMinZ } from './street-layout.js';
import { crossing } from './country-route.js';
import { orders } from './orders.js';

function drawCityDistrictMap(canvas, state, target) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio, ratio);

  const tall = height > width;
  const spanX = 140, spanZ = 92; // x in [-18, 122], z in [-44, 48]
  const centerX = 52, centerZ = 2;
  const pad = 20;
  const scale = Math.min(((tall ? height : width) - pad) / spanX, ((tall ? width : height) - pad) / spanZ);

  function point({ x, z }) {
    const along = (x - centerX) * scale, across = (z - centerZ) * scale;
    return tall ? [width / 2 + across, height / 2 - along] : [width / 2 + along, height / 2 + across];
  }
  function block(x0, z0, x1, z1, color) {
    const [a, b] = point({ x: x0, z: z0 }), [c, d] = point({ x: x1, z: z1 });
    ctx.fillStyle = color;
    ctx.fillRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
  }
  function path(stops, color, weight, dash = []) {
    ctx.beginPath();
    stops.forEach((p, i) => i ? ctx.lineTo(...point(p)) : ctx.moveTo(...point(p)));
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function label(name, p, { font = '600 11px system-ui', color = '#526258' } = {}) {
    const [x, y] = point(p);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f5f1de';
    ctx.strokeText(name, x, y);
    ctx.fillStyle = color;
    ctx.fillText(name, x, y);
  }

  // Sidewalk corridors
  block(-26, -2.0, 56, 9.4, '#dfdcc9');
  block(54, crossing.z - crossing.half - 2.6, 130, crossing.z + crossing.half + 2.6, '#dfdcc9');
  block(crossing.x - crossing.half - 2.6, -46, crossing.x + crossing.half + 2.6, 54, '#dfdcc9');

  // Carriageways: Old Street, City main avenue, and North/South side streets
  block(-26, CURB_Z, 58, 7.05, '#fff9eb');
  block(54, crossing.z - crossing.half, 130, crossing.z + crossing.half, '#fff9eb');
  block(crossing.x - crossing.half, -46, crossing.x + crossing.half, 54, '#fff9eb');

  // Center lane markings
  path([{ x: -24, z: crossing.z }, { x: crossing.x - crossing.half - 2, z: crossing.z }], '#d3c8aa', 1.4, [7, 6]);
  path([{ x: crossing.x + crossing.half + 2, z: crossing.z }, { x: 126, z: crossing.z }], '#d3c8aa', 1.4, [7, 6]);
  path([{ x: crossing.x, z: -46 }, { x: crossing.x, z: crossing.z - crossing.half - 2 }], '#d3c8aa', 1.4, [7, 6]);
  path([{ x: crossing.x, z: crossing.z + crossing.half + 2 }, { x: crossing.x, z: 54 }], '#d3c8aa', 1.4, [7, 6]);

  // Old Street building footprints
  for (let i = -12; i <= 44; i += 7) {
    block(i - 3.0, -7.2, i + 3.0, -2.1, '#aec6b8');
    block(i - 3.0, 9.5, i + 3.0, 14.5, '#bed0bd');
  }

  // 4 City Crossing quadrant blocks
  block(68, -12.5, 83.5, -3.9, '#a9c3b5');   // NW: 春风书局
  block(100.5, -12.5, 117, -3.9, '#b1c9ba'); // NE: 榕湾百货
  block(68, 12.2, 83.5, 21.2, '#b6cbb9');    // SW: 海棠茶行
  block(100.5, 12.2, 117, 21.2, '#a9c3b5');  // SE: 南方冰室

  // Side-street residential blocks
  block(74, -28.5, 83.5, -16.5, '#bed0bd');
  block(74, -41.5, 83.5, -31.0, '#c5d5c3');
  block(100.5, -28.5, 110.5, -16.5, '#c5d5c3');
  block(100.5, -41.5, 110.5, -31.0, '#bed0bd');
  block(74, 24.5, 83.5, 35.5, '#c5d5c3');
  block(74, 38.0, 83.5, 46.5, '#bed0bd');
  block(100.5, 24.5, 110.5, 35.5, '#bed0bd');
  block(100.5, 38.0, 110.5, 46.5, '#c5d5c3');

  // Route polylines along the road network
  const { door: pickup, customer } = state.order;
  const inside = state.mode === 'shop';
  const rider = inside ? pickup : state;
  const destination = inside ? pickup : target;
  const onSide = p => Math.abs(p.x - crossing.x) < 10 && Math.abs(p.z - crossing.z) > crossing.half + 2;
  const snap = p => onSide(p) ? { x: crossing.x, z: p.z } : { x: p.x, z: crossing.z };
  const route = (a, b) => onSide(a) !== onSide(b)
    ? [a, snap(a), { x: crossing.x, z: crossing.z }, snap(b), b]
    : [a, snap(a), snap(b), b];

  if (state.phase === 'offer' || state.phase === 'pickup') {
    path(route(pickup, customer.point), '#559478', 2.5, [4, 5]);
  }
  if (!inside && state.phase !== 'done') {
    path(route(rider, destination), '#267e70', 4);
  }

  // Subtle district & shop labels
  const districtLabels = [
    ['老街', { x: 8, z: -11.5 }],
    ['十字路口', { x: crossing.x, z: crossing.z }],
    ['春风书局', { x: 75.5, z: -8.2 }],
    ['榕湾百货', { x: 109, z: -8.2 }],
    ['海棠茶行', { x: 75.5, z: 16.8 }],
    ['南方冰室', { x: 109, z: 16.8 }],
  ];
  let pickupLabeled = false;
  for (const [name, pos] of districtLabels) {
    const active = name === state.order.name;
    if (active) pickupLabeled = true;
    label(name, pos, active ? { font: '700 12px system-ui', color: '#743f16' } : {});
  }

  // Pickup & delivery pins
  for (const [stop, fill] of [[pickup, '#bf702e'], [customer.point, '#32805e']]) {
    const [x, y] = point(stop);
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff8e9';
    ctx.stroke();
  }
  if (!pickupLabeled) {
    label(state.order.mapLabel || state.order.name, { x: pickup.x, z: pickup.z - 6 }, { font: '700 12px system-ui', color: '#743f16' });
  }
  const delPos = customer.point.x < 50
    ? { x: customer.point.x, z: customer.point.z - 7.5 }
    : customer.point.x < crossing.x
      ? { x: customer.point.x - 10, z: customer.point.z - 5.5 }
      : { x: customer.point.x + 10, z: customer.point.z + 5.5 };
  label(customer.mapLabel || customer.address, delPos, { font: '700 12px system-ui', color: '#245740' });

  // Shiba live directional triangle
  ctx.save();
  ctx.translate(...point(rider));
  ctx.rotate(Math.PI - state.yaw - (tall ? Math.PI / 2 : 0));
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 4); ctx.lineTo(-7, 7); ctx.closePath();
  ctx.fillStyle = '#273e48'; ctx.fill();
  ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// Draw the street in world metres. Turn the sheet in portrait to keep shop
// labels legible; draw text after projecting so it always reads upright.
export function drawStreetMap(canvas, state, target) {
  if (state.order?.cityRoute) {
    drawCityDistrictMap(canvas, state, target);
    return;
  }
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const tall = height > width;
  const scale = Math.min((tall ? height : width) / 59, (tall ? width : height) / 23);
  function point({ x, z }) {
    const along = (x - 15) * scale, across = (z - 3.3) * scale;
    return tall ? [width / 2 + across, height / 2 - along] : [width / 2 + along, height / 2 + across];
  }
  function block(x0, z0, x1, z1, color) {
    const [a, b] = point({x:x0,z:z0}), [c, d] = point({x:x1,z:z1});
    ctx.fillStyle = color;
    ctx.fillRect(a, b, c - a, d - b);
  }
  function path(stops, color, weight, dash = []) {
    ctx.beginPath();
    stops.forEach((p, i) => i ? ctx.lineTo(...point(p)) : ctx.moveTo(...point(p)));
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function label(name, p) {
    const [x, y] = point(p);
    ctx.font = '600 13px system-ui';
    ctx.textAlign = tall ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f5f1de';
    ctx.strokeText(name, x, y);
    ctx.fillStyle = '#323c36';
    ctx.fillText(name, x, y);
  }
  block(-100,-1.6,110,8.8,'#dfdcc9');
  block(-100,CURB_Z,110,7.05,'#fff9eb');
  path([{x:-100,z:(CURB_Z + 7.05) / 2},{x:110,z:(CURB_Z + 7.05) / 2}],'#d3c8aa',1.5,[8,7]);
  for (let i = -12; i <= 44; i += 7) {
    block(i-3.18,-6,i+3.18,-1.7,'#aec6b8');
    if (i < 44) block(27-i-3.18,8.9,27-i+3.18,13,'#bed0bd');
  }
  const { door: pickup, customer } = state.order;
  const inside = state.mode === 'shop';
  const rider = inside ? pickup : state;
  const destination = inside ? pickup : target;
  const lane = p => ({x:p.x,z:rideMinZ + .2});
  if (state.phase === 'offer' || state.phase === 'pickup') {
    path([pickup,lane(pickup),lane(customer.point),customer.point],'#559478',2.5,[4,5]);
  }
  if (!inside && state.phase !== 'done') {
    path([rider,lane(rider),lane(destination),destination],'#267e70',4);
  }
  const landmarks = new Map();
  for (const order of orders) if (!order.cityRoute) landmarks.set(order.storefront, [order.mapLabel, order.door]);
  landmarks.set(state.order.storefront, [state.order.mapLabel, pickup]);
  landmarks.set('destination', [customer.mapLabel, customer.point]);
  for (const [name, stop] of landmarks.values()) {
    const [x,y] = point(stop);
    ctx.beginPath();
    ctx.arc(x,y,stop === pickup || stop === customer.point ? 6 : 3,0,2*Math.PI);
    ctx.fillStyle = stop === customer.point ? '#32805e' : stop === pickup ? '#bf702e' : '#8c9b8d';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff8e9';
    ctx.stroke();
    label(name,{x:stop.x,z:-3.8});
  }
  ctx.save();
  ctx.translate(...point(rider));
  if (inside) {
    ctx.beginPath();
    ctx.arc(0,0,9,0,2*Math.PI);
    ctx.strokeStyle = '#273e48';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.rotate(Math.PI - state.yaw - (tall ? Math.PI/2 : 0));
    ctx.beginPath();
    ctx.moveTo(0,-10); ctx.lineTo(7,7); ctx.lineTo(0,4); ctx.lineTo(-7,7); ctx.closePath();
    ctx.fillStyle = '#273e48'; ctx.fill();
    ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}
