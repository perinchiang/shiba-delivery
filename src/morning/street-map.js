import { CURB_Z } from './town.js';

import { orders } from './orders.js';

// Draw the street in world metres. Turn the sheet in portrait to keep shop
// labels legible; draw text after projecting so it always reads upright.
export function drawStreetMap(canvas, state, target) {
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
  path([{x:-100,z:4},{x:110,z:4}],'#d3c8aa',1.5,[8,7]);
  for (let i = -12; i <= 44; i += 7) {
    block(i-3.18,-6,i+3.18,-1.7,'#aec6b8');
    if (i < 44) block(27-i-3.18,8.9,27-i+3.18,13,'#bed0bd');
  }
  const { door: pickup, customer } = state.order;
  const inside = state.mode === 'shop';
  const rider = inside ? pickup : state;
  const destination = inside ? pickup : target;
  const lane = p => ({x:p.x,z:2.8});
  if (state.phase === 'offer' || state.phase === 'pickup') {
    path([pickup,lane(pickup),lane(customer.point),customer.point],'#559478',2.5,[4,5]);
  }
  if (!inside && state.phase !== 'done') {
    path([rider,lane(rider),lane(destination),destination],'#267e70',4);
  }
  const landmarks = new Map();
  for (const order of orders) landmarks.set(order.storefront, [order.mapLabel, order.door]);
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
