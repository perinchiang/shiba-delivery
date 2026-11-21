import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { rngFrom } from '../core/rng.js';
import { litMaterial } from '../core/materials.js';
import { bridgeJointXs, centerZ, halfWidth, roadEnd, roadHeight } from './country-route.js';
import { sign } from './shapes.js';
import { addPaddies, fieldStart, fieldEnd, fieldWindTime } from './paddy.js';
import { addGravelVerge, addWornSurface } from './road-verge.js';
import { addBankWillows } from './sample-trees.js';

const paint = litMaterial({ vertexColors: true, grid: false });
const instancePaint = litMaterial({ grid: false });
const fieldColors = [0x9ca757, 0xc1b45e, 0xaebc70, 0xc3bd73, 0x9bac69];
const roofColors = [0x806d60, 0x946b53, 0x697974];
const crown = new THREE.IcosahedronGeometry(1, 1);
const pole = new THREE.CylinderGeometry(1, 1.12, 1, 7);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function instances(group, geometry, pieces, material = instancePaint, castShadow = true) {
  if (!pieces.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
  pieces.forEach(([x, y, z, w, h, d, color], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = i * 2.4;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint.setHex(color));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

function house(builder, x, z, side, rng) {
  // Low whitewashed walls, a two-pitch tiled roof and shaded door facing the road.
  const w = rng.range(4.7, 7.1), d = rng.range(4.1, 6), h = rng.range(2.8, 4.6);
  const wall = rng.pick([0xe8d9ae, 0xcbd8bd, 0xe0c69e]), roof = rng.pick(roofColors);
  builder.box(x, h/2-.15, z, w, h+.3, d, { color: wall });
  const left = x-w/2, right = x+w/2;
  for (const sideX of [-1, 1]) {
    const gx = x + sideX*w/2;
    const gable = [[gx,h,z-d/2],[gx,h+1.08,z],[gx,h,z+d/2],[gx,h,z+d/2]];
    if (sideX<0) gable.reverse();
    builder.quad(...gable,{color:wall});
    const end = gx+sideX*.03;
    builder.box(end,h*.57,z,.08,.93,.73,{color:0x718881});
    builder.box(end+sideX*.05,h*.57,z,.06,.97,.075,{color:wall});
  }
  for (const slope of [-1, 1]) {
    const edge = z+slope*(d/2+.42);
    const points = [[left-.38,h,edge],[right+.38,h,edge],[right+.38,h+1.1,z],[left-.38,h+1.1,z]];
    if (slope < 0) points.reverse();
    builder.quad(...points, { color: roof });
    builder.box(x,h-.055,edge,w+.82,.13,.14,{color:0x655b52});
    for (let tile=1;tile<6;tile++) {
      const t = tile/6;
      builder.box(x,h+1.1*t+.005,edge+(z-edge)*t,w+.74,.035,.05,{color:roof});
    }
  }
  builder.box(x, h + 1.08, z, w+.85, .15, .21, { color: 0x625c53 });
  const front = z-side*(d/2+.03);
  builder.box(x-.65, 1, front, 1.1, 2.05, .08, { color: 0x76664f });
  builder.box(x+1.25, 1.6, front, 1.23, 1.1, .09, { color: 0x607d78 });
  builder.box(x+1.25, 1.6, front-side*.05, .09, 1.1, .05, { color: wall });
  builder.box(x, .13, front-side*.45, w, .26, .85, { color: 0xb7a98b });
  builder.box(x-.65,2.13,front-side*.18,1.56,.15,.48,{color:0x977861});
  builder.box(x-.65,1.87,front-side*.06,.92,.18,.07,{color:0xa4523d});
  for (const post of [-1,1]) builder.box(x-.65+post*.59,1.04,front-side*.07,.105,1.9,.06,{color:0xa4523d});
}

function waymark(group, builder, x, text, sub) {
  const z = centerZ(x) + halfWidth(x) + 1.0, y = roadHeight(x);
  builder.box(x, y+.85, z, .18, 1.70, .18, { color: 0x745f44 });
  builder.box(x, y+1.9, z, .13, .92, 2.65, { color: 0x5b6754 });
  const plaque = sign(group, x-.075, y+1.9, z, 2.6, .9, text,
    { bg: '#f3dfad', ink: '#435d52', sub });
  plaque.rotation.y = -Math.PI/2;
}

// One two-sided tuft for the whole route. The field chunks vary its height,
// orientation and tint without allocating thousands of copies of the vertices.
function riceGeometry() {
  const geo = new GeoBuilder();
  for (const dir of [-1,1]) {
    const tip = [dir*.17,.5,.09];
    geo.quad([-.045,0,0],[.045,0,0],tip,tip,{color:0x849844});
    geo.quad(tip,tip,[.045,0,0],[-.045,0,0],{color:0x849844});
    geo.box(dir*.19,.455,.09,.06,.135,.055,{color:0xcbb452});
  }
  return geo.build();
}
const rice = riceGeometry();

function banyan(geo, crowns, x, z) {
  const limb = (a, b, bottom, top) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), delta.clone().normalize());
    const mesh = new THREE.CylinderGeometry(top, bottom, delta.length(), 8);
    geo.add(mesh,{ color:0x856e51, m:new THREE.Matrix4().compose(start.lerp(end,.5),orientation,new THREE.Vector3(1,1,1)) });
    mesh.dispose();
  };
  geo.cylinder(x,-.3,z,.77,.54,3.75,{color:0x836e51,seg:12});
  for (let i=0; i<8; i++) {
    const a=i*2.4, r=2.4+i%3*.6;
    const dx=Math.cos(a), dz=Math.sin(a), top=4.8+(i%3)*.56;
    limb([x+dx*.32,1.5+i%2*.6,z+dz*.32],[x+dx*r,top,z+dz*r],.40,.16);
    limb([x,1.05,z],[x+dx*1.45,-.18,z+dz*1.45],.3,.09);
    crowns.push([x+dx*r,top+.72,z+dz*r,2.5,1.54,2.45,i%2 ? 0x668753 : 0x7d9259]);
    if (i%2===0) {
      geo.cylinder(x+dx*r,.04,z+dz*r,.11,.075,top,{color:0x907c57,seg:6});
      geo.cylinder(x+dx*(r+.55),2.2,z+dz*(r+.55),.028,.037,2.8,{color:0x937c52,seg:5});
    }
  }
  crowns.push([x,6.9,z,3.3,1.5,3.2,0x7d995e]);
}

