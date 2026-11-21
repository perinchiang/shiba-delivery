import { STOPS } from './town.js';

// A north-up schematic of the one playable street and the two shop rooms.
// Keep map coordinates separate indoors: the counter has room-local coordinates.
export function phoneMap(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, previous = '';
  const observer = new ResizeObserver(([entry]) => {
    width = Math.round(entry.contentRect.width);
    height = Math.round(entry.contentRect.height);
    previous = '';
  });
  observer.observe(canvas);

  return (state, target, expanded) => {
    if (!ctx || !width || !height) return;
    const inside = state.mode === 'shop';
    const key = [inside, expanded, state.phase, state.order, state.x.toFixed(1), state.z.toFixed(1),
      state.yaw.toFixed(1), target.x.toFixed(1), target.z.toFixed(1)].join('/');
    if (key === previous) return;
    previous = key;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
    ctx.fillStyle = '#dbe4cf';
    ctx.fillRect(0, 0, width, height);
    const span = inside ? 9 : expanded ? 54 : Math.max(19, Math.abs(target.x - state.x) + 9);
    const middle = inside ? 0 : expanded ? 15 : (target.x + state.x) / 2;
    const x = v => width / 2 + (v - middle) * width / span;
    const z = v => inside ? (v + 3.2) / 6.6 * height : height * (.48 + (v - 2.2) * .068);
    function rect(x0, z0, x1, z1, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x(x0), z(z0), x(x1) - x(x0), z(z1) - z(z0));
    }
    if (inside) {
      rect(-4.2, -3.1, 4.2, 2.9, '#faf0d9');
      rect(-1.9, -1.50, 1.9, -.65, '#bd956c');
      rect(-.85, 2.26, .85, 2.8, '#90a689');
    } else {
      rect(-30, .95, 56, 7.05, '#fff9e7');
      // Storefront blocks follow the same seven-metre bays as the scene.
      for (let i = -12; i <= 44; i += 7) {
        rect(i - 3.2, -5.3, i + 3.2, -1.65, '#b0c6ae');
        if (i < 44) rect(27 - i - 3.2, 8.9, 27 - i + 3.2, 13, '#b9cbb9');
      }
      if (expanded) {
        ctx.fillStyle = '#355542';
        ctx.font = '600 11px system-ui';
        ctx.textAlign = 'center';
        for (const [name, point] of [['榕记', STOPS.bunDoor], ['药店', STOPS.pharmacy], ['榕树里', STOPS.home]]) {
          ctx.fillText(name, x(point.x), Math.max(13, z(-2.8)));
        }
      }
    }
    const px = x(state.x), py = z(state.z), tx = x(target.x), ty = z(target.z);
    ctx.beginPath();
    ctx.moveTo(px, py);
    if (!inside && Math.abs(target.x - state.x) > 2) ctx.lineTo(tx, py);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = '#477d63';
    ctx.lineWidth = expanded ? 3 : 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx, ty, expanded ? 5 : 3.7, 0, 2 * Math.PI);
    ctx.fillStyle = '#be643a';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#fff7da';
    ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - state.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6.6);
    ctx.lineTo(5.2, 5.3);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5.2, 5.3);
    ctx.closePath();
    ctx.fillStyle = '#224f49';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
}
