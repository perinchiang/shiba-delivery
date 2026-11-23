// Painterly Ghibli-style trees for meadow stretches:
// - Hand-painted gouache leaf-cluster alpha texture with alpha-bleed edge padding
// - Cupped leaf cards with spherical normal transfer (soft cloud shading without checkerboard facets)
// - Slender curving trunks & branches peeking naturally into asymmetric foliage lobes
// - Grounded contact shadows (1 InstancedMesh) + shared wind & cloud shadows across all 4 TODs
import * as THREE from 'three';
import { litMaterial } from '../core/materials.js';
import { rngFrom } from '../core/rng.js';
import { MEADOW_COMMON_GLSL, meadowUniforms } from './stylized-meadow.js';

let leafTexture;
let shadowTexture;
let trunkMaterial;
let canopyMaterial;
let shadowMaterial;
const variantCache = new Map();

function createLeafClusterTexture() {
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([215, 220, 205, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = rngFrom('吉卜力树叶笔触', 7);

  ctx.clearRect(0, 0, size, size);

  const drawLeafStroke = (cx, cy, rx, ry, ang, lum, alpha = 1) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    // Crisp Ghibli ovate broadleaf (tapered tip & base so silhouette breaks into distinct leaves)
    ctx.moveTo(0, ry);
    ctx.bezierCurveTo(rx * 1.15, ry * 0.35, rx * 0.85, -ry * 0.55, 0, -ry);
    ctx.bezierCurveTo(-rx * 0.85, -ry * 0.55, -rx * 1.15, ry * 0.35, 0, ry);
    ctx.closePath();
    const r = Math.round(lum * 0.96);
    const g = Math.min(255, Math.round(lum * 1.04));
    const b = Math.round(lum * 0.86);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
    ctx.restore();
  };

  const cx = size * 0.5;
  const cy = size * 0.5;

  const drawSprig = (sx, sy, count, baseAng, spread, minR, maxR, lumLo, lumHi) => {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) - 0.5 : 0;
      const a = baseAng + t * spread + rng.range(-0.18, 0.18);
      const dist = rng.range(minR, maxR);
      const rx = rng.range(22, 34);
      const ry = rng.range(38, 56);
      drawLeafStroke(
        sx + Math.cos(a) * dist,
        sy + Math.sin(a) * dist,
        rx,
        ry,
        a + Math.PI * 0.5 + rng.range(-0.25, 0.25),
        rng.range(lumLo, lumHi),
      );
    }
  };

  // Back dark leaves forming 5 distinct fanning leafy sprays around a light-hearted core
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = size * 0.19;
    drawSprig(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, a, 1.35, 18, 52, 146, 178);
  }

  // Cohesive mid-core leaves bridging sprays without filling the whole square into a pancake
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const d = rng.range(0, size * 0.11);
    drawLeafStroke(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      rng.range(28, 42),
      rng.range(42, 58),
      a + rng.range(-0.5, 0.5),
      rng.range(182, 212),
    );
  }

  // Crisp sunlit front leaf sprigs toward the upper/outer face for gouache depth
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 + 0.32 + rng.range(-0.15, 0.15);
    const r = size * 0.14;
    drawSprig(cx + Math.cos(a) * r, cy + Math.sin(a) * r - size * 0.02, 4, a, 1.15, 14, 46, 218, 250);
  }

  // Alpha-bleed padding: set transparent pixels to mid-leaf RGB so mipmaps never get dark halos
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) {
      data[i] = 198;
      data[i + 1] = 212;
      data[i + 2] = 186;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture() {
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([30, 50, 30, 128]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.04, size * 0.5, size * 0.5, size * 0.48);
  g.addColorStop(0.0, 'rgba(18, 46, 36, 0.92)');
  g.addColorStop(0.42, 'rgba(20, 52, 40, 0.62)');
  g.addColorStop(0.76, 'rgba(24, 58, 44, 0.22)');
  g.addColorStop(1.0, 'rgba(24, 58, 44, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function getTrunkMaterial() {
  if (trunkMaterial) return trunkMaterial;
  trunkMaterial = litMaterial({ vertexColors: true, grid: false, roughness: 0.94 });
  return trunkMaterial;
}

function getCanopyMaterial() {
  if (canopyMaterial) return canopyMaterial;
  if (!leafTexture) leafTexture = createLeafClusterTexture();
  canopyMaterial = litMaterial({
    map: leafTexture,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    grid: false,
    roughness: 0.90,
  });
  const prev = canopyMaterial.onBeforeCompile;
  canopyMaterial.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMeadowTime = meadowUniforms.uMeadowTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFoliage;
        varying vec4 vFoliage;
        varying vec2 vMeadowXZ;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFoliage = aFoliage;
        #ifdef USE_INSTANCING
          vec4 rootW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vMeadowXZ = rootW.xz;
          float gust = meadowGust(vMeadowXZ, uMeadowTime);
          float rustle = sin(uMeadowTime * 2.7 + aFoliage.w * 6.2831 + vMeadowXZ.x * 0.7);
          float w = aFoliage.z;
          vec2 disp = vec2(0.76, 0.65) * ((0.035 + 0.055 * gust) * w)
                    + vec2(0.45, -0.55) * (0.022 * rustle * w);
          vec2 col0 = instanceMatrix[0].xz;
          vec2 col2 = instanceMatrix[2].xz;
          transformed.x += dot(col0, disp) / max(dot(col0, col0), 1e-4);
          transformed.z += dot(col2, disp) / max(dot(col2, col2), 1e-4);
          transformed.y += 0.012 * rustle * w;
        #else
          vMeadowXZ = position.xz;
        #endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFoliage;
        varying vec2 vMeadowXZ;
        ` + MEADOW_COMMON_GLSL)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Keep transferred outward spherical normals on both sides of DoubleSide cards
        normal *= faceDirection;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float texLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 deepTeal  = vec3(0.044, 0.175, 0.082);
        vec3 midGreen  = vec3(0.112, 0.340, 0.070);
        vec3 warmCrown = vec3(0.285, 0.520, 0.078);

        float crownMix = clamp(vFoliage.y * 0.62 + vFoliage.x * 0.38, 0.0, 1.0);
        vec3 pal = mix(deepTeal, midGreen, smoothstep(0.12, 0.56, crownMix));
        pal = mix(pal, warmCrown, smoothstep(0.54, 0.94, crownMix));

        // Clean inner-core AO & crisp gouache brush shading (no muddy dark interior)
        float coreAO = mix(0.76, 1.06, vFoliage.x);
        float brush = mix(0.84, 1.18, smoothstep(0.32, 0.94, texLuma));
        vec3 cloud = mix(vec3(1.0), meadowCloudShadow(vMeadowXZ, uMeadowTime), 0.72);
        diffuseColor.rgb = pal * coreAO * brush * cloud;
        #ifdef USE_INSTANCING_COLOR
          diffuseColor.rgb *= vColor;
        #endif`);
  };
  canopyMaterial.customProgramCacheKey = () => 'rongwan-stylized-tree-canopy-v1';
  return canopyMaterial;
}

