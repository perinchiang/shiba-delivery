import { centerZ, roadEnd, landmarks } from './country-route.js';

export function drawRouteMap(canvas, state) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w*ratio);
  canvas.height = Math.round(h*ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const tall = h > w;
  const origin = tall ? 40 : 48;
  const along = ((tall ? h : w)-2*origin)/roadEnd;
  const across = (tall ? w : h)/180;
  const point = (x,z) => tall ? [w*.48 + (z-16)*across, h-origin-x*along] :
    [origin+x*along, h*.48 + (z-16)*across];
  ctx.beginPath();
  for (let x=0;x<roadEnd;x+=4) {
    const p=point(x,centerZ(x));
    if (x===0) ctx.moveTo(...p); else ctx.lineTo(...p);
  }
  ctx.lineWidth=6; ctx.lineCap='round'; ctx.strokeStyle='#6f957e'; ctx.stroke();
  ctx.font='600 13px system-ui'; ctx.textBaseline='middle';
  for (const stop of landmarks) {
    const [x,y]=point(stop.x,centerZ(stop.x));
    ctx.fillStyle='#355d50'; ctx.beginPath(); ctx.arc(x,y,4,0,2*Math.PI); ctx.fill();
    ctx.textAlign=tall ? 'left' : 'center';
    ctx.strokeStyle='#faf5e5'; ctx.lineWidth=3;
    const tx=x+(tall?10:0), ty=y+(tall?0:17);
    ctx.strokeText(stop.name,tx,ty); ctx.fillText(stop.name,tx,ty);
  }
  const [x,y]=point(state.x,state.z);
  ctx.beginPath(); ctx.arc(x,y,6,0,2*Math.PI); ctx.fillStyle='#bc6539'; ctx.fill();
  ctx.strokeStyle='#fff4d8'; ctx.lineWidth=2; ctx.stroke();
}
