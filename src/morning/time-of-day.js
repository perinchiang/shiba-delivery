// 4-time-of-day lighting calibrated to Blender Cycles AgX renders (`01-diorama-hero-34.png` & `05-diorama-night.png`).
// Drives Haikaze-so's literal Cycles Day/Night 2K Lightmaps (zero wall-piercing PointLights!),
// crisp dynamic shadows for Shiba & scooter, coastal sky/ocean, and the 4-layer scooter headlamp rig.
import * as THREE from 'three';
import { haikazeLightmapUniforms, heroLocalToWorld } from './coastal-town.js';

export const TOD_ORDER = Object.freeze(['morning', 'noon', 'dusk', 'night']);

export const TOD_PRESETS = Object.freeze({
  morning: {
    id: 'morning',
    label: '早晨',
    t: 0,
    // Matches Blender Cycles SummerSun direction (-X, +Y, -Z after rotY=PI)
    sunOffset: [-14.0, 15.0, -16.0],
    sunColor: 0xffeed0,
    sunIntensity: 2.75,
    hemiSky: 0x9ad8fc,
    hemiGround: 0x626b75,
    hemiIntensity: 0.92,
    envIntensity: 0.44,
    // Cycles Lightmap blend (0 = pure Cycles Day, 1 = pure Cycles Night)
    lmNightMix: 0.0,
    lmTint: [1.00, 1.00, 1.00],
    lmGain: 1.00,
    // Crisp Blender Cycles summer coastal azure sky!
    skyZenith: 0x1678e2,
    skyMid: 0x4ab8f5,
    skyHorizon: 0xa4e0fc,
    skySunDir: [-0.56, 0.56, -0.61],
    skySunGlowColor: [0.36, 0.28, 0.14],
    skySunGlowStr: 0.75,
    skySunDiscColor: [1.5, 1.35, 1.05],
    skySunDiscStr: 0.95,
    mountainTint: 0xd8eef8,
    cloudShadow: [0.76, 0.87, 0.96],
    cloudLit: [1.02, 1.00, 0.97],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBg: 0x6ac3f4,
    fogColor: 0xaadbf5,
    fogColorStyled: 0xaadbf5,
    fogDensityScale: 0.75,
    shadowTint: 0x4b74a8,
    shadowTintStrength: 0.26,
    grade: {
      lift: [0.0, 0.0, 0.0],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.0, 1.0, 1.0],
      saturation: 1.04,
      contrast: 1.02,
    },
    emissive: 0.0,
    bloomStrength: 0.11,
    bloomThreshold: 0.98,
    exposure: 1.02,
    waterTint: 0x9cdbf7,
  },
  noon: {
    id: 'noon',
    label: '中午',
    t: 1 / 3,
    sunOffset: [-6.0, 22.0, -8.5],
    sunColor: 0xfff9ea,
    sunIntensity: 3.15,
    hemiSky: 0x8cd2ff,
    hemiGround: 0x6e7878,
    hemiIntensity: 1.08,
    envIntensity: 0.50,
    lmNightMix: 0.0,
    lmTint: [1.02, 1.04, 1.06],
    lmGain: 1.12,
    skyZenith: 0x1266d6,
    skyMid: 0x40b0f4,
    skyHorizon: 0xbce8fc,
    skySunDir: [-0.24, 0.91, -0.34],
    skySunGlowColor: [0.34, 0.32, 0.22],
    skySunGlowStr: 0.80,
    skySunDiscColor: [1.7, 1.6, 1.35],
    skySunDiscStr: 1.0,
    mountainTint: 0xd0ecf8,
    cloudShadow: [0.78, 0.90, 0.99],
    cloudLit: [1.06, 1.05, 1.02],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBg: 0x5abaf2,
    fogColor: 0xb4e2f7,
    fogColorStyled: 0xb4e2f7,
    fogDensityScale: 0.62,
    shadowTint: 0x3b66b0,
    shadowTintStrength: 0.30,
    grade: {
      lift: [0.0, 0.0, 0.0],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.02, 1.02, 1.00],
      saturation: 1.06,
      contrast: 1.03,
    },
    emissive: 0.0,
    bloomStrength: 0.14,
    bloomThreshold: 0.99,
    exposure: 1.05,
    waterTint: 0xaee6ff,
  },
  dusk: {
    id: 'dusk',
    label: '傍晚',
    t: 2 / 3,
    sunOffset: [-18.5, 7.2, -10.5],
    sunColor: 0xffa860,
    sunIntensity: 2.35,
    hemiSky: 0x8e96b2,
    hemiGround: 0x564c52,
    hemiIntensity: 0.86,
    envIntensity: 0.24,
    lmNightMix: 0.44,
    lmTint: [1.14, 0.88, 0.70],
    lmGain: 0.92,
    skyZenith: 0x2a3c68,
    skyMid: 0xc9788e,
    skyHorizon: 0xffa85e,
    skySunDir: [-0.84, 0.18, -0.51],
    skySunGlowColor: [0.85, 0.42, 0.16],
    skySunGlowStr: 1.35,
    skySunDiscColor: [2.0, 1.24, 0.64],
    skySunDiscStr: 1.10,
    mountainTint: 0x7b687c,
    cloudShadow: [0.46, 0.42, 0.56],
    cloudLit: [1.10, 0.72, 0.50],
    cloudOpacity: 1.0,
    starStrength: 0.14,
    skyBg: 0xc47d84,
    fogColor: 0xc49288,
    fogColorStyled: 0xc49288,
    fogDensityScale: 0.78,
    shadowTint: 0x4e587a,
    shadowTintStrength: 0.30,
    grade: {
      lift: [0.002, 0.001, 0.004],
      gamma: [1.0, 0.995, 0.985],
      gain: [1.03, 0.99, 0.95],
      saturation: 1.06,
      contrast: 1.03,
    },
    emissive: 0.48,
    bloomStrength: 0.24,
    bloomThreshold: 0.88,
    exposure: 1.00,
    waterTint: 0xa67c7a,
  },
  night: {
    id: 'night',
    label: '夜晚',
    t: 1,
    sunOffset: [-12.0, 15.0, -14.0],
    sunColor: 0x7aa4dc,
    sunIntensity: 0.42,
    hemiSky: 0x223656,
    hemiGround: 0x101828,
    hemiIntensity: 0.54,
    envIntensity: 0.10,
    lmNightMix: 1.0,
    lmTint: [1.00, 1.00, 1.00],
    lmGain: 1.00,
    // Exact Cycles 05-diorama-night deep coastal midnight navy!
    skyZenith: 0x061022,
    skyMid: 0x0d1c36,
    skyHorizon: 0x1a3052,
    skySunDir: [-0.56, 0.52, -0.64],
    skySunGlowColor: [0.10, 0.16, 0.26],
    skySunGlowStr: 0.45,
    skySunDiscColor: [1.30, 1.40, 1.60],
    skySunDiscStr: 0.85,
    mountainTint: 0x182840,
    cloudShadow: [0.05, 0.08, 0.15],
    cloudLit: [0.12, 0.18, 0.28],
    cloudOpacity: 1.0,
    starStrength: 1.0,
    skyBg: 0x0e1d36,
    fogColor: 0x10203a,
    fogColorStyled: 0x10203a,
    fogDensityScale: 0.85,
    shadowTint: 0x2c4264,
    shadowTintStrength: 0.34,
    grade: {
      lift: [0.0, 0.0, 0.004],
      gamma: [1.0, 1.0, 1.01],
      gain: [1.0, 1.0, 1.01],
      saturation: 1.03,
      contrast: 1.02,
    },
    emissive: 1.0,
    bloomStrength: 0.36,
    bloomThreshold: 0.82,
    exposure: 1.04,
    waterTint: 0x193152,
  },
});

