// Stylized countryside route: crisp morning sky + 3D puff clouds, clean slate rural road,
// Blender solid-3D trees / utility poles / road mirrors / flowers / reeds, Scheme A paddies,
// cartoon river water, and upgraded cozy village cottages.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { rngFrom } from '../core/rng.js';
import { litMaterial } from '../core/materials.js';
import { bridgeJointXs, crossing, centerZ, halfWidth, roadEnd, roadHeight, roadYaw } from './country-route.js';
import { placeInstances } from './kit-instances.js';
import { createCityCrossing } from './city-crossing.js';
import { sign } from './shapes.js';
import { addPaddies, fieldEnd, fieldStart, eastFieldStart, eastFieldEnd, updatePaddyEnv } from './paddy.js';
import { buildCountryRoad } from './country-road.js';
import { createRiverWater } from './country-water.js';

const paint = litMaterial({ vertexColors: true, grid: false, roughness: 0.90 });
// Upgraded cozy village cottage: fixes the degenerate-quad black gable bug, adds warm eaves,
// shutters, stone plinths and low garden walls so cottages feel grounded like Old Street.
function house(builder, x, z, side, rng) {
  const w = rng.range(5.0, 7.0), d = rng.range(4.3, 5.8), h = rng.range(2.9, 4.1);
  const wall = rng.pick([0xf3e4c2, 0xd4e2cf, 0xf0d6ad]);
  const roof = rng.pick([0x50726c, 0xb2684c, 0x6b7c74]);
  const trim = 0xf7ecd1;
  const timber = 0x7c573c;

  // Stone foundation plinth so house sits firmly in the meadow
  builder.box(x, 0.14, z, w + 0.42, 0.56, d + 0.42, { color: 0xb7aa91 });
  // Main plaster body
  builder.box(x, h / 2 + 0.18, z, w, h, d, { color: wall, shade: 0.08 });

  const topY = h + 0.18;
  const ridgeH = 1.25;
  const left = x - w / 2, right = x + w / 2;

  // Gable end triangles with explicit outward normals (fixes the black-gable zero-normal bug!)
  for (const sideX of [-1, 1]) {
    const gx = x + sideX * w / 2;
    const gable = [
      [gx, topY, z - d / 2],
      [gx, topY + ridgeH, z],
      [gx, topY, z + d / 2],
      [gx, topY, z + d / 2],
    ];
    if (sideX < 0) gable.reverse();
    builder.quad(...gable, { color: wall, normal: [sideX, 0, 0] });
    // Side window with cream frame & wood sill
    const end = gx + sideX * 0.04;
    builder.box(end, topY * 0.58, z, 0.10, 1.02, 0.88, { color: trim });
    builder.box(end + sideX * 0.04, topY * 0.58, z, 0.06, 0.84, 0.70, { color: 0x547b78 });
    builder.box(end + sideX * 0.06, topY * 0.58, z, 0.05, 0.86, 0.07, { color: trim });
    builder.box(end + sideX * 0.07, topY * 0.58 - 0.50, z, 0.16, 0.09, 1.02, { color: timber });
  }

  // Clean overhanging pitched tiled roof with thick fascia & ridge cap (no loose floating sticks)
  const overX = 0.46, overZ = 0.55;
  for (const slope of [-1, 1]) {
    const edgeZ = z + slope * (d / 2 + overZ);
    const eaveY = topY - 0.16;
    const roofPts = [
      [left - overX, eaveY, edgeZ],
      [right + overX, eaveY, edgeZ],
      [right + overX, topY + ridgeH + 0.04, z],
      [left - overX, topY + ridgeH + 0.04, z],
    ];
    if (slope < 0) roofPts.reverse();
    builder.quad(...roofPts, { color: roof });
    // Underside soffit so eaves never look paper-thin
    const soffit = roofPts.map(([px, py, pz]) => [px, py - 0.12, pz]);
    soffit.reverse();
    builder.quad(...soffit, { color: timber });
    // Clean timber fascia beam along the eave edge
    builder.box(x, eaveY - 0.06, edgeZ, w + overX * 2 + 0.04, 0.14, 0.14, { color: trim });
  }
  // Roof ridge beam & terracotta finial caps
  builder.box(x, topY + ridgeH + 0.08, z, w + overX * 2 + 0.12, 0.18, 0.24, { color: 0x455d59 });

  // Warm front porch, door, shutters & stepping terrace facing the road
  const front = z - side * (d / 2 + 0.04);
  builder.box(x, 0.14, front - side * 0.58, w + 0.3, 0.28, 1.15, { color: 0xc9b999 });
  // Doorway + warm wooden door + red lintel accents (matches Old Street palette)
  builder.box(x - 0.72, 1.24, front - side * 0.02, 1.30, 2.18, 0.12, { color: trim });
  builder.box(x - 0.72, 1.20, front - side * 0.06, 1.06, 2.02, 0.10, { color: timber });
  builder.box(x - 0.72, 2.38, front - side * 0.36, 1.92, 0.16, 0.86, { color: roof });
  builder.box(x - 0.72, 2.26, front - side * 0.74, 1.96, 0.09, 0.10, { color: trim });
  // Front window with jade shutters
  const wx = x + 1.25;
  builder.box(wx, 1.72, front - side * 0.03, 1.38, 1.18, 0.11, { color: trim });
  builder.box(wx, 1.72, front - side * 0.07, 1.18, 0.98, 0.07, { color: 0x527a78 });
  builder.box(wx, 1.72, front - side * 0.10, 0.07, 1.00, 0.06, { color: trim });
  builder.box(wx, 1.20, front - side * 0.14, 1.56, 0.10, 0.24, { color: timber });
  for (const s of [-1, 1]) {
    builder.box(wx + s * 0.84, 1.72, front - side * 0.07, 0.28, 1.04, 0.09, { color: 0x3b7a6f });
  }
  // Low cozy courtyard wall framing the house yard
  const yardZ = front - side * 2.15;
  builder.box(x + 0.85, 0.34, yardZ, w * 0.62, 0.72, 0.24, { color: 0xeadac0 });
  builder.box(x + 0.85, 0.73, yardZ, w * 0.65, 0.11, 0.32, { color: roof });
}

