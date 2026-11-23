// Data-driven 4-time-of-day lighting, atmosphere, sky, color-grade targets,
// and night self-illumination (windows, signs, lanterns, streetlamps, traffic lights,
// scooter headlamp + fake additive ground light pools — zero extra real-time PointLights).
import * as THREE from 'three';
import { crossing, centerZ, roadHeight } from './country-route.js';
import { CURB_H } from './street-layout.js';

export const TOD_ORDER = Object.freeze(['morning', 'noon', 'dusk', 'night']);

export const TOD_PRESETS = Object.freeze({
  morning: {
    id: 'morning',
    label: '早晨',
    t: 0,
    sunOffsetStreet: [-6.0, 11.5, 7.5],
    sunOffsetCountry: [14.0, 7.5, -5.5],
    sunColor: 0xffefd0,
    sunIntensity: 2.65,
    hemiSky: 0xdff3ff,
    hemiGround: 0x79a48c,
    hemiIntensity: 1.48,
    skyZenith: 0x4b9cd6,
    skyMid: 0x9bd4eb,
    skyHorizon: 0xfff0d2,
    skySunDir: [0.93, 0.24, -0.34],
    skySunGlowColor: [0.45, 0.26, 0.08],
    skySunGlowStr: 1.0,
    skySunDiscColor: [1.5, 1.25, 0.85],
    skySunDiscStr: 1.0,
    skyStripMix: 1.0,
    skyStripTint: 0xffffff,
    mountainTint: 0xffffff,
    cloudShadow: [0.75, 0.86, 0.94],
    cloudLit: [1.0, 0.985, 0.945],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBgPersp: 0x9cd3e9,
    skyBgOrtho: 0xcfe0dc,
    fogColor: 0xdaf0f5,
    fogColorStyled: 0xc8e4f2,
    fogDensityScale: 1.0,
    shadowTint: 0x5670b2,
    shadowTintStrength: 0.36,
    outlineColor: 0x26212c,
    grade: {
      lift: [0.0, 0.002, 0.012],
      gamma: [1.0, 1.0, 1.01],
      gain: [1.04, 1.01, 0.96],
      saturation: 1.08,
      contrast: 1.04,
    },
    emissive: 0.0,
    bloomStrength: 0.16,
    bloomThreshold: 0.96,
    exposure: 1.05,
    waterTint: 0xffffff,
    sheafEmissiveScale: 1.0,
  },
  noon: {
    id: 'noon',
    label: '中午',
    t: 1 / 3,
    sunOffsetStreet: [-2.8, 18.0, 5.2],
    sunOffsetCountry: [6.8, 17.5, -5.4],
    sunColor: 0xfff9e6,
    sunIntensity: 3.35,
    hemiSky: 0xa6dfff,
    hemiGround: 0xb6bd86,
    hemiIntensity: 1.70,
    skyZenith: 0x1b78dc,
    skyMid: 0x6ec2f2,
    skyHorizon: 0xf7f6de,
    skySunDir: [0.34, 0.89, -0.29],
    skySunGlowColor: [0.42, 0.38, 0.22],
    skySunGlowStr: 0.95,
    skySunDiscColor: [1.75, 1.65, 1.38],
    skySunDiscStr: 1.0,
    skyStripMix: 0.45,
    skyStripTint: 0xf8fcff,
    mountainTint: 0xd0ecf7,
    cloudShadow: [0.76, 0.89, 0.99],
    cloudLit: [1.08, 1.06, 1.01],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBgPersp: 0x72c3f2,
    skyBgOrtho: 0xc8e7ed,
    fogColor: 0xe2f2f8,
    fogColorStyled: 0xc0e4f7,
    fogDensityScale: 0.72,
    shadowTint: 0x3c62b5,
    shadowTintStrength: 0.38,
    outlineColor: 0x222534,
    grade: {
      lift: [0.012, 0.009, -0.004],
      gamma: [1.01, 1.00, 0.97],
      gain: [1.10, 1.06, 0.97],
      saturation: 1.16,
      contrast: 1.07,
    },
    emissive: 0.0,
    bloomStrength: 0.22,
    bloomThreshold: 0.98,
    exposure: 1.10,
    waterTint: 0xf0fdff,
    sheafEmissiveScale: 1.0,
  },
  dusk: {
    id: 'dusk',
    label: '傍晚',
    t: 2 / 3,
    sunOffsetStreet: [-14.5, 6.2, 6.8],
    sunOffsetCountry: [16.5, 5.8, -7.2],
    sunColor: 0xff9e56,
    sunIntensity: 3.05,
    hemiSky: 0xde8ea8,
    hemiGround: 0x625a86,
    hemiIntensity: 1.42,
    skyZenith: 0x2d3a76,
    skyMid: 0xcc6b86,
    skyHorizon: 0xffa852,
    skySunDir: [0.94, 0.14, -0.31],
    skySunGlowColor: [0.90, 0.36, 0.11],
    skySunGlowStr: 1.50,
    skySunDiscColor: [2.1, 1.18, 0.56],
    skySunDiscStr: 1.15,
    skyStripMix: 0.18,
    skyStripTint: 0xffa87c,
    mountainTint: 0x9b7091,
    cloudShadow: [0.48, 0.39, 0.62],
    cloudLit: [1.14, 0.70, 0.46],
    cloudOpacity: 1.0,
    starStrength: 0.14,
    skyBgPersp: 0xd07c7e,
    skyBgOrtho: 0xc69b8e,
    fogColor: 0xdc937c,
    fogColorStyled: 0xd88874,
    fogDensityScale: 0.86,
    shadowTint: 0x4d408c,
    shadowTintStrength: 0.48,
    outlineColor: 0x2d1b2e,
    grade: {
      lift: [0.018, 0.004, 0.028],
      gamma: [1.03, 0.98, 0.97],
      gain: [1.13, 0.98, 0.91],
      saturation: 1.13,
      contrast: 1.04,
    },
    emissive: 0.30,
    bloomStrength: 0.34,
    bloomThreshold: 0.86,
    exposure: 1.07,
    waterTint: 0xd09288,
    sheafEmissiveScale: 0.45,
  },
  night: {
    id: 'night',
    label: '夜晚',
    t: 1,
    sunOffsetStreet: [-7.5, 12.8, 8.0],
    sunOffsetCountry: [11.5, 11.2, -6.8],
    sunColor: 0x8bb6ff,
    sunIntensity: 1.12,
    hemiSky: 0x355499,
    hemiGround: 0x253057,
    hemiIntensity: 1.02,
    skyZenith: 0x081229,
    skyMid: 0x142652,
    skyHorizon: 0x2b4275,
    skySunDir: [0.80, 0.46, -0.38],
    skySunGlowColor: [0.16, 0.24, 0.42],
    skySunGlowStr: 0.65,
    skySunDiscColor: [1.35, 1.45, 1.75],
    skySunDiscStr: 0.92,
    skyStripMix: 0.0,
    skyStripTint: 0x223254,
    mountainTint: 0x2c4066,
    cloudShadow: [0.06, 0.11, 0.24],
    cloudLit: [0.15, 0.24, 0.44],
    cloudOpacity: 1.0,
    starStrength: 1.0,
    skyBgPersp: 0x18284e,
    skyBgOrtho: 0x1b2949,
    fogColor: 0x1a2a50,
    fogColorStyled: 0x17274c,
    fogDensityScale: 0.90,
    shadowTint: 0x3553a6,
    shadowTintStrength: 0.44,
    outlineColor: 0x10172b,
    grade: {
      lift: [0.004, 0.012, 0.036],
      gamma: [0.98, 1.00, 1.04],
      gain: [0.97, 1.01, 1.12],
      saturation: 1.12,
      contrast: 1.06,
    },
    emissive: 1.0,
    bloomStrength: 0.56,
    bloomThreshold: 0.72,
    exposure: 1.12,
    waterTint: 0x2d4875,
    sheafEmissiveScale: 0.10,
  },
});

