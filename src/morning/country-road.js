// High-contrast stylized countryside asphalt road with clean markings and crumbling earth shoulders.
// Transitions smoothly from Old Street / City Crossing into dark slate rural asphalt and stone bridge deck.
import * as THREE from 'three';
import { litMaterial } from '../core/materials.js';
import { centerZ, crossing, halfWidth, roadHeight, paddyShoulderCrossSection, paddyShoulderWeight } from './country-route.js';

import { harvestStart, harvestEnd } from './harvest-field.js';

let roadMaterial;

function getRoadMaterial() {
  if (roadMaterial) return roadMaterial;
  roadMaterial = litMaterial({ grid: false, roughness: 0.92 });
  const prev = roadMaterial.onBeforeCompile;
  roadMaterial.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aRoad;
        varying vec3 vRoad;
        varying vec3 vRoadWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRoad = aRoad;
        vRoadWorld = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRoad;
        varying vec3 vRoadWorld;
        float rHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float rNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x),
            mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float lat = vRoad.x;
          float d = abs(lat);
          float s = vRoad.y;
          float hw = vRoad.z;
          vec2 wp = vRoadWorld.xz;

          float nBroad = rNoise(wp * 0.085 + 1.3);
          float nMed = rNoise(wp * 0.42 + 4.7);
          float nFine = rNoise(vec2(lat * 0.45, s * 0.14) + 2.1);

          // Smoothly blend from town pavement near the city crossing into rich slate country asphalt.
          float countryBlend = smoothstep(115.0, 148.0, wp.x);
          float bridgeBlend = smoothstep(892.5, 895.0, wp.x) * (1.0 - smoothstep(949.0, 951.5, wp.x));

          // Clean limited-palette slate asphalt (crisp contrast against golden rice & warm Shiba)
          vec3 townRoad = vec3(0.41, 0.40, 0.36);
          vec3 slateDark = vec3(0.105, 0.128, 0.145);
          vec3 slateMid  = vec3(0.135, 0.162, 0.180);
          vec3 slateTire = vec3(0.172, 0.198, 0.214);

          vec3 road = mix(slateDark, slateMid, smoothstep(0.32, 0.72, nBroad));
          // Subtle polished tire tracks along both lanes
          float tireOffset = (d - hw * 0.44) / 0.52;
          float tireLane = exp(-tireOffset * tireOffset);
          road = mix(road, slateTire, tireLane * 0.55);
          // Slight edge darkening
          road = mix(road, slateDark * 0.88, smoothstep(hw - 0.65, hw, d) * 0.35);
          // Gentle transverse expansion/repaving cadence for high-speed rhythm
          float seam = 1.0 - smoothstep(0.0, 0.09, abs(fract(s / 9.5) - 0.5));
          road *= 1.0 - seam * 0.065;
          road *= 0.96 + 0.08 * nFine;
          road = mix(townRoad, road, countryBlend);

          // Analytical anti-aliased crisp markings (suppressed in crossing, bridge & village turnaround)
          float markMask = smoothstep(138.0, 152.0, wp.x)
                         * (1.0 - bridgeBlend)
                         * (1.0 - smoothstep(1150.0, 1170.0, wp.x));
          float aw = max(fwidth(lat) * 1.15, 0.008);
          float wear = mix(0.68, 0.96, smoothstep(0.28, 0.68, nMed * 0.6 + nBroad * 0.4));

          // Cream side edge lines
          vec3 edgeInk = vec3(0.86, 0.79, 0.63);
          float edgeLine = 1.0 - smoothstep(0.065 - aw, 0.065 + aw, abs(d - (hw - 0.30)));
          road = mix(road, edgeInk, edgeLine * wear * markMask * 0.88);

          // Warm golden-amber dashed center line
          float dashPeriod = 8.4;
          float ds = fract(s / dashPeriod) * dashPeriod;
          float al = max(fwidth(s) * 1.15, 0.02);
          float dash = smoothstep(0.0, al * 2.0, ds) * (1.0 - smoothstep(3.1 - al * 2.0, 3.1, ds));
          float centre = (1.0 - smoothstep(0.058 - aw, 0.058 + aw, d)) * dash;
          vec3 centreInk = vec3(0.84, 0.58, 0.16);
          road = mix(road, centreInk, centre * wear * markMask * 0.92);

          // Dressed warm granite deck on the stone bridge
          vec3 stoneA = vec3(0.56, 0.49, 0.38);
          vec3 stoneB = vec3(0.49, 0.43, 0.34);
          float slabU = fract(wp.x / 2.0);
          float slabV = fract((lat + 3.0) / 1.5);
          float mortar = (1.0 - smoothstep(0.0, 0.045, min(slabU, 1.0 - slabU)))
                       + (1.0 - smoothstep(0.0, 0.045, min(slabV, 1.0 - slabV)));
          vec3 stone = mix(stoneB, stoneA, smoothstep(0.3, 0.7, nMed));
          stone *= 1.0 - clamp(mortar, 0.0, 1.0) * 0.14;
          road = mix(road, stone, bridgeBlend);

          // Organic crumbling asphalt-to-earth shoulder & lush grass verge (breaks straight lines!)
          vec3 earthLight = vec3(0.60, 0.48, 0.28);
          vec3 earthDark  = vec3(0.45, 0.35, 0.20);
          vec3 earth = mix(earthDark, earthLight, smoothstep(0.30, 0.72, nMed * 0.65 + nBroad * 0.35));
          vec3 vergeGrass = mix(vec3(0.18, 0.37, 0.14), vec3(0.29, 0.47, 0.17), smoothstep(0.25, 0.75, nBroad));

          float sideSign = sign(lat);
          float wob = (nMed - 0.5) * 0.34 + 0.11 * sin(s * 0.43 + sideSign * 1.9);
          // Dust creeping slightly onto the outer asphalt edge
          float dust = smoothstep(hw - 0.34, hw + 0.04, d + wob * 0.7) * (1.0 - bridgeBlend) * countryBlend;
          road = mix(road, earth * 0.92, dust * 0.32);

          // Crumbling border into warm earth shoulder
          float shEdge = smoothstep(hw - 0.04, hw + 0.06, d + wob * (1.0 - bridgeBlend));
          vec3 bridgeCurb = vec3(0.55, 0.50, 0.40);
          vec3 shoulder = mix(earth, bridgeCurb, bridgeBlend);
          // Earth shoulder softly transitions into lush green verge further out
          float grassBlend = smoothstep(hw + 0.62, hw + 1.25, d + wob * 0.9) * (1.0 - bridgeBlend);
          shoulder = mix(shoulder, vergeGrass, grassBlend);

          float field = smoothstep(${harvestStart}.0, ${harvestStart+12}.0, wp.x)
            * (1.0-smoothstep(${harvestEnd-12}.0, ${harvestEnd}.0, wp.x));
          vec3 dustyLane = mix(vec3(.275,.255,.202), vec3(.38,.35,.273), .50*nBroad+.35*tireLane+.15*nFine);
          dustyLane = mix(dustyLane, vec3(.48,.43,.32), smoothstep(hw-.75,hw+.22,d+wob)*.82);
          dustyLane = mix(dustyLane, edgeInk, edgeLine*wear*.33);
          dustyLane = mix(dustyLane, centreInk, centre*wear*.46);
          road = mix(road,dustyLane,field*.91);
          shoulder = mix(shoulder,mix(vec3(.46,.405,.297),vec3(.34,.325,.195),grassBlend),field);
          shEdge = mix(shEdge,smoothstep(hw-.42,hw+.35,d+wob),field);

          // Keep the one study section from reading as a pale painted stripe.
          // Its dark cut and green berm are keyed to the same cross-section as
          // the geometry, so the height change remains legible in motion.
          float shoulderStudy = smoothstep(738.0, 748.0, wp.x)
            * (1.0 - smoothstep(812.0, 822.0, wp.x));
          float sd = d - hw;
          vec3 studyCut = mix(vec3(.39,.31,.19), vec3(.25,.24,.16), smoothstep(.28, 1.08, sd));
          vec3 studyBerm = mix(vec3(.31,.38,.19), vec3(.39,.47,.22), smoothstep(1.12, 1.82, sd));
          vec3 study = mix(studyCut, studyBerm, smoothstep(1.10, 1.48, sd));
          shoulder = mix(shoulder, study, shoulderStudy * smoothstep(hw - .02, hw + 1.78, d));

          diffuseColor.rgb = mix(road, shoulder, shEdge);
        }`);
  };
  roadMaterial.customProgramCacheKey = () => 'rongwan-country-road-v1';
  return roadMaterial;
}

export function buildCountryRoad(start, end) {
  const step = 2;
  const xs = [];
  for (let x = start; x < end; x += step) xs.push(x);
  xs.push(end);

  // Eleven columns make the sample section readable as a shallow cut and
  // berm. Outside it, the extra columns collapse onto the old shoulder.
  const cols = 11;
  const rows = xs.length;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const roadAttr = new Float32Array(rows * cols * 3);

  let sAccum = start;
  const prevX = x => Math.max(0, x - 1);
  for (let i = 0; i < rows; i++) {
    const x = xs[i];
    if (i > 0) {
      const x0 = xs[i - 1];
      sAccum += Math.hypot(x - x0, centerZ(x) - centerZ(x0), roadHeight(x) - roadHeight(x0));
    }
    const cz = centerZ(x);
    const hw = halfWidth(x);
    const h = roadHeight(x);
    const river = x >= 894 && x <= 950;
    const nearCross = Math.abs(x - crossing.x) < 28;
    const tallZone = x >= 575 && x <= 892;

    // Outside the bridge, grade shoulders gently down toward soil so there is zero floating edge.
    const skirtWidth = river ? 0.75 : nearCross ? 0.85 : 1.75;
    const midShoulder = river ? 0.45 : 0.68;
    const skirtDrop = river ? 0 : nearCross ? -0.18 : tallZone ? -0.07 : -0.22;
    const shDrop = river ? 0 : nearCross ? -0.04 : -0.025;
    const sample = paddyShoulderWeight(x);
    const sampleSkirt = paddyShoulderCrossSection.roadOuter;
    const outer = THREE.MathUtils.lerp(skirtWidth, sampleSkirt, sample);
    const mid = THREE.MathUtils.lerp(midShoulder, 0.72, sample);
    const ditch = THREE.MathUtils.lerp(midShoulder, 1.34, sample);
    const actualLats = [
      -(hw + outer), -(hw + ditch), -(hw + mid), -hw, -hw * 0.5, 0,
      hw * 0.5, hw, hw + mid, hw + ditch, hw + outer,
    ];
    const oldDrops = [skirtDrop, shDrop, 0, 0, 0, 0, 0, 0, shDrop, shDrop, skirtDrop];
    const sampleDrops = [-0.15, -0.30, -0.18, -0.06, 0, 0, 0, -0.06, -0.18, -0.30, -0.15];
    const actualDrops = oldDrops.map((drop, index) => THREE.MathUtils.lerp(drop, sampleDrops[index], sample));

    // Tangent / normal estimate along the grade
    const dh = (roadHeight(x + 1) - roadHeight(prevX(x))) * 0.5;
    const dz = (centerZ(x + 1) - centerZ(prevX(x))) * 0.5;
    const len = Math.hypot(1, dz, dh) || 1;
    const nx = -dh / len, ny = Math.hypot(1, dz) / len, nz = 0;

    for (let c = 0; c < cols; c++) {
      const idx = (i * cols + c) * 3;
      const lat = actualLats[c];
      pos[idx] = x;
      pos[idx + 1] = h + actualDrops[c];
      pos[idx + 2] = cz + lat;
      nor[idx] = nx;
      nor[idx + 1] = ny;
      nor[idx + 2] = nz;
      roadAttr[idx] = lat;
      roadAttr[idx + 1] = sAccum;
      roadAttr[idx + 2] = hw;
    }
  }

  const indices = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // (b - a) = +Z, (d - a) = +X => (+Z) x (+X) = +Y (front face upward!)
      indices.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aRoad', new THREE.BufferAttribute(roadAttr, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, getRoadMaterial());
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
