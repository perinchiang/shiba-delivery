// Clean standalone coastal sky dome (gradient + sun disc + horizon hills + night stars)
// and stylized 3D sunlit cumulus clouds, with native 4-time-of-day uniforms (zero shader patching).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rngFrom } from '../core/rng.js';

export function createCoastalSky() {
  const sky = new THREE.Group();
  sky.name = 'coastal-sky';

  const skyUniforms = {
    zenith: { value: new THREE.Color(0x4b9cd6) },
    midSky: { value: new THREE.Color(0x9bd4eb) },
    horizon: { value: new THREE.Color(0xfff0d2) },
    uTodSunDir: { value: new THREE.Vector3(-0.62, 0.42, -0.66).normalize() },
    uTodSunGlowColor: { value: new THREE.Vector3(0.48, 0.28, 0.09) },
    uTodSunGlowStr: { value: 1.0 },
    uTodSunDiscColor: { value: new THREE.Vector3(1.5, 1.25, 0.85) },
    uTodSunDiscStr: { value: 1.0 },
    uTodMountainTint: { value: new THREE.Color(0xffffff) },
    uTodStarStr: { value: 0.0 },
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 zenith, midSky, horizon;
      uniform vec3 uTodSunDir, uTodSunGlowColor, uTodSunDiscColor;
      uniform float uTodSunGlowStr, uTodSunDiscStr, uTodStarStr;
      uniform vec3 uTodMountainTint;

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

        // Keep southern ocean horizon (+Z) open sea; show soft coastal ridges toward north/flanks
        float oceanOpen = smoothstep(0.10, 0.65, dir.z);
        float landMask = 1.0 - oceanOpen * 0.85;
        float farRidge  = (0.072 + 0.032 * sin(2.0 * az + 0.5) + 0.018 * cos(5.0 * az - 1.1)) * landMask;
        float midRidge  = (0.044 + 0.020 * cos(3.0 * az + 1.3) + 0.014 * sin(7.0 * az + 0.4)) * landMask;

        float farMask = 1.0 - smoothstep(farRidge - 0.0025, farRidge + 0.0025, dir.y);
        float midMask = 1.0 - smoothstep(midRidge - 0.0022, midRidge + 0.0022, dir.y);

        vec3 farCol = mix(vec3(0.58, 0.76, 0.84), vec3(0.76, 0.84, 0.84), pow(sun, 3.0) * 0.40) * uTodMountainTint;
        vec3 midCol = mix(vec3(0.45, 0.66, 0.70), vec3(0.62, 0.75, 0.70), pow(sun, 3.0) * 0.32) * uTodMountainTint;

        col = mix(col, farCol, farMask * 0.78 * step(0.004, farRidge));
        col = mix(col, midCol, midMask * 0.86 * step(0.004, midRidge));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 20), domeMat);
  dome.frustumCulled = false;
  sky.add(dome);

  // Stylized Ghibli 3D cumulus cloud ring (1 single batched draw call)
  const cloudUniforms = {
    uSunDir: { value: new THREE.Vector3(-0.62, 0.42, -0.66).normalize() },
    uCloudShadow: { value: new THREE.Vector3(0.75, 0.86, 0.94) },
    uCloudLit: { value: new THREE.Vector3(1.0, 0.985, 0.945) },
    uCloudOpacity: { value: 1.0 },
  };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying float vLocalY;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vLocalY = normal.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uCloudShadow, uCloudLit;
      uniform float uCloudOpacity;
      varying vec3 vNormalW;
      varying float vLocalY;
      void main() {
        float ndl = dot(normalize(vNormalW), normalize(uSunDir)) * 0.5 + 0.5;
        float topGrad = smoothstep(-0.65, 0.55, vLocalY);
        float light = clamp(ndl * 0.48 + topGrad * 0.62, 0.0, 1.0);
        vec3 col = mix(uCloudShadow, uCloudLit, smoothstep(0.24, 0.78, light));
        gl_FragColor = vec4(col, uCloudOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const rng = rngFrom('rongwan-coastal-clouds-v2', 11);
  const parts = [];
  const basePuff = new THREE.IcosahedronGeometry(1, 2);
  for (let c = 0; c < 18; c++) {
    const angle = (c / 18) * Math.PI * 2 + rng.range(-0.14, 0.14);
    const dist = rng.range(165, 225);
    const elev = rng.range(36, 84);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const puffs = Math.floor(rng.range(4, 7));
    for (let p = 0; p < puffs; p++) {
      const g = basePuff.clone();
      const spread = (p - (puffs - 1) * 0.5) * rng.range(7.0, 10.5);
      const sx = rng.range(8.5, 16.0);
      const sy = rng.range(4.2, 8.2);
      const sz = rng.range(7.0, 12.5);
      g.scale(sx, sy, sz);
      const tx = -Math.sin(angle) * spread + rng.range(-3, 3);
      const tz = Math.cos(angle) * spread + rng.range(-3, 3);
      const ty = Math.cos(((p + 0.5) / puffs - 0.5) * Math.PI) * rng.range(2.0, 5.2);
      g.translate(cx + tx, elev + ty, cz + tz);
      parts.push(g);
    }
  }
  basePuff.dispose();
  const cloudGeo = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  const cloudRing = new THREE.Mesh(cloudGeo, cloudMat);
  cloudRing.frustumCulled = false;
  sky.add(cloudRing);

  return {
    root: sky,
    skyUniforms,
    cloudUniforms,
    update(time) {
      cloudRing.rotation.y = time * 0.0045;
    },
  };
}
