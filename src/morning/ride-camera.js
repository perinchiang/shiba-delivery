import { clamp, lerp, smoothstep } from '../core/mathx.js';

export function resizeRideCamera(camera, aspect) {
  camera.aspect = aspect;
  camera.fov = aspect < 0.85 ? 63 : 55;
  camera.updateProjectionMatrix();
}

/** Keep a fixed-length boom about the rider, including turns against either row of storefronts. */
export function frameRide(camera, bike, yaw, focus) {
  const radius = 7.9, pivotHeight = 1.04, rise = 2.54;
  const bearing = yaw + 0.17 * Math.sin(yaw);
  const along = Math.sin(bearing), across = Math.cos(bearing);
  const dz = clamp(-across * radius, 0.42 - bike.z, 8.18 - bike.z);
  // Slide along the curb when the rear quarter is blocked. When crossing the road or
  // turning all the way around, the boom arcs over the rider to reach the other side.
  const alongCurb = -Math.sign(along) * Math.sqrt(Math.max(0, radius * radius - dz * dz));
  const dx = lerp(-along * radius, alongCurb, smoothstep(0, 0.58, Math.abs(along)));
  const horizontal = Math.hypot(dx, dz);
  const height = Math.sqrt(Math.max(rise * rise, radius * radius + rise * rise - horizontal * horizontal));
  camera.position.set(bike.x + dx, pivotHeight + height, bike.z + dz);

  const hx = Math.sin(bike.bikeYaw), hz = Math.cos(bike.bikeYaw);
  const invHorizontal = 1 / Math.max(horizontal, 0.001);
  const fx = -dx * invHorizontal, fz = -dz * invHorizontal;
  const behind = fx * hx + fz * hz;
  const open = smoothstep(0.45, 0.96, behind) * smoothstep(2.8, 6.9, horizontal);
  const lead = lerp(0.40, 2.60, open);
  // Keep the look into a turn inside the available screen width, especially on a phone.
  const forward = behind * lead;
  const lateral = clamp((fz * hx - fx * hz) * lead, -camera.aspect, camera.aspect);
  focus.set(bike.x + fx * forward + fz * lateral, lerp(1.18, 1.43, open), bike.z + fz * forward - fx * lateral);
  camera.lookAt(focus);
}