function villagePavilion(group, geo) {
  const x = roadEnd+7, z = centerZ(roadEnd)+2;
  geo.box(x,-.07,z,5,.42,8,{color:0xaa9f83});
  geo.box(x-2.8,-.03,z,.85,.22,5.0,{color:0xc8b999});
  for (const dx of [-1.8,1.8]) for (const dz of [-3.2,3.2]) {
    geo.box(x+dx,.38,z+dz,.62,.6,.62,{color:0xa79c86});
    geo.cylinder(x+dx,.64,z+dz,.22,.215,2.62,{color:0xa5664c,seg:10});
    geo.box(x+dx,3.22,z+dz,.69,.26,.62,{color:0x93634d});
  }
  geo.box(x,3.43,z,4.98,.4,8.56,{color:0x825843});
  for (const side of [-1,1]) {
    const points = [[x+side*3,3.58,z-4.7],[x+side*3,3.58,z+4.7],[x,4.88,z+4.3],[x,4.88,z-4.3]];
    if (side>0) points.reverse();
    geo.quad(...points,{color:0x64736d});
    geo.box(x+side*3,3.56,z,.16,.16,9.6,{color:0x677b74});
  }
  geo.box(x,4.9,z,.26,.18,9.0,{color:0x61746e});
  for (const dz of [-2.7,2.7]) {
    geo.cylinder(x-2.08,2.46,z+dz,.33,.28,.55,{color:0xc36a48,seg:12});
    geo.box(x-2.08,3.17,z+dz,.04,.32,.04,{color:0x72523c});
    geo.box(x-2.08,2.33,z+dz,.06,.23,.06,{color:0xc79646});
  }
  for (const dz of [-2.1,2.1]) {
    geo.box(x,.64,z+dz,2.5,.18,.49,{color:0xb48b61});
    for (const dx of [-.9,.9]) geo.box(x+dx,.35,z+dz,.23,.57,.36,{color:0x8c7861});
  }
  sign(group,x-2.52,3.42,z,2.28,.58,'榕下歇脚亭',{bg:'#685743',ink:'#f0da99'}).rotation.y=-Math.PI/2;
}

