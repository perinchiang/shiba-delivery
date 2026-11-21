import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { rngFrom } from '../core/rng.js';
import { centerZ, halfWidth, paddyRoadOuterHeight, paddyRoadOuterOffset, paddyShoulderCrossSection, paddyShoulderWeight, roadHeight } from './country-route.js';
import sheafUrl from '../../art/countryside/harvest-rice.png?url';

export const harvestStart = 686;
export const harvestEnd = 852;
export const inHarvest = x => x >= harvestStart && x < harvestEnd;
export function harvestWeight(x, feather = 12) {
  return THREE.MathUtils.smoothstep(x, harvestStart, harvestStart + feather)
    * (1 - THREE.MathUtils.smoothstep(x, harvestEnd - feather, harvestEnd));
}

// The furrow widens in pockets along the inside of each bend.
function margin(x, side) {
  const sample = paddyShoulderWeight(x);
  return halfWidth(x) + 1.55 + sample * 1.05
    + .75 * Math.sin(x * .092 + side) + .26 * Math.cos(x * .21 - side);
}
function swell(x, d, side) {
  return .54 * Math.sin(x * .18 + d * .43 + side) + .46 * Math.sin(x * .081 - d * .24);
}

export function harvestSheaves() {
  // Three loosely folded panels at different depths, with a common root and a wind-flexing crown.
  const geometry = new GeoBuilder();
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI / 3;
    const point = (u, v) => {
      const along = (u - .5) * 2.42;
      const depth = (u - .5) ** 2 * .95 + .24 * v * v;
      return [along * Math.cos(angle) - depth * Math.sin(angle), v * 1.55,
        along * Math.sin(angle) + depth * Math.cos(angle)];
    };
    for (const u of [0, .5]) {
      geometry.quad(point(u,0), point(u+.5,0), point(u+.5,1), point(u,1),
        {uv:[u,0,u+.5,1], normal:[0,1,0], colors:[0x868751,0x868751,0xffffff,0xffffff]});
    }
  }
  const map = new THREE.TextureLoader().load(sheafUrl);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshLambertMaterial({map, side:THREE.DoubleSide, alphaTest:.32,
    color:0xffedc9, emissive:0x41340f, vertexColors:true});
  return { geometry:geometry.build(), material };
}

