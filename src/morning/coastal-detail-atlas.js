// Procedural 1024x1024 stylized East-Asian coastal street detail atlas (Color + Emissive + Roughness).
// Shared across Direction A benchmark & future modular buildings (+1 draw call for all rich surface details!).
// Uses glTF UV convention (flipY = false): canvas (x, y) in [0..1024] maps directly to UV (x/1024, y/1024).
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from '../core/textures.js';

const S = 1024;
const FONT_JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans SC", "PingFang SC", sans-serif';
const FONT_SERIF = '"Hiragino Mincho ProN", "Songti SC", serif';

function rrect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function setRough(rctx, x, y, w, h, roughness) {
  const v = Math.round(Math.max(0, Math.min(1, roughness)) * 255);
  rctx.fillStyle = `rgb(${v},${v},${v})`;
  rctx.fillRect(x, y, w, h);
}

function paintVendingMachine(ctx, ectx, rctx, ox, oy, variant = 'white') {
  const w = 256, h = 512;
  const isPink = variant === 'pink';
  const bodyTop = isPink ? '#f7dce1' : '#f4f2eb';
  const bodyBot = isPink ? '#eabec8' : '#e3dfd3';
  const accent = isPink ? '#e2748b' : '#2f82b5';
  const accentLite = isPink ? '#f4a8b8' : '#74c5dd';

  // Outer enameled cabinet body
  const bg = ctx.createLinearGradient(ox, oy, ox + w, oy + h);
  bg.addColorStop(0, bodyTop);
  bg.addColorStop(1, bodyBot);
  ctx.fillStyle = bg;
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.34);

  // Subtle door seam & top header brand stripe
  ctx.strokeStyle = 'rgba(70, 75, 82, 0.28)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 6, oy + 6, w - 12, h - 12);

  // Top illuminated brand header strip
  const hdrGrad = ctx.createLinearGradient(ox + 14, oy + 14, ox + w - 14, oy + 48);
  hdrGrad.addColorStop(0, accent);
  hdrGrad.addColorStop(1, accentLite);
  rrect(ctx, ox + 14, oy + 14, w - 28, 34, 6);
  ctx.fillStyle = hdrGrad;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 18px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isPink ? 'さくらドリンク' : 'SHIOKAZE DRINK', ox + w * 0.5, oy + 31);
  // Gentle header night glow
  ectx.fillStyle = isPink ? 'rgba(255, 195, 208, 0.65)' : 'rgba(175, 230, 255, 0.65)';
  ectx.fillRect(ox + 16, oy + 16, w - 32, 30);

  // Large glass showcase window (x: 16..240, y: 56..308)
  const sx = ox + 16, sy = oy + 56, sw = w - 32, sh = 252;
  rrect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, 8);
  ctx.fillStyle = '#6f7880';
  ctx.fill();

  const scBg = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  scBg.addColorStop(0, '#fffef7');
  scBg.addColorStop(0.5, '#f2f7fa');
  scBg.addColorStop(1, '#e4eff5');
  rrect(ctx, sx, sy, sw, sh, 6);
  ctx.fillStyle = scBg;
  ctx.fill();
  setRough(rctx, sx, sy, sw, sh, 0.12); // glossy front glass!

  // Emissive interior showcase backlight (controlled luminance so colorful drinks NEVER blow out to white at night!)
  const eGrad = ectx.createLinearGradient(sx, sy, sx, sy + sh);
  eGrad.addColorStop(0, '#96a8b2');
  eGrad.addColorStop(1, '#7c93a0');
  ectx.fillStyle = eGrad;
  ectx.fillRect(sx + 2, sy + 2, sw - 4, sh - 4);

  // 3 shelves of detailed colorful Japanese drinks + cold/hot bars + buttons
  const palettes = isPink
    ? [
        ['#f28da8', '#7ac77e', '#f7c54a', '#5daee0', '#e36154', '#c993db'],
        ['#62b3e3', '#f5a149', '#eb6c7d', '#58b07b', '#f2cf57', '#89a7e0'],
        ['#d95548', '#5287c4', '#70b35e', '#f0a63e', '#d67da6', '#4ba8a3'],
      ]
    : [
        ['#40a862', '#47a8db', '#df4d3f', '#f2bd38', '#336db5', '#76c456'],
        ['#f08e36', '#43b3a6', '#e05344', '#5698d6', '#e8c446', '#9b6bc7'],
        ['#3a5b94', '#cf4436', '#d49a44', '#4d8c57', '#6c4932', '#3988a8'],
      ];

  for (let row = 0; row < 3; row++) {
    const ry = sy + 8 + row * 82;
    const isHotRow = row === 2 && !isPink;

    // Subtle interior shelf shadow backband
    ctx.fillStyle = 'rgba(130, 155, 175, 0.14)';
    ctx.fillRect(sx + 4, ry + 48, sw - 8, 8);

    // 6 miniature illustrated cans / PET bottles per shelf
    for (let i = 0; i < 6; i++) {
      const bx = sx + 10 + i * 35;
      const col = palettes[row][i];
      const isBottle = (row === 0) || (row === 1 && i % 2 === 0);

      if (isBottle) {
        // PET bottle silhouette: cap + neck + shoulder + body + label + specular strip
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : col;
        ctx.fillRect(bx + 8, ry + 4, 10, 6); // cap
        ctx.fillStyle = col;
        rrect(ctx, bx + 4, ry + 11, 18, 41, 5);
        ctx.fill();
        // Crisp white/cream drink label band
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(bx + 4, ry + 22, 18, 15);
        ctx.fillStyle = col;
        ctx.fillRect(bx + 7, ry + 26, 12, 4);
        ctx.fillStyle = '#333b42';
        ctx.fillRect(bx + 8, ry + 32, 10, 2);
        // Glass bottle highlight
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(bx + 6, ry + 13, 3, 35);
      } else {
        // Aluminum beverage can: silver rim + colorful cylinder + stripe + highlight
        ctx.fillStyle = '#c8d0d6';
        ctx.fillRect(bx + 5, ry + 16, 16, 3);
        ctx.fillStyle = col;
        rrect(ctx, bx + 4, ry + 18, 18, 34, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(bx + 4, ry + 27, 18, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.fillRect(bx + 6, ry + 20, 3, 29);
      }

      // Preserve rich bottle/can colors & crisp labels in emissive map so backlit drinks stay readable at night!
      ectx.fillStyle = col;
      ectx.globalAlpha = 0.88;
      ectx.fillRect(bx + 4, ry + 12, 18, 40);
      ectx.fillStyle = 'rgba(255, 252, 240, 0.55)';
      ectx.fillRect(bx + 4, ry + 23, 18, 12);
      ectx.globalAlpha = 1.0;
    }

    // Iconic Japanese cold (blue つめた〜い) / hot (red あたたか〜い) strip
    const barY = ry + 54;
    ctx.fillStyle = isHotRow ? '#d64538' : '#2d83c4';
    ctx.fillRect(sx + 4, barY, sw - 8, 11);
    ectx.fillStyle = isHotRow ? '#b83226' : '#1e68a6';
    ectx.fillRect(sx + 4, barY, sw - 8, 11);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 8px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.fillText(isHotRow ? 'あたたか〜い  ¥130' : 'つめた〜い  ¥120', sx + sw * 0.5, barY + 6);

    // Push buttons with glowing LED dots underneath each drink
    const btnY = ry + 67;
    ctx.fillStyle = '#d5dce0';
    ctx.fillRect(sx + 4, btnY, sw - 8, 11);
    ectx.fillStyle = '#2c3438';
    ectx.fillRect(sx + 4, btnY, sw - 8, 11);
    for (let i = 0; i < 6; i++) {
      const bx = sx + 10 + i * 35;
      rrect(ctx, bx + 2, btnY + 2, 22, 7, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#9aa5ad';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Tiny glowing green/blue ready indicator dot
      ctx.fillStyle = isHotRow ? '#f27238' : '#40c278';
      ctx.fillRect(bx + 10, btnY + 4, 6, 3);
      ectx.fillStyle = isHotRow ? '#ff9d5c' : '#7ef7b2';
      ectx.fillRect(bx + 9, btnY + 3, 8, 5);
    }
  }

  // Diagonal sunlit sky reflection sheen across the showcase glass
  ctx.save();
  rrect(ctx, sx, sy, sw, sh, 6);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.moveTo(sx + 25, sy);
  ctx.lineTo(sx + 82, sy);
  ctx.lineTo(sx + 10, sy + sh);
  ctx.lineTo(sx - 25, sy + sh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.beginPath();
  ctx.moveTo(sx + 102, sy);
  ctx.lineTo(sx + 122, sy);
  ctx.lineTo(sx + 50, sy + sh);
  ctx.lineTo(sx + 30, sy + sh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Middle control zone (y: 318..410): Left illuminated coastal graphic poster + Right coin/IC card panel
  const px = ox + 18, py = oy + 322, pw = 132, ph = 84;
  const pGrad = ctx.createLinearGradient(px, py, px, py + ph);
  if (isPink) {
    pGrad.addColorStop(0, '#ffe8ef');
    pGrad.addColorStop(0.55, '#f6b3c6');
    pGrad.addColorStop(1, '#e888a4');
  } else {
    pGrad.addColorStop(0, '#dff4fc');
    pGrad.addColorStop(0.52, '#62c3df');
    pGrad.addColorStop(1, '#2678b0');
  }
  rrect(ctx, px, py, pw, ph, 6);
  ctx.fillStyle = pGrad;
  ctx.fill();
  // Cute sun + coastal wave graphic on lower poster
  ctx.fillStyle = isPink ? '#fff6d1' : '#ffe37a';
  ctx.beginPath();
  ctx.arc(px + 98, py + 24, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(px, py + 62);
  ctx.quadraticCurveTo(px + 34, py + 48, px + 68, py + 60);
  ctx.quadraticCurveTo(px + 102, py + 72, px + pw, py + 56);
  ctx.lineTo(px + pw, py + ph);
  ctx.lineTo(px, py + ph);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 16px ${FONT_JP}`;
  ctx.textAlign = 'left';
  ctx.fillText(isPink ? 'ももサイダー' : '海風サイダー', px + 10, py + 32);
  ctx.font = `600 10px ${FONT_JP}`;
  ctx.fillText('爽やか微炭酸!', px + 10, py + 50);
  // Soft backlit glow on graphic poster at night
  ectx.fillStyle = isPink ? 'rgba(255, 200, 218, 0.48)' : 'rgba(130, 215, 245, 0.52)';
  ectx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
  setRough(rctx, px, py, pw, ph, 0.22);

  // Right payment/coin/bill console
  const cx = ox + 162, cy = oy + 322, cw = 76, ch = 84;
  rrect(ctx, cx, cy, cw, ch, 6);
  ctx.fillStyle = '#384047';
  ctx.fill();
  setRough(rctx, cx, cy, cw, ch, 0.40);
  // Digital LED readout
  ctx.fillStyle = '#18221c';
  ctx.fillRect(cx + 8, cy + 8, 60, 16);
  ctx.fillStyle = '#ff6a3a';
  ctx.font = '700 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('120', cx + 62, cy + 17);
  ectx.fillStyle = '#ff7242';
  ectx.fillRect(cx + 32, cy + 11, 30, 10);
  // Coin slot + bill acceptor + return lever
  ctx.fillStyle = '#8b959e';
  ctx.beginPath();
  ctx.arc(cx + 22, cy + 44, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d2226';
  ctx.fillRect(cx + 20, cy + 38, 4, 12);
  ctx.fillStyle = '#5c6670';
  ctx.fillRect(cx + 40, cy + 34, 28, 12);
  ctx.fillStyle = '#181c1f';
  ctx.fillRect(cx + 44, cy + 39, 20, 3);
  // IC card touch pad (blue glow)
  rrect(ctx, cx + 10, cy + 60, 56, 16, 3);
  ctx.fillStyle = '#2d7fb8';
  ctx.fill();
  ectx.fillStyle = 'rgba(95, 195, 255, 0.45)';
  ectx.fillRect(cx + 12, cy + 62, 52, 12);

  // Lower drink pickup bay (y: 422..494)
  rrect(ctx, ox + 22, oy + 422, w - 44, 70, 8);
  ctx.fillStyle = '#242a2e';
  ctx.fill();
  rrect(ctx, ox + 30, oy + 430, w - 60, 54, 5);
  ctx.fillStyle = '#181c1f';
  ctx.fill();
  // Metallic push flap highlight bar
  ctx.fillStyle = '#5c656d';
  ctx.fillRect(ox + 36, oy + 434, w - 72, 6);
  setRough(rctx, ox + 22, oy + 422, w - 44, 70, 0.58);
}

function paintAcFront(ctx, rctx, ox, oy) {
  const w = 256, h = 256;
  // Clean off-white enameled sheet metal housing
  const g = ctx.createLinearGradient(ox, oy, ox, oy + h);
  g.addColorStop(0, '#efede4');
  g.addColorStop(1, '#dedbd0');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.46);

  // Subtle panel bevel & right service plate seam
  ctx.strokeStyle = 'rgba(90, 96, 102, 0.30)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 6, oy + 6, w - 12, h - 12);
  ctx.beginPath();
  ctx.moveTo(ox + 184, oy + 8);
  ctx.lineTo(ox + 184, oy + h - 8);
  ctx.stroke();

  // Deep circular fan shroud + 3 curved propeller blades inside
  const fx = ox + 100, fy = oy + 128, fr = 76;
  const cavity = ctx.createRadialGradient(fx, fy, 10, fx, fy, fr);
  cavity.addColorStop(0, '#2a3236');
  cavity.addColorStop(0.75, '#3b4449');
  cavity.addColorStop(1, '#252c30');
  ctx.fillStyle = cavity;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  ctx.fill();

  // 3 stylized fan blades
  ctx.save();
  ctx.translate(fx, fy);
  ctx.fillStyle = '#556168';
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(38, -28, 62, -4);
    ctx.quadraticCurveTo(46, 26, 0, 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#3a4247';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Concentric wire grille rings + radial guard struts
  ctx.strokeStyle = '#cfd3d0';
  ctx.lineWidth = 2.6;
  for (let r = 22; r <= fr; r += 11) {
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(a) * 14, fy + Math.sin(a) * 14);
    ctx.lineTo(fx + Math.cos(a) * (fr + 2), fy + Math.sin(a) * (fr + 2));
    ctx.stroke();
  }
  // Outer recessed bezel ring
  ctx.strokeStyle = '#9aa19e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(fx, fy, fr + 3, 0, Math.PI * 2);
  ctx.stroke();
  setRough(rctx, fx - fr, fy - fr, fr * 2, fr * 2, 0.35);

  // Right side brand badge, warning sticker & recessed handle
  rrect(ctx, ox + 196, oy + 42, 44, 16, 3);
  ctx.fillStyle = '#3b6c67';
  ctx.fill();
  ctx.fillStyle = '#f5f2e6';
  ctx.font = '700 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHIBA', ox + 218, oy + 50);

  // Tiny yellow/grey spec label
  ctx.fillStyle = '#f0cc5c';
  ctx.fillRect(ox + 200, oy + 72, 36, 10);
  ctx.fillStyle = '#a6aca8';
  ctx.fillRect(ox + 200, oy + 86, 36, 20);
  // Horizontal louver intake slots near bottom-right
  ctx.fillStyle = '#8b9290';
  for (let k = 0; k < 5; k++) {
    ctx.fillRect(ox + 196, oy + 178 + k * 10, 44, 4);
  }
}

function paintMenuBoard(ctx, rctx, ox, oy) {
  const w = 256, h = 384;
  // Warm cedar wooden border frame
  ctx.fillStyle = '#8d5936';
  ctx.fillRect(ox, oy, w, h);
  ctx.strokeStyle = '#623c23';
  ctx.lineWidth = 4;
  ctx.strokeRect(ox + 4, oy + 4, w - 8, h - 8);

  // Matte espresso chalkboard surface
  const bx = ox + 16, by = oy + 18, bw = w - 32, bh = h - 36;
  ctx.fillStyle = '#2c3531';
  ctx.fillRect(bx, by, bw, bh);
  // Soft dusty chalk texture speckles
  ctx.fillStyle = 'rgba(255,250,235,0.04)';
  for (let i = 0; i < 80; i++) {
    ctx.fillRect(bx + ((i * 53) % bw), by + ((i * 97) % bh), 14, 2);
  }
  setRough(rctx, ox, oy, w, h, 0.84);

  // Decorative chalk header border
  ctx.strokeStyle = 'rgba(246, 232, 198, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 8, by + 8, bw - 16, bh - 16);

  // Header badge
  ctx.fillStyle = '#e5684d';
  rrect(ctx, bx + 26, by + 20, bw - 52, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#fff9ea';
  ctx.font = `700 20px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('本日のおすすめ', ox + w * 0.5, by + 37);

  // Cute stylized chalk ramen bowl illustration
  const rcx = ox + w * 0.5, rcy = by + 112;
  ctx.strokeStyle = '#f7ebd0';
  ctx.lineWidth = 2.5;
  // Steam wisps
  for (const dx of [-18, 0, 18]) {
    ctx.beginPath();
    ctx.moveTo(rcx + dx, rcy - 36);
    ctx.quadraticCurveTo(rcx + dx - 6, rcy - 44, rcx + dx + 3, rcy - 52);
    ctx.stroke();
  }
  // Bowl & golden broth + narutomaki swirl
  ctx.fillStyle = '#f2c76e';
  ctx.beginPath();
  ctx.ellipse(rcx, rcy - 12, 34, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4513d';
  ctx.beginPath();
  ctx.arc(rcx, rcy - 12, 34, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff7e8';
  ctx.fillRect(rcx - 16, rcy + 20, 32, 6);
  // Narutomaki pink swirl + green onion dots
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rcx + 14, rcy - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8748b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(rcx + 14, rcy - 14, 3.5, 0, Math.PI * 1.6);
  ctx.stroke();
  ctx.fillStyle = '#6db35b';
  ctx.fillRect(rcx - 16, rcy - 16, 12, 5);

  // Menu items in crisp warm chalk lettering
  const items = [
    ['潮風塩ラーメン', '¥780', '#fff7e2'],
    ['特製チャーシュー', '¥920', '#ffe49e'],
    ['手作り焼餃子', '¥420', '#fff7e2'],
    ['海街サイダー', '¥280', '#a8e2f0'],
  ];
  ctx.textAlign = 'left';
  items.forEach(([name, price, col], idx) => {
    const iy = by + 168 + idx * 42;
    ctx.fillStyle = col;
    ctx.font = `700 17px ${FONT_JP}`;
    ctx.fillText(name, bx + 18, iy);
    ctx.textAlign = 'right';
    ctx.fillText(price, bx + bw - 18, iy);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(255,248,230,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 18, iy + 16);
    ctx.lineTo(bx + bw - 18, iy + 16);
    ctx.stroke();
  });

  ctx.fillStyle = '#f5d278';
  ctx.font = `600 13px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.fillText('営業時間 11:00 - 22:00', ox + w * 0.5, by + bh - 24);
}

function paintWindow(ctx, ectx, rctx, ox, oy, kind = 'apt') {
  const w = 256, h = 256;
  setRough(rctx, ox, oy, w, h, 0.12); // glossy sky-reflecting glass!

  // Daytime sunlit coastal glass gradient (deep blue-teal bottom -> crisp sky reflection top)
  const g = ctx.createLinearGradient(ox, oy, ox + w * 0.6, oy + h);
  if (kind === 'shop') {
    g.addColorStop(0, '#5a8381');
    g.addColorStop(0.55, '#416969');
    g.addColorStop(1, '#315254');
  } else {
    g.addColorStop(0, '#6c9aa6');
    g.addColorStop(0.5, '#4b7880');
    g.addColorStop(1, '#3a6068');
  }
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, w, h);

  // Subtle interior curtain / blind folds visible softly behind glass
  if (kind === 'apt') {
    ctx.fillStyle = 'rgba(240, 236, 224, 0.16)';
    ctx.fillRect(ox + 10, oy + 10, 62, h - 20);
    ctx.fillRect(ox + w - 72, oy + 10, 62, h - 20);
    ctx.strokeStyle = 'rgba(30, 52, 58, 0.18)';
    ctx.lineWidth = 3;
    for (let x = 22; x < 70; x += 14) {
      ctx.beginPath(); ctx.moveTo(ox + x, oy + 10); ctx.lineTo(ox + x, oy + h - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + w - x, oy + 10); ctx.lineTo(ox + w - x, oy + h - 10); ctx.stroke();
    }
  } else {
    // Warm ramen shop pendant lamps & counter shadow subtly hinted behind glass
    ctx.fillStyle = 'rgba(255, 224, 155, 0.18)';
    ctx.beginPath(); ctx.arc(ox + 76, oy + 72, 34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ox + 180, oy + 72, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(24, 38, 40, 0.25)';
    ctx.fillRect(ox, oy + 182, w, 74);
  }

  // Crisp Ghibli-style diagonal sky reflection streaks!
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip();
  ctx.fillStyle = 'rgba(220, 245, 255, 0.26)';
  ctx.beginPath();
  ctx.moveTo(ox + 42, oy); ctx.lineTo(ox + 108, oy);
  ctx.lineTo(ox - 12, oy + h); ctx.lineTo(ox - 78, oy + h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(230, 248, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(ox + 134, oy); ctx.lineTo(ox + 162, oy);
  ctx.lineTo(ox + 42, oy + h); ctx.lineTo(ox + 14, oy + h);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Inner recessed dark window frame shadow
  ctx.strokeStyle = 'rgba(24, 42, 46, 0.35)';
  ctx.lineWidth = 10;
  ctx.strokeRect(ox + 5, oy + 5, w - 10, h - 10);

  // Rich textured night emissive interior glow (warm ceiling light -> cozy lower falloff + soft curtains!)
  const eg = ectx.createLinearGradient(ox, oy, ox, oy + h);
  if (kind === 'shop') {
    eg.addColorStop(0, '#ffdc86');
    eg.addColorStop(0.55, '#ffb74d');
    eg.addColorStop(1, '#c97828');
  } else {
    eg.addColorStop(0, '#ffe399');
    eg.addColorStop(0.65, '#f2a84b');
    eg.addColorStop(1, '#c77a32');
  }
  ectx.fillStyle = eg;
  ectx.fillRect(ox + 6, oy + 6, w - 12, h - 12);
  if (kind === 'apt') {
    // Soft curtain folds silhouette in night glow!
    ectx.fillStyle = 'rgba(90, 48, 18, 0.22)';
    ectx.fillRect(ox + 8, oy + 8, 54, h - 16);
    ectx.fillRect(ox + w - 62, oy + 8, 54, h - 16);
    // Horizontal venetian blind whisper lines
    ectx.fillStyle = 'rgba(70, 38, 15, 0.14)';
    for (let y = 24; y < h - 16; y += 20) ectx.fillRect(ox + 8, oy + y, w - 16, 4);
  } else {
    // Warm pendant glow hotspots in ramen shop at night
    ectx.fillStyle = 'rgba(255, 250, 215, 0.55)';
    ectx.beginPath(); ectx.arc(ox + 76, oy + 68, 28, 0, Math.PI * 2); ectx.fill();
    ectx.beginPath(); ectx.arc(ox + 180, oy + 68, 28, 0, Math.PI * 2); ectx.fill();
  }
}

function paintNorenPanels(ctx, rctx, ox, oy) {
  // 4 distinct vertical crimson fabric panels (each 128x256) spelling 潮 風 拉 麺!
  const chars = ['潮', '風', '拉', '麺'];
  setRough(rctx, ox, oy, 512, 256, 0.92);

  for (let i = 0; i < 4; i++) {
    const px = ox + i * 128;
    const g = ctx.createLinearGradient(px, oy, px, oy + 256);
    g.addColorStop(0, '#b53128');
    g.addColorStop(0.15, '#c93a30');
    g.addColorStop(0.85, '#bf342a');
    g.addColorStop(1, '#9d271f');
    ctx.fillStyle = g;
    ctx.fillRect(px, oy, 128, 256);

    // Subtle woven cotton vertical slub threads & horizontal texture
    ctx.fillStyle = 'rgba(255, 232, 210, 0.05)';
    for (let x = 4; x < 128; x += 6) ctx.fillRect(px + x, oy, 1.5, 256);
    ctx.fillStyle = 'rgba(40, 10, 8, 0.06)';
    for (let y = 8; y < 256; y += 9) ctx.fillRect(px, oy + y, 128, 1.5);

    // Top rod sleeve seam & bottom double-stitched hem
    ctx.fillStyle = 'rgba(55, 12, 10, 0.30)';
    ctx.fillRect(px, oy + 22, 128, 4);
    ctx.fillRect(px, oy + 240, 128, 3);
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px + 6, oy + 245); ctx.lineTo(px + 122, oy + 245);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crisp off-white circular crest & calligraphy kanji
    const cx = px + 64, cy = oy + 126;
    ctx.strokeStyle = 'rgba(250, 242, 224, 0.86)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#faf2e0';
    ctx.font = `700 48px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chars[i], cx, cy + 2);

    // Subtle cream wave motif along bottom
    ctx.strokeStyle = 'rgba(250, 242, 224, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      ctx.arc(px + 22 + k * 42, oy + 224, 21, Math.PI * 1.15, Math.PI * 1.85);
    }
    ctx.stroke();
  }
}

function paintMosaicTiles(ctx, rctx, ox, oy) {
  const w = 256, h = 256;
  // Clean warm pale grout background
  ctx.fillStyle = '#f2ece0';
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.18); // glossy glazed ceramic!

  const cols = ['#f0beb8', '#b8dfd2', '#f5dfa2', '#bcd4ea', '#f8f2e2', '#cce0b8'];
  const n = 5;
  const step = w / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tx = ox + c * step + 3;
      const ty = oy + r * step + 3;
      const ts = step - 6;
      const hex = cols[(r * 3 + c * 2 + (r % 2)) % cols.length];
      rrect(ctx, tx, ty, ts, ts, 3.5);
      ctx.fillStyle = hex;
      ctx.fill();
      // Crisp top-left ceramic glaze highlight & subtle bottom-right bevel shadow
      ctx.fillStyle = 'rgba(255,255,255,0.44)';
      ctx.fillRect(tx + 2, ty + 2, ts - 4, 5);
      ctx.fillRect(tx + 2, ty + 2, 4, ts - 6);
      ctx.fillStyle = 'rgba(70, 62, 52, 0.16)';
      ctx.fillRect(tx + 2, ty + ts - 4, ts - 4, 3.5);
    }
  }
}

function paintWoodDoor(ctx, rctx, ox, oy) {
  const w = 256, h = 256;
  ctx.fillStyle = '#9c623d';
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.56);

  // Vertical cedar planks with gentle tone variation & soft wood grain
  const planks = 6;
  const pw = w / planks;
  const tones = ['#9e643f', '#925a37', '#a66b44', '#8e5735', '#a16640', '#965d39'];
  for (let i = 0; i < planks; i++) {
    const px = ox + i * pw;
    ctx.fillStyle = tones[i];
    ctx.fillRect(px, oy, pw, h);
    // Subtle vertical wood fibers
    for (let s = 0; s < 10; s++) {
      ctx.fillStyle = s % 2 === 0 ? 'rgba(255,230,195,0.08)' : 'rgba(55,28,14,0.08)';
      ctx.fillRect(px + 3 + s * 4, oy, 2, h);
    }
    // Crisp tongue-and-groove plank groove
    ctx.fillStyle = 'rgba(48, 26, 14, 0.42)';
    ctx.fillRect(px, oy, 2.5, h);
    ctx.fillStyle = 'rgba(255, 224, 185, 0.16)';
    ctx.fillRect(px + 2.5, oy, 1.5, h);
  }
  // Horizontal rail border top & bottom
  ctx.fillStyle = '#734529';
  ctx.fillRect(ox, oy, w, 14);
  ctx.fillRect(ox, oy + h - 18, w, 18);
}