function getShadowMaterial() {
  if (shadowMaterial) return shadowMaterial;
  if (!shadowTexture) shadowTexture = createContactShadowTexture();
  shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return shadowMaterial;
}

function appendTube(pos, nor, col, idx, pts, radii, cols, sides = 8) {
  const rings = [];
  let prevU = null;
  const _t = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const cTmp = new THREE.Color();

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) _t.subVectors(pts[1], pts[0]).normalize();
    else if (i === pts.length - 1) _t.subVectors(pts[i], pts[i - 1]).normalize();
    else _t.subVectors(pts[i + 1], pts[i - 1]).normalize();

    if (!prevU) {
      const ref = Math.abs(_t.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      _u.crossVectors(_t, ref).normalize();
    } else {
      _u.copy(prevU).addScaledVector(_t, -prevU.dot(_t));
      if (_u.lengthSq() < 1e-6) {
        const ref = Math.abs(_t.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        _u.crossVectors(_t, ref);
      }
      _u.normalize();
    }
    _v.crossVectors(_t, _u).normalize();
    prevU = _u.clone();

    cTmp.setHex(cols[i]);
    const r = radii[i];
    const ring = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      _d.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_v, Math.sin(a));
      const vi = pos.length / 3;
      pos.push(p.x + _d.x * r, p.y + _d.y * r, p.z + _d.z * r);
      nor.push(_d.x, _d.y, _d.z);
      // Slight subtle bark shading around circumference
      const barkVar = 0.93 + 0.09 * Math.sin(a * 3 + i * 1.1);
      col.push(cTmp.r * barkVar, cTmp.g * barkVar, cTmp.b * barkVar);
      ring.push(vi);
    }
    rings.push(ring);
  }

  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let s = 0; s < sides; s++) {
      const ns = (s + 1) % sides;
      idx.push(r0[s], r1[s], r1[ns], r0[s], r1[ns], r0[ns]);
    }
  }
}