// Continuous vertex-coloured ground includes the shallow ditch, its banks and the undulating field.
// The surface rises into the sheaves so near and distant rice share one silhouette.
export function addHarvest(ground, crowns, from, to) {
  const list = [];
  const rng = rngFrom('桥前熟稻', from);
  for (const side of [-1, 1]) {
    const distances = [-2, -.32, .12, .53, 1.28, 2.7, 4.4, 7, 10, 14, 19, 25, 34, 46, 63, 83, 108, 132, 134, 235];
    function vertex(x, d) {
      const sample = paddyShoulderWeight(x);
      // The harvested field owns this whole interval. Its first surface
      // starts at the same shoulder boundary as the road mesh, then reaches
      // the root zone after the cut and bund. This prevents a hidden gap
      // when addZone intentionally skips ripe-rice rows.
      const skirt = paddyRoadOuterOffset(x);
      const furrow = sample > .01
        ? halfWidth(x) + paddyShoulderCrossSection.root
          + .32 * Math.sin(x * .092 + side) + .12 * Math.cos(x * .21 - side)
        : Math.max(skirt + .28, margin(x, side) + .65);
      let offset = d < 0 ? THREE.MathUtils.lerp(skirt, furrow, (d + 2) / 2) : furrow + d;
      if (sample > .01 && d >= 1) offset = halfWidth(x) + paddyShoulderCrossSection.root + (d - 1);
      let profileHeight = roadHeight(x) - .15;
      if (sample > .01 && d < 1) {
        const profile = [
          [-2, paddyShoulderCrossSection.roadOuter, paddyRoadOuterHeight(x)],
          [-.8, paddyShoulderCrossSection.cut, paddyRoadOuterHeight(x)],
          [-.2, paddyShoulderCrossSection.ditch, roadHeight(x) - .27],
          [.35, paddyShoulderCrossSection.berm, roadHeight(x) - .03],
          [1, paddyShoulderCrossSection.root, -.04],
        ];
        for (let p = 1; p < profile.length; p++) {
          if (d > profile[p][0]) continue;
          const a = profile[p - 1], b = profile[p];
          const t = THREE.MathUtils.clamp((d - a[0]) / (b[0] - a[0]), 0, 1);
          offset = halfWidth(x) + THREE.MathUtils.lerp(a[1], b[1], t);
          profileHeight = THREE.MathUtils.lerp(a[2], b[2], t);
          break;
        }
      }
      const z = centerZ(x) + side * offset;
      const blend = harvestWeight(x);
      const roll = swell(x, d, side);
      let h, col;
      if (d < 1) {
        if (sample > .01) {
          h = profileHeight;
          col = new THREE.Color(0x5a472d).lerp(new THREE.Color(0x6e874b),
            THREE.MathUtils.clamp((d + 2) / 3, 0, 1));
        } else {
          h = d === -2 ? -.07 : d < .2 ? -.19 : -.10;
          col = d < -.3 ? 0xa29872 : d < .2 ? 0x939677 : 0x999653;
        }
      } else {
        const rise = THREE.MathUtils.smoothstep(d, 1, 4.8);
        const far = THREE.MathUtils.smoothstep(d, 18, 65);
        h = -.10 + rise * (.80 + roll * .23) + far * (2.2 + 1.8 * Math.sin(x*.047+d*.091+side));
        col = new THREE.Color(0x928348).lerp(new THREE.Color(0xb9a356), .52 + .45 * roll);
      }
      const oldHeight = d > 132 ? -.24 : THREE.MathUtils.lerp(-.06, 1.18, THREE.MathUtils.smoothstep(d, 9.5, 13.8));
      const oldColor = d < 10 ? 0x5f8541 : d > 132 ? 0x6ea062 : 0xdfb94b;
      const outerY = paddyRoadOuterHeight(x);
      return {p:[x,d === -2 ? outerY : THREE.MathUtils.lerp(oldHeight,h,blend),z], col:new THREE.Color(oldColor).lerp(new THREE.Color(col),blend)};
    }
    for (let x = from; x < to; x += 2) {
      const next = Math.min(to,x+2);
      for (let i=1; i<distances.length; i++) {
        const lo=distances[i-1], hi=distances[i];
        const verts=[vertex(x,lo),vertex(x,hi),vertex(next,hi),vertex(next,lo)];
        if (side<0) verts.reverse();
        const surface = lo < 2.7 ? ground : crowns;
        surface.quad(...verts.map(v=>v.p), {colors:verts.map(v=>v.col)});
      }
    }

    // Near clumps overlap with loose boundaries. Further out only their lit crowns emerge.
    for (let x=from+.25; x<to; x+=rng.range(.69,1.02)) {
      for (let d=rng.range(.35,1.05); d<46; ) {
        const px=THREE.MathUtils.clamp(x+rng.range(-.58,.58),from,to);
        const roll=swell(px,d,side);
        const far=THREE.MathUtils.smoothstep(d,9,44);
        const size=rng.range(.79,1.08)*(1+.18*roll);
        const spacing=1+far*3;
        const site = vertex(px, d).p;
        const base = d < 3 ? -.30 : Math.max(-.27, site[1] - .65 * size);
        if (rng.chance((1-far*.60)*harvestWeight(px))) {
          list.push([px,base,site[2],size*(1+far*1.6),
            size*(1+far*.15),rng.range(-1.3,1.3)]);
        }
        d+=spacing*rng.range(.72,1.36)*(1-.19*roll);
      }
    }
  }
  return list;
}