function paintAptDoor(ctx, rctx, ox, oy) {
  const w = 256, h = 256;
  // Soft coastal seafoam-teal painted steel apartment door
  const g = ctx.createLinearGradient(ox, oy, ox + w, oy + h);
  g.addColorStop(0, '#7ca599');
  g.addColorStop(1, '#688f84');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.36);

  // Subtle recessed architectural door panels
  ctx.strokeStyle = 'rgba(35, 62, 58, 0.34)';
  ctx.lineWidth = 4;
  rrect(ctx, ox + 22, oy + 18, w - 44, 108, 4);
  ctx.stroke();
  rrect(ctx, ox + 22, oy + 144, w - 44, 92, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230, 248, 242, 0.28)';
  ctx.lineWidth = 2;
  rrect(ctx, ox + 25, oy + 21, w - 50, 102, 3);
  ctx.stroke();

  // Brass peephole (ドアスコープ) centered above mid-rail
  ctx.fillStyle = '#c9b378';
  ctx.beginPath(); ctx.arc(ox + w * 0.5, oy + 82, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#252d2c';
  ctx.beginPath(); ctx.arc(ox + w * 0.5, oy + 82, 3.5, 0, Math.PI * 2); ctx.fill();

  // Brushed stainless mail slot cover plate
  rrect(ctx, ox + 86, oy + 158, 84, 24, 3);
  ctx.fillStyle = '#b9c4c2';
  ctx.fill();
  ctx.fillStyle = '#3c4948';
  ctx.fillRect(ox + 94, oy + 168, 68, 5);
}

