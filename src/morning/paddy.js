// Scheme A Stylized 3D Rice Paddies:
// - Zone 1 (x = 196..570 & 956..1068): Open airy green-gold water paddies with glinting irrigation channels.
// - Zone 2 (x = 570..892): Helmet-high golden ripe rice corridor hugging the road, with GPU rider slipstream wake.
// The bridge bend has its own painted sheaves and continuous field surface.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { rngFrom } from '../core/rng.js';
import { addHarvest, harvestSheaves, harvestStart, harvestEnd, harvestWeight, inHarvest } from './harvest-field.js';
import { centerZ, halfWidth, paddyShoulderSample, roadHeight } from './country-route.js';

export const fieldStart = 196;
export const tallStart = 570;
export const tallFull = 632;
export const fieldEnd = 892;
export const eastFieldStart = 956;
export const eastFieldEnd = 1068;

export const fieldWindTime = { value: 0 };

export function shoulderSampleWeight(x) {
  return THREE.MathUtils.smoothstep(x, paddyShoulderSample.start - 10, paddyShoulderSample.start)
    * (1 - THREE.MathUtils.smoothstep(x, paddyShoulderSample.end, paddyShoulderSample.end + 10));
}

// 6-slot trailing wake ring buffer + live rider state shared across all paddy shaders.
const WAKE_COUNT = 6;
const wakeTrail = Array.from({ length: WAKE_COUNT }, () => new THREE.Vector4(1e5, 1e5, -100, 0));
const riderLive = new THREE.Vector4(1e5, 1e5, 1, 0);
const riderSpeedNorm = { value: 0 };
let lastWakeStamp = -10;
let wakeSlot = 0;

export function updatePaddyEnv(time, state) {
  fieldWindTime.value = time;
  if (!state) return;
  const speed = Math.abs(state.speed || 0);
  const norm = THREE.MathUtils.clamp(speed / 13.9, 0, 1);
  riderSpeedNorm.value = norm;
  const yaw = state.bikeYaw ?? state.yaw ?? Math.PI / 2;
  riderLive.set(state.x, state.z, Math.sin(yaw), Math.cos(yaw));
  if (time - lastWakeStamp >= 0.085 && speed > 0.35) {
    lastWakeStamp = time;
    wakeTrail[wakeSlot].set(state.x, state.z, time, norm);
    wakeSlot = (wakeSlot + 1) % WAKE_COUNT;
  }
}

const canopyMaterial = litMaterial({ vertexColors: true, grid: false, roughness: 0.92 });
const clumpMaterial = litMaterial({ vertexColors: true, grid: false, roughness: 0.88 });

