import { centerZ, halfWidth, roadHeight } from './country-route.js';
import { rngFrom } from '../core/rng.js';

// Soft bands of compacted earth follow the bend with irregular edges.
const pavementBands = [
  [-1, 0xb1a38d], [-.82, 0xb4aa96], [-.58, 0xc4bda8],
  [-.41, 0xc4bda9], [0, 0xb9b39f], [.43, 0xc5bfac],
  [.58, 0xc5bfac], [.82, 0xb5ac98], [1, 0xb1a38d],
];

export function addWornSurface(geo, x, nextX) {
  const point = (px, band) => {
    const wiggle = Math.sin(px*.08 + band*6)*.055*(1-Math.abs(band));
    return [px, roadHeight(px), centerZ(px) + halfWidth(px)*band + wiggle];
  };
  for (let i = 1; i < pavementBands.length; i++) {
    const [left, colorL] = pavementBands[i-1], [right, colorR] = pavementBands[i];
    geo.quad(point(x, left), point(x, right), point(nextX, right), point(nextX, left),
      {colors: [colorL, colorR, colorR, colorL]});
  }
}

// The gravel thins into the wheel tracks. All the patches belong to the
// existing terrain batch and follow the grade of the bridge approach.
export function addGravelVerge(geo, start, end) {
  const rng = rngFrom('桥头路肩', start);
  const first = Math.max(start, 690), last = Math.min(end, 894);
  const point = (x, offset, lift) => [x, roadHeight(x) + lift, centerZ(x) + offset];
  for (const side of [-1, 1]) {
    for (let x = first; x < last; x += rng.range(.9, 3.3)) {
      const offset = side * (halfWidth(x) + rng.range(-.48, .56));
      const length = Math.min(last - x, rng.range(.38, 2));
      const width = rng.range(.045, .18);
      const shade = rng.pick([0xb0a58f, 0xbeb29a, 0xa99f8b]);
      geo.quad(point(x, offset, .012), point(x + length*.22, offset+width, .012),
        point(x + length, offset+width*.6, .012), point(x + length*.84, offset-width*.4, .012),
        {color: shade});
      for (let j = 0; j < 3; j++) {
        const px = x + rng.range(0, length), z = centerZ(px) + offset + rng.range(-.22, .22);
        const r = rng.range(.023, .065);
        geo.box(px, roadHeight(px)+.012, z, 2.1*r, .022, r, {
          color: rng.pick([0xb4aa98, 0xc8bfac, 0xa19887]), rotY: rng.range(-.8,.8), skip:'ny',
        });
      }
    }
  }
}
