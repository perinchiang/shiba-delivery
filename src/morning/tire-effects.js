import * as THREE from 'three';
import { coastalTownSurfaceHeight } from './coastal-town.js';
import { smoothstep } from '../core/mathx.js';

function pool(capacity) {
  const slots = Array.from({ length: capacity }, () => ({ life: 0 }));
  let cursor = 0;
  return {
    add() {
      const slot = slots[cursor];
      cursor = (cursor + 1) % capacity;
      return slot;
    },
    update(dt, draw) {
      let count = 0;
      for (const p of slots) {
        p.life = Math.max(0, p.life - dt);
        if (p.life > 0) draw(p, p.life / p.duration, count++);
      }
      return count;
    },
    clear() { for (const p of slots) p.life = 0; },
  };
}

function createRubberTrail(scene) {
  const capacity = 240, marks = pool(capacity);
  const position = new THREE.BufferAttribute(new Float32Array(capacity * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(capacity * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  const shade = new THREE.Color(0x514e46);
  for (let i = 0; i < capacity; i++) {
    const v = i * 4;
    indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    for (let j = v; j < v + 4; j++) colors.setXYZW(j, shade.r, shade.g, shade.b, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', colors);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    transparent: true, vertexColors: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  let lastDX = 0, lastDZ = 0, joined = false;
  function add(a, b, width, strength) {
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const dx = width * Math.cos(heading), dz = -width * Math.sin(heading);
    const p = marks.add();
    Object.assign(p, {
      ax: a.x, ay: a.y + 0.014, az: a.z, bx: b.x, by: b.y + 0.014, bz: b.z,
      adx: joined ? lastDX : 0, adz: joined ? lastDZ : 0, dx, dz, strength,
    });
    p.duration = p.life = 0.5 + strength * 0.7;
    lastDX = dx; lastDZ = dz; joined = true;
  }
  function update(dt) {
    const count = marks.update(dt, (p, remaining, i) => {
      const n = i * 4, opacity = 0.32 * p.strength * smoothstep(0, 0.85, remaining);
      position.setXYZ(n, p.ax - p.adx, p.ay, p.az - p.adz);
      position.setXYZ(n + 1, p.ax + p.adx, p.ay, p.az + p.adz);
      position.setXYZ(n + 2, p.bx - p.dx, p.by, p.bz - p.dz);
      position.setXYZ(n + 3, p.bx + p.dx, p.by, p.bz + p.dz);
      for (let j = n; j < n + 4; j++) colors.setW(j, opacity);
    });
    mesh.visible = count > 0;
    geometry.setDrawRange(0, count * 6);
    if (count) position.needsUpdate = colors.needsUpdate = true;
  }
  return { add, update, end() { joined = false; }, clear() { marks.clear(); joined = false; update(0); } };
}

export function createTireEffects(scene, scooter) {
  const dust = pool(40), rubber = createRubberTrail(scene);
  const clouds = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0xe9ddbe, flatShading: true, transparent: true, opacity: 0.42, depthWrite: false }),
    40,
  );
  clouds.frustumCulled = false;
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  clouds.count = 0;
  scene.add(clouds);
  const stamp = new THREE.Object3D(), point = new THREE.Vector3(), previous = new THREE.Vector3();
  const wheelbase = scooter.frontZ - scooter.rearZ;
  let lastSpeed, dustTime = 0, tick = 0;

  function reset() {
    lastSpeed = undefined;
    clouds.count = dustTime = tick = 0;
    dust.clear();
    rubber.clear();
  }

  function update(state, dt) {
    scooter.rearContact(point);
    point.y = Math.max(point.y, coastalTownSurfaceHeight(point.x, point.z, false) + 0.032);
    const speed = state.speed, yaw = state.bikeYaw;
    const moving = state.mode === 'ride' && !state.sequence && speed > 0.45 && dt > 0;
    const accel = lastSpeed === undefined || !dt ? 0 : (speed - lastSpeed) / dt;
    if (lastSpeed === undefined) previous.copy(point);
    const travel = point.distanceTo(previous);
    const launch = state.throttle * smoothstep(1.2, 3.7, accel);
    const braking = state.brakePressure * smoothstep(2, 6, -accel);
    const lateral = Math.tan(state.steer) * speed * speed / wheelbase;
    const turn = smoothstep(2.3, 5.5, Math.abs(lateral));
    const scrub = Math.max(braking, 0.72 * turn);
    if (moving && travel > 0.001 && travel < 2) {
      if (scrub > 0.12) rubber.add(previous, point, 0.023 + 0.047 * scrub, scrub);
      else rubber.end();
      const effort = Math.max(launch, braking, turn);
      dustTime += dt * effort;
      if (effort > 0.16 && dustTime >= 0.065) {
        dustTime %= 0.065;
        const side = turn > 0.2 ? -Math.sign(lateral) : (++tick % 2 ? 1 : -1);
        const drift = side * (0.52 + turn * 0.7), back = 0.7 + launch * 0.8;
        const p = dust.add();
        p.x = point.x - 0.13 * Math.sin(yaw) + 0.09 * side * Math.cos(yaw);
        p.y = point.y + 0.06;
        p.z = point.z - 0.13 * Math.cos(yaw) - 0.09 * side * Math.sin(yaw);
        p.vx = drift * Math.cos(yaw) - back * Math.sin(yaw);
        p.vz = -drift * Math.sin(yaw) - back * Math.cos(yaw);
        p.size = 0.085 + effort * 0.09;
        p.duration = p.life = 0.28 + 0.17 * effort;
      }
    } else { rubber.end(); dustTime = 0; }
    previous.copy(point);
    lastSpeed = speed;
    clouds.count = dust.update(dt, (p, remaining, i) => {
      const age = p.duration - p.life, size = p.size * Math.sin(Math.PI * (1 - 0.9 * remaining));
      stamp.position.set(p.x + p.vx * age, p.y + age * 0.45, p.z + p.vz * age);
      stamp.rotation.set(0.3, p.x, 0.3);
      stamp.scale.set(size * 1.4, size * 0.76, size);
      stamp.updateMatrix();
      clouds.setMatrixAt(i, stamp.matrix);
    });
    clouds.visible = clouds.count > 0;
    if (clouds.visible) clouds.instanceMatrix.needsUpdate = true;
    rubber.update(dt);
  }
  return { update, reset };
}