function waymark(group, builder, x, text, sub) {
  const z = centerZ(x) + halfWidth(x) + 1.15, y = roadHeight(x);
  builder.box(x, y + 0.85, z, 0.18, 1.70, 0.18, { color: 0x6f553c });
  builder.box(x, y + 1.9, z, 0.13, 0.92, 2.65, { color: 0x3a645a });
  const plaque = sign(group, x - 0.075, y + 1.9, z, 2.6, 0.9, text,
    { bg: '#f6e4b6', ink: '#2e544b', sub });
  plaque.rotation.y = -Math.PI / 2;
}

function villagePavilion(group, geo) {
  const x = roadEnd + 7, z = centerZ(roadEnd) + 2;
  geo.box(x, -0.07, z, 5.2, 0.42, 8.2, { color: 0xb7aa8d });
  geo.box(x - 2.8, -0.03, z, 0.85, 0.22, 5.0, { color: 0xd4c4a2 });
  for (const dx of [-1.8, 1.8]) for (const dz of [-3.2, 3.2]) {
    geo.box(x + dx, 0.38, z + dz, 0.62, 0.6, 0.62, { color: 0xb0a58d });
    geo.cylinder(x + dx, 0.64, z + dz, 0.22, 0.215, 2.62, { color: 0xb05d42, seg: 10 });
    geo.box(x + dx, 3.22, z + dz, 0.69, 0.26, 0.62, { color: 0x93533d });
  }
  geo.box(x, 3.43, z, 4.98, 0.4, 8.56, { color: 0x7b4c37 });
  for (const side of [-1, 1]) {
    const points = [[x + side * 3.1, 3.56, z - 4.75], [x + side * 3.1, 3.56, z + 4.75], [x, 4.92, z + 4.3], [x, 4.92, z - 4.3]];
    if (side > 0) points.reverse();
    geo.quad(...points, { color: 0x4b6e68 });
    geo.box(x + side * 3.1, 3.54, z, 0.18, 0.18, 9.7, { color: 0x5c7f78 });
  }
  geo.box(x, 4.94, z, 0.28, 0.20, 9.1, { color: 0x45655f });
  for (const dz of [-2.7, 2.7]) {
    geo.cylinder(x - 2.08, 2.46, z + dz, 0.33, 0.28, 0.55, { color: 0xd56742, seg: 12 });
    geo.box(x - 2.08, 3.17, z + dz, 0.04, 0.32, 0.04, { color: 0x72523c });
    geo.box(x - 2.08, 2.33, z + dz, 0.06, 0.23, 0.06, { color: 0xe6ad46 });
  }
  for (const dz of [-2.1, 2.1]) {
    geo.box(x, 0.64, z + dz, 2.5, 0.18, 0.49, { color: 0xc29362 });
    for (const dx of [-0.9, 0.9]) geo.box(x + dx, 0.35, z + dz, 0.23, 0.57, 0.36, { color: 0x917c64 });
  }
  sign(group, x - 2.52, 3.42, z, 2.28, 0.58, '榕下歇脚亭', { bg: '#2c5b50', ink: '#ffe4a2' }).rotation.y = -Math.PI / 2;
}