const INDOOR_BG = new THREE.Color(0xe2cfaa);
const INDOOR_FOG = new THREE.Color(0xe2cfaa);
const INDOOR_HEMI_SKY = new THREE.Color(0xfff0d8);
const INDOOR_HEMI_GROUND = new THREE.Color(0x9a8568);
const INDOOR_SUN_COLOR = new THREE.Color(0xffe9c5);

// Exact linear vertex colors from town.js, city-crossing.js, bun-shop.js, countryside.js
// used to tag baked windows, hanging lanterns, and porch lamp globes with zero extra draw calls.
const WINDOW_HEXES = [
  0x4e7975, // city-crossing P.glass
  0x89aea5, // city-crossing P.glassLight
  0x7aa299, // city-crossing shopfront right pane
  0x7ca299, // city-crossing upper right pane
  0x547c77, // town glass
  0x86a9a0, // town glassLight
  0x91ada0, // town right pane
  0x93afa3, // town skyline distant windows
  0xe8d798, // pharmacy door window
  0x547b78, // countryside cottage side window
  0x527a78, // countryside cottage front window
];
const LANTERN_HEXES = [
  0xd97348, // city-crossing tea house lanterns
  0xd87949, // bun-shop hanging lanterns
  0xd56742, // countryside pavilion lanterns
];
const PORCH_LAMP_HEXES = [
  0xffe4a0, // town porch lamp globes
];

const toLin = hex => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const WINDOW_LIN = WINDOW_HEXES.map(toLin);
const LANTERN_LIN = LANTERN_HEXES.map(toLin);
const PORCH_LIN = PORCH_LAMP_HEXES.map(toLin);

const WARM_WINDOW_COLORS = [
  [1.00, 0.50, 0.12], // rich warm amber (retains golden hue through ACES Filmic)
  [1.00, 0.62, 0.20], // cozy warm gold
  [0.98, 0.42, 0.10], // deep honey tungsten
  [0.96, 0.58, 0.26], // warm lamp glow
];

function colorMatch(r, g, b, list, epsSq = 0.00018) {
  for (let i = 0; i < list.length; i++) {
    const [lr, lg, lb] = list[i];
    const dr = r - lr, dg = g - lg, db = b - lb;
    if (dr * dr + dg * dg + db * db <= epsSq) return true;
  }
  return false;
}

