// Coastal detached-house 3D vertical-slice sample (S2 prep):
// A 2x2 grid of 4 walled Japanese/East-Asian style detached homes around a corner
// intersection + 2.4m cut-through lane, built from coastal-houses.glb + SignKit plaques.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { RNG } from '../core/rng.js';
import { makeCanvas, canvasTexture, fbm2D } from '../core/textures.js';
import { clamp } from '../core/mathx.js';
import { SignKit } from './sign-kit.js';
import { placeInstances } from './kit-instances.js';
import { CURB_H } from './street-layout.js';
import { CITY_PALETTE } from './city-palette.js';

export const COASTAL_SAMPLE = { x: 260, z: -320 };
const CX = COASTAL_SAMPLE.x;
const CZ = COASTAL_SAMPLE.z;

// Block geometry constants (world metres)
const LOT_W = 8.8;
const LOT_D = 8.2;
const LANE_HALF = 1.2;    // 2.4m walkable/rideable cut-through alley between W and E pairs
const ROW_GAP_HALF = 0.5; // 1.0m planted hedge gap between N and S pairs
const SW_WIDTH = 2.0;
const ROAD_W = 6.4;

const LOT_X_OFF = LANE_HALF + LOT_W * 0.5;     // 5.6m
const LOT_Z_OFF = ROW_GAP_HALF + LOT_D * 0.5;  // 4.6m
const INNER_SW_X = LANE_HALF + LOT_W + SW_WIDTH; // 12.0m
const INNER_SW_Z = ROW_GAP_HALF + LOT_D + SW_WIDTH; // 10.7m
const ROAD_OUT_X = INNER_SW_X + ROAD_W;        // 18.4m
const ROAD_OUT_Z = INNER_SW_Z + ROAD_W;        // 17.1m

export function inCoastalSample(x, z) {
  return Math.abs(x - CX) <= 38 && Math.abs(z - CZ) <= 36;
}

export function coastalSidewalk(x, z) {
  if (!inCoastalSample(x, z)) return false;
  const dx = Math.abs(x - CX);
  const dz = Math.abs(z - CZ);
  // Two inner block sidewalk islands (split by the central cut-through lane)
  if (dx >= LANE_HALF && dx <= INNER_SW_X && dz <= INNER_SW_Z) return true;
  // Outer corner sidewalk aprons framing the perimeter intersection
  if (dx >= ROAD_OUT_X && dx <= ROAD_OUT_X + 4.4 && dz >= ROAD_OUT_Z && dz <= ROAD_OUT_Z + 4.4) return true;
  if (dx >= ROAD_OUT_X && dx <= ROAD_OUT_X + 2.4 && dz <= INNER_SW_Z) return true;
  if (dz >= ROAD_OUT_Z && dz <= ROAD_OUT_Z + 2.4 && dx <= INNER_SW_X) return true;
  return false;
}

function pushOutBox(pos, minX, maxX, minZ, maxZ, margin) {
  const x0 = minX - margin, x1 = maxX + margin;
  const z0 = minZ - margin, z1 = maxZ + margin;
  if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) return;
  const dl = pos.x - x0, dr = x1 - pos.x;
  const dt = pos.z - z0, db = z1 - pos.z;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) pos.x = x0;
  else if (m === dr) pos.x = x1;
  else if (m === dt) pos.z = z0;
  else pos.z = z1;
}

export function constrainCoastalSample(x, z, walking) {
  const pos = {
    x: clamp(x, CX - 24.5, CX + 24.5),
    z: clamp(z, CZ - 22.5, CZ + 22.5),
  };
  const margin = walking ? 0.38 : 0.68;
  // West & East walled residential islands (keeps central 2.4m cut-through lane open)
  pushOutBox(pos, CX - LANE_HALF - LOT_W, CX - LANE_HALF, CZ - LOT_Z_OFF - LOT_D * 0.5, CZ + LOT_Z_OFF + LOT_D * 0.5, margin);
  pushOutBox(pos, CX + LANE_HALF, CX + LANE_HALF + LOT_W, CZ - LOT_Z_OFF - LOT_D * 0.5, CZ + LOT_Z_OFF + LOT_D * 0.5, margin);
  // Corner vending machine & utility poles near West sidewalk
  pushOutBox(pos, CX - 11.15, CX - 10.15, CZ + 5.80, CZ + 7.00, walking ? 0.25 : 0.45);
  return pos;
}

function makeAsphaltTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const macro = fbm2D(u * 4, v * 4, 3, 17, 4);
      const grain = fbm2D(u * 24, v * 24, 2, 53, 24);
      const shade = 0.88 + macro * 0.10 + grain * 0.08;
      // Subtle warm slate-charcoal asphalt (no harsh noisy contrast)
      d[i++] = Math.round(92 * shade);
      d[i++] = Math.round(98 * shade);
      d[i++] = Math.round(103 * shade);
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(16, 16);
  return tex;
}

function makeSidewalkTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  ctx.fillStyle = '#e4d8bf';
  ctx.fillRect(0, 0, w, h);
  const tile = 64;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const n = fbm2D(tx * 1.7, ty * 2.3, 2, 91, 4);
      const v = Math.round((n - 0.5) * 10);
      ctx.fillStyle = `rgb(${229 + v},${216 + v},${191 + v})`;
      ctx.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
    }
  }
  ctx.strokeStyle = 'rgba(155, 140, 114, 0.35)';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 256; k += tile) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(256, k); ctx.stroke();
  }
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(14, 14);
  return tex;
}

function makeMeadowTexture() {
  const { canvas, ctx, w, h } = makeCanvas(256, 256);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = fbm2D(u * 6, v * 6, 3, 29, 6);
      const g = 0.90 + n * 0.16;
      d[i++] = Math.round(145 * g);
      d[i++] = Math.round(186 * g);
      d[i++] = Math.round(104 * g);
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(canvas, { repeat: true, aniso: 4 });
  tex.repeat.set(18, 18);
  return tex;
}

function makeContactTex() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 8, 32, 32, 31);
  grad.addColorStop(0, 'rgba(62, 54, 46, 0.24)');
  grad.addColorStop(0.7, 'rgba(62, 54, 46, 0.12)');
  grad.addColorStop(1, 'rgba(62, 54, 46, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas, { mipmaps: false });
}

function addOverheadSpan(builder, p0, p1, sag = 0.42, radius = 0.018, segs = 7) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([
      THREE.MathUtils.lerp(p0[0], p1[0], t),
      THREE.MathUtils.lerp(p0[1], p1[1], t) - 4 * sag * t * (1 - t),
      THREE.MathUtils.lerp(p0[2], p1[2], t),
    ]);
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = -dz / len * radius, nz = dx / len * radius;
    builder.quad(
      [a[0] - nx, a[1], a[2] - nz],
      [a[0] + nx, a[1], a[2] + nz],
      [b[0] + nx, b[1], b[2] + nz],
      [b[0] - nx, b[1], b[2] - nz],
      { color: 0x3b4442 }
    );
  }
}