// Dressed arch rings cross the water beneath the deck. Both faces use the same
// arch profile so the intrados is visible through each opening from the bank.
function addStoneBridge(geo,start,end) {
  const stone = [0x948d74,0xb0a28a,0xa39a83,0xb5ac92,0x9c967f];
  const rim = 3.68, bottom = -.94;
  for (let x=894; x<950; x+=8) {
    if (x<start || x>=end) continue;
    for(let k=0;k<10;k++) {
      const a=x+k*.8,b=a+.8;
      const ring=(i)=>-.70+1.78*Math.sin(Math.PI*i/10)**.66;
      for(const side of [-1,1]){
        const face=(px,y,offset)=>[px,y,centerZ(px)+side*(rim+offset)];
        const h0=Math.min(roadHeight(a)-.33,ring(k));
        const h1=Math.min(roadHeight(b)-.33,ring(k+1));
        const panel=[face(a,h0,0),face(b,h1,0),face(b,roadHeight(b)-.12,0),face(a,roadHeight(a)-.12,0)];
        if(side<0) panel.reverse();
        geo.quad(...panel,{color:stone[(k+1)%5]});
        const lip=[face(a,h0,.05),face(b-.015,h1,.05),face(b-.015,h1+.21,.05),face(a,h0+.21,.05)];
        if(side<0) lip.reverse();
        geo.quad(...lip,{color:stone[(k+3)%5]});
        if(k===0) {
          geo.box(a, (h0+bottom)/2,centerZ(a)+side*rim,.52,h0-bottom,.35,{color:stone[1]});
        }
        if(side===1) {
          geo.quad(face(a,h0,0),[a,h0,centerZ(a)-rim],[b,h1,centerZ(b)-rim],face(b,h1,0),{color:0x736f61});
        }
      }
    }
    for(const side of [-1,1]) {
      const balustrade = (px,y)=>[px,roadHeight(px)+y,centerZ(px)+side*3.18];
      for(let i=0;i<4;i++){
        const px=x+i*2+.94,z=centerZ(px)+side*3.18,h=roadHeight(px);
        geo.cylinder(px,h+.12,z,.12,.105,.53,{color:stone[(i+2)%5],seg:6});
        geo.box(px,h+.66,z,.24,.11,.26,{color:stone[2]});
      }
      for(const [y,thick] of [[.09,.13],[.82,.16]]){
        for(let n=0;n<8;n+=2){
          const a=x+n, b=a+2;
          const z0=balustrade(a,y)[2],z1=balustrade(b,y)[2];
          const top0=roadHeight(a)+y,top1=roadHeight(b)+y;
          const w=y>.5?.22:.16;
          geo.quad([a,top0,z0-w],[a,top0,z0+w],[b,top1,z1+w],[b,top1,z1-w],{color:0xb9ac92});
          for(const f of [-1,1]){
            const face=[[a,top0-thick,z0+f*w],[b,top1-thick,z1+f*w],[b,top1,z1+f*w],[a,top0,z0+f*w]];
            if(f<0) face.reverse();
            geo.quad(...face,{color:0x9f947d});
          }
        }
      }
    }
  }
  for (const joint of bridgeJointXs) {
    if (joint<start || joint>=end) continue;
    const steps=[[-.58,.007],[-.29,.036],[0,.07],[.29,.036],[.58,.007]];
    for(let i=1;i<steps.length;i++){
      const [oa,ha]=steps[i-1], [ob,hb]=steps[i], a=joint+oa,b=joint+ob;
      for(let slab=0;slab<4;slab++){
        const lo=-2.97+slab*1.49,hi=lo+1.48,ya=roadHeight(a)+ha,yb=roadHeight(b)+hb;
        geo.quad([a,ya,centerZ(a)+lo],[a,ya,centerZ(a)+hi],[b,yb,centerZ(b)+hi],[b,yb,centerZ(b)+lo],
          {color:[0xaa9f87,0xb3a88f,0xb6ab91,0xa99e86][slab]});
      }
    }
  }
}