// Dressed stone arch bridge across the river with balustrade and stone joints.
function addStoneBridge(geo, start, end) {
  const stone = [0xaa9f84, 0xc3b69b, 0xb7aa8f, 0xc8bca2, 0xb0a58b];
  const rim = 3.68, bottom = -0.94;
  for (let x = 894; x < 950; x += 8) {
    if (x < start || x >= end) continue;
    for (let k = 0; k < 10; k++) {
      const a = x + k * 0.8, b = a + 0.8;
      const ring = (i) => -0.70 + 1.78 * Math.sin(Math.PI * i / 10) ** 0.66;
      for (const side of [-1, 1]) {
        const face = (px, y, offset) => [px, y, centerZ(px) + side * (rim + offset)];
        const h0 = Math.min(roadHeight(a) - 0.33, ring(k));
        const h1 = Math.min(roadHeight(b) - 0.33, ring(k + 1));
        const panel = [face(a, h0, 0), face(b, h1, 0), face(b, roadHeight(b) - 0.12, 0), face(a, roadHeight(a) - 0.12, 0)];
        if (side < 0) panel.reverse();
        geo.quad(...panel, { color: stone[(k + 1) % 5] });
        const lip = [face(a, h0, 0.05), face(b - 0.015, h1, 0.05), face(b - 0.015, h1 + 0.21, 0.05), face(a, h0 + 0.21, 0.05)];
        if (side < 0) lip.reverse();
        geo.quad(...lip, { color: stone[(k + 3) % 5] });
        if (k === 0) {
          geo.box(a, (h0 + bottom) / 2, centerZ(a) + side * rim, 0.56, h0 - bottom, 0.42, { color: stone[1] });
        }
        if (side === 1) {
          geo.quad(face(a, h0, 0), [a, h0, centerZ(a) - rim], [b, h1, centerZ(b) - rim], face(b, h1, 0), { color: 0x7d7868 });
        }
      }
    }
    for (const side of [-1, 1]) {
      const balustrade = (px, y) => [px, roadHeight(px) + y, centerZ(px) + side * 3.18];
      for (let i = 0; i < 4; i++) {
        const px = x + i * 2 + 0.94, z = centerZ(px) + side * 3.18, h = roadHeight(px);
        geo.cylinder(px, h + 0.12, z, 0.12, 0.105, 0.53, { color: stone[(i + 2) % 5], seg: 6 });
        geo.box(px, h + 0.66, z, 0.24, 0.11, 0.26, { color: stone[2] });
      }
      for (const [y, thick] of [[0.09, 0.13], [0.82, 0.16]]) {
        for (let n = 0; n < 8; n += 2) {
          const a = x + n, b = a + 2;
          const z0 = balustrade(a, y)[2], z1 = balustrade(b, y)[2];
          const top0 = roadHeight(a) + y, top1 = roadHeight(b) + y;
          const w = y > 0.5 ? 0.22 : 0.16;
          geo.quad([a, top0, z0 - w], [a, top0, z0 + w], [b, top1, z1 + w], [b, top1, z1 - w], { color: 0xc8bba0 });
          for (const f of [-1, 1]) {
            const face = [[a, top0 - thick, z0 + f * w], [b, top1 - thick, z1 + f * w], [b, top1, z1 + f * w], [a, top0, z0 + f * w]];
            if (f < 0) face.reverse();
            geo.quad(...face, { color: 0xafa38b });
          }
        }
      }
    }
  }
  for (const joint of bridgeJointXs) {
    if (joint < start || joint >= end) continue;
    const steps = [[-0.58, 0.007], [-0.29, 0.036], [0, 0.07], [0.29, 0.036], [0.58, 0.007]];
    for (let i = 1; i < steps.length; i++) {
      const [oa, ha] = steps[i - 1], [ob, hb] = steps[i], a = joint + oa, b = joint + ob;
      for (let slab = 0; slab < 4; slab++) {
        const lo = -2.97 + slab * 1.49, hi = lo + 1.48, ya = roadHeight(a) + ha, yb = roadHeight(b) + hb;
        geo.quad([a, ya, centerZ(a) + lo], [a, ya, centerZ(a) + hi], [b, yb, centerZ(b) + hi], [b, yb, centerZ(b) + lo],
          { color: [0xb8ac92, 0xc3b79d, 0xc6baa0, 0xb6aa90][slab] });
      }
    }
  }
}