// Matches Blender Cycles `boost_night_emissives()` so window curtains, ramen interior,
// porch lamps, chochin lantern & vending showcase glow identically to `05-diorama-night.png`!
const HAIKAZE_EMISSIVE_CURVES = Object.freeze({
  Arch_Shop_Interior:       { day: 0.45, night: 2.35, color: 0xffc86e },
  Arch_Room_Interior:       { day: 0.24, night: 2.05, color: 0xffcc78 },
  Arch_Curtain_Cream:       { day: 0.00, night: 1.05, color: 0xffd082 },
  Arch_Curtain_Blue:        { day: 0.00, night: 0.88, color: 0xffe0a4 },
  Arch_Porch_Lamp:          { day: 0.65, night: 3.80, color: 0xffd282 },
  Prop_Lantern_Paper:       { day: 0.48, night: 3.20, color: 0xffcb74 },
  Arch_Sign_Board_Cream:    { day: 0.06, night: 0.82, color: 0xffeac0 },
  Emissive_Vending:         { day: 0.55, night: 2.10, color: 0xfff6df },
  Prop_VendingPoster_White: { day: 0.06, night: 0.62, color: 0xffffff },
  Prop_VendingPoster_Pink:  { day: 0.06, night: 0.62, color: 0xffffff },
});

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
    mountainTintObj: new THREE.Color(p.mountainTint),
    skyBgObj: new THREE.Color(p.skyBg),
    fogColorObj: new THREE.Color(p.fogColor),
    fogColorStyledObj: new THREE.Color(p.fogColorStyled),
    shadowTintObj: new THREE.Color(p.shadowTint),
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
  const w = 128, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let idx = 0;
  for (let py = 0; py < h; py++) {
    const fy = py / (h - 1);
    const nearFade = smooth(0.01, 0.14, fy);
    const farFade = Math.pow(1 - smooth(0.18, 1.0, fy), 1.35);
    const halfW = 0.08 + fy * 0.42;
    const coreW = 0.05 + fy * 0.20;
    for (let px = 0; px < w; px++) {
      const fx = Math.abs(px / (w - 1) - 0.5);
      const outer = Math.pow(1 - smooth(0.0, halfW, fx), 1.85);
      const core = Math.pow(1 - smooth(0.0, coreW, fx), 1.65) * Math.pow(1 - smooth(0.05, 0.78, fy), 1.25);
      const intensity = Math.min(1, nearFade * farFade * (outer * 0.68 + core * 0.58));
      const coreMix = Math.min(1, core * 1.15);
      d[idx++] = 255;
      d[idx++] = Math.round(226 + 26 * coreMix);
      d[idx++] = Math.round(166 + 66 * coreMix);
      d[idx++] = Math.round(intensity * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVolumetricBeamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xfff1c9) },
      uIntensity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vNormalV = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      void main() {
        float dist = 1.0 - vUv.y;
        float along = smoothstep(0.0, 0.06, dist) * pow(max(0.0, 1.0 - dist), 1.35);
        vec3 n = normalize(vNormalV);
        vec3 v = normalize(vViewPos);
        float fresnel = pow(abs(dot(n, v)), 1.25);
        float alpha = along * fresnel * uIntensity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor * alpha, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function buildNightFixtures(scene) {
  const group = new THREE.Group();
  group.name = 'night-fixtures';

  // Single soft warm doorway light purely to illuminate dynamic Shiba & scooter outside the shop at night!
  // (Haikaze-so's own walls & sidewalk get 100% real shadowed Cycles Night Lightmap — zero light bleeding!)
  const shopHeroLightPos = heroLocalToWorld(-0.4, -4.8, 2.0);
  const shopDynamicFill = new THREE.PointLight(0xffb860, 0.0, 7.5, 1.8);
  shopDynamicFill.castShadow = false;
  shopDynamicFill.position.set(shopHeroLightPos.x, shopHeroLightPos.y, shopHeroLightPos.z);
  group.add(shopDynamicFill);

  const poolTex = makeRadialPoolTexture();

  // 4-layer Scooter Lighting Rig (SpotLight + terrain-conforming ground beam + volumetric cone + taillight)
  const scooterRig = new THREE.Group();
  scooterRig.name = 'scooter-light-rig';
  scooterRig.rotation.order = 'YXZ';

  const headSpot = new THREE.SpotLight(0xffe9b5, 0.0, 32, 0.52, 0.68, 1.25);
  headSpot.castShadow = false;
  headSpot.position.set(0, 0.80, 0.92);
  headSpot.target.position.set(0, -0.40, 12.5);
  scooterRig.add(headSpot, headSpot.target);

  const beamGeo = new THREE.PlaneGeometry(5.6, 10.2, 4, 16);
  beamGeo.rotateX(-Math.PI / 2);
  beamGeo.translate(0, 0, 0.90 + 5.1);
  const beamLocalPos = new Float32Array(beamGeo.attributes.position.array);
  const beamTex = makeHeadlightBeamTexture();
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    color: 0xfff3d1,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const headlightBeam = new THREE.Mesh(beamGeo, beamMat);
  headlightBeam.frustumCulled = false;
  group.add(headlightBeam);

  const coneLen = 2.45;
  const coneGeo = new THREE.CylinderGeometry(0.068, 0.48, coneLen, 20, 1, true);
  coneGeo.translate(0, -coneLen * 0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = createVolumetricBeamMaterial();
  const volumetricCone = new THREE.Mesh(coneGeo, coneMat);
  volumetricCone.position.set(0, 0.84, 0.50);
  volumetricCone.rotation.x = 0.065;
  volumetricCone.frustumCulled = false;
  scooterRig.add(volumetricCone);

  const tailPoolGeo = new THREE.PlaneGeometry(1.5, 1.5);
  tailPoolGeo.rotateX(-Math.PI / 2);
  const tailPoolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    color: 0xff3b28,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const tailPool = new THREE.Mesh(tailPoolGeo, tailPoolMat);
  tailPool.position.set(0, 0.045, -0.88);
  tailPool.frustumCulled = false;
  scooterRig.add(tailPool);

  const tailHaloGeo = new THREE.PlaneGeometry(0.42, 0.42);
  const tailHaloMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    color: 0xff4630,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tailHalo = new THREE.Mesh(tailHaloGeo, tailHaloMat);
  tailHalo.position.set(0, 0.45, -0.62);
  tailHalo.frustumCulled = false;
  scooterRig.add(tailHalo);

  group.add(scooterRig);
  group.visible = false;
  scene.add(group);

  return {
    group, shopDynamicFill, beamMat, coneMat, tailPoolMat, tailHaloMat, headSpot,
    scooterRig, headlightBeam, beamLocalPos,
    dispose() {
      poolTex.dispose();
      beamGeo.dispose(); beamTex.dispose(); beamMat.dispose();
      coneGeo.dispose(); coneMat.dispose();
      tailPoolGeo.dispose(); tailPoolMat.dispose();
      tailHaloGeo.dispose(); tailHaloMat.dispose();
    },
  };
}

export function createTimeOfDay({ scene, renderer, coastalSky, coastalTown, scooter }) {
  const hemi = new THREE.HemisphereLight(0x9ad8fc, 0x626b75, 0.92);
  const sun = new THREE.DirectionalLight(0xffeed0, 2.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Tighter shadow frustum (28m x 28m -> ~1.3cm/texel!) for crisp grounded character & street shadows!
  const SHADOW_HALF = 14;
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF,
    near: 0.5, far: 86,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.012;
  sun.shadow.bias = -0.00018;
  sun.shadow.radius = 2;
  scene.add(hemi, sun, sun.target);

  const nightFixtures = buildNightFixtures(scene);

  const haikazeEmissives = [];
  const bikeLampMats = [];
  const seenMats = new WeakSet();

  coastalTown.heroRoot.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || seenMats.has(m)) continue;
      const baseName = (m.name || '').replace(/\.\d+$/, '');
      const spec = HAIKAZE_EMISSIVE_CURVES[baseName];
      if (spec) {
        seenMats.add(m);
        if (spec.color !== 0xffffff) m.emissive.setHex(spec.color);
        haikazeEmissives.push({ mat: m, day: spec.day, night: spec.night });
      }
    }
  });

  scooter.root.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m && !seenMats.has(m) && /lamp/i.test(m.name || '')) {
        seenMats.add(m);
        bikeLampMats.push(m);
      }
    }
  });

  const current = {
    t: 0,
    presetId: 'morning',
    sunOffset: [-14.0, 15.0, -16.0],
    sunColor: new THREE.Color(0xffeed0),
    sunIntensity: 2.75,
    hemiSky: new THREE.Color(0x9ad8fc),
    hemiGround: new THREE.Color(0x626b75),
    hemiIntensity: 0.92,
    envIntensity: 0.44,
    lmNightMix: 0.0,
    lmTint: [1, 1, 1],
    lmGain: 1.0,
    skyZenith: new THREE.Color(0x1678e2),
    skyMid: new THREE.Color(0x4ab8f5),
    skyHorizon: new THREE.Color(0xa4e0fc),
    skySunDir: new THREE.Vector3(-0.56, 0.56, -0.61).normalize(),
    skySunGlowColor: [0.36, 0.28, 0.14],
    skySunGlowStr: 0.75,
    skySunDiscColor: [1.5, 1.35, 1.05],
    skySunDiscStr: 0.95,
    mountainTint: new THREE.Color(0xd8eef8),
    cloudShadow: [0.76, 0.87, 0.96],
    cloudLit: [1.02, 1.00, 0.97],
    cloudOpacity: 1.0,
    starStrength: 0.0,
    skyBg: new THREE.Color(0x6ac3f4),
    fogColor: new THREE.Color(0xaadbf5),
    fogColorStyled: new THREE.Color(0xaadbf5),
    fogDensityScale: 0.75,
    shadowTint: new THREE.Color(0x4b74a8),
    shadowTintStrength: 0.26,
    grade: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1.04, contrast: 1.02 },
    emissive: 0.0,
    bloomStrength: 0.11,
    bloomThreshold: 0.98,
    exposure: 1.02,
    waterTint: new THREE.Color(0x9cdbf7),
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

    const nearest = PRESET_ARRAY[Math.round(scaled)];
    current.presetId = Math.abs(scaled - Math.round(scaled)) < 0.01 ? nearest.id : `${a.id}→${b.id}`;

    lerp3(current.sunOffset, a.sunOffset, b.sunOffset, f);
    current.sunColor.copy(a.sunColorObj).lerp(b.sunColorObj, f);
    current.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, f);
    current.hemiSky.copy(a.hemiSkyObj).lerp(b.hemiSkyObj, f);
    current.hemiGround.copy(a.hemiGroundObj).lerp(b.hemiGroundObj, f);
    current.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, f);
    current.envIntensity = THREE.MathUtils.lerp(a.envIntensity, b.envIntensity, f);

    current.lmNightMix = THREE.MathUtils.lerp(a.lmNightMix, b.lmNightMix, f);
    lerp3(current.lmTint, a.lmTint, b.lmTint, f);
    current.lmGain = THREE.MathUtils.lerp(a.lmGain, b.lmGain, f);

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
    current.mountainTint.copy(a.mountainTintObj).lerp(b.mountainTintObj, f);
    lerp3(current.cloudShadow, a.cloudShadow, b.cloudShadow, f);
    lerp3(current.cloudLit, a.cloudLit, b.cloudLit, f);
    current.cloudOpacity = THREE.MathUtils.lerp(a.cloudOpacity, b.cloudOpacity, f);
    current.starStrength = THREE.MathUtils.lerp(a.starStrength, b.starStrength, f);

    current.skyBg.copy(a.skyBgObj).lerp(b.skyBgObj, f);
    current.fogColor.copy(a.fogColorObj).lerp(b.fogColorObj, f);
    current.fogColorStyled.copy(a.fogColorStyledObj).lerp(b.fogColorStyledObj, f);
    current.fogDensityScale = THREE.MathUtils.lerp(a.fogDensityScale, b.fogDensityScale, f);
    current.shadowTint.copy(a.shadowTintObj).lerp(b.shadowTintObj, f);
    current.shadowTintStrength = THREE.MathUtils.lerp(a.shadowTintStrength, b.shadowTintStrength, f);

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

    for (const fn of listeners) fn(current);
  }

  evaluate(0);

  if (!scene.background) scene.background = new THREE.Color(0x6ac3f4);
  if (!scene.fog) scene.fog = new THREE.FogExp2(0xaadbf5, 0.0018);

  function setPreset(id) {
    if (!Object.hasOwn(TOD_PRESETS, id)) return false;
    evaluate(TOD_PRESETS[id].t);
    return true;
  }

  function applyAtmosphere({ baseFogDensity = 0.0016, styleFogFactor = 1.0, useStyledFog = false } = {}) {
    hemi.color.copy(current.hemiSky);
    hemi.groundColor.copy(current.hemiGround);
    hemi.intensity = current.hemiIntensity;
    sun.color.copy(current.sunColor);
    sun.intensity = current.sunIntensity;
    scene.environmentIntensity = current.envIntensity;
    renderer.toneMappingExposure = current.exposure;

    // Drive Haikaze-so Cycles Day/Night 2K Lightmaps smoothly!
    haikazeLightmapUniforms.uLmNightMix.value = current.lmNightMix;
    haikazeLightmapUniforms.uLmTint.value.setRGB(current.lmTint[0], current.lmTint[1], current.lmTint[2]);
    haikazeLightmapUniforms.uLmGain.value = current.lmGain;

    scene.background.copy(current.skyBg);
    scene.fog.color.copy(useStyledFog ? current.fogColorStyled : current.fogColor);
    scene.fog.density = baseFogDensity * current.fogDensityScale * styleFogFactor;

    const u = coastalSky.skyUniforms;
    u.zenith.value.copy(current.skyZenith);
    u.midSky.value.copy(current.skyMid);
    u.horizon.value.copy(current.skyHorizon);
    u.uTodSunDir.value.copy(current.skySunDir);
    u.uTodSunGlowColor.value.set(...current.skySunGlowColor);
    u.uTodSunGlowStr.value = current.skySunGlowStr;
    u.uTodSunDiscColor.value.set(...current.skySunDiscColor);
    u.uTodSunDiscStr.value = current.skySunDiscStr;
    u.uTodMountainTint.value.copy(current.mountainTint);
    u.uTodStarStr.value = current.starStrength;

    const cu = coastalSky.cloudUniforms;
    cu.uSunDir.value.copy(current.skySunDir);
    cu.uCloudShadow.value.set(...current.cloudShadow);
    cu.uCloudLit.value.set(...current.cloudLit);
    cu.uCloudOpacity.value = current.cloudOpacity;

    if (coastalTown.waterTintUniform) {
      coastalTown.waterTintUniform.value.copy(current.waterTint);
    }

    const em = current.emissive;
    for (let i = 0; i < haikazeEmissives.length; i++) {
      const e = haikazeEmissives[i];
      e.mat.emissiveIntensity = THREE.MathUtils.lerp(e.day, e.night, em);
    }
    for (let i = 0; i < bikeLampMats.length; i++) {
      const m = bikeLampMats[i];
      m.emissive.setHex(0xfff1c0);
      m.emissiveIntensity = em * 2.4;
    }

    const showFixtures = em > 0.03;
    nightFixtures.group.visible = showFixtures;
    if (showFixtures) {
      nightFixtures.shopDynamicFill.intensity = em * 4.2;
      nightFixtures.beamMat.opacity = em * 0.56;
      nightFixtures.coneMat.uniforms.uIntensity.value = em * 0.34;
      nightFixtures.headSpot.intensity = em * 38.0;
      nightFixtures.tailPoolMat.opacity = em * 0.22;
      nightFixtures.tailHaloMat.opacity = em * 0.60;
    } else {
      nightFixtures.shopDynamicFill.intensity = 0.0;
      nightFixtures.headSpot.intensity = 0.0;
    }
  }

  const _lDir = new THREE.Vector3();
  const _lRight = new THREE.Vector3();
  const _lUp = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);
  const _lTarget = new THREE.Vector3();
  const SHADOW_TEXEL = (SHADOW_HALF * 2) / 2048;

  function updateLightTransform({ lightX, ground, lightZ, scooterRoot, groundAt }) {
    const [sx0, sy0, sz0] = current.sunOffset;
    const ox = sx0 * 1.45;
    const oy = sy0 * 1.45;
    const oz = sz0 * 1.45;

    _lDir.set(ox, oy, oz).normalize();
    _lRight.crossVectors(_worldUp, _lDir).normalize();
    _lUp.crossVectors(_lDir, _lRight).normalize();
    _lTarget.set(lightX, ground + 0.3, lightZ);
    const rx = Math.round(_lTarget.dot(_lRight) / SHADOW_TEXEL) * SHADOW_TEXEL;
    const ry = Math.round(_lTarget.dot(_lUp) / SHADOW_TEXEL) * SHADOW_TEXEL;
    const rz = _lTarget.dot(_lDir);
    _lTarget.set(0, 0, 0)
      .addScaledVector(_lRight, rx)
      .addScaledVector(_lUp, ry)
      .addScaledVector(_lDir, rz);

    sun.target.position.copy(_lTarget);
    sun.position.set(_lTarget.x + ox, _lTarget.y + oy, _lTarget.z + oz);

    if (nightFixtures.group.visible && scooterRoot) {
      const rig = nightFixtures.scooterRig;
      rig.position.copy(scooterRoot.position);
      rig.rotation.set(scooterRoot.rotation.x, scooterRoot.rotation.y, scooterRoot.rotation.z, 'YXZ');

      const posAttr = nightFixtures.headlightBeam.geometry.attributes.position;
      const src = nightFixtures.beamLocalPos;
      const sx = scooterRoot.position.x;
      const sy = scooterRoot.position.y;
      const sz = scooterRoot.position.z;
      const yaw = scooterRoot.rotation.y;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      for (let i = 0; i < posAttr.count; i++) {
        const lx = src[i * 3];
        const lz = src[i * 3 + 2];
        const wx = sx + lx * cosY + lz * sinY;
        const wz = sz - lx * sinY + lz * cosY;
        const wy = (groundAt ? groundAt(wx, wz) : sy) + 0.055;
        posAttr.setXYZ(i, wx, wy, wz);
      }
      posAttr.needsUpdate = true;
    }
  }

  return {
    sun,
    hemi,
    current,
    setPreset,
    setValue: t => evaluate(Number(t)),
    getPresetId: () => current.presetId,
    getValue: () => current.t,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    applyAtmosphere,
    updateLightTransform,
    dispose() { nightFixtures.dispose(); },
  };
}