function hashCell(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// Precompute reusable color objects per preset so interpolation does zero allocations.
const PRESET_ARRAY = TOD_ORDER.map(id => {
  const p = TOD_PRESETS[id];
  return {
    ...p,
    sunColorObj: new THREE.Color(p.sunColor),
    hemiSkyObj: new THREE.Color(p.hemiSky),
    hemiGroundObj: new THREE.Color(p.hemiGround),
    skyZenithObj: new THREE.Color(p.skyZenith),
    skyMidObj: new THREE.Color(p.skyMid),
    skyHorizonObj: new THREE.Color(p.skyHorizon),
    skyStripTintObj: new THREE.Color(p.skyStripTint),
    mountainTintObj: new THREE.Color(p.mountainTint),
    skyBgPerspObj: new THREE.Color(p.skyBgPersp),
    skyBgOrthoObj: new THREE.Color(p.skyBgOrtho),
    fogColorObj: new THREE.Color(p.fogColor),
    fogColorStyledObj: new THREE.Color(p.fogColorStyled),
    shadowTintObj: new THREE.Color(p.shadowTint),
    outlineColorObj: new THREE.Color(p.outlineColor),
    waterTintObj: new THREE.Color(p.waterTint),
  };
});

function lerp3(out, a, b, f) {
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
}

function makeRadialPoolTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255, 224, 152, 0.95)');
  g.addColorStop(0.35, 'rgba(255, 198, 112, 0.50)');
  g.addColorStop(0.72, 'rgba(255, 168, 86, 0.14)');
  g.addColorStop(1.0, 'rgba(255, 150, 70, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHeadlightBeamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 112, 4, 32, 72, 68);
  g.addColorStop(0.0, 'rgba(255, 245, 205, 0.92)');
  g.addColorStop(0.45, 'rgba(255, 232, 175, 0.36)');
  g.addColorStop(1.0, 'rgba(255, 220, 150, 0.0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(26, 122);
  ctx.lineTo(4, 12);
  ctx.quadraticCurveTo(32, 0, 60, 12);
  ctx.lineTo(38, 122);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function patchSkyAndClouds(skyRoot) {
  const dome = skyRoot?.children?.[0];
  const cloudRing = skyRoot?.children?.[1];
  const handles = { skyUniforms: null, cloudUniforms: null };

  if (dome?.material?.isShaderMaterial && dome.material.uniforms?.zenith) {
    const u = dome.material.uniforms;
    u.uTodSunDir = { value: new THREE.Vector3(0.93, 0.24, -0.34).normalize() };
    u.uTodSunGlowColor = { value: new THREE.Vector3(0.45, 0.26, 0.08) };
    u.uTodSunGlowStr = { value: 1.0 };
    u.uTodSunDiscColor = { value: new THREE.Vector3(1.5, 1.25, 0.85) };
    u.uTodSunDiscStr = { value: 1.0 };
    u.uTodSkyStripMix = { value: 1.0 };
    u.uTodSkyStripTint = { value: new THREE.Color(0xffffff) };
    u.uTodMountainTint = { value: new THREE.Color(0xffffff) };
    u.uTodStarStr = { value: 0.0 };

    dome.material.fragmentShader = /* glsl */ `
      varying vec3 vDir;
      uniform float harvestLight, drift;
      uniform sampler2D skyStrip;
      uniform vec3 zenith, midSky, horizon;
      uniform vec3 uTodSunDir, uTodSunGlowColor, uTodSunDiscColor;
      uniform float uTodSunGlowStr, uTodSunDiscStr, uTodSkyStripMix, uTodStarStr;
      uniform vec3 uTodSkyStripTint, uTodMountainTint;

      float starHash(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.24, h));
        col = mix(col, zenith, smoothstep(0.18, 0.72, h));

        vec3 sunDir = normalize(uTodSunDir);
        float sun = max(0.0, dot(dir, sunDir));
        col += uTodSunGlowColor * uTodSunGlowStr * pow(sun, 14.0);
        col += uTodSunDiscColor * uTodSunDiscStr * smoothstep(0.9992, 0.99985, sun);

        float az = atan(dir.z, dir.x);
        if (uTodStarStr > 0.005 && dir.y > 0.08) {
          vec2 grid = floor(vec2(az * 38.0, dir.y * 74.0));
          float rnd = starHash(grid);
          vec2 cell = fract(vec2(az * 38.0, dir.y * 74.0)) - 0.5;
          float dotStar = smoothstep(0.24, 0.04, length(cell)) * step(0.986, rnd);
          col += vec3(0.85, 0.92, 1.0) * dotStar * smoothstep(0.08, 0.36, dir.y) * uTodStarStr * 0.95;
        }

        vec2 skyUV = vec2(az / 6.2831853 + .5 + drift, clamp(h / .70, 0., 1.));
        float stripW = harvestLight * uTodSkyStripMix;
        if (stripW > 0.001) {
          col = mix(col, texture2D(skyStrip, skyUV).rgb * uTodSkyStripTint, stripW);
        }

        float farRidge  = 0.088 + 0.038 * sin(2.0 * az + 0.5) + 0.022 * cos(5.0 * az - 1.1) + 0.011 * sin(11.0 * az);
        float midRidge  = 0.056 + 0.026 * cos(3.0 * az + 1.3) + 0.017 * sin(7.0 * az + 0.4) + 0.007 * cos(13.0 * az);
        float nearRidge = 0.026 + 0.015 * sin(4.0 * az - 0.8) + 0.009 * cos(9.0 * az + 1.7);

        float farMask  = 1.0 - smoothstep(farRidge - 0.0025, farRidge + 0.0025, dir.y);
        float midMask  = 1.0 - smoothstep(midRidge - 0.0022, midRidge + 0.0022, dir.y);
        float nearMask = 1.0 - smoothstep(nearRidge - 0.0020, nearRidge + 0.0020, dir.y);

        vec3 farCol  = mix(vec3(0.60, 0.77, 0.83), vec3(0.76, 0.84, 0.82), pow(sun, 3.0) * 0.45) * uTodMountainTint;
        vec3 midCol  = mix(vec3(0.46, 0.68, 0.69), vec3(0.62, 0.75, 0.68), pow(sun, 3.0) * 0.35) * uTodMountainTint;
        vec3 nearCol = mix(vec3(0.36, 0.59, 0.53), vec3(0.48, 0.67, 0.52), pow(sun, 3.0) * 0.28) * uTodMountainTint;

        col = mix(col, farCol, farMask * (1.0 - .39 * stripW) * 0.82);
        col = mix(col, midCol, midMask * (1.0 - .39 * stripW) * 0.90);
        col = mix(col, nearCol, nearMask * (1.0 - .39 * stripW) * 0.94);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    dome.material.needsUpdate = true;
    handles.skyUniforms = u;
  }

  if (cloudRing?.material?.isShaderMaterial && cloudRing.material.uniforms?.uSunDir) {
    const u = cloudRing.material.uniforms;
    u.uCloudShadow = { value: new THREE.Vector3(0.75, 0.86, 0.94) };
    u.uCloudLit = { value: new THREE.Vector3(1.0, 0.985, 0.945) };
    u.uCloudOpacity = { value: 1.0 };

    cloudRing.material.fragmentShader = /* glsl */ `
      uniform float harvestLight;
      uniform vec3 uSunDir;
      uniform vec3 uCloudShadow, uCloudLit;
      uniform float uCloudOpacity;
      varying vec3 vNormalW;
      varying float vLocalY;
      void main() {
        float ndl = dot(normalize(vNormalW), uSunDir) * 0.5 + 0.5;
        float topGrad = smoothstep(-0.65, 0.55, vLocalY);
        float light = clamp(ndl * 0.48 + topGrad * 0.62, 0.0, 1.0);
        vec3 col = mix(uCloudShadow, uCloudLit, smoothstep(0.24, 0.78, light));
        gl_FragColor = vec4(col, (1.0 - harvestLight) * uCloudOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    cloudRing.material.needsUpdate = true;
    handles.cloudUniforms = u;
  }
  return handles;
}

function patchRiverWater(countryRoot) {
  for (const child of countryRoot.children) {
    if (child.isMesh && child.material?.isShaderMaterial && child.material.uniforms?.uBridgeZ) {
      const u = child.material.uniforms;
      u.uWaterTint = { value: new THREE.Color(0xffffff) };
      child.material.fragmentShader = child.material.fragmentShader
        .replace('uniform float uBridgeZ;', 'uniform float uBridgeZ;\nuniform vec3 uWaterTint;')
        .replace(
          'vec3 outCol = mix(water, uFogColor, clamp(fogFactor, 0.0, 1.0));',
          'vec3 outCol = mix(water * uWaterTint, uFogColor, clamp(fogFactor, 0.0, 1.0));',
        );
      child.material.needsUpdate = true;
      return u.uWaterTint;
    }
  }
  return null;
}

function buildNightFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'night-fixtures';
  const dummy = new THREE.Object3D();

  // 1) Crossing vintage streetlamp globes (6 bulbs batched in 1 InstancedMesh).
  const half = crossing.half;
  const lampSpots = [
    [-15.2, -(half + 0.68), 0, 1],
    [15.2, -(half + 0.68), 0, 1],
    [-15.2, half + 0.68, 0, -1],
    [15.2, half + 0.68, 0, -1],
    [-(half + 0.68), -17.5, 1, 0],
    [half + 0.68, 17.5, -1, 0],
  ];
  const globeGeo = new THREE.SphereGeometry(1, 12, 10);
  const globeMat = new THREE.MeshBasicMaterial({ color: 0xffebb0 });
  const globes = new THREE.InstancedMesh(globeGeo, globeMat, lampSpots.length);
  lampSpots.forEach(([lx, lz, dx, dz], i) => {
    dummy.position.set(crossing.x + lx + dx * 0.56, CURB_H + 3.30, crossing.z + lz + dz * 0.56);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.185, 0.215, 0.185);
    dummy.updateMatrix();
    globes.setMatrixAt(i, dummy.matrix);
  });
  globes.instanceMatrix.needsUpdate = true;
  globes.frustumCulled = false;
  group.add(globes);

  // 2) Fake additive ground light pools under streetlamps, lanterns & shopfronts (1 InstancedMesh).
  const pools = [];
  // Crossing streetlamp pools
  for (const [lx, lz, dx, dz] of lampSpots) {
    const wx = crossing.x + lx + dx * 1.1;
    const wz = crossing.z + lz + dz * 1.1;
    pools.push([wx, roadHeight(wx) + 0.045, wz, 6.4, 6.4]);
  }
  // Crossing corner shopfront / lantern spill pools
  const crossingSpills = [
    [crossing.x - 12.5, CURB_H + 0.035, crossing.z + 7.2, 7.2, 4.4],  // 海棠茶行 lanterns
    [crossing.x - 7.5, CURB_H + 0.035, crossing.z + 7.2, 6.4, 4.0],
    [crossing.x - 12.5, CURB_H + 0.035, crossing.z - 7.2, 6.8, 4.4], // 春风书局
    [crossing.x + 12.5, CURB_H + 0.035, crossing.z - 7.2, 7.4, 4.6], // 榕湾百货
    [crossing.x + 12.5, CURB_H + 0.035, crossing.z + 7.2, 6.8, 4.4], // 南方冰室
  ];
  for (const p of crossingSpills) pools.push(p);

  // Old Street shopfront & porch spill pools
  for (const sx of [-12, -5, 2, 9, 16, 23, 30, 37, 44]) {
    pools.push([sx, CURB_H + 0.035, -0.75, 5.4, 3.6]);
  }

  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const poolTex = makeRadialPoolTexture();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    color: 0xffcf78,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, pools.length);
  pools.forEach(([x, y, z, sx, sz], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx, 1, sz);
    dummy.updateMatrix();
    poolMesh.setMatrixAt(i, dummy.matrix);
  });
  poolMesh.instanceMatrix.needsUpdate = true;
  poolMesh.frustumCulled = false;
  group.add(poolMesh);

  // 3) Scooter fake ground headlight beam (1 mesh, follows scooter at night).
  const beamGeo = new THREE.PlaneGeometry(2.6, 5.6);
  beamGeo.rotateX(-Math.PI / 2);
  beamGeo.translate(0, 0, 3.1);
  const beamTex = makeHeadlightBeamTexture();
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    color: 0xfff0c4,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const headlightBeam = new THREE.Mesh(beamGeo, beamMat);
  headlightBeam.frustumCulled = false;
  group.add(headlightBeam);

  group.visible = false;
  scene.add(group);
  return { group, globeMat, poolMat, beamMat, headlightBeam, dispose() {
    globeGeo.dispose(); globeMat.dispose();
    poolGeo.dispose(); poolTex.dispose(); poolMat.dispose();
    beamGeo.dispose(); beamTex.dispose(); beamMat.dispose();
  } };
}

