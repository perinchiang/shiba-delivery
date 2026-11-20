// Chinese text on canvas: font stacks (system fonts only, no downloads) and fit-to-box drawing,
// horizontal or vertical. Used for shop signs, posters, plates, stickers and any in-world writing.

export const FONTS = {
  // 黑体: the default for lightbox shop signs
  hei: '"PingFang SC","Hiragino Sans GB","Heiti SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif',
  // 宋体: old-fashioned shops, notices, couplets
  song: '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif',
  // 楷体/书法 feel: tea houses, clinics, traditional shop names (falls back to Songti)
  kai: '"Kaiti SC","STKaiti","KaiTi","BiauKai","Songti SC",serif',
  // rounded: milk tea / cute brands (falls back to PingFang)
  round: '"Yuanti SC","Hiragino Maru Gothic ProN","PingFang SC","Microsoft YaHei",sans-serif',
  latin: '"Helvetica Neue","Arial",sans-serif',
  mono: '"SF Mono","Menlo","Consolas",monospace',
  // seven-segment-ish numerals for LED price boards / clocks
  led: '"DIN Alternate","DIN Condensed","Arial Narrow","Helvetica Neue",sans-serif',
};

export function fontCss(family = 'hei', px = 32, weight = 700) {
  return `${weight} ${px}px ${FONTS[family] || family}`;
}

/**
 * Draw `text` fitted inside the box (x, y, w, h). Returns the font size used.
 * opts: {
 *   font='hei', weight=700, color='#fff',
 *   vertical=false,        // stack characters top-to-bottom (竖排)
 *   align='center',        // 'left' | 'center' | 'right' (horizontal only)
 *   pad=0.08,              // padding as a fraction of the smaller box side
 *   maxSize,               // cap on font px
 *   spacing=0.06,          // extra gap between characters as a fraction of font size
 *   stroke, strokeWidth,   // outline colour / width (px, default size*0.08)
 *   glow, glowBlur,        // soft halo colour / radius (px, default size*0.35) - neon / lightbox feel
 *   squash=1,              // horizontal scale of glyphs (<1 = condensed, e.g. 0.8)
 * }
 */
export function drawText(ctx, text, x, y, w, h, opts = {}) {
  const {
    font = 'hei', weight = 700, color = '#fff', vertical = false, align = 'center',
    pad = 0.08, maxSize = Infinity, spacing = 0.06, stroke = null, glow = null, squash = 1,
  } = opts;
  const chars = Array.from(String(text));
  if (!chars.length) return 0;
  const p = Math.min(w, h) * pad;
  const bw = w - p * 2, bh = h - p * 2;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let size;
  const REF = 100;
  ctx.font = fontCss(font, REF, weight);
  if (vertical) {
    const widest = Math.max(...chars.map((c) => ctx.measureText(c).width)) * squash;
    size = Math.min(bh / (chars.length * (1 + spacing) - spacing), (bw / widest) * REF, maxSize);
  } else {
    const widths = chars.map((c) => ctx.measureText(c).width * squash);
    const total = widths.reduce((a, b) => a + b, 0) + REF * spacing * (chars.length - 1);
    size = Math.min(bh * 0.92, (bw / total) * REF, maxSize);
  }
  size = Math.max(4, size);
  ctx.font = fontCss(font, size, weight);
  const sw = opts.strokeWidth ?? size * 0.08;
  const draw = (ch, cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    if (squash !== 1) ctx.scale(squash, 1);
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = opts.glowBlur ?? size * 0.35; }
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(ch, 0, 0); }
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    if (glow) { ctx.fillText(ch, 0, 0); } // second pass thickens the halo core
    ctx.restore();
  };
  if (vertical) {
    const step = size * (1 + spacing);
    const total = step * chars.length - size * spacing;
    let cy = y + h / 2 - total / 2 + size / 2;
    for (const ch of chars) { draw(ch, x + w / 2, cy); cy += step; }
  } else {
    const widths = chars.map((c) => ctx.measureText(c).width * squash);
    const gap = size * spacing;
    const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    let cx = align === 'left' ? x + p : align === 'right' ? x + w - p - total : x + w / 2 - total / 2;
    for (let i = 0; i < chars.length; i++) {
      draw(chars[i], cx + widths[i] / 2, y + h / 2 + size * 0.03);
      cx += widths[i] + gap;
    }
  }
  ctx.restore();
  return size;
}

/** Rounded rectangle path helper. */
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Multi-line paragraph, wrapping by character (correct for Chinese). Returns the y after the last line. */
export function drawParagraph(ctx, text, x, y, maxW, lineH, opts = {}) {
  const { font = 'hei', weight = 400, size = 16, color = '#fff', maxLines = 99 } = opts;
  ctx.save();
  ctx.font = fontCss(font, size, weight);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let line = '', lines = 0;
  for (const ch of Array.from(String(text))) {
    if (ch === '\n' || ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, y); y += lineH; lines++;
      line = ch === '\n' ? '' : ch;
      if (lines >= maxLines) { ctx.restore(); return y; }
    } else line += ch;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  ctx.restore();
  return y;
}
