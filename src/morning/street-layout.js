// Old Street coordinates in metres, increasing from the shopfront towards the road.
export const CURB_H = .14;
export const CURB_Z = 2.55;
export const rideMinZ = CURB_Z + .94;
export const treePitRadius = .78;
export const treePitZ = CURB_Z - treePitRadius - .24;
export const streetTreeXs = [-9.1, -1.25, 5.58, 13.2, 17.8, 25.6, 33.55, 40.4];
// Crossing trees are expressed once, relative to `crossing` in country-route.js.
// Rendering and collision both consume this list; do not duplicate world points.
export const cityTreeOffsets = [
  [23.8, -8.2, .66], [23.8, 8.2, .66], [-24.2, -8.2, .64],
  [-7.5, -22.8, .63], [7.5, -22.8, .63], [-7.5, 22.8, .63], [7.5, 22.8, .63],
  [-4.4, -54.5, .67], [4.4, -54.5, .67], [-4.4, 54.5, .67], [4.4, 54.5, .67],
];
export const cityTreePits = cityTreeOffsets;
export const cityTreePitRadius = .82;

// Slide a walking courier around the low masonry, including in free ride.
export function avoidTreePits(state) {
  const clearance = treePitRadius + .22;
  const dz = state.z - treePitZ;
  if (Math.abs(dz) < clearance) {
    for (const x of streetTreeXs) {
      const dx = state.x - x;
      const d = Math.hypot(dx, dz);
      if (d >= clearance) continue;
      state.x = x + dx / (d || 1) * clearance;
      state.z = treePitZ + (d ? dz / d : -1) * clearance;
      return;
    }
  }
  // The crossing is fixed in the route and uses the same relative list as
  // city-crossing.js. Keep this after the Old Street early path for stability.
  const cx = 92, cz = 4.17, cityClearance = cityTreePitRadius + .22;
  for (const [ox, oz] of cityTreePits) {
    const px = cx + ox, pz = cz + oz, dx = state.x - px, dz2 = state.z - pz;
    const d = Math.hypot(dx, dz2);
    if (d >= cityClearance) continue;
    state.x = px + dx / (d || 1) * cityClearance;
    state.z = pz + (d ? dz2 / d : -1) * cityClearance;
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