function paintLanternGlow(ctx, ectx, rctx, ox, oy) {
  const w = 256, h = 256;
  setRough(rctx, ox, oy, w, h, 0.45);
  // Warm Japanese paper chochin / frosted glass sconce
  const g = ctx.createRadialGradient(ox + w * 0.5, oy + h * 0.5, 16, ox + w * 0.5, oy + h * 0.5, 140);
  g.addColorStop(0, '#fff9e6');
  g.addColorStop(0.6, '#fce3a4');
  g.addColorStop(1, '#e8b468');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, w, h);

  // Delicate horizontal lantern bamboo ribs
  ctx.strokeStyle = 'rgba(145, 76, 32, 0.28)';
  ctx.lineWidth = 3;
  for (let y = 24; y < h; y += 28) {
    ctx.beginPath(); ctx.moveTo(ox, oy + y); ctx.lineTo(ox + w, oy + y); ctx.stroke();
  }
  // Warm deterministic emissive night glow
  const eg = ectx.createRadialGradient(ox + w * 0.5, oy + h * 0.5, 14, ox + w * 0.5, oy + h * 0.5, 140);
  eg.addColorStop(0, '#fff5cc');
  eg.addColorStop(0.65, '#ffbe59');
  eg.addColorStop(1, '#e88b2e');
  ectx.fillStyle = eg;
  ectx.fillRect(ox, oy, w, h);
}