function buildChunk(start, end) {
  const group = new THREE.Group(), geo = new GeoBuilder(), crowns = [], poles = [], shoots = [];
  const rng = rngFrom('榕湾村道', start);
  function ribbon(x, next, left, right, leftNext, rightNext, y0, y1, color) {
    const z = centerZ(x), z1 = centerZ(next);
    geo.quad([x,y0,z+left],[x,y0,z+right],[next,y1,z1+rightNext],[next,y1,z1+leftNext], { color });
  }
  function tree(x, z, scale) {
    const h = scale * 2.1;
    poles.push([x,h/2-.18,z,.22*scale,h,.22*scale,0x83705a]);
    for (let k=0; k<5; k++) {
      const a = k*2.4+1.4;
      crowns.push([x+Math.sin(a)*scale*.94,h+scale*(k===0 ? 1.4 : .37+(k%3)*.3),z+Math.cos(a)*scale*.94,
        1.35*scale,1.18*scale,1.23*scale,rng.pick([0x79965a,0x678852,0x8aa463])]);
    }
  }
  for (let x=start; x<end; x+=2) {
    const nx = Math.min(x+2,end), width = halfWidth(x), width1 = halfWidth(nx);
    const h = roadHeight(x), h1 = roadHeight(nx);
    const river = x >= 894 && x < 950;
    const field = x >= 190 && x < 1090;
    const surface = river ? 0xb4aa95 : field ? 0xb9b39f : 0xaaa598;
    const inSample = x>=fieldStart && x<fieldEnd;
    if (inSample) addWornSurface(geo,x,nx);
    else ribbon(x,nx,-width,width,-width1,width1,h,h1,surface);
    for (const side of [-1,1]) {
      const band = (lo,hi,lo1,hi1,y,y1,color) => side > 0
        ? ribbon(x,nx,lo,hi,lo1,hi1,y,y1,color)
        : ribbon(x,nx,-hi,-lo,-hi1,-lo1,y,y1,color);
      band(width,width+.75,width1,width1+.75,h,h1,river ? 0xb8b2a5 : 0xbda987);
      if (river) {
        if (x%8===0) {
          geo.box(x,h-.38,centerZ(x)+side*width,.82,.78,.48,{color:0xada58e});
          geo.box(x,-.07,centerZ(x)+side*(width-.3),.9,2.22,.82,{color:0x9c9987});
        }
        const deckZ = centerZ(x)+side*(width+.75), deckNext = centerZ(nx)+side*(width1+.75);
        const fascia = [[x,h,deckZ],[nx,h1,deckNext],[nx,h1-.33,deckNext],[x,h-.33,deckZ]];
        if (side > 0) fascia.reverse();
        geo.quad(...fascia,{color:0xb1a991});
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
      // Grade the outer shoulder down to the paddy rather than leaving a floating edge.
      function bankPoint(px, lateral, y) { return [px,y,centerZ(px)+side*lateral]; }
      const foot = inSample ? 5.0 : 8;
      const bank = [bankPoint(x,width+.75,h),bankPoint(x,foot,-.22),
        bankPoint(nx,foot,-.22),bankPoint(nx,width1+.75,h1)];
      if (side < 0) bank.reverse();
      geo.quad(...bank,{color:0x9ca36a});
      if (inSample) {
        band(foot,225,foot,225,-.235,-.235,0x8b975d);
        continue;
      }
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

  }
  for (let x=start+.6;x<end;x+=1.3) {
    if (x>=894 && x<950) {
      for (const side of [-1,1]) {
        const z = centerZ(x)+side*rng.range(8,38);
        geo.floor(x,z,x+rng.range(.25,1.3),z+.08,-.868,{color:0xa3c4b1});
      }
      continue;
    }
    if (x<214 || x>1050 || (x>=fieldStart && x<fieldEnd)) continue;
    for (const side of [-1,1]) {
      const z = centerZ(x);
      for (let row=0;row<7;row++) {
        const px = x + rng.range(-.26,.26);
        const pz = z + side*(8.8 + row*1.65 + rng.range(-.14,.14));
        shoots.push([px,-.22,pz,1,rng.range(.7,1.26),1,0xffffff]);
      }
    }
  }
  for (let x=start+28; x<end; x+=55) {
    if (x<190 || x>850) continue;
    const z = centerZ(x)+5.1;
    // Split bamboo field fence with two staggered rails.
    for (let j=0;j<4;j++) geo.cylinder(x+j*1.55,-.14,z,.063,.052,.90,{color:0xa78c52,seg:6});
    for (const y of [.30,.61]) geo.box(x+2.33,y,z,4.8,.064,.07,{color:0xc1a572});
  }
  for (let x=start+8; x<end-1; x+=14) {
    if (x>860 && x<977) continue;
    const z = centerZ(x), side = rng.sign();
    if (x<204 || x>1070) {
      house(geo,x,z+side*rng.range(8.4,13.8),side,rng);
      if (rng.chance(.55)) house(geo,x+2,z-side*rng.range(12,22),-side,rng);
    }
    if (rng.chance(.75) && (x<fieldStart || x>=fieldEnd)) tree(x, z-side*rng.range(5.8,20), rng.range(1.0,2.25));
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
  for (const bankX of [894,950]) {
    if (bankX>=start && bankX<end) {
      const z = centerZ(bankX);
      for (const side of [-1,1]) {
        const near = z+side*8, far = z+side*225;
        const edge = [[bankX,-.22,near],[bankX,-.22,far],[bankX,-.91,far],[bankX,-.91,near]];
        if ((bankX===950) === (side>0)) edge.reverse();
        geo.quad(...edge,{color:0xa49c78});
      }
    }
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
    villagePavilion(group,geo);
    banyan(geo,crowns,roadEnd+7,centerZ(roadEnd)-5.9);
    for (let i=0; i<6; i++) {
      crowns.push([roadEnd+85+i%2*36,-8,centerZ(roadEnd)-118+i*46,
        31+i%2*12,22+i%3*7,36, i%2 ? 0x92a98b : 0x869c81]);
    }
    geo.box(roadEnd+29,-.42,centerZ(roadEnd),58,.36,185,{color:0xa3b58c});
  }
  addPaddies(group,geo,start,end);
  addStoneBridge(geo,start,end);
  addGravelVerge(geo,start,end);
  addBankWillows(geo,start,end);
  const mesh = geo.mesh(paint);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  instances(group,crown,crowns);
  instances(group,pole,poles);
  instances(group,rice,shoots,paint,false);
  return group;
}

function morningSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color(0xffe8b8) }, zenith: { value: new THREE.Color(0x94c9d2) } },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 horizon, zenith;
      void main() {
        vec3 dir = normalize(direction);
        float height = smoothstep(-.035, .46, dir.y);
        vec3 daylight = mix(horizon, zenith, height);
        // Distant ridges are fixed on the compass even when the rider turns back.
        float az = atan(dir.z, dir.x);
        float ridge = .058 + .038*sin(3.*az+.6) + .023*cos(7.*az-1.) + .010*sin(15.*az);
        float foothill = .027 + .021*cos(4.*az+1.2) + .013*sin(9.*az+.3);
        float cloudHeight = dir.y - (.205 + .016*sin(5.*az));
        float wisps = exp(-cloudHeight*cloudHeight*3400.) *
          smoothstep(.50,1.05,cos(3.*az-.55) + .23*sin(10.*az));
        daylight = mix(daylight, vec3(.94,.89,.70), .42*wisps);
        daylight = mix(daylight, vec3(.52,.61,.54), .65*(1.-smoothstep(ridge-.002,ridge+.002,dir.y)));
        daylight = mix(daylight, vec3(.39,.51,.42), .51*(1.-smoothstep(foothill-.002,foothill+.002,dir.y)));
        float sun = max(0.0, dot(dir, normalize(vec3(.95,.21,-.38))));
        daylight += vec3(.4,.22,.06)*pow(sun,24.) + vec3(1.6,1.2,.8)*smoothstep(.9996,.99994,sun);
        gl_FragColor = vec4(daylight,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(55,32,16),material);
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  return sky;
}

export function createCountryside() {
  const root = new THREE.Group();
  const chunks = new Map();
  const sky = morningSky();
  root.add(sky);
  // The street's base slab ends at x=52. Generate only nearby stretches as needed.
  return { root, sky, update(x, time) {
    fieldWindTime.value = time;
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