function patchPaddyWind(surface, isClump, painted = false) {
  const worldLighting = surface.onBeforeCompile;
  surface.onBeforeCompile = (shader, renderer) => {
    worldLighting(shader, renderer);
    shader.uniforms.uPaddyTime = fieldWindTime;
    shader.uniforms.uWake = { value: wakeTrail };
    shader.uniforms.uRider = { value: riderLive };
    shader.uniforms.uRiderSpeed = riderSpeedNorm;

    const common = /* glsl */ `
      varying vec2 vPaddy;
      varying float vPaddyH;
      varying float vWakeBoost;
      uniform float uPaddyTime;
      uniform vec4 uWake[${WAKE_COUNT}];
      uniform vec4 uRider;
      uniform float uRiderSpeed;
      float paddyGust(vec2 p) {
        float phase = dot(p, vec2(0.24, 0.62)) - 1.85 * uPaddyTime + 1.05 * sin(p.x * 0.085 + p.y * 0.055);
        return 0.58 * sin(phase) + 0.26 * sin(phase * 1.48 + 0.41 * uPaddyTime)
             + 0.16 * sin(p.x * 0.52 + p.y * 0.21 - 2.2 * uPaddyTime);
      }
    `;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + common)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vPaddyH = position.y;
        vWakeBoost = 0.0;
        #ifdef USE_INSTANCING
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          vPaddy = wp.xz;
          float flex = pow(clamp(position.y / 1.32, 0.0, 1.0), 1.65);
          float g = paddyGust(vPaddy);
          vec2 worldDisp = vec2(0.36, 0.93) * ((0.06 + 0.16 * g) * flex);

          // Live vehicle proximity + trailing slipstream wake (parting push + brisk flutter + elastic rebound)
          vec2 toPlant = vPaddy - uRider.xy;
          float dLive = length(toPlant);
          if (dLive < 5.6 && uRiderSpeed > 0.02) {
            float prox = (1.0 - smoothstep(0.6, 5.6, dLive)) * uRiderSpeed;
            vec2 away = toPlant / max(dLive, 0.15);
            float vib = sin(uPaddyTime * (12.0 + 14.0 * uRiderSpeed) + vPaddy.x * 1.7 + vPaddy.y * 1.3);
            worldDisp += (away * 0.34 + uRider.zw * 0.14 + away * (0.09 * vib)) * prox * flex;
            vWakeBoost = max(vWakeBoost, prox);
          }
          for (int wi = 0; wi < ${WAKE_COUNT}; wi++) {
            vec4 wk = uWake[wi];
            float age = uPaddyTime - wk.z;
            if (age > 0.0 && age < 1.55 && wk.w > 0.02) {
              vec2 dVec = vPaddy - wk.xy;
              float dist = length(dVec);
              if (dist < 5.2) {
                float env = exp(-age * 2.15) * (1.0 - smoothstep(0.5, 5.2, dist)) * wk.w;
                vec2 away = dVec / max(dist, 0.15);
                float ring = sin(age * 13.5 - dist * 1.6 + vPaddy.x * 0.9);
                float push = 0.24 * exp(-age * 1.8) + 0.14 * ring;
                worldDisp += away * push * env * flex;
                vWakeBoost = max(vWakeBoost, env * 0.85);
              }
            }
          }
          // Transform world XZ displacement into each randomly-rotated instance's local space
          vec2 axisX = normalize(instanceMatrix[0].xz);
          vec2 axisZ = normalize(instanceMatrix[2].xz);
          transformed.x += dot(axisX, worldDisp);
          transformed.z += dot(axisZ, worldDisp);
          transformed.y -= 0.14 * length(worldDisp) * flex;
        #else
          vPaddy = position.xz;
          float hMask = smoothstep(-0.08, 0.38, position.y);
          transformed.y += 0.055 * paddyGust(vPaddy) * hMask;
        #endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + common)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        ${painted ? `
          float fold = .5 + .5 * sin(vPaddy.x*.19 + vPaddy.y*.47 + .9*sin(vPaddy.x*.072));
          diffuseColor.rgb *= mix(vec3(.75,.79,.64), vec3(1.11,1.08,.92), smoothstep(.12,.90,fold));
        ` : ''}
        float wave = smoothstep(-0.62, 0.85, paddyGust(vPaddy));
        vec3 shadeTint = vec3(0.84, 0.90, 0.82);
        vec3 sunTint   = vec3(1.16, 1.11, 0.92);
        diffuseColor.rgb *= mix(shadeTint, sunTint, clamp(wave + vWakeBoost * 0.45, 0.0, 1.0));
        ${isClump ? `
          // Luminous warm gold crown & cool lush shaded root (clean storybook depth without dark mud)
          float hGrad = smoothstep(0.05, 1.15, vPaddyH);
          diffuseColor.rgb *= mix(vec3(0.76, 0.88, 0.82), vec3(1.08, 1.05, 0.95), hGrad);
        ` : `
          // Lush dappled golden-green crown swells matching the 3D foreground stalks seamlessly
          float swell = 0.5 + 0.5 * sin(vPaddy.x * 0.13 + vPaddy.y * 0.08 + sin(vPaddy.x * 0.035) * 1.8);
          float tuftTex = 0.5 + 0.5 * sin(vPaddy.x * 1.7 + sin(vPaddy.y * 1.3) * 1.4)
                        * cos(vPaddy.y * 1.5 - sin(vPaddy.x * 1.1));
          diffuseColor.rgb *= mix(0.88, 1.06, swell * 0.65 + tuftTex * 0.35);
        `}`);
    if (painted) {
      // Each side of a folded panel represents a canopy catching sunlight from above.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n normal *= faceDirection;');
    }
  };
  surface.customProgramCacheKey = () => painted ? 'rongwan-painted-sheaf' : isClump ? 'rongwan-paddy-clump-v3' : 'rongwan-paddy-canopy-v3';
}

