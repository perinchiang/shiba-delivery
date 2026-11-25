import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { glowMaterial } from '../core/materials.js';
import { setMaxAnisotropy } from '../core/textures.js';
import { createShiba, createScooter, parcel } from './rider.js';
import { createCoastalSky } from './coastal-sky.js';
import { createCoastalTown } from './coastal-town.js';
import { createTimeOfDay } from './time-of-day.js';
import { createRenderStyle, registerRendererControls } from './render-style.js';
import { $ } from './dom.js';

export async function createWorld(renderer, onProgress) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 3.5, -3.5, 0.1, 82);
  const chase = new THREE.PerspectiveCamera(46, 1, 0.12, 340);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Exact Blender AgX color science natively supported by Three.js r187!
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.02;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  setMaxAnisotropy(maxAniso);
  $('stage').appendChild(renderer.domElement);

  // Subtle PMREM environment map so brushed gold brass, glazed ceramic tiles, satin paint & glass shine!
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();

  const glbUrls = [
    new URL('../../art/morning/shiba-courier.glb', import.meta.url).href,
    new URL('../../art/morning/monkey-delivery.glb', import.meta.url).href,
    new URL('../../art/town/haikaze-hero/haikaze-hero-game.glb', import.meta.url).href,
  ];
  const lmDayUrl = new URL('../../art/town/haikaze-hero/haikaze-lm-day.webp', import.meta.url).href;
  const lmNightUrl = new URL('../../art/town/haikaze-hero/haikaze-lm-night.webp', import.meta.url).href;

  const progress = new Array(glbUrls.length + 2).fill(0);
  const reportDownload = () => {
    const avg = progress.reduce((sum, p) => sum + p, 0) / progress.length;
    onProgress?.(0.08 + avg * 0.78, `正在加载 3D 与 Cycles 光影 (${Math.round(avg * 100)}%)…`);
  };
  reportDownload();

  const loadLm = (url, idx) => texLoader.loadAsync(url).then(tex => {
    tex.flipY = false; // Exact glTF TEXCOORD_1 orientation!
    tex.colorSpace = THREE.NoColorSpace; // Raw linear sqrt-range HDR encoding
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(8, maxAniso);
    tex.needsUpdate = true;
    progress[idx] = 1;
    reportDownload();
    return tex;
  });

  const [courier, motorcycle, haikazeGltf, lmDayTex, lmNightTex] = await Promise.all([
    ...glbUrls.map((url, idx) =>
      gltfLoader.loadAsync(url, event => {
        if (event.lengthComputable && event.total > 0) {
          progress[idx] = Math.min(1, event.loaded / event.total);
          reportDownload();
        }
      }).then(gltf => {
        progress[idx] = 1;
        reportDownload();
        return gltf;
      }),
    ),
    loadLm(lmDayUrl, glbUrls.length),
    loadLm(lmNightUrl, glbUrls.length + 1),
  ]);

  onProgress?.(0.90, '正在拼装海风庄与 Cycles 光照…');
  const coastalSky = createCoastalSky();
  const coastalTown = createCoastalTown(haikazeGltf, maxAniso, { lmDayTex, lmNightTex });
  const shiba = createShiba(courier);
  const scooter = createScooter(motorcycle);
  scene.add(coastalSky.root, coastalTown.root, shiba.root, scooter.root);

  const looseBag = parcel(scene, 0, 0, 0);
  looseBag.scale.copy(shiba.root.scale);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.49, 0.54, 48),
    glowMaterial({ color: 0xffdf8a, intensity: 1, transparent: true, opacity: 0.86, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d');
  const shade = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  shade.addColorStop(0, 'rgba(32,38,52,.42)');
  shade.addColorStop(1, 'rgba(32,38,52,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    glowMaterial({ map: shadowTexture, intensity: 1, transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  scene.add(contact);

  const timeOfDay = createTimeOfDay({ scene, renderer, coastalSky, coastalTown, scooter });
  const renderStyle = createRenderStyle({ renderer, shiba, scooter, coastalTown, timeOfDay });
  registerRendererControls(renderer, { timeOfDay, renderStyle });

  return {
    scene, coastalSky, coastalTown, camera, chase,
    sun: timeOfDay.sun, hemi: timeOfDay.hemi, timeOfDay, renderStyle,
    shiba, scooter, looseBag, marker, contact,
  };
}
