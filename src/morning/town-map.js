// Minimal crisp canvas mini-map for the Clean-Slate Rongwan Coastal Corner.
import { HERO_HAIKAZE, PLAZA_Z, RAIL_Z, BLVD_Z, SEAWALL_Z } from './coastal-town.js';

export function drawTownMap(canvas, state, goalPoint) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(240, canvas.clientWidth || 480);
  const h = Math.max(200, canvas.clientHeight || 360);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.save();
  ctx.scale(dpr, dpr);

  // World bounds shown on map: x in [-48..48], z in [-52..68]
  const minX = -48, maxX = 48, minZ = -52, maxZ = 68;
  const pad = 20;
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = (w - (maxX - minX) * scale) * 0.5 - minX * scale;
  const oy = (h - (maxZ - minZ) * scale) * 0.5 - minZ * scale;
  const px = x => ox + x * scale;
  const pz = z => oy + z * scale;

  // Soft green hillside background
  ctx.fillStyle = '#dce8cc';
  ctx.fillRect(0, 0, w, h);

  // Sparkling blue ocean south of seawall
  ctx.fillStyle = '#79bdd6';
  ctx.fillRect(0, pz(SEAWALL_Z), w, h - pz(SEAWALL_Z));
  ctx.strokeStyle = '#e7f4f8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, pz(SEAWALL_Z + 1.5));
  ctx.lineTo(w, pz(SEAWALL_Z + 1.5));
  ctx.stroke();

  // Warm sandstone terrace around Haikaze-so
  ctx.fillStyle = '#eadbc0';
  ctx.fillRect(px(3.8), pz(13.8), 15.2 * scale, 13.8 * scale);

  // Roads
  ctx.fillStyle = '#8b959e';
  ctx.fillRect(px(-4.0), pz(-52), 8.0 * scale, 102 * scale); // Main Slope Avenue
  ctx.fillRect(px(-48), pz(PLAZA_Z - 3.6), 96 * scale, 7.2 * scale); // Cross Street
  ctx.fillRect(px(-48), pz(BLVD_Z - 4.3), 96 * scale, 8.6 * scale); // Oceanfront Blvd

  // Coastal railway track
  ctx.strokeStyle = '#6c5a49';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, pz(RAIL_Z));
  ctx.lineTo(w, pz(RAIL_Z));
  ctx.stroke();
  ctx.setLineDash([]);

  // Hero Building "海风庄" footprint + exterior stairs
  ctx.fillStyle = '#f5e4c3';
  ctx.strokeStyle = '#473a30';
  ctx.lineWidth = 2;
  const hx = px(HERO_HAIKAZE.x - 4.25);
  const hz = pz(HERO_HAIKAZE.z - 3.94);
  ctx.fillRect(hx, hz, 8.5 * scale, 7.88 * scale);
  ctx.strokeRect(hx, hz, 8.5 * scale, 7.88 * scale);
  // Stairs accent
  ctx.fillStyle = '#4e9b99';
  ctx.fillRect(px(HERO_HAIKAZE.x - 5.62), pz(HERO_HAIKAZE.z - 2.6), 1.38 * scale, 6.4 * scale);

  // Labels
  ctx.fillStyle = '#362d26';
  ctx.font = '700 12px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('海风庄 · 海风拉面', px(HERO_HAIKAZE.x), pz(HERO_HAIKAZE.z + 7.2));
  ctx.fillStyle = '#4f6250';
  ctx.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('榕湾观海坡道 ↑', px(0), pz(-36));
  ctx.fillStyle = '#255870';
  ctx.fillText('榕湾海岸', px(0), pz(SEAWALL_Z + 8));

  // Pickup & Delivery pins when an order is active
  if (state.phase !== 'free' && state.order) {
    const drawPin = (pt, bg, tag) => {
      const x = px(pt.x), y = pz(pt.z);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fffaf0';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 10px "PingFang SC",sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, x, y + 0.5);
    };
    drawPin(state.order.door, '#d97b3e', '取');
    drawPin(state.order.customer.point, '#2e7d5e', '送');
  }

  // Active target beacon ring
  if (goalPoint && state.phase !== 'free' && state.phase !== 'done') {
    ctx.strokeStyle = '#f2b724';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px(goalPoint.x), pz(goalPoint.z), 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player heading arrow (Shiba)
  const sx = px(state.x), sy = pz(state.z);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-state.yaw + Math.PI);
  ctx.fillStyle = '#f7c52a';
  ctx.strokeStyle = '#362d26';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6.5, 7);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-6.5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