function buildChunk(start, end, kit) {
  const group = new THREE.Group();
  const geo = new GeoBuilder();
  const rng = rngFrom('榕湾村道v2', start);

  const roundTrees = [];
  const bankTrees = [];
  const plainPoles = [];
  const lampPoles = [];
  const mirrors = [];
  const bollards = [];
  const tufts = [];
  const flowers = [];
  const reeds = [];

  function ribbon(x, next, left, right, leftNext, rightNext, y0, y1, color) {
    const z = centerZ(x), z1 = centerZ(next);
    geo.quad([x, y0, z + left], [x, y0, z + right], [next, y1, z1 + rightNext], [next, y1, z1 + leftNext], { color });
  }

  // Stylized asphalt road & stone bridge deck
  group.add(buildCountryRoad(start, end));

  // Non-paddy meadow ground & bridge deck fascia/posts
  for (let x = start; x < end; x += 2) {
    const nx = Math.min(x + 2, end), width = halfWidth(x), width1 = halfWidth(nx);
    const h = roadHeight(x), h1 = roadHeight(nx);
    const river = x >= 894 && x < 950;
    const inPaddy = (x >= fieldStart && x < fieldEnd) || (x >= eastFieldStart && x < eastFieldEnd);

    for (const side of [-1, 1]) {
      if (river) {
        if (x % 8 === 0) {
          geo.box(x, h - 0.38, centerZ(x) + side * width, 0.82, 0.78, 0.48, { color: 0xb9b098 });
          geo.box(x, -0.07, centerZ(x) + side * (width - 0.3), 0.9, 2.22, 0.82, { color: 0xa5a18d });
          geo.box(x, h + 0.48, centerZ(x) + side * (width + 0.22), 0.35, 1.02, 0.38, { color: 0xd0c6ae });
          geo.box(x, h + 1.02, centerZ(x) + side * (width + 0.22), 0.43, 0.13, 0.45, { color: 0xe3d6b8 });
        }
        const deckZ = centerZ(x) + side * (width + 0.75), deckNext = centerZ(nx) + side * (width1 + 0.75);
        const fascia = [[x, h, deckZ], [nx, h1, deckNext], [nx, h1 - 0.33, deckNext], [x, h - 0.33, deckZ]];
        if (side > 0) fascia.reverse();
        geo.quad(...fascia, { color: 0xbdb49a });
        continue;
      }
      if (!inPaddy) {
        // Warm fresh green village/town meadow outside the road skirt
        const s0 = width + 1.65, s1 = width1 + 1.65;
        const meadowCol = ((Math.floor(x / 18) + (side > 0 ? 1 : 0)) % 2 === 0) ? 0x76a856 : 0x6ca053;
        if (side > 0) ribbon(x, nx, s0, 235, s1, 235, -0.22, -0.22, meadowCol);
        else ribbon(x, nx, -235, -s0, -235, -s1, -0.22, -0.22, meadowCol);
      }
    }
  }

  // Scheme A 3D rice paddies (open water-paddy -> helmet-high golden corridor)
  addPaddies(group, geo, start, end, kit);

  // Soft sloped embankments & riverside cattail reeds at both bridge banks
  for (const bankX of [894, 950]) {
    if (bankX >= start && bankX < end) {
      const dir = bankX === 894 ? 1 : -1;
      const zMid = centerZ(bankX);
      for (const side of [-1, 1]) {
        const near = zMid + side * 4.4, far = zMid + side * 225;
        // Sloped lush green bank down into warm stone shoreline
        const upper = [
          [bankX - dir * 1.4, -0.10, near], [bankX - dir * 1.4, -0.10, far],
          [bankX + dir * 0.4, -0.58, far], [bankX + dir * 0.4, -0.58, near],
        ];
        if ((dir > 0) === (side < 0)) upper.reverse();
        geo.quad(...upper, { color: 0x6ca052 });
        const lower = [
          [bankX + dir * 0.4, -0.58, near], [bankX + dir * 0.4, -0.58, far],
          [bankX + dir * 1.6, -1.05, far], [bankX + dir * 1.6, -1.05, near],
        ];
        if ((dir > 0) === (side < 0)) lower.reverse();
        geo.quad(...lower, { color: 0xb9a882 });

        // Organic bunches of 2-4 stylized reeds & cattails along the riverbank (never fence-like!)
        for (const baseD of [6.0, 12.5, 22.0, 35.0, 50.0]) {
          const bunch = 2 + Math.floor(rng.range(0, 3));
          for (let b = 0; b < bunch; b++) {
            const d = baseD + rng.range(-1.6, 1.8);
            reeds.push([
              bankX + dir * rng.range(-0.35, 0.75), -0.78, zMid + side * d,
              rng.range(0, Math.PI * 2), rng.range(0.95, 1.42), rng.range(0.95, 1.42), rng.range(0.95, 1.42), 0xffffff,
            ]);
          }
        }
      }
    }
  }

  // Roadside organic edge-breakers: 3D grass tufts & wildflowers along both crumbling shoulders!
  for (let x = start + 1.5; x < end - 0.5; x += 2.6) {
    if ((x >= 892 && x <= 952) || Math.abs(x - crossing.x) < 31 || x < 126) continue;
    for (const side of [-1, 1]) {
      if (!rng.chance(0.72)) continue;
      const px = x + rng.range(-0.9, 0.9);
      const lat = halfWidth(px) + rng.range(0.32, 1.15);
      const pz = centerZ(px) + side * lat;
      const py = roadHeight(px) - 0.03;
      const sc = rng.range(0.85, 1.32);
      const target = rng.chance(0.36) ? flowers : tufts;
      target.push([px, py, pz, rng.range(0, Math.PI * 2), sc, sc * rng.range(0.85, 1.2), sc, 0xffffff]);
    }
  }

  // High-speed curve bollards along countryside bends
  for (let x = Math.ceil(start / 18) * 18; x < end; x += 18) {
    if (x < 152 || x > 1140 || (x >= 886 && x <= 956) || Math.abs(x - crossing.x) < 34) continue;
    for (const side of [-1, 1]) {
      const z = centerZ(x) + side * (halfWidth(x) + 0.52);
      bollards.push([x, roadHeight(x) - 0.02, z, roadYaw(x), 1, 1, 1, 0xffffff]);
    }
  }

  // Iconic orange convex curve mirrors at key rural bends & bridge approach
  for (const [mx, side] of [[218, -1], [435, 1], [592, -1], [788, -1], [883, -1], [964, 1]]) {
    if (mx >= start && mx < end) {
      const z = centerZ(mx) + side * (halfWidth(mx) + 0.85);
      const yaw = roadYaw(mx) + Math.PI * 0.5 + side * 0.25;
      mirrors.push([mx, roadHeight(mx) - 0.04, z, yaw, 1.05, 1.05, 1.05, 0xffffff]);
    }
  }

  // Split bamboo field fence accents in open paddy & approach
  for (let x = start + 26; x < end; x += 64) {
    if (x < 210 || x > 560) continue;
    const z = centerZ(x) + halfWidth(x) + 1.55;
    for (let j = 0; j < 4; j++) geo.cylinder(x + j * 1.55, -0.18, z, 0.065, 0.055, 0.92, { color: 0xb28f52, seg: 6 });
    for (const y of [0.28, 0.60]) geo.box(x + 2.33, y, z, 4.8, 0.068, 0.075, { color: 0xd0b072 });
  }

  // Village & town-edge houses + lush Blender stylized trees (NO ugly icosahedron blobs!)
  for (let x = start + 8; x < end - 1; x += 15) {
    if ((x > 872 && x < 968) || Math.abs(x - crossing.x) < 36) continue;
    const z = centerZ(x), side = rng.sign();
    if (x < 194 || x > 1072) {
      const hz = z + side * rng.range(9.2, 13.8);
      house(geo, x, hz, side, rng);
      if (rng.chance(0.55)) house(geo, x + 2.5, z - side * rng.range(13.5, 22), -side, rng);
      // Warm cozy trees & yard wildflower tufts framing the cottages
      const ts = rng.range(0.95, 1.40);
      roundTrees.push([x - 3.5, -0.22, z - side * rng.range(7.2, 12.5), rng.range(0, Math.PI * 2), ts, ts * rng.range(0.92, 1.12), ts, 0xffffff]);
      for (let f = 0; f < 3; f++) {
        (f === 0 ? flowers : tufts).push([
          x + rng.range(-3.5, 3.5), -0.22, hz - side * rng.range(3.2, 5.2),
          rng.range(0, Math.PI * 2), 1.15, 1.15, 1.15, 0xffffff,
        ]);
      }
    }
    // Scenic treeline dots across the open fields (keep clear of the golden corridor foreground)
    if (rng.chance(0.55) && x >= 194 && x <= 1072) {
      const dist = rng.range(24, 62);
      const ts = rng.range(1.15, 1.85);
      roundTrees.push([x + rng.range(-4, 4), -0.22, z + side * dist, rng.range(0, Math.PI * 2), ts, ts * rng.range(0.92, 1.15), ts, 0xffffff]);
    }
    if (rng.chance(0.35) && x >= 194 && x <= 1072) {
      const dist = rng.range(55, 115);
      const ts = rng.range(1.5, 2.25);
      roundTrees.push([x + 6, -0.24, z - side * dist, rng.range(0, Math.PI * 2), ts, ts, ts, 0xeef5e8]);
    }
  }

  // Broadleaf trees on the riverbank and at the edge of the paddies.
  const bankTreeSpots = [
    [330, 14.5, 1.15], [495, -13.5, 1.25], [648, 17.5, 1.22],
    [767, 15.8, 1.28], [818, -11.5, 1.12], [891.5, 11.2, 1.36],
    [892.5, -12.8, 1.18], [954, -13.5, 1.38], [958, 14.2, 1.22],
  ];
  for (const [wx, offset, size] of bankTreeSpots) {
    if (wx >= start && wx < end) {
      bankTrees.push([wx, -0.20, centerZ(wx) + offset, (wx * 1.7) % (Math.PI * 2), size, size, size, 0xffffff]);
    }
  }

  // Stylized Blender utility poles (alternating plain & retro gooseneck streetlamp!) + clean sagging wires
  const poleOffset = 14;
  for (let x = Math.ceil((start - poleOffset) / 36) * 36 + poleOffset; x < end; x += 36) {
    if ((x >= 880 && x < 968) || Math.abs(x - crossing.x) < 28 || x < 142) continue;
    const z = centerZ(x) - (halfWidth(x) + 1.95);
    const poleIdx = Math.round((x - poleOffset) / 36);
    const target = poleIdx % 2 === 0 ? lampPoles : plainPoles;
    target.push([x, roadHeight(x) - 0.14, z, 0, 1, 1, 1, 0xffffff]);

    const nx = x + 36;
    if (Math.abs(nx - crossing.x) < 28 || nx >= roadEnd || (nx >= 880 && nx < 968)) continue;
    const nz = centerZ(nx) - (halfWidth(nx) + 1.95);
    const y0 = roadHeight(x) + 5.75, y1 = roadHeight(nx) + 5.75;
    for (const offset of [-0.82, 0.82]) {
      for (let k = 0; k < 8; k++) {
        const wire = (t) => [
          x + t * 36,
          THREE.MathUtils.lerp(y0, y1, t) - 1.55 * t * (1 - t),
          THREE.MathUtils.lerp(z, nz, t) + offset,
        ];
        const a = wire(k / 8), b = wire((k + 1) / 8);
        geo.quad(a, [a[0], a[1] + 0.036, a[2]], [b[0], b[1] + 0.036, b[2]], b, { color: 0x3a4a4d });
        geo.quad(b, [b[0], b[1] + 0.036, b[2]], [a[0], a[1] + 0.036, a[2]], a, { color: 0x3a4a4d });
      }
    }
  }

  // Rongwan town gateway archway
  if (start <= 138 && end > 138) {
    const z = centerZ(138);
    for (const side of [-1, 1]) {
      geo.box(138, 2.04, z + side * 4.65, 0.67, 4.4, 0.67, { color: 0xe6d3b1 });
      geo.box(138, 0.38, z + side * 4.65, 1.04, 0.82, 1.04, { color: 0x9aa397 });
    }
    geo.box(138, 4.28, z, 1.03, 0.72, 10.6, { color: 0xf1dfc0 });
    geo.box(138, 4.78, z, 1.65, 0.30, 11.4, { color: 0x4b746a });
    sign(group, 137.46, 4.3, z, 2.5, 0.6, '榕湾', { ink: '#fff0c8', bg: '#2d5d53' }).rotation.y = -Math.PI / 2;
  }

  for (const [x, title, sub] of [
    [56, '榕湾村道', '向东 · 田间慢行'],
    [395, '开阔水田', '前方金黄稻浪'],
    [876, '石桥', '慢行过桥'],
    [1180, '榕树村', '村口可掉头'],
  ]) {
    if (x >= start && x < end) waymark(group, geo, x, title, sub);
  }

  // Village turnaround pavilion & grand banyan cluster
  if (start < roadEnd && end === roadEnd) {
    villagePavilion(group, geo);
    const vz = centerZ(roadEnd);
    roundTrees.push([roadEnd + 7.5, -0.22, vz - 6.4, 0.8, 1.95, 1.75, 1.95, 0xffffff]);
    bankTrees.push([roadEnd + 11.0, -0.22, vz + 9.2, 2.1, 1.45, 1.45, 1.45, 0xffffff]);
    for (let i = 0; i < 7; i++) {
      const ts = 1.45 + (i % 3) * 0.35;
      roundTrees.push([roadEnd + 22 + (i % 2) * 14, -0.22, vz - 36 + i * 12, i * 1.1, ts, ts * 1.05, ts, 0xf2f7eb]);
    }
    geo.box(roadEnd + 29, -0.42, vz, 58, 0.36, 185, { color: 0x73a556 });
  }

  if (start <= crossing.x && end > crossing.x) group.userData.updateSignals = createCityCrossing(group, kit?.Tree_Round);
  addStoneBridge(geo, start, end);

  const mesh = geo.mesh(paint);
  if (mesh) {
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  placeInstances(group, kit?.Tree_Round, roundTrees, true, true);
  placeInstances(group, kit?.Tree_Bank, bankTrees, true, true);
  placeInstances(group, kit?.UtilityPole, plainPoles, true, true);
  placeInstances(group, kit?.UtilityPole_Lamp, lampPoles, true, true);
  placeInstances(group, kit?.RoadMirror, mirrors, true, true);
  placeInstances(group, kit?.Bollard, bollards, true, true);
  placeInstances(group, kit?.RoadTuft, tufts, false, true);
  placeInstances(group, kit?.RoadFlowers, flowers, false, true);
  placeInstances(group, kit?.ReedClump, reeds, false, true);

  return group;
}

// Crisp Ghibli / Wind Waker morning sky with clean 3-tier mountain silhouettes & sculpted 3D puff clouds!
function createSkyAndClouds() {
  const skyRoot = new THREE.Group();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x4b9cd6) },
      midSky: { value: new THREE.Color(0x9bd4eb) },
      horizon: { value: new THREE.Color(0xfff0d2) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 zenith, midSky, horizon;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        // Clean luminous morning sky gradient
        vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.24, h));
        col = mix(col, zenith, smoothstep(0.18, 0.72, h));

        // Morning sun disc & warm halo
        vec3 sunDir = normalize(vec3(0.93, 0.24, -0.34));
        float sun = max(0.0, dot(dir, sunDir));
        col += vec3(0.45, 0.26, 0.08) * pow(sun, 16.0);
        col += vec3(1.5, 1.25, 0.85) * smoothstep(0.9993, 0.99985, sun);

        // 3 sweeping clean atmospheric mountain ridge layers (replaces ugly giant icosahedron domes!)
        float az = atan(dir.z, dir.x);
        float farRidge  = 0.088 + 0.038 * sin(2.0 * az + 0.5) + 0.022 * cos(5.0 * az - 1.1) + 0.011 * sin(11.0 * az);
        float midRidge  = 0.056 + 0.026 * cos(3.0 * az + 1.3) + 0.017 * sin(7.0 * az + 0.4) + 0.007 * cos(13.0 * az);
        float nearRidge = 0.026 + 0.015 * sin(4.0 * az - 0.8) + 0.009 * cos(9.0 * az + 1.7);

        float farMask  = 1.0 - smoothstep(farRidge - 0.0025, farRidge + 0.0025, dir.y);
        float midMask  = 1.0 - smoothstep(midRidge - 0.0022, midRidge + 0.0022, dir.y);
        float nearMask = 1.0 - smoothstep(nearRidge - 0.0020, nearRidge + 0.0020, dir.y);

        // Gentle atmospheric depth tinting (crisp pale slate-blue -> soft jade -> sage)
        vec3 farCol  = mix(vec3(0.60, 0.77, 0.83), vec3(0.76, 0.84, 0.82), pow(sun, 3.0) * 0.45);
        vec3 midCol  = mix(vec3(0.46, 0.68, 0.69), vec3(0.62, 0.75, 0.68), pow(sun, 3.0) * 0.35);
        vec3 nearCol = mix(vec3(0.36, 0.59, 0.53), vec3(0.48, 0.67, 0.52), pow(sun, 3.0) * 0.28);

        col = mix(col, farCol, farMask * 0.82);
        col = mix(col, midCol, midMask * 0.90);
        col = mix(col, nearCol, nearMask * 0.94);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(72, 36, 20), skyMat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  skyRoot.add(dome);

  // Sculpted stylized 3D cumulus cloud ring (1 InstancedMesh draw call! Warm cream tops + serene sky-blue undersides)
  const cloudMat = new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.93, 0.28, -0.34).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        mat4 worldMat = modelMatrix;
        #ifdef USE_INSTANCING
          worldMat = modelMatrix * instanceMatrix;
        #endif
        vNormalW = normalize(mat3(worldMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldMat * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vNormalW;
      varying float vLocalY;
      void main() {
        float ndl = dot(normalize(vNormalW), uSunDir) * 0.5 + 0.5;
        float topGrad = smoothstep(-0.65, 0.55, vLocalY);
        float light = clamp(ndl * 0.48 + topGrad * 0.62, 0.0, 1.0);
        vec3 shadowCol = vec3(0.75, 0.86, 0.94);
        vec3 creamTop  = vec3(1.00, 0.985, 0.945);
        vec3 col = mix(shadowCol, creamTop, smoothstep(0.24, 0.78, light));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const puffGeo = new THREE.SphereGeometry(1, 14, 10);
  const rng = rngFrom('清晨大白云');
  const cloudCount = 15;
  const puffs = [
    [0, 0.35, 0, 3.6, 2.0, 2.2],
    [-2.8, -0.15, 0.3, 2.5, 1.45, 1.8],
    [2.9, -0.10, -0.2, 2.7, 1.55, 1.8],
    [-1.1, 1.15, -0.3, 2.2, 1.45, 1.6],
    [1.4, 0.95, 0.3, 2.0, 1.30, 1.5],
    [4.9, -0.45, 0.1, 1.7, 0.95, 1.3],
    [-4.6, -0.48, -0.1, 1.6, 0.92, 1.3],
  ];
  const cloudRing = new THREE.InstancedMesh(puffGeo, cloudMat, cloudCount * puffs.length);
  const clusterObj = new THREE.Object3D();
  const puffObj = new THREE.Object3D();
  const mat4 = new THREE.Matrix4();
  let ci = 0;
  for (let i = 0; i < cloudCount; i++) {
    const az = (i / cloudCount) * Math.PI * 2 + rng.range(-0.14, 0.14);
    const dist = rng.range(54, 62);
    const elev = rng.range(10.5, 22.0);
    const baseScale = rng.range(1.15, 1.85);
    clusterObj.position.set(Math.cos(az) * dist, elev, Math.sin(az) * dist);
    clusterObj.rotation.set(0, -az + Math.PI / 2, 0);
    clusterObj.scale.set(1, 1, 1);
    clusterObj.updateMatrix();
    for (const [px, py, pz, sx, sy, sz] of puffs) {
      puffObj.position.set(px * baseScale, py * baseScale, pz * baseScale);
      puffObj.rotation.set(0, 0, 0);
      puffObj.scale.set(sx * baseScale, sy * baseScale, sz * baseScale);
      puffObj.updateMatrix();
      mat4.multiplyMatrices(clusterObj.matrix, puffObj.matrix);
      cloudRing.setMatrixAt(ci++, mat4);
    }
  }
  cloudRing.renderOrder = -95;
  cloudRing.frustumCulled = false;
  skyRoot.add(cloudRing);

  return {
    skyRoot,
    update(time) {
      cloudRing.rotation.y = time * 0.0028;
    },
  };
}

export function createCountryside(kit) {
  const root = new THREE.Group();
  const chunks = new Map();
  const { skyRoot: sky, update: updateSky } = createSkyAndClouds();
  const river = createRiverWater();
  root.add(sky, river.mesh);

  return {
    root,
    sky,
    update(stateOrX, time, fogColor, fogDensity) {
      const x = typeof stateOrX === 'number' ? stateOrX : stateOrX.x;
      updatePaddyEnv(time, typeof stateOrX === 'number' ? null : stateOrX);
      updateSky(time);
      river.update(time, fogColor, fogDensity);

      const current = Math.floor((x - 52) / 100);
      for (let i = Math.max(0, current - 2); i <= current + 2 && 52 + i * 100 < roadEnd; i++) {
        if (chunks.has(i)) continue;
        const start = 52 + i * 100;
        const part = buildChunk(start, Math.min(start + 100, roadEnd), kit);
        chunks.set(i, part);
        root.add(part);
      }
      for (const [i, part] of chunks) {
        part.visible = Math.abs(i - current) <= 2;
        if (part.visible) part.userData.updateSignals?.(time);
      }
    },
  };
}