export function createCoastalSample(housesGltf, roundTreeTemplate) {
  const root = new THREE.Group();
  root.name = 'coastal-sample';

  // Single shared PBR material for all vertex-colored Blender assets (batches cleanly in Three.js)
  const kitMat = litMaterial({ vertexColors: true, grid: false, roughness: 0.90 });
  const kitMeshes = {};
  housesGltf.scene.traverse(obj => {
    if (!obj.isMesh || !obj.name) return;
    obj.material = kitMat;
    obj.castShadow = false;
    obj.receiveShadow = true;
    kitMeshes[obj.name] = obj;
  });

  const disposables = [kitMat];
  const trackTex = t => { disposables.push(t); return t; };
  const trackMat = m => { disposables.push(m); return m; };

  // 1) Textured ground meadow pad
  const meadowTex = trackTex(makeMeadowTexture());
  const meadowMat = trackMat(litMaterial({ map: meadowTex, roughness: 0.95, grid: false }));
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(180, 170), meadowMat);
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(CX, -0.025, CZ);
  meadow.receiveShadow = true;
  root.add(meadow);

  // 2) Textured perimeter asphalt loop + corner intersection
  const asphaltTex = trackTex(makeAsphaltTexture());
  const asphaltMat = trackMat(litMaterial({ map: asphaltTex, roughness: 0.94, grid: false }));
  const asphaltGeo = new GeoBuilder();
  // South & North East-West roads (extended out to 82m so road continues cleanly into distance)
  asphaltGeo.box(CX, -0.012, CZ + INNER_SW_Z + ROAD_W * 0.5, 84, 0.024, ROAD_W, { color: 0xffffff });
  asphaltGeo.box(CX, -0.012, CZ - INNER_SW_Z - ROAD_W * 0.5, 84, 0.024, ROAD_W, { color: 0xffffff });
  // West & East North-South roads (extended out to 76m)
  asphaltGeo.box(CX - INNER_SW_X - ROAD_W * 0.5, -0.012, CZ, ROAD_W, 0.024, 76, { color: 0xffffff });
  asphaltGeo.box(CX + INNER_SW_X + ROAD_W * 0.5, -0.012, CZ, ROAD_W, 0.024, 76, { color: 0xffffff });
  const asphaltMesh = asphaltGeo.mesh(asphaltMat, 'coastal-asphalt');
  asphaltMesh.receiveShadow = true;
  root.add(asphaltMesh);

  // 3) Tiled sidewalks (inner W/E islands + outer intersection corners) + central cut-through stone lane
  const sidewalkTex = trackTex(makeSidewalkTexture());
  const sidewalkMat = trackMat(litMaterial({ map: sidewalkTex, roughness: 0.92, grid: false }));
  const swGeo = new GeoBuilder();
  const islandW = INNER_SW_X - LANE_HALF; // 10.8m
  const islandCenterX = LANE_HALF + islandW * 0.5; // 6.6m
  for (const sx of [-1, 1]) {
    swGeo.box(CX + sx * islandCenterX, CURB_H * 0.5, CZ, islandW, CURB_H, INNER_SW_Z * 2, { color: 0xffffff });
  }
  // Outer intersection corner aprons
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      swGeo.box(CX + sx * (ROAD_OUT_X + 2.4), CURB_H * 0.5, CZ + sz * (ROAD_OUT_Z + 2.4), 4.8, CURB_H, 4.8, { color: 0xf4ecd8 });
    }
    swGeo.box(CX + sx * (ROAD_OUT_X + 1.2), CURB_H * 0.5, CZ, 2.4, CURB_H, INNER_SW_Z * 2, { color: 0xf4ecd8 });
  }
  for (const sz of [-1, 1]) {
    swGeo.box(CX, CURB_H * 0.5, CZ + sz * (ROAD_OUT_Z + 1.2), INNER_SW_X * 2, CURB_H, 2.4, { color: 0xf4ecd8 });
  }
  // Central 2.4m cut-through stone lane (flush with road so riding through is smooth)
  swGeo.box(CX, 0.008, CZ, LANE_HALF * 2, 0.016, INNER_SW_Z * 2 + 0.12, { color: 0xd9cdb6 });
  const swMesh = swGeo.mesh(sidewalkMat, 'coastal-sidewalk');
  swMesh.receiveShadow = true;
  root.add(swMesh);

  // 4) Crisp road markings, crosswalks, curbs, hedges, utility wires & baked ground details
  const detailMat = trackMat(litMaterial({ vertexColors: true, grid: false, roughness: 0.90 }));
  const det = new GeoBuilder();
  const roadEdgeS = CZ + INNER_SW_Z + ROAD_W * 0.5;
  const roadEdgeN = CZ - INNER_SW_Z - ROAD_W * 0.5;
  const roadEdgeW = CX - INNER_SW_X - ROAD_W * 0.5;
  const roadEdgeE = CX + INNER_SW_X + ROAD_W * 0.5;

  // Dashed centerlines along the 4 roads (skipping inside the intersection boxes)
  for (let k = -39; k <= 39; k += 2.6) {
    const wx = CX + k;
    if (Math.abs(wx - roadEdgeW) > 3.6 && Math.abs(wx - roadEdgeE) > 3.6) {
      det.box(wx, 0.008, roadEdgeS, 1.35, 0.012, 0.11, { color: CITY_PALETTE.roadPaint });
      det.box(wx, 0.008, roadEdgeN, 1.35, 0.012, 0.11, { color: CITY_PALETTE.roadPaint });
    }
  }
  for (let k = -34; k <= 34; k += 2.6) {
    const wz = CZ + k;
    if (Math.abs(wz - roadEdgeS) > 3.6 && Math.abs(wz - roadEdgeN) > 3.6) {
      det.box(roadEdgeW, 0.008, wz, 0.11, 0.012, 1.35, { color: CITY_PALETTE.roadPaint });
      det.box(roadEdgeE, 0.008, wz, 0.11, 0.012, 1.35, { color: CITY_PALETTE.roadPaint });
    }
  }
  // Crosswalks framing the SW focal corner intersection (roadEdgeW, roadEdgeS)
  for (let i = -3; i <= 3; i++) {
    det.box(CX - INNER_SW_X + 0.8, 0.008, roadEdgeS + i * 0.72, 1.4, 0.012, 0.34, { color: CITY_PALETTE.roadPaint });
    det.box(CX - ROAD_OUT_X - 0.8, 0.008, roadEdgeS + i * 0.72, 1.4, 0.012, 0.34, { color: CITY_PALETTE.roadPaint });
    det.box(roadEdgeW + i * 0.72, 0.008, CZ + INNER_SW_Z - 0.8, 0.34, 0.012, 1.4, { color: CITY_PALETTE.roadPaint });
    det.box(roadEdgeW + i * 0.72, 0.008, CZ + ROAD_OUT_Z + 0.8, 0.34, 0.012, 1.4, { color: CITY_PALETTE.roadPaint });
  }
  // Rounded curb border trim along the two house block islands
  for (const sx of [-1, 1]) {
    const x0 = CX + sx * (LANE_HALF + LOT_W + SW_WIDTH - 0.12);
    det.box(x0, CURB_H * 0.55, CZ, 0.24, CURB_H * 1.06, INNER_SW_Z * 2, { color: 0xeee3cc });
    det.box(CX + sx * islandCenterX, CURB_H * 0.55, CZ + INNER_SW_Z - 0.12, islandW, CURB_H * 1.06, 0.24, { color: 0xeee3cc });
    det.box(CX + sx * islandCenterX, CURB_H * 0.55, CZ - INNER_SW_Z + 0.12, islandW, CURB_H * 1.06, 0.24, { color: 0xeee3cc });
  }
  // Low cozy shrub strip in the 1.0m gap between North & South lots
  for (const sx of [-1, 1]) {
    det.box(CX + sx * LOT_X_OFF, CURB_H + 0.28, CZ, LOT_W - 0.4, 0.56, 0.76, { color: 0x5c9658 });
  }

  // Overhead utility wires connecting the 2 poles along the South-West sidewalk
  const poleA = [CX - 11.4, CURB_H, CZ + 4.0];
  const poleB = [CX - 11.4, CURB_H, CZ + 18.0];
  const poleC = [CX + 11.4, CURB_H, CZ + 10.2];
  for (const ox of [-0.66, 0.0, 0.66]) {
    addOverheadSpan(det, [poleA[0] + ox, CURB_H + 6.38, poleA[2]], [poleB[0] + ox, CURB_H + 6.38, poleB[2]], 0.48);
  }
  addOverheadSpan(det, [poleA[0], CURB_H + 6.38, poleA[2] + 0.1], [poleC[0], CURB_H + 6.38, poleC[2]], 0.75);

  const detailMesh = det.mesh(detailMat, 'coastal-details');
  detailMesh.receiveShadow = true;
  root.add(detailMesh);

  // 5) Assemble the 2x2 grid of 4 walled detached houses + garden trees + AC units + gate nameplates
  const contactTex = trackTex(makeContactTex());
  const contactMat = trackMat(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }));
  const signKit = new SignKit({ rng: new RNG(4021), mode: 'lit', storybook: true, density: 1 });

  const lots = [
    {
      name: '小林宅', sub: '101',
      x: CX - LOT_X_OFF, z: CZ + LOT_Z_OFF, rotY: 0, // SW lot -> faces South road (+Z)
      house: 'House_A', wall: 'Lot_Wall_Cream',
      citrus: [-2.8, 2.3], ac: [-3.14, 1.45, -1.25, -Math.PI / 2],
    },
    {
      name: '陈家', sub: '102',
      x: CX + LOT_X_OFF, z: CZ + LOT_Z_OFF, rotY: 0, // SE lot -> faces South road (+Z)
      house: 'House_B', wall: 'Lot_Wall_Brick',
      citrus: [2.9, 2.5], ac: [3.09, 1.35, -1.10, Math.PI / 2],
    },
    {
      name: '佐藤宅', sub: '103',
      x: CX - LOT_X_OFF, z: CZ - LOT_Z_OFF, rotY: -Math.PI / 2, // NW lot -> faces West road (-X)
      house: 'House_C', wall: 'Lot_Wall_Timber',
      citrus: [-2.5, 2.5], ac: [2.49, 1.35, -1.65, Math.PI / 2],
    },
    {
      name: '林家', sub: '104',
      x: CX + LOT_X_OFF, z: CZ - LOT_Z_OFF, rotY: Math.PI / 2, // NE lot -> faces East road (+X)
      house: 'House_B', wall: 'Lot_Wall_Cream',
      citrus: [2.7, 2.4], ac: [-3.04, 1.35, -1.25, -Math.PI / 2],
    },
  ];

  const placeProp = (meshName, x, y, z, rotY = 0, scale = 1) => {
    const src = kitMeshes[meshName];
    if (!src) return null;
    const clone = src.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = rotY;
    clone.scale.setScalar(scale);
    root.add(clone);
    return clone;
  };

  for (const lot of lots) {
    const lotGroup = new THREE.Group();
    lotGroup.position.set(lot.x, CURB_H, lot.z);
    lotGroup.rotation.y = lot.rotY;

    const houseMesh = kitMeshes[lot.house].clone();
    const wallMesh = kitMeshes[lot.wall].clone();
    lotGroup.add(houseMesh, wallMesh);

    // Subtle soft contact shadow pad under house & citrus tree
    const housePad = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 6.4), contactMat);
    housePad.rotation.x = -Math.PI / 2;
    housePad.position.set(0, 0.012, -1.15);
    lotGroup.add(housePad);

    const citrus = kitMeshes.Prop_CitrusTree.clone();
    citrus.position.set(lot.citrus[0], 0, lot.citrus[1]);
    citrus.rotation.y = lot.x * 0.4;
    lotGroup.add(citrus);

    const ac = kitMeshes.Prop_ACUnit.clone();
    ac.position.set(lot.ac[0], lot.ac[1], lot.ac[2]);
    ac.rotation.y = lot.ac[3];
    lotGroup.add(ac);

    root.add(lotGroup);

    // Compute world coordinates for the right gate pillar plaque mount (local +1.18, 1.12, +4.16)
    const localMount = new THREE.Vector3(1.18, CURB_H + 1.12, 4.162);
    localMount.applyAxisAngle(new THREE.Vector3(0, 1, 0), lot.rotY);
    signKit.add(
      {
        kind: 'plaque',
        style: 'door',
        text: lot.name,
        sub: lot.sub,
        w: 0.42,
        h: 0.28,
        bg: 0x2c5c8f,
        fg: 0xffffff,
        storybook: true,
        emit: 0,
      },
      { x: lot.x + localMount.x, y: localMount.y, z: lot.z + localMount.z, rotY: lot.rotY },
    );
  }

  root.add(signKit.build());

  // 6) Street corner details: vending machine (flush along West wall, clearly separated from mirror & lit at night),
  // corner mirror facing SW intersection, and utility poles
  placeProp('Prop_VendingMachine', CX - 10.65, CURB_H, CZ + 6.40, -Math.PI * 0.5);
  placeProp('Prop_CornerMirror', CX - 11.62, CURB_H, CZ + 10.35, -Math.PI * 0.25);
  placeProp('Prop_UtilityPole', poleA[0], poleA[1], poleA[2], Math.PI * 0.5);
  placeProp('Prop_UtilityPole', poleB[0], poleB[1], poleB[2], Math.PI * 0.5);
  placeProp('Prop_UtilityPole', poleC[0], poleC[1], poleC[2], 0);

  // 7) Soft perimeter framing trees using existing countryside round tree InstancedMesh
  if (roundTreeTemplate) {
    const outerTrees = [
      [CX - 22.0, 0, CZ + 20.5, 0.3, 1.05, 1.02, 1.05],
      [CX - 22.0, 0, CZ - 20.0, 1.7, 1.12, 1.08, 1.12],
      [CX + 22.5, 0, CZ + 20.5, 2.4, 1.02, 0.98, 1.02],
      [CX + 22.5, 0, CZ - 20.0, 3.8, 1.15, 1.10, 1.15],
      [CX - 6.0, 0, CZ - 22.5, 1.1, 1.08, 1.05, 1.08],
      [CX + 8.0, 0, CZ - 22.5, 2.9, 1.10, 1.06, 1.10],
      [CX + 24.5, 0, CZ - 3.0, 4.2, 1.05, 1.02, 1.05],
      [CX + 30.0, 0, CZ + 20.5, 0.9, 1.12, 1.08, 1.12],
      [CX + 34.0, 0, CZ + 7.0, 2.1, 1.06, 1.02, 1.06],
      [CX + 23.0, 0, CZ - 28.0, 3.1, 1.14, 1.10, 1.14],
      [CX - 22.5, 0, CZ - 30.0, 4.5, 1.08, 1.04, 1.08],
      [CX - 34.0, 0, CZ + 7.5, 1.4, 1.10, 1.06, 1.10],
    ];
    placeInstances(root, roundTreeTemplate, outerTrees);
  }

  return {
    root,
    dispose() {
      signKit.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