// Compute a per-vertex vec4 attribute `aNightGlow` (rgb = glow tint, a = intensity)
// on baked static building meshes so windows, lanterns & porch lamps glow at night
// with ZERO extra draw calls.
function tagBakedEmissiveMesh(mesh) {
  const geo = mesh.geometry;
  if (!geo || geo.attributes.aNightGlow) return Boolean(geo?.attributes?.aNightGlow);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  if (!pos || !nor || !col) return false;

  // Skip small standalone baked groups (NPCs ~1.45m, parcels ~0.3m) so animals never glow.
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  if (size.x < 1.35 && size.z < 1.35 && size.y < 1.95) return false;

  mesh.updateWorldMatrix(true, false);
  const wm = mesh.matrixWorld;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(wm);

  const count = pos.count;
  const glow = new Float32Array(count * 4);
  let litVerts = 0;

  for (let i = 0; i < count; i++) {
    const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
    v.fromBufferAttribute(pos, i).applyMatrix4(wm);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();

    if (v.y > 1.75 && colorMatch(r, g, b, PORCH_LIN, 0.00022)) {
      glow[i * 4] = 1.0; glow[i * 4 + 1] = 0.70; glow[i * 4 + 2] = 0.22; glow[i * 4 + 3] = 1.85;
      litVerts++;
    } else if (v.y > 1.75 && colorMatch(r, g, b, LANTERN_LIN, 0.00022)) {
      glow[i * 4] = 1.0; glow[i * 4 + 1] = 0.24; glow[i * 4 + 2] = 0.04; glow[i * 4 + 3] = 1.75;
      litVerts++;
    } else if (v.y > 0.72 && Math.abs(n.y) < 0.28 && colorMatch(r, g, b, WINDOW_LIN, 0.00016)) {
      // Ground-floor shopfronts mostly stay open; upper floors get a cozy lit/unlit mix per window bay.
      const groundFloor = v.y < 3.45;
      const cellX = Math.floor((v.x + 1.1) / 3.0);
      const cellY = Math.floor((v.y - 3.6) / 2.75);
      const cellZ = Math.floor((v.z + 1.1) / 3.0);
      const h = hashCell(cellX, cellY, cellZ);
      const lit = groundFloor ? (h < 0.90) : (h < 0.68);
      if (lit) {
        const pal = WARM_WINDOW_COLORS[Math.floor(h * 19.7) % WARM_WINDOW_COLORS.length];
        const strength = groundFloor ? 1.15 : (0.85 + (h * 0.42));
        glow[i * 4] = pal[0]; glow[i * 4 + 1] = pal[1]; glow[i * 4 + 2] = pal[2]; glow[i * 4 + 3] = strength;
        litVerts++;
      }
    }
  }
  if (litVerts === 0) return false;
  geo.setAttribute('aNightGlow', new THREE.BufferAttribute(glow, 4));
  return true;
}

