// Old Street coordinates in metres, increasing from the shopfront towards the road.
export const CURB_H = .14;
export const CURB_Z = 2.55;
export const rideMinZ = CURB_Z + .94;
export const treePitRadius = .78;
export const treePitZ = CURB_Z - treePitRadius - .24;
export const streetTreeXs = [-9.1, -1.25, 5.58, 13.2, 17.8, 25.6, 33.55, 40.4];

// Slide a walking courier around the low masonry, including in free ride.
export function avoidTreePits(state) {
  const clearance = treePitRadius + .22;
  const dz = state.z - treePitZ;
  if (Math.abs(dz) >= clearance) return;
  for (const x of streetTreeXs) {
    const dx = state.x - x;
    const d = Math.hypot(dx, dz);
    if (d >= clearance) continue;
    state.x = x + dx / (d || 1) * clearance;
    state.z = treePitZ + (d ? dz / d : -1) * clearance;
    return;
  }
}

// Cross the planting strip through a gap first. This keeps the walking arrow
// from repeatedly directing the courier into a brick rim on the way to a door.
export function treeCrossingDirection(from, to) {
  const margin = treePitRadius + .34;
  const side = Math.sign(to.z - treePitZ);
  if (Math.abs(to.z - treePitZ) <= margin || (from.z - treePitZ) * side >= margin) return null;
  for (const x of streetTreeXs) {
    const dx = from.x - x;
    if (Math.abs(dx) < margin) return { x: Math.sign(dx || to.x - x || 1), z: 0 };
  }
  return { x: 0, z: side };
}