function paintCrateSide(ctx, rctx, ox, oy) {
  const w = 256, h = 256;
  // White/neutral molded crate lattice pattern (multiplied cleanly by vertex color per crate!)
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.42);
  // Molded reinforcement ribs & side handle slot
  ctx.fillStyle = '#d4d4d4';
  for (let x = 24; x < w - 16; x += 36) {
    ctx.fillRect(ox + x, oy + 26, 14, h - 52);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox, oy, w, 26);
  ctx.fillRect(ox, oy + h - 22, w, 22);
  // Hand-grip cutout shadow
  rrect(ctx, ox + 82, oy + 36, 92, 34, 12);
  ctx.fillStyle = '#484848';
  ctx.fill();
}

function paintPosterWall(ctx, rctx, ox, oy) {
  const w = 256, h = 128;
  // Retro coastal summer ramen poster ("冷やし中華 始めました" / coastal town notice)
  ctx.fillStyle = '#faf5e4';
  ctx.fillRect(ox, oy, w, h);
  setRough(rctx, ox, oy, w, h, 0.78);
  ctx.strokeStyle = '#387ea8';
  ctx.lineWidth = 6;
  ctx.strokeRect(ox + 8, oy + 8, w - 16, h - 16);
  // Cool summer wave band
  ctx.fillStyle = '#6ec2e0';
  ctx.fillRect(ox + 12, oy + 12, w - 24, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 14px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('〜 榕湾・海風商店街 〜', ox + w * 0.5, oy + 24);
  ctx.fillStyle = '#c83c32';
  ctx.font = `700 28px ${FONT_SERIF}`;
  ctx.fillText('冷やし中華', ox + w * 0.5, oy + 66);
  ctx.fillStyle = '#2f5866';
  ctx.font = `700 18px ${FONT_JP}`;
  ctx.fillText('はじめました！', ox + w * 0.5, oy + 98);
}

let cachedAtlas = null;

export function getCoastalDetailAtlas() {
  if (cachedAtlas) return cachedAtlas;

  const colorC = makeCanvas(S, S);
  const emissiveC = makeCanvas(S, S);
  const roughC = makeCanvas(S, S);

  const ctx = colorC.ctx;
  const ectx = emissiveC.ctx;
  const rctx = roughC.ctx;

  // Base defaults: neutral light plaster color, black (unlit) emissive, matte 0.85 roughness
  ctx.fillStyle = '#f2ead4';
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, S, S);
  setRough(rctx, 0, 0, S, S, 0.85);

  paintVendingMachine(ctx, ectx, rctx, 0, 0, 'white');
  paintVendingMachine(ctx, ectx, rctx, 256, 0, 'pink');
  paintAcFront(ctx, rctx, 512, 0);
  paintMenuBoard(ctx, rctx, 768, 0);
  paintWindow(ctx, ectx, rctx, 512, 256, 'shop');
  paintWindow(ctx, ectx, rctx, 768, 384, 'apt');
  paintNorenPanels(ctx, rctx, 0, 512);
  paintMosaicTiles(ctx, rctx, 512, 512);
  paintWoodDoor(ctx, rctx, 0, 768);
  paintAptDoor(ctx, rctx, 256, 768);
  paintLanternGlow(ctx, ectx, rctx, 512, 768);
  paintCrateSide(ctx, rctx, 768, 640);
  paintPosterWall(ctx, rctx, 768, 896);

  const colorTex = canvasTexture(colorC.canvas, { srgb: true, aniso: 16 });
  colorTex.flipY = false;

  const emissiveTex = canvasTexture(emissiveC.canvas, { srgb: true, aniso: 8 });
  emissiveTex.flipY = false;

  const roughnessTex = canvasTexture(roughC.canvas, { srgb: false, aniso: 8 });
  roughnessTex.flipY = false;

  cachedAtlas = { colorTex, emissiveTex, roughnessTex };
  return cachedAtlas;
}
