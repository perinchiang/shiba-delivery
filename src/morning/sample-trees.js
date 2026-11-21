import * as THREE from 'three';
import { centerZ } from './country-route.js';
import { rngFrom } from '../core/rng.js';

const foliage = new THREE.SphereGeometry(1, 12, 7);
const leafPositions = foliage.attributes.position;
const tones = [];
for (let i = 0; i < leafPositions.count; i++) {
  const x = leafPositions.getX(i), y = leafPositions.getY(i), z = leafPositions.getZ(i);
  const bulge = 1 + .11 * Math.sin(5*x + 3*z) + .09 * Math.cos(6*z - 3*y);
  leafPositions.setXYZ(i, x*bulge + .12*y, y*(1 + .08*Math.sin(7*x)) - .12*x, z*bulge);
  const light = .82 + .18*y;
  tones.push(light, light, light);
}
foliage.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
foliage.computeVertexNormals();

const unitUp = new THREE.Vector3(0,1,0);
const wood = new THREE.CylinderGeometry(.65, 1, 1, 8);
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
const vec = (x,y,z) => new THREE.Vector3(x,y,z);
function limb(geo, base, tip, radius) {
  const axis = tip.clone().sub(base);
  const length = axis.length();
  quaternion.setFromUnitVectors(unitUp, axis.normalize());
  matrix.compose(base.clone().lerp(tip,.5), quaternion, vec(radius,length,radius));
  geo.add(wood, {color:0x776c53, m:matrix});
}

function tree(geo, x, offset, size) {
  const rng = rngFrom('水柳', x);
  const fork = vec(.38, 2.5, .2);
  geo.at(x,-.22,centerZ(x)+offset,rng.range(0,6),()=>{
    const scaled = new THREE.Matrix4().makeScale(size,size,size);
    geo.with(scaled,()=>{
      limb(geo, vec(0,-.15,0), fork, .34);
      for (let i = 0; i < 7; i++) {
        const a = i*2.4, reach = i === 0 ? .45 : rng.range(1.9,3.05);
        const top = vec(Math.cos(a)*reach, rng.range(3.8,4.9) + (i===0 ? 1.1 : 0), Math.sin(a)*reach);
        const elbow = fork.clone().lerp(top,.55);
        elbow.y -= .35;
        limb(geo, fork, elbow, .17);
        limb(geo, elbow, top, .11);
        const leafy = rng.pick([0x809b57,0x92a961,0x769450,0x8aa25b]);
        quaternion.setFromAxisAngle(unitUp,a);
        matrix.compose(top, quaternion, vec(1.75,1.25,1.65));
        geo.add(foliage, {color:leafy,m:matrix});
        for (let j = 0; j < 18; j++) {
          const t = j*2.4 + a;
          const r = rng.range(1.24,1.65), length = rng.range(1.1,2.4);
          const sx = Math.cos(t), sz = Math.sin(t);
          const at = top.clone().add(vec(r*sx,-.25,r*sz));
          for (let k = 0; k < 6; k++) {
            const f = k/6;
            const curve = Math.sin(f*1.65)*.34;
            const tx = at.x + sx*curve + f*.18, ty = at.y - f*length, tz = at.z + sz*curve;
            const bend = k%2 ? .085 : -.085;
            const coords = [
              [tx,ty,tz],
              [tx+sz*bend-sx*.052,ty-.13,tz-sx*bend-sz*.052],
              [tx+sz*bend*.6+.03,ty-length/6-.09,tz-sx*bend*.6],
              [tx+sx*.044,ty-.10,tz+sz*.044],
            ];
            const shade = rng.pick([0x98b567,0x8fa957,0x718e4e]);
            geo.quad(...coords,{color:shade});
            geo.quad(...coords.reverse(),{color:shade});
            const spine = [
              [tx-.012,ty+.025,tz],[tx+.012,ty+.025,tz],
              [tx+.038,ty-length/6-.04,tz+.026],[tx+.018,ty-length/6-.04,tz+.026],
            ];
            geo.quad(...spine,{color:0x707f49});
            geo.quad(...spine.reverse(),{color:0x707f49});
          }
        }
      }
    });
  });
}

export function addBankWillows(geo, start, end) {
  for (const [x, offset, size] of [[767,16,1.16],[815,-8.8,.94],[893.7,11.4,1.23],[957,-24,1.42]]) {
    if (x >= start && x < end) tree(geo,x,offset,size);
  }
}