patchPaddyWind(canopyMaterial, false);
patchPaddyWind(clumpMaterial, true);

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function tallWeight(x) {
  if (x >= eastFieldStart) return 0;
  return smoothstep(tallStart, tallFull, x);
}

function nearEdge(x, side) {
  const tw = tallWeight(x);
  const hw = halfWidth(x);
  // Open water-paddy sits a bit further out so you see the glinting water channel & bund;
  // Tall golden rice corridor hugs right up next to the warm dirt shoulder for immersive envelopment!
  const sample = shoulderSampleWeight(x);
  const base = THREE.MathUtils.lerp(hw + 1.95, hw + 1.08, tw) + sample * 1.20;
  return base + 0.24 * Math.sin(x * 0.065 + side * 1.4) + 0.15 * Math.cos(x * 0.12);
}

function soilElevation(x) {
  const tw = tallWeight(x);
  return THREE.MathUtils.lerp(-0.20, -0.06, tw);
}

function addZone(group, ground, crowns, tallA, tallB, lowList, from, to, rng) {
  if (from >= to) return;

  const strip = (geo, a, b, side, lo0, hi0, lo1, hi1, y0, y1, color) => {
    const pos = (x, d, h) => [x, h, centerZ(x) + side * d];
    const quad = [pos(a, lo0, y0), pos(a, hi0, y1), pos(b, hi1, y1), pos(b, lo1, y0)];
    if (side < 0) quad.reverse();
    geo.quad(...quad, { color });
  };

  // Parcel dividers every ~44m
  const parcelLen = 44;
  const openColors = [0x6ea552, 0x82b251, 0x649b54, 0x91b853];
  const tallColors = [0xdfb94b, 0xe8c455, 0xd4ae44, 0xebc95a];

  for (let x = from; x < to; x += 2) {
    const nx = Math.min(x + 2, to);
    if (inHarvest(x)) continue;
    const xm = (x + nx) * 0.5;
    const tw = tallWeight(xm);
    const twN = tallWeight(nx);
    const sy = soilElevation(x);
    const syN = soilElevation(nx);
    const parcelIdx = Math.floor(xm / parcelLen);
    const onDivider = (xm % parcelLen) < 1.3;

    for (const side of [-1, 1]) {
      const e0 = nearEdge(x, side);
      const e1 = nearEdge(nx, side);
      const sample = shoulderSampleWeight(xm);

      // Gentle grassy verge from road skirt to paddy edge
      const roadSkirt = halfWidth(x) + 1.65;
      const roadSkirtN = halfWidth(nx) + 1.65;
      if (sample > 0.01) {
        // A short section with a legible road-to-field section: the road
        // drops into a dark cut, then climbs a rounded bund before the root
        // zone. The faces are part of the existing ground batch.
        const cut0 = roadSkirt, cut1 = halfWidth(x) + 1.98;
        const cut0N = roadSkirtN, cut1N = halfWidth(nx) + 1.98;
        const cut2 = halfWidth(x) + 2.38, cut2N = halfWidth(nx) + 2.38;
        const berm = halfWidth(x) + 2.82, bermN = halfWidth(nx) + 2.82;
        strip(ground, x, nx, side, cut0, cut1, cut0N, cut1N, roadHeight(x) - .10, roadHeight(nx) - .10, 0x59482d);
        strip(ground, x, nx, side, cut1, cut2, cut1N, cut2N, roadHeight(x) - .10, roadHeight(nx) - .25, 0x3c3626);
        strip(ground, x, nx, side, cut2, berm, cut2N, bermN, roadHeight(x) - .25, sy + .05, 0x80663d);
        strip(ground, x, nx, side, berm, e0, bermN, e1, sy + .02, sy, 0x71884a);
      } else if (e0 > roadSkirt + 0.05) {
        strip(ground, x, nx, side, roadSkirt, e0, roadSkirtN, e1, sy, syN, 0x6ea04f);
      }

      if (tw < 0.45) {
        // Zone 1: Clean sky-reflecting shallow water channel + rounded grassy earthen bund
        const ditchLo = e0 - 0.18, ditchHi = e0 + 0.92;
        const ditchLoN = e1 - 0.18, ditchHiN = e1 + 0.92;
        strip(ground, x, nx, side, ditchLo, ditchHi, ditchLoN, ditchHiN, sy + 0.015, syN + 0.015, 0x5ab2c2);
        // Rounded grassy bund separating ditch from open paddy
        strip(ground, x, nx, side, ditchHi, ditchHi + 0.45, ditchHiN, ditchHiN + 0.45, sy + 0.02, sy + 0.12, 0xb9a06c);
        strip(ground, x, nx, side, ditchHi + 0.45, ditchHi + 1.05, ditchHiN + 0.45, ditchHiN + 1.05, sy + 0.12, sy + 0.12, 0x7ca750);
        strip(ground, x, nx, side, ditchHi + 1.05, ditchHi + 1.45, ditchHiN + 1.05, ditchHiN + 1.45, sy + 0.12, sy + 0.02, 0xa89262);
        // Shallow sunlit paddy water under the foreground open clumps (extends past canopy rise so zero seam!)
        strip(ground, x, nx, side, ditchHi + 1.45, e0 + 24.0, ditchHiN + 1.45, e1 + 24.0, sy + 0.02, syN + 0.02, 0x56a8b7);
      } else {
        // Zone 2: Warm rich olive ground tucked beneath the towering golden rice sea
        const base = e0 + (sample > 0.01 ? 0.12 : -0.30);
        const baseN = e1 + (sample > 0.01 ? 0.12 : -0.30);
        strip(ground, x, nx, side, base, e0 + 24.0, baseN, e1 + 24.0, sy, syN, 0x5f8541);
      }

      // Seamless undulating mid-to-far plush canopy stretching to the distant treeline (10m .. 135m)
      const cA = new THREE.Color(openColors[(parcelIdx + (side > 0 ? 1 : 0)) % openColors.length]);
      const cB = new THREE.Color(tallColors[(parcelIdx + (side > 0 ? 1 : 0)) % tallColors.length]);
      const farCol = cA.lerp(cB, tw).getHex();
      const baseCrownH = THREE.MathUtils.lerp(0.46, 1.18, tw);
      const baseCrownHN = THREE.MathUtils.lerp(0.46, 1.18, twN);

      // Soft sloped rise tucked cleanly inside the 3D instanced foreground clumps (starts at +9.5m)
      const cStart = e0 + 9.5, cStartN = e1 + 9.5;
      const cCrest = e0 + 13.8, cCrestN = e1 + 13.8;
      strip(crowns, x, nx, side, cStart, cCrest, cStartN, cCrestN, sy + 0.04, baseCrownH, farCol);

      // Broad, gentle hills/swells across the wide fields (no sharp parallel stripes!)
      const bands = [13.8, 29, 52, 84, 132];
      for (let bi = 0; bi < bands.length - 1; bi++) {
        const d0 = e0 + bands[bi], d1 = e0 + bands[bi + 1];
        const dn0 = e1 + bands[bi], dn1 = e1 + bands[bi + 1];
        const h0 = baseCrownH + 0.09 * Math.sin(bi * 1.6 + xm * 0.045 + side);
        const h1 = baseCrownHN + 0.09 * Math.sin((bi + 1) * 1.6 + nx * 0.045 + side);
        const bandCol = new THREE.Color(openColors[(parcelIdx + bi + (side > 0 ? 1 : 0)) % openColors.length])
          .lerp(new THREE.Color(tallColors[(parcelIdx + bi + (side > 0 ? 1 : 0)) % tallColors.length]), tw)
          .getHex();
        if (onDivider && bi < 2) {
          // Transverse earthen bund cutting across parcels for clean agrarian scale
          strip(ground, x, nx, side, d0, d1, dn0, dn1, sy + 0.16, syN + 0.16, 0xc4ad78);
        } else {
          strip(crowns, x, nx, side, d0, d1, dn0, dn1, h0, h1, bandCol);
        }
      }
      // Distant meadow skirt beyond 132m
      strip(ground, x, nx, side, e0 + 132, 235, e1 + 132, 235, -0.24, -0.24, 0x6ea062);
    }
  }

  // Populate foreground solid-3D Blender clumps!
  for (const side of [-1, 1]) {
    let x = from + 0.5;
    while (x < to - 0.3) {
      const tw = tallWeight(x);
      const sy = soilElevation(x);
      const isTall = tw >= 0.35;
      // Tighter step in the lush tall golden corridor so it feels genuinely enveloping at 50 km/h
      const stepX = isTall ? 0.92 : 1.18;
      const inDivider = !isTall && ((x % parcelLen) < 2.2);
      if (!inDivider) {
        const edge = nearEdge(x, side);
        const sample = shoulderSampleWeight(x);
        const startOff = isTall ? THREE.MathUtils.lerp(0.18, 0.46, sample) : 1.70;
        const rows = isTall ? 13 : 9;
        const rowPitch = isTall ? 1.08 : 1.24;
        for (let r = 0; r < rows; r++) {
          // Feather outer rows softly into the far golden canopy so there is zero straight boundary
          if (r >= 6 && r < 10 && (Math.floor(x) + r) % 2 === 1) continue;
          if (sample > 0.01 && isTall && r < 3 && !rng.chance(.48 + r * .10)) continue;
          if (r >= 10 && !rng.chance(0.32)) continue;
          const jitterX = rng.range(-0.36, 0.36);
          const jitterZ = rng.range(-0.32, 0.32);
          const px = x + jitterX;
          if (px < from || px > to) continue;
          const pz = centerZ(px) + side * (edge + startOff + r * rowPitch + jitterZ);
          const rot = rng.range(0, Math.PI * 2);
          if (isTall) {
            // Smooth height ramp from 0.85 -> 1.0..1.20 so stalks reach ~1.30..1.58m above road!
            const ramp = THREE.MathUtils.lerp(0.76, 1.0, tw);
            // Front-most edge slightly fuller and playfully arching over the shoulder
            const frontBoost = r === 0 ? 1.06 : 1.0;
            const syScale = ramp * frontBoost * rng.range(sample > 0.01 && r < 3 ? .72 : .94,
              sample > 0.01 && r < 3 ? 1.08 : 1.16);
            const sxScale = rng.range(1.06, 1.28);
            const target = ((Math.floor(x * 3) + r + (side > 0 ? 1 : 0)) % 2 === 0) ? tallA : tallB;
            const blend = harvestWeight(px);
            if (blend === 0 || (blend < 1 && rng.fork(px * 907 + r).next() > blend)) {
              const scale = 1 - .48 * blend;
              target.push([px, sy, pz, sxScale * scale, syScale * scale, rot]);
            }
          } else {
            const syScale = rng.range(0.90, 1.14);
            const sxScale = rng.range(1.02, 1.24);
            lowList.push([px, sy + 0.02, pz, sxScale, syScale, rot]);
          }
        }
      }
      x += stepX;
    }
  }
}

