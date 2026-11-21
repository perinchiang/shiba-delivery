import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { rngFrom } from '../core/rng.js';
import { litMaterial } from '../core/materials.js';
import { centerZ, halfWidth, roadEnd, roadHeight } from './country-route.js';
import { sign } from './shapes.js';

const paint = litMaterial({ vertexColors: true, grid: false });
const fieldColors = [0x9ca757, 0xc1b45e, 0xaebc70, 0xc3bd73, 0x9bac69];
const roofColors = [0x806d60, 0x946b53, 0x697974];
const crown = new THREE.IcosahedronGeometry(1, 1);
const pole = new THREE.CylinderGeometry(1, 1.12, 1, 7);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function instances(group, geometry, pieces) {
  if (!pieces.length) return;
  const mesh = new THREE.InstancedMesh(geometry, litMaterial({ grid: false }), pieces.length);
  pieces.forEach(([x, y, z, w, h, d, color], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = i * 2.4;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint.setHex(color));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

function house(builder, x, z, side, rng) {
  // Low whitewashed walls, a two-pitch tiled roof and shaded door facing the road.
  const w = rng.range(4.7, 7.1), d = rng.range(4.1, 6), h = rng.range(2.8, 4.6);
  const wall = rng.pick([0xe8d9ae, 0xcbd8bd, 0xe0c69e]), roof = rng.pick(roofColors);
  builder.box(x, h/2-.15, z, w, h+.3, d, { color: wall });
  for (const slope of [-1, 1]) {
    const a = x-w/2-.38, b = x+w/2+.38, edge = z+slope*(d/2+.42);
    const points = [[a,h,edge],[b,h,edge],[b,h+1.1,z],[a,h+1.1,z]];
    if (slope < 0) points.reverse();
    builder.quad(...points, { color: roof });
  }
  builder.box(x, h + 1.05, z, w+.85, .15, .21, { color: 0x625c53 });
  const front = z-side*(d/2+.03);
  builder.box(x-.65, 1, front, 1.1, 2.05, .08, { color: 0x76664f });
  builder.box(x+1.25, 1.6, front, 1.23, 1.1, .09, { color: 0x607d78 });
  builder.box(x+1.25, 1.6, front-side*.05, .09, 1.1, .05, { color: wall });
  builder.box(x, .13, front-side*.45, w, .26, .85, { color: 0xb7a98b });
}

function waymark(group, builder, x, text, sub) {
  const z = centerZ(x) + halfWidth(x) + 1.0, y = roadHeight(x);
  builder.box(x, y+.85, z, .18, 1.70, .18, { color: 0x745f44 });
  builder.box(x, y+1.9, z, .13, .92, 2.65, { color: 0x5b6754 });
  const plaque = sign(group, x-.075, y+1.9, z, 2.6, .9, text,
    { bg: '#f3dfad', ink: '#435d52', sub });
  plaque.rotation.y = -Math.PI/2;
}

function buildChunk(start, end) {
  const group = new THREE.Group(), geo = new GeoBuilder(), crowns = [], poles = [];
  const rng = rngFrom('榕湾村道', start);
  function ribbon(x, next, left, right, leftNext, rightNext, y0, y1, color) {
    const z = centerZ(x), z1 = centerZ(next);
    geo.quad([x,y0,z+left],[x,y0,z+right],[next,y1,z1+rightNext],[next,y1,z1+leftNext], { color });
  }
  function tree(x, z, scale) {
    const h = scale * 2.1;
    poles.push([x,h/2-.18,z,.22*scale,h,.22*scale,0x83705a]);
    for (let k=0; k<3; k++) {
      const a = k*2.1+1.4;
      crowns.push([x+Math.sin(a)*scale*.65,h+scale*(k===0 ? 1.1 : .6),z+Math.cos(a)*scale*.65,
        1.35*scale,1.18*scale,1.23*scale,rng.pick([0x79965a,0x678852,0x8aa463])]);
    }
  }
  for (let x=start; x<end; x+=2) {
    const nx = Math.min(x+2,end), width = halfWidth(x), width1 = halfWidth(nx);
    const h = roadHeight(x), h1 = roadHeight(nx);
    const river = x >= 894 && x < 950;
    const field = x >= 190 && x < 1090;
    const surface = river ? 0xb4aa95 : field ? 0xb9b39f : 0xaaa598;
    ribbon(x,nx,-width,width,-width1,width1,h,h1,surface);
    for (const side of [-1,1]) {
      const band = (lo,hi,lo1,hi1,y,y1,color) => side > 0
        ? ribbon(x,nx,lo,hi,lo1,hi1,y,y1,color)
        : ribbon(x,nx,-hi,-lo,-hi1,-lo1,y,y1,color);
      band(width,width+.75,width1,width1+.75,h,h1,river ? 0xb8b2a5 : 0xbda987);
      if (river) {
        band(0,220,0,220,-.88,-.88,0x7baaa3);
        if (x%8===0) {
          geo.box(x,h+.48,centerZ(x)+side*(width+.22),.35,1.02,.38,{ color:0xc1baa3 });
          geo.box(x,h+1.02,centerZ(x)+side*(width+.22),.43,.13,.45,{ color:0xd4c8ac });
        }
        const rail = side*(width+.22), rail1 = side*(width1+.22);
        const a = centerZ(x)+rail, b = centerZ(nx)+rail1;
        geo.quad([x,h+.70,a],[x,h+.85,a],[nx,h1+.85,b],[nx,h1+.70,b],{ color:0x998d78 });
        geo.quad([nx,h1+.70,b],[nx,h1+.85,b],[x,h+.85,a],[x,h+.70,a],{ color:0x998d78 });
        continue;
      }
      band(width+.75,8,width1+.75,8,h,h1,0x9ca36a);
      for (let row=0; row<4; row++) {
        const lo = 8 + 19*row, hi = lo+19;
        const parcel = Math.floor((x+13*row)/42);
        const color = field ? fieldColors[(parcel+row+(side+1))%fieldColors.length] : 0x9ba77b;
        band(lo,hi,lo,hi,-.22,-.22,x%42<2 && field ? 0xb5a681 : color);
        if (field) {
          band(lo,lo+.48,lo,lo+.48,-.19,-.19,0xa39365);
          for (let line=1; line<=4; line++) {
            const offset = lo + 3.6*line;
            band(offset,offset+.34,offset,offset+.34,-.205,-.205,0xc4be7d);
          }
        }
      }
      band(84,225,84,225,-.24,-.24,0xa3b58c);
    }
    if (x<200 && x%12<4) ribbon(x,nx,-.075,.075,-.075,.075,h+.012,h1+.012,0xe7dcb7);
    if (river && x%4===0) ribbon(x,x+.12,-width,width,-width,width,h+.012,h+.012,0x9c9686);
  }
  for (let x=start+8; x<end-1; x+=14) {
    if (x>860 && x<977) continue;
    const z = centerZ(x), side = rng.sign();
    if (x<204 || x>1070) {
      house(geo,x,z+side*rng.range(8.4,13.8),side,rng);
      if (rng.chance(.55)) house(geo,x+2,z-side*rng.range(12,22),-side,rng);
    }
    if (rng.chance(.75)) tree(x, z-side*rng.range(5.8,20), rng.range(1.0,2.25));
    if (rng.chance(.32)) tree(x+5, z+side*rng.range(18,47), rng.range(1.2,2.4));
  }
  // Chunk boundaries share pole locations; each span belongs to its western end.
  for (let x=Math.ceil(start/36)*36; x<end; x+=36) {
    if (x>=880 && x<970) continue;
    const z=centerZ(x)-6;
    poles.push([x,2.9,z,.12,6.2,.12,0x8b8173]);
    geo.box(x,5.65,z,.23,.19,1.8,{ color:0x665b50 });
    if (x+36>=roadEnd || (x+36>=880 && x+36<970)) continue;
    for (const offset of [-.66,.66]) {
      for (let k=0;k<6;k++) {
        function wire(t) { return [x+t*36,5.8-1.8*t*(1-t),z+(centerZ(x+36)-centerZ(x))*t+offset]; }
        const a=wire(k/6), b=wire((k+1)/6);
        geo.quad(a,[a[0],a[1]+.04,a[2]],[b[0],b[1]+.04,b[2]],b,{color:0x686957});
      }
    }
  }
  for (let x=start+45; x<end; x+=65) {
    for (const side of [-1,1]) crowns.push([x,-7,centerZ(x)+side*rng.range(115,170),
      rng.range(46,85),rng.range(18,36),rng.range(27,48),rng.pick([0x829b85,0x91a78c])]);
  }
  if (start<=138 && end>138) {
    const z = centerZ(138);
    for (const side of [-1,1]) {
      geo.box(138,2.04,z+side*4.65,.67,4.4,.67,{color:0xc9b499});
      geo.box(138,.38,z+side*4.65,1,.8,1,{color:0x9d9987});
    }
    geo.box(138,4.28,z,1.03,.7,10.6,{color:0xd5c3a4});
    geo.box(138,4.75,z,1.6,.28,11.4,{color:0x757e6b});
    sign(group,137.46,4.3,z,2.5,.6,'榕湾',{ink:'#624e3e',bg:'#e2c798'}).rotation.y=-Math.PI/2;
  }
  for (const [x,title,sub] of [[56,'榕湾村道','向东 · 田间慢行'],[395,'稻田','小桥在前方'],[876,'石桥','慢行过桥'],[1180,'榕树村','村口可掉头']]) {
    if (x>=start && x<end) waymark(group,geo,x,title,sub);
  }
  if (start<roadEnd && end===roadEnd) {
    tree(roadEnd+4,centerZ(roadEnd)-4,3.5);
    geo.box(roadEnd+29,-.42,centerZ(roadEnd),58,.36,185,{color:0xa3b58c});
  }
  const mesh = geo.mesh(paint);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  instances(group,crown,crowns);
  instances(group,pole,poles);
  return group;
}

export function createCountryside() {
  const root = new THREE.Group();
  const chunks = new Map();
  // The street's base slab ends at x=52. Generate only nearby stretches as needed.
  return { root, update(x) {
    const current = Math.floor((x-52)/100);
    for (let i=Math.max(0,current-2); i<=current+2 && 52+i*100<roadEnd; i++) {
      if (chunks.has(i)) continue;
      const start=52+i*100, part=buildChunk(start,Math.min(start+100,roadEnd));
      chunks.set(i,part);
      root.add(part);
    }
    for (const [i,part] of chunks) part.visible = Math.abs(i-current)<=2;
  } };
}