export function createTimeOfDay({ scene, renderer, country, street, scooter, rooms }) {
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x79a48c, 1.48);
  const sun = new THREE.DirectionalLight(0xffefd0, 2.65);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -10, near: 0.5, far: 48 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 2;
  scene.add(hemi, sun, sun.target);

  const skyHandles = patchSkyAndClouds(country.sky);
  const waterTintUniform = patchRiverWater(country.root);
  const nightFixtures = buildNightFixtures(scene);

  // Shared uniform driven every frame by current TOD emissive level.
  const nightGlowUniform = { value: 0.0 };

  // Cloned material cache keyed by base material so building meshes keep batching
  // without leaking aNightGlow shaders onto NPCs or untagged props.
  const nightMatCache = new Map();
  function getNightAwareMaterial(baseMat) {
    if (nightMatCache.has(baseMat)) return nightMatCache.get(baseMat);
    const mat = baseMat.clone();
    mat.userData = { ...baseMat.userData, isNightBuildingMat: true };
    const prevCompile = baseMat.onBeforeCompile;
    const prevKey = baseMat.customProgramCacheKey ? baseMat.customProgramCacheKey.bind(baseMat) : () => '';
    mat.onBeforeCompile = (shader, r) => {
      if (prevCompile) prevCompile(shader, r);
      shader.uniforms.uNightGlow = nightGlowUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aNightGlow;\nvarying vec4 vNightGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightGlow = aNightGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vNightGlow;\nuniform float uNightGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          'if (uNightGlow > 0.001 && vNightGlow.a > 0.001) {\n' +
          '  float gMix = clamp(uNightGlow * 0.85, 0.0, 0.92);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vNightGlow.rgb, gMix);\n' +
          '  totalEmissiveRadiance += vNightGlow.rgb * (vNightGlow.a * uNightGlow);\n' +
          '}',
        );
    };
    mat.customProgramCacheKey = () => prevKey() + '|nightglow';
    nightMatCache.set(baseMat, mat);
    return mat;
  }

  // Tracked emissive targets discovered across scene & dynamically streamed chunks.
  const seenMeshes = new WeakSet();
  const seenMats = new WeakSet();
  const signMaterials = [];       // { mat, baseSelfLit }
  const trafficLampMats = [];     // MeshBasicMaterial on InstancedMesh signal lamps
  const bikeLampMats = [];        // Bike · Lamp on scooter.root
  const sheafMaterials = [];      // MeshLambertMaterial with hardcoded emissive in harvest-field.js
  const detectedReport = {
    signs: 0,
    bakedBuildingMeshes: 0,
    trafficSignalMeshes: 0,
    scooterLampMaterials: 0,
    streetlampGlobes: 6,
    groundLightPools: 20,
    unclassifiedNotice: [
      'UtilityPole_Lamp (countryside-kit.glb): 单一合并贴图材质 UtilityPole_Lamp_Mat，灯头与电杆未拆分材质，夜晚未单独点亮',
      'clockTower 表盘 (city-crossing.js): 烘焙进建筑合批且复用 P.trimCream 顶点色，未拆分独立自发光材质',
    ],
  };

  function isInsideRoom(obj) {
    let p = obj;
    while (p) {
      for (const rm of Object.values(rooms)) {
        if (p === rm.root) return true;
      }
      p = p.parent;
    }
    return false;
  }

  function scanRoot(root, { isScooter = false } = {}) {
    if (!root) return;
    root.traverse(obj => {
      if (!obj.isMesh || seenMeshes.has(obj)) return;
      seenMeshes.add(obj);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

      // 1) Scooter lamp material (Bike · Lamp)
      if (isScooter) {
        for (const m of mats) {
          if (m && !seenMats.has(m) && /lamp/i.test(m.name || '')) {
            seenMats.add(m);
            bikeLampMats.push(m);
            detectedReport.scooterLampMaterials++;
          }
        }
        return;
      }

      if (isInsideRoom(obj)) return;

      // 2) Traffic signals InstancedMesh (MeshBasicMaterial with instanceColor)
      if (obj.isInstancedMesh && obj.instanceColor && obj.material?.isMeshBasicMaterial) {
        if (!seenMats.has(obj.material)) {
          seenMats.add(obj.material);
          trafficLampMats.push(obj.material);
          detectedReport.trafficSignalMeshes++;
        }
        return;
      }

      // 3) Shop / road signs created by shapes.js sign() (litMaterial with map + uSelfLit)
      obj.updateWorldMatrix(true, false);
      const isRuralSign = obj.matrixWorld.elements[12] > 160;
      for (const m of mats) {
        if (!m) continue;
        if (m.map && m.userData?.worldUniforms?.uSelfLit && !seenMats.has(m)) {
          seenMats.add(m);
          signMaterials.push({ mat: m, base: m.userData.worldUniforms.uSelfLit.value, boost: isRuralSign ? 0.22 : 0.88 });
          detectedReport.signs++;
        }
        // 4) Harvest sheaves (MeshLambertMaterial with warm baked emissive that must dim at night)
        if (m.isMeshLambertMaterial && m.emissive && m.emissive.getHex() !== 0 && !seenMats.has(m)) {
          seenMats.add(m);
          sheafMaterials.push({ mat: m, base: m.emissiveIntensity ?? 1.0 });
        }
      }

      // 5) Baked vertex-colored building meshes (town.js, city-crossing.js, countryside.js)
      if (
        !obj.isInstancedMesh &&
        !obj.isSkinnedMesh &&
        obj.material?.isMeshStandardMaterial &&
        obj.material.vertexColors &&
        !obj.material.map &&
        tagBakedEmissiveMesh(obj)
      ) {
        obj.material = getNightAwareMaterial(obj.material);
        detectedReport.bakedBuildingMeshes++;
      }
    });
  }

  scanRoot(street.root);
  scanRoot(country.root);
  scanRoot(scooter.root, { isScooter: true });
  let lastCountryChildren = country.root.children.length;

  // Interpolated live snapshot (pre-allocated — zero per-frame allocations!).
  const current = {
    t: 0,
    presetId: 'morning',
    sunOffsetStreet: [-6.0, 11.5, 7.5],
    sunOffsetCountry: [14.0, 7.5, -5.5],
    sunColor: new THREE.Color(0xffefd0),
    sunIntensity: 2.65,
    hemiSky: new THREE.Color(0xdff3ff),
    hemiGround: new THREE.Color(0x79a48c),
    hemiIntensity: 1.48,
    skyZenith: new THREE.Color(0x4b9cd6),
    skyMid: new THREE.Color(0x9bd4eb),
    skyHorizon: new THREE.Color(0xfff0d2),
    skySunDir: new THREE.Vector3(0.93, 0.24, -0.34).normalize(),
    skySunGlowColor: [0.45, 0.26, 0.08],
    skySunGlowStr: 1.0,
    skySunDiscColor: [1.5, 1.25, 0.85],
    skySunDiscStr: 1.0,
    skyStripMix: 1.0,
    skyStripTint: new THREE.Color(0xffffff),
    mountainTint: new THREE.Color(0xffffff),
    cloudShadow: [0.75, 0.86, 0.94],
    cloudLit: [1.0, 0.985, 0.945],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBgPersp: new THREE.Color(0x9cd3e9),
    skyBgOrtho: new THREE.Color(0xcfe0dc),
    fogColor: new THREE.Color(0xdaf0f5),
    fogColorStyled: new THREE.Color(0xc8e4f2),
    fogDensityScale: 1.0,
    shadowTint: new THREE.Color(0x5670b2),
    shadowTintStrength: 0.36,
    outlineColor: new THREE.Color(0x26212c),
    grade: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      saturation: 1.08,
      contrast: 1.04,
    },
    emissive: 0.0,
    bloomStrength: 0.16,
    bloomThreshold: 0.96,
    exposure: 1.05,
    waterTint: new THREE.Color(0xffffff),
    sheafEmissiveScale: 1.0,
  };

  const scratchSunDir = new THREE.Vector3();
  const listeners = new Set();

  function evaluate(tRaw) {
    const t = THREE.MathUtils.clamp(tRaw, 0, 1);
    current.t = t;
    const scaled = t * (PRESET_ARRAY.length - 1);
    const idxA = Math.min(PRESET_ARRAY.length - 2, Math.floor(scaled));
    const idxB = idxA + 1;
    const f = scaled - idxA;
    const a = PRESET_ARRAY[idxA];
    const b = PRESET_ARRAY[idxB];

    // Nearest discrete label for UI readout
    const nearest = PRESET_ARRAY[Math.round(scaled)];
    current.presetId = Math.abs(scaled - Math.round(scaled)) < 0.01 ? nearest.id : `${a.id}→${b.id}`;

    lerp3(current.sunOffsetStreet, a.sunOffsetStreet, b.sunOffsetStreet, f);
    lerp3(current.sunOffsetCountry, a.sunOffsetCountry, b.sunOffsetCountry, f);
    current.sunColor.copy(a.sunColorObj).lerp(b.sunColorObj, f);
    current.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, f);
    current.hemiSky.copy(a.hemiSkyObj).lerp(b.hemiSkyObj, f);
    current.hemiGround.copy(a.hemiGroundObj).lerp(b.hemiGroundObj, f);
    current.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, f);

    current.skyZenith.copy(a.skyZenithObj).lerp(b.skyZenithObj, f);
    current.skyMid.copy(a.skyMidObj).lerp(b.skyMidObj, f);
    current.skyHorizon.copy(a.skyHorizonObj).lerp(b.skyHorizonObj, f);
    scratchSunDir.set(
      THREE.MathUtils.lerp(a.skySunDir[0], b.skySunDir[0], f),
      THREE.MathUtils.lerp(a.skySunDir[1], b.skySunDir[1], f),
      THREE.MathUtils.lerp(a.skySunDir[2], b.skySunDir[2], f),
    ).normalize();
    current.skySunDir.copy(scratchSunDir);
    lerp3(current.skySunGlowColor, a.skySunGlowColor, b.skySunGlowColor, f);
    current.skySunGlowStr = THREE.MathUtils.lerp(a.skySunGlowStr, b.skySunGlowStr, f);
    lerp3(current.skySunDiscColor, a.skySunDiscColor, b.skySunDiscColor, f);
    current.skySunDiscStr = THREE.MathUtils.lerp(a.skySunDiscStr, b.skySunDiscStr, f);
    current.skyStripMix = THREE.MathUtils.lerp(a.skyStripMix, b.skyStripMix, f);
    current.skyStripTint.copy(a.skyStripTintObj).lerp(b.skyStripTintObj, f);
    current.mountainTint.copy(a.mountainTintObj).lerp(b.mountainTintObj, f);
    lerp3(current.cloudShadow, a.cloudShadow, b.cloudShadow, f);
    lerp3(current.cloudLit, a.cloudLit, b.cloudLit, f);
    current.cloudOpacity = THREE.MathUtils.lerp(a.cloudOpacity, b.cloudOpacity, f);
    current.starStrength = THREE.MathUtils.lerp(a.starStrength, b.starStrength, f);

    current.skyBgPersp.copy(a.skyBgPerspObj).lerp(b.skyBgPerspObj, f);
    current.skyBgOrtho.copy(a.skyBgOrthoObj).lerp(b.skyBgOrthoObj, f);
    current.fogColor.copy(a.fogColorObj).lerp(b.fogColorObj, f);
    current.fogColorStyled.copy(a.fogColorStyledObj).lerp(b.fogColorStyledObj, f);
    current.fogDensityScale = THREE.MathUtils.lerp(a.fogDensityScale, b.fogDensityScale, f);
    current.shadowTint.copy(a.shadowTintObj).lerp(b.shadowTintObj, f);
    current.shadowTintStrength = THREE.MathUtils.lerp(a.shadowTintStrength, b.shadowTintStrength, f);
    current.outlineColor.copy(a.outlineColorObj).lerp(b.outlineColorObj, f);

    lerp3(current.grade.lift, a.grade.lift, b.grade.lift, f);
    lerp3(current.grade.gamma, a.grade.gamma, b.grade.gamma, f);
    lerp3(current.grade.gain, a.grade.gain, b.grade.gain, f);
    current.grade.saturation = THREE.MathUtils.lerp(a.grade.saturation, b.grade.saturation, f);
    current.grade.contrast = THREE.MathUtils.lerp(a.grade.contrast, b.grade.contrast, f);

    current.emissive = THREE.MathUtils.lerp(a.emissive, b.emissive, f);
    current.bloomStrength = THREE.MathUtils.lerp(a.bloomStrength, b.bloomStrength, f);
    current.bloomThreshold = THREE.MathUtils.lerp(a.bloomThreshold, b.bloomThreshold, f);
    current.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, f);
    current.waterTint.copy(a.waterTintObj).lerp(b.waterTintObj, f);
    current.sheafEmissiveScale = THREE.MathUtils.lerp(a.sheafEmissiveScale, b.sheafEmissiveScale, f);

    for (const fn of listeners) fn(current);
  }

  evaluate(0);

  if (!scene.background) scene.background = new THREE.Color(0xcfe0dc);
  if (!scene.fog) scene.fog = new THREE.FogExp2(0xdaf0f5, 0.016);

  function setPreset(id) {
    if (!Object.hasOwn(TOD_PRESETS, id)) return false;
    evaluate(TOD_PRESETS[id].t);
    return true;
  }

  function setValue(t) {
    evaluate(Number(t));
  }

  function syncScene() {
    if (country.root.children.length !== lastCountryChildren) {
      lastCountryChildren = country.root.children.length;
      scanRoot(country.root);
    }
  }

  function applyAtmosphere({ inside, perspectiveView, baseFogDensity, styleFogFactor = 1.0, useStyledFog = false }) {
    if (inside) {
      hemi.color.copy(INDOOR_HEMI_SKY);
      hemi.groundColor.copy(INDOOR_HEMI_GROUND);
      hemi.intensity = 1.48;
      sun.color.copy(INDOOR_SUN_COLOR);
      sun.intensity = 2.45;
      scene.background.copy(INDOOR_BG);
      scene.fog.color.copy(INDOOR_FOG);
      scene.fog.density = 0.014;
      nightFixtures.group.visible = false;
      nightGlowUniform.value = 0;
      renderer.toneMappingExposure = 1.05;
      return;
    }

    hemi.color.copy(current.hemiSky);
    hemi.groundColor.copy(current.hemiGround);
    hemi.intensity = current.hemiIntensity;
    sun.color.copy(current.sunColor);
    sun.intensity = current.sunIntensity;
    renderer.toneMappingExposure = current.exposure;

    scene.background.copy(perspectiveView ? current.skyBgPersp : current.skyBgOrtho);
    scene.fog.color.copy(useStyledFog ? current.fogColorStyled : current.fogColor);
    scene.fog.density = baseFogDensity * current.fogDensityScale * styleFogFactor;

    // Sky dome + clouds
    if (skyHandles.skyUniforms) {
      const u = skyHandles.skyUniforms;
      u.zenith.value.copy(current.skyZenith);
      u.midSky.value.copy(current.skyMid);
      u.horizon.value.copy(current.skyHorizon);
      u.uTodSunDir.value.copy(current.skySunDir);
      u.uTodSunGlowColor.value.set(...current.skySunGlowColor);
      u.uTodSunGlowStr.value = current.skySunGlowStr;
      u.uTodSunDiscColor.value.set(...current.skySunDiscColor);
      u.uTodSunDiscStr.value = current.skySunDiscStr;
      u.uTodSkyStripMix.value = current.skyStripMix;
      u.uTodSkyStripTint.value.copy(current.skyStripTint);
      u.uTodMountainTint.value.copy(current.mountainTint);
      u.uTodStarStr.value = current.starStrength;
    }
    if (skyHandles.cloudUniforms) {
      const u = skyHandles.cloudUniforms;
      u.uSunDir.value.copy(current.skySunDir);
      u.uCloudShadow.value.set(...current.cloudShadow);
      u.uCloudLit.value.set(...current.cloudLit);
      u.uCloudOpacity.value = current.cloudOpacity;
    }
    if (waterTintUniform) {
      waterTintUniform.value.copy(current.waterTint);
    }

    // Night self-illumination across all detected sources
    const em = current.emissive;
    nightGlowUniform.value = em;
    for (let i = 0; i < signMaterials.length; i++) {
      const entry = signMaterials[i];
      entry.mat.userData.worldUniforms.uSelfLit.value = entry.base + em * entry.boost;
    }
    for (let i = 0; i < trafficLampMats.length; i++) {
      trafficLampMats[i].color.setScalar(1.0 + em * 1.15);
    }
    for (let i = 0; i < bikeLampMats.length; i++) {
      const m = bikeLampMats[i];
      m.emissive.setHex(0xfff1c0);
      m.emissiveIntensity = em * 2.4;
    }
    for (let i = 0; i < sheafMaterials.length; i++) {
      const entry = sheafMaterials[i];
      entry.mat.emissiveIntensity = entry.base * current.sheafEmissiveScale;
    }

    const showFixtures = em > 0.03;
    nightFixtures.group.visible = showFixtures;
    if (showFixtures) {
      nightFixtures.globeMat.color.setHex(0xffe6a6).multiplyScalar(1.0 + em * 1.45);
      nightFixtures.poolMat.opacity = em * 0.42;
      nightFixtures.beamMat.opacity = em * 0.44;
    }
  }

  function updateLightTransform({ inside, openCountry, lightX, ground, lightZ, scooterRoot }) {
    sun.target.position.set(lightX, ground + 0.3, lightZ);
    if (inside) {
      sun.position.set(lightX - 6, ground + 11.5, lightZ + 7.5);
      return;
    }
    const s = current.sunOffsetStreet;
    const c = current.sunOffsetCountry;
    sun.position.set(
      lightX + THREE.MathUtils.lerp(s[0], c[0], openCountry),
      ground + THREE.MathUtils.lerp(s[1], c[1], openCountry),
      lightZ + THREE.MathUtils.lerp(s[2], c[2], openCountry),
    );
    if (nightFixtures.group.visible && scooterRoot) {
      nightFixtures.headlightBeam.position.set(
        scooterRoot.position.x,
        scooterRoot.position.y + 0.045,
        scooterRoot.position.z,
      );
      nightFixtures.headlightBeam.rotation.y = scooterRoot.rotation.y;
    }
  }

  return {
    sun,
    hemi,
    current,
    detectedReport,
    setPreset,
    setValue,
    getPresetId: () => current.presetId,
    getValue: () => current.t,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    syncScene,
    applyAtmosphere,
    updateLightTransform,
    dispose() { nightFixtures.dispose(); },
  };
}