function addInstancedClumps(group, geometry, list, material = clumpMaterial) {
  if (!geometry || !list.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < list.length; i++) {
    const [x, y, z, sx, sy, rot] = list[i];
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

let sheaves;

export function addPaddies(group, ground, start, end, kit) {
  const crowns = new GeoBuilder();
  const tallA = [], tallB = [], lowList = [];
  const rng = rngFrom('风过金稻', start);

  // West of river: Open water-paddy (196..570) -> Tall golden rice sea (570..892)
  addZone(group, ground, crowns, tallA, tallB, lowList,
    Math.max(fieldStart, start), Math.min(fieldEnd, end), rng);

  // East of river: Open water-paddy welcoming into Rongshu Village (956..1068)
  addZone(group, ground, crowns, tallA, tallB, lowList,
    Math.max(eastFieldStart, start), Math.min(eastFieldEnd, end), rng);

  if (start < harvestEnd && end > harvestStart) {
    if (!sheaves) {
      sheaves = harvestSheaves();
      patchPaddyWind(sheaves.material, true, true);
    }
    const plants = addHarvest(ground, crowns, Math.max(start, harvestStart), Math.min(end, harvestEnd));
    addInstancedClumps(group, sheaves.geometry, plants, sheaves.material);
  }

  if (!crowns.empty) {
    const canopyMesh = crowns.mesh(canopyMaterial);
    canopyMesh.receiveShadow = true;
    group.add(canopyMesh);
  }
  addInstancedClumps(group, kit?.RiceTall_A, tallA);
  addInstancedClumps(group, kit?.RiceTall_B, tallB);
  addInstancedClumps(group, kit?.RiceLow, lowList);
}