function buildTrunkGeometry(spec) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];

  // Main slender S-curved trunk
  const trunkPts = spec.trunkPts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const trunkCols = [0x68422b, 0x7a4f34, 0x8d5d3f, 0x9b6847, 0x8a5b3d, 0x754b32];
  appendTube(pos, nor, col, idx, trunkPts, spec.trunkRadii, trunkCols.slice(0, trunkPts.length), 10);

  // Gentle organic root flare tucked cleanly into grass (no spiky carrot fingers)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + spec.rootSpin;
    const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = spec.trunkRadii[0];
    const pts = [
      new THREE.Vector3(ca * (r0 * 0.95), -0.09, sa * (r0 * 0.95)),
      new THREE.Vector3(ca * (r0 * 0.62), 0.12, sa * (r0 * 0.62)),
      new THREE.Vector3(ca * (r0 * 0.28), 0.42, sa * (r0 * 0.28)),
    ];
    appendTube(pos, nor, col, idx, pts, [r0 * 0.45, r0 * 0.34, r0 * 0.16], [0x5e3b26, 0x764c32, 0x895a3c], 6);
  }

  // Primary branches reaching into the centers of foliage lobes
  for (const br of spec.branches) {
    const pts = br.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    appendTube(pos, nor, col, idx, pts, br.radii, [0x7e5135, 0x8f5f40, 0x74492f], 6);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function buildCanopyGeometry(spec, seed) {
  const rng = rngFrom('吉卜力树冠', seed);
  const pos = [];
  const nor = [];
  const uv = [];
  const foliage = [];
  const idx = [];

  // Compute canopy macro center & height bounds for spherical normal transfer
  const macroCenter = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (const l of spec.lobes) {
    macroCenter.add(new THREE.Vector3(l.x, l.y, l.z));
    minY = Math.min(minY, l.y - l.ry);
    maxY = Math.max(maxY, l.y + l.ry);
  }
  macroCenter.divideScalar(spec.lobes.length);
  const spanY = Math.max(1.0, maxY - minY);

  const upAxis = new THREE.Vector3(0, 1, 0);
  const rightAxis = new THREE.Vector3();
  const cardUp = new THREE.Vector3();
  const lobeC = new THREE.Vector3();
  const cardCenter = new THREE.Vector3();
  const lobeN = new THREE.Vector3();
  const macroN = new THREE.Vector3();
  const cardNormal = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();

  // Add a 5-vertex slightly cupped leaf-cluster card so cards look plump even at grazing angles
  const emitCard = (center, faceDir, cardSize, roll, lobeShade, windWeight, phase) => {
    const f = faceDir.clone().normalize();
    const ref = Math.abs(f.y) < 0.92 ? upAxis : new THREE.Vector3(1, 0, 0);
    rightAxis.crossVectors(ref, f).normalize();
    cardUp.crossVectors(f, rightAxis).normalize();

    const cr = Math.cos(roll), sr = Math.sin(roll);
    const rx = rightAxis.clone().multiplyScalar(cr).addScaledVector(cardUp, sr);
    const uy = rightAxis.clone().multiplyScalar(-sr).addScaledVector(cardUp, cr);

    const half = cardSize * 0.5;
    const cup = cardSize * 0.14;
    const corners = [
      [-half, -half, 0, 0, 0],
      [half, -half, 0, 1, 0],
      [half, half, 0, 1, 1],
      [-half, half, 0, 0, 1],
      [0, 0, cup, 0.5, 0.5],
    ];

    const base = pos.length / 3;
    for (const [lx, ly, lz, u, v] of corners) {
      vPos.copy(center).addScaledVector(rx, lx).addScaledVector(uy, ly).addScaledVector(f, lz);
      lobeN.subVectors(vPos, lobeC);
      if (lobeN.lengthSq() < 1e-5) lobeN.set(0, 1, 0);
      lobeN.normalize();
      macroN.subVectors(vPos, macroCenter);
      if (macroN.lengthSq() < 1e-5) macroN.set(0, 1, 0);
      macroN.normalize();

      // Spherical normal transfer: blend lobe sphere + whole canopy + slight upward sky lift
      vNorm.copy(lobeN).multiplyScalar(0.68).addScaledVector(macroN, 0.32);
      vNorm.y += 0.28;
      vNorm.normalize();

      const crownH = THREE.MathUtils.clamp((vPos.y - minY) / spanY, 0, 1);
      pos.push(vPos.x, vPos.y, vPos.z);
      nor.push(vNorm.x, vNorm.y, vNorm.z);
      uv.push(u, v);
      foliage.push(lobeShade, crownH, windWeight, phase);
    }

    idx.push(
      base + 0, base + 1, base + 4,
      base + 1, base + 2, base + 4,
      base + 2, base + 3, base + 4,
      base + 3, base + 0, base + 4,
    );
  };

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const lobe of spec.lobes) {
    lobeC.set(lobe.x, lobe.y, lobe.z);

    // Inner darker core cards prevent see-through hollows inside a lobe
    const innerCount = lobe.innerCards ?? 10;
    for (let i = 0; i < innerCount; i++) {
      const y = 1 - ((i + 0.5) / innerCount) * 1.85;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * goldenAngle + rng.range(-0.25, 0.25);
      const radScale = rng.range(0.40, 0.58);
      lobeN.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();
      cardCenter.set(
        lobeC.x + lobeN.x * lobe.rx * radScale,
        lobeC.y + lobeN.y * lobe.ry * radScale,
        lobeC.z + lobeN.z * lobe.rz * radScale,
      );
      cardNormal.copy(lobeN).add(new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(-0.2, 0.3), rng.range(-0.4, 0.4))).normalize();
      emitCard(cardCenter, cardNormal, lobe.cardSize * 0.92, rng.range(0, Math.PI * 2), 0.38, 0.35, rng.next());
    }

    // Outer fluffy leaf-cluster shell cards (Fibonacci sphere + varied tilt for 3D volume)
    const outerCount = lobe.outerCards ?? 46;
    for (let i = 0; i < outerCount; i++) {
      const y = 1 - ((i + 0.5) / outerCount) * 1.88; // keep bottom slightly tucked
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * goldenAngle + rng.range(-0.18, 0.18);
      const radScale = rng.range(0.76, 1.02);
      lobeN.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();

      cardCenter.set(
        lobeC.x + lobeN.x * lobe.rx * radScale,
        lobeC.y + lobeN.y * lobe.ry * radScale,
        lobeC.z + lobeN.z * lobe.rz * radScale,
      );

      // Mix outward-facing and cross-angled vane orientations so silhouettes stay rich from every view
      const vaneMix = i % 3 === 0 ? 0.65 : 0.28;
      cardNormal.copy(lobeN).add(
        new THREE.Vector3(rng.range(-vaneMix, vaneMix), rng.range(-0.22, 0.32), rng.range(-vaneMix, vaneMix)),
      ).normalize();

      const sz = lobe.cardSize * rng.range(0.86, 1.16);
      const lobeShade = THREE.MathUtils.clamp(0.45 + 0.55 * (y * 0.5 + 0.5) + rng.range(-0.08, 0.08), 0.28, 1.0);
      emitCard(cardCenter, cardNormal, sz, rng.range(0, Math.PI * 2), lobeShade, 0.65 + 0.35 * radScale, rng.next());
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFoliage', new THREE.Float32BufferAttribute(foliage, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const TREE_SPECS = {
  tall: {
    seed: 101,
    rootSpin: 0.35,
    trunkPts: [[0, -0.10, 0], [0.06, 0.95, -0.04], [-0.04, 1.95, 0.06], [-0.08, 2.95, 0.02], [-0.02, 3.85, -0.05]],
    trunkRadii: [0.25, 0.19, 0.15, 0.115, 0.075],
    branches: [
      { pts: [[-0.04, 2.1, 0.04], [0.65, 2.75, 0.45], [1.35, 3.35, 0.78]], radii: [0.105, 0.07, 0.04] },
      { pts: [[-0.06, 2.45, 0.03], [-0.72, 3.05, -0.38], [-1.35, 3.58, -0.68]], radii: [0.10, 0.068, 0.038] },
      { pts: [[-0.04, 2.75, 0.0], [0.22, 3.35, -0.78], [0.45, 3.88, -1.22]], radii: [0.088, 0.058, 0.035] },
    ],
    lobes: [
      { x: 0.05, y: 4.75, z: 0.05, rx: 1.32, ry: 1.08, rz: 1.28, cardSize: 1.15, outerCards: 56, innerCards: 12 },
      { x: 1.38, y: 3.45, z: 0.82, rx: 1.08, ry: 0.86, rz: 1.04, cardSize: 1.05, outerCards: 46, innerCards: 10 },
      { x: -1.35, y: 3.72, z: -0.68, rx: 1.05, ry: 0.85, rz: 1.02, cardSize: 1.04, outerCards: 44, innerCards: 10 },
      { x: 0.42, y: 4.00, z: -1.25, rx: 0.98, ry: 0.80, rz: 0.96, cardSize: 1.00, outerCards: 40, innerCards: 8 },
      { x: -0.58, y: 3.15, z: 1.12, rx: 0.90, ry: 0.74, rz: 0.88, cardSize: 0.96, outerCards: 38, innerCards: 8 },
    ],
  },
  wide: {
    seed: 207,
    rootSpin: 1.15,
    trunkPts: [[0, -0.10, 0], [-0.08, 0.85, 0.05], [0.05, 1.75, -0.04], [0.02, 2.65, 0.02]],
    trunkRadii: [0.29, 0.22, 0.17, 0.12],
    branches: [
      { pts: [[0.03, 1.92, 0.0], [0.88, 2.50, 0.58], [1.72, 3.02, 1.02]], radii: [0.12, 0.08, 0.046] },
      { pts: [[0.02, 2.08, 0.0], [-0.90, 2.62, 0.50], [-1.72, 3.10, 0.85]], radii: [0.115, 0.078, 0.044] },
      { pts: [[0.02, 2.25, -0.02], [-0.28, 2.82, -0.92], [-0.52, 3.30, -1.58]], radii: [0.105, 0.07, 0.04] },
      { pts: [[0.03, 2.38, 0.02], [0.55, 2.98, -0.75], [1.05, 3.48, -1.25]], radii: [0.095, 0.062, 0.038] },
    ],
    lobes: [
      { x: 0.0, y: 4.10, z: 0.0, rx: 1.45, ry: 0.98, rz: 1.42, cardSize: 1.20, outerCards: 58, innerCards: 12 },
      { x: 1.75, y: 3.05, z: 1.02, rx: 1.18, ry: 0.82, rz: 1.12, cardSize: 1.10, outerCards: 48, innerCards: 10 },
      { x: -1.75, y: 3.15, z: 0.85, rx: 1.15, ry: 0.80, rz: 1.10, cardSize: 1.08, outerCards: 46, innerCards: 10 },
      { x: -0.52, y: 3.32, z: -1.58, rx: 1.10, ry: 0.80, rz: 1.08, cardSize: 1.06, outerCards: 44, innerCards: 9 },
      { x: 1.08, y: 3.50, z: -1.22, rx: 1.02, ry: 0.75, rz: 0.98, cardSize: 1.02, outerCards: 40, innerCards: 8 },
    ],
  },
  compact: {
    seed: 319,
    rootSpin: 0.75,
    trunkPts: [[0, -0.10, 0], [-0.05, 0.78, -0.05], [0.06, 1.58, 0.05], [0.02, 2.40, 0.0]],
    trunkRadii: [0.22, 0.165, 0.13, 0.09],
    branches: [
      { pts: [[0.04, 1.72, 0.02], [0.68, 2.25, 0.48], [1.15, 2.70, 0.78]], radii: [0.09, 0.058, 0.035] },
      { pts: [[0.03, 1.85, 0.01], [-0.65, 2.32, -0.42], [-1.10, 2.78, -0.72]], radii: [0.085, 0.055, 0.034] },
    ],
    lobes: [
      { x: 0.0, y: 3.68, z: 0.0, rx: 1.20, ry: 0.95, rz: 1.16, cardSize: 1.06, outerCards: 50, innerCards: 10 },
      { x: 1.15, y: 2.72, z: 0.78, rx: 0.96, ry: 0.76, rz: 0.92, cardSize: 0.98, outerCards: 42, innerCards: 8 },
      { x: -1.10, y: 2.82, z: -0.72, rx: 0.94, ry: 0.74, rz: 0.90, cardSize: 0.96, outerCards: 40, innerCards: 8 },
      { x: -0.35, y: 2.65, z: 0.96, rx: 0.85, ry: 0.68, rz: 0.84, cardSize: 0.92, outerCards: 36, innerCards: 7 },
    ],
  },
  citrus: {
    seed: 421,
    rootSpin: 0.45,
    trunkPts: [[0, -0.06, 0], [-0.03, 0.45, 0.02], [0.03, 0.95, -0.02], [0.0, 1.42, 0.0]],
    trunkRadii: [0.11, 0.085, 0.065, 0.045],
    branches: [
      { pts: [[0.02, 0.95, 0.0], [0.34, 1.32, 0.24]], radii: [0.045, 0.025] },
      { pts: [[0.0, 1.05, 0.0], [-0.32, 1.38, -0.20]], radii: [0.042, 0.024] },
    ],
    lobes: [
      { x: 0.0, y: 2.02, z: 0.0, rx: 0.72, ry: 0.58, rz: 0.70, cardSize: 0.66, outerCards: 38, innerCards: 8 },
      { x: 0.48, y: 1.56, z: 0.30, rx: 0.54, ry: 0.44, rz: 0.52, cardSize: 0.58, outerCards: 30, innerCards: 6 },
      { x: -0.46, y: 1.62, z: -0.26, rx: 0.52, ry: 0.42, rz: 0.50, cardSize: 0.56, outerCards: 28, innerCards: 6 },
    ],
  },
};

function getVariantMeshes(name) {
  if (variantCache.has(name)) return variantCache.get(name);
  const spec = TREE_SPECS[name];
  const pair = {
    trunkGeo: buildTrunkGeometry(spec),
    canopyGeo: buildCanopyGeometry(spec, spec.seed),
  };
  variantCache.set(name, pair);
  return pair;
}

const FOLIAGE_TINTS = [0xffffff, 0xf3fae6, 0xe8f5dc, 0xfff8e2];

function pickVariant(entry) {
  if (entry.variant && TREE_SPECS[entry.variant]) return entry.variant;
  if (entry.kind === 'bank') return 'wide';
  const h = Math.abs(Math.round(entry.x * 13 + entry.z * 7)) % 3;
  return h === 0 ? 'tall' : h === 1 ? 'compact' : 'wide';
}

export { getCanopyMaterial, getTrunkMaterial };

export function placeStylizedTrees(group, entries) {
  if (!entries || !entries.length) return;

  const buckets = { tall: [], wide: [], compact: [], citrus: [] };
  for (const e of entries) buckets[pickVariant(e)].push(e);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  for (const [name, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const { trunkGeo, canopyGeo } = getVariantMeshes(name);

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, getTrunkMaterial(), list.length);
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, getCanopyMaterial(), list.length);

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      dummy.position.set(e.x, e.y, e.z);
      dummy.rotation.set(0, e.rotY, 0);
      dummy.scale.set(e.sx, e.sy, e.sz);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      canopyMesh.setMatrixAt(i, dummy.matrix);

      const baseHex = e.colorHex !== undefined ? e.colorHex : 0xffffff;
      const varHex = FOLIAGE_TINTS[Math.abs(Math.round(e.x * 11 + e.z * 5)) % FOLIAGE_TINTS.length];
      tint.setHex(baseHex).multiply(new THREE.Color(varHex));
      canopyMesh.setColorAt(i, tint);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    trunkMesh.castShadow = false;
    trunkMesh.receiveShadow = true;
    canopyMesh.castShadow = false;
    canopyMesh.receiveShadow = true;
    trunkMesh.computeBoundingSphere();
    canopyMesh.computeBoundingSphere();

    group.add(trunkMesh, canopyMesh);
  }

  // Soft radial contact shadows grounding every tree firmly in the grass
  const shadowGeo = new THREE.PlaneGeometry(4.8, 4.8);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.InstancedMesh(shadowGeo, getShadowMaterial(), entries.length);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const vName = pickVariant(e);
    const rScale = ((e.sx + e.sz) * 0.5) * (vName === 'wide' ? 1.18 : vName === 'citrus' ? 0.42 : 1.0);
    dummy.position.set(e.x, e.y + 0.025, e.z);
    dummy.rotation.set(0, e.rotY, 0);
    dummy.scale.set(rScale, 1, rScale);
    dummy.updateMatrix();
    shadowMesh.setMatrixAt(i, dummy.matrix);
  }
  shadowMesh.instanceMatrix.needsUpdate = true;
  shadowMesh.renderOrder = 1;
  shadowMesh.computeBoundingSphere();
  group.add(shadowMesh);
}
