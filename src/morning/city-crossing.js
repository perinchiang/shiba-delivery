// One city block between the old shopping street and the east gate.
import * as THREE from 'three';
import { crossing } from './country-route.js';
import { bake, box, cylinder, group, oval, sign } from './shapes.js';

const ivory = 0xf5ddac, trim = 0xe3c99e, glass = 0x607f80, metal = 0x435953;
const pavement = 0xd7c7ab, ink = 0x354e51, paint = 0xf3e6c9;

function facade(parent, width, floors, accent) {
  const bays = Math.floor(width / 2.8), step = width / bays;
  for (let i = 0; i < bays; i++) {
    const x = (i + .5) * step - width / 2;
    box(parent, x, 1.48, .04, step - .32, 2.65, .12, glass);
    box(parent, x, 1.5, .13, .09, 2.65, .08, ivory);
    box(parent, x, .48, .14, step - .42, .68, .1, accent);
    box(parent, x - step / 2 + .11, 1.65, .22, .28, 3.3, .45, trim);
    for (let f = 0; f < floors; f++) {
      const y = 5.05 + f * 2.8;
      box(parent, x, y, .06, step * .65, 1.78, .17, ivory);
      box(parent, x, y, .16, step * .55, 1.50, .10, glass);
      box(parent, x, y + .06, .24, .08, 1.5, .07, trim);
      box(parent, x, y - .81, .22, step * .72, .12, .44, trim);
    }
  }
  box(parent, 0, 3.28, .47, width + .24, .26, 1.04, accent);
  box(parent, 0, 3.12, .93, width + .24, .09, .12, ivory);
}

// Fittings on the corner shops give each approach a different silhouette.
function cornerShop(front, end, name, accent) {
  if (name === '榕湾百货') {
    const blade = group(end, 2.9, 6.55, .84);
    box(blade, 0, 0, 0, 1.18, 4.7, .38, 0x874e42, .1);
    sign(blade, 0, 0, .20, 1.04, 4.52, '榕湾百货',
      {bg:'#a65748',ink:'#fff0c9',vertical:true});
    for (const y of [-1.6,1.6]) box(end, 2.9, 6.55+y, .39, .17,.16,.88, metal);
    for (const x of [-3.4,0,3.4]) {
      for (let i=0;i<3;i++) box(front,x+(i-1)*.44,1.12+i*.16,.18,.37,.76,.10,[0xcb9b61,0xb47568,0x83a39a][i]);
    }
  } else {
    const fabric = name === '南方冰室' ? 0x578f84 : name === '春风书局' ? 0x849c85 : 0xb56d53;
    for (let i=0;i<11;i++) {
      const x=(i-5)*.63, tint=i%2 ? ivory : fabric;
      box(end,x,2.91,.89,.63,.11,1.64,tint).rotation.x=.15;
      box(end,x,2.70,1.68,.63,.23,.09,tint);
    }
    if (name === '南方冰室') {
      for (const x of [-2.15,1.65]) {
        cylinder(end,x,.89,1.38,.48,.48,.1,0xbaa477);
        cylinder(end,x,.49,1.38,.065,.12,.76,metal);
        for (const side of [-1,1]) {
          cylinder(end,x+side*.67,.49,1.36,.24,.24,.11,accent);
          cylinder(end,x+side*.67,.28,1.36,.09,.14,.42,metal);
        }
      }
    } else if (name === '春风书局') {
      box(end,0,.87,.89,3.4,1.36,.57,0x976f52);
      for (let row=0;row<2;row++) for(let i=0;i<8;i++) {
        box(end,(i-3.5)*.38,.59+row*.58,1.19,.28,.41+.05*(i%2),.07,
          [0xc17c69,0x89a395,0xdab86c,0xa0b6b2][(i+row)%4]).rotation.z=(i%3-1)*.06;
      }
    } else {
      for(const x of [-2.65,2.65]) {
        cylinder(end,x,2.26,1.4,.28,.25,.49,0xc77751);
        cylinder(end,x,2.56,1.4,.20,.24,.1,ivory);
        box(end,x,1.91,1.4,.06,.21,.06,0xca994c);
      }
    }
  }
}

function block(root, x, z, width, depth, floors, sideX, sideZ, wall, accent, name) {
  const b = group(root, x, 0, z), h = 4.0 + floors * 2.8;
  box(b, 0, h/2, 0, width, h, depth, wall);
  box(b, 0, h-.12, 0, width+.45, .28, depth+.45, ivory);
  box(b, 0, h+.20, 0, width-.25, .43, depth-.25, accent);
  box(b, 0, h+.43, 0, width+.18, .12, depth+.18, trim);
  const front = group(b, 0, 0, -sideZ * depth/2);
  front.rotation.y = sideZ < 0 ? 0 : Math.PI;
  facade(front, width, floors, accent);
  const end = group(b, -sideX*width/2, 0, 0);
  end.rotation.y = -sideX * Math.PI/2;
  facade(end, depth, floors, accent);
  if (name) {
    cornerShop(front,end,name,accent);
    box(front, 0, 3.66, .32, width*.82, .87, .46, accent);
    sign(front, 0, 3.67, .56, width*.78, .73, name, { bg: '#f6dfad', ink: '#345e56' });
  }
  if (!name) {
    for (const y of [4.45,7.25].slice(0,floors)) {
      box(end,0,y, .45, depth*.64,.17,.99,ivory);
      for(const k of [-1,0,1]) box(end,k*depth*.30,y+.32,.92,.075,.62,.075,accent);
      box(end,0,y+.64,.92,depth*.64,.09,.08,accent);
      box(end,0,y+.25,.92,depth*.64,.06,.07,accent);
    }
  }
}

function clockTower(root) {
  const tower = group(root, 12.7, 0, -12.6);
  box(tower, 0, 8.7, 0, 3.6, 7.8, 3.6, 0xd99a78);
  box(tower, 0, 12.62, 0, 4, .36, 4, ivory);
  box(tower, 0, 13.02, 0, 3.15, .48, 3.15, 0x56867d);
  box(tower, 0, 13.42, 0, 2.15, .4, 2.15, 0x44756f);
  for (const angle of [0, -Math.PI/2]) {
    const face = group(tower, 0, 10.94, 0);
    face.rotation.y = angle;
    const rim = cylinder(face, 0, 0, 1.84, 1.14, 1.14, .14, metal, 32);
    rim.rotation.x = Math.PI/2;
    const dial = cylinder(face, 0, 0, 1.93, 1.02, 1.02, .08, ivory, 32);
    dial.rotation.x = Math.PI/2;
    for (let i=0; i<12; i++) {
      const a = i*Math.PI/6;
      box(face, .86*Math.sin(a), .86*Math.cos(a), 1.99, .055, .16, .035, metal).rotation.z = -a;
    }
    box(face, .21, .20, 2.04, .085, .64, .05, ink).rotation.z = -.80;
    box(face, -.14, -.32, 2.06, .07, .77, .05, ink).rotation.z = -.42;
  }
}

function planeTree(root, x, z) {
  box(root, x, .17, z, 1.85, .32, 1.85, trim);
  box(root, x, .35, z, 1.53, .07, 1.53, 0x947a59);
  cylinder(root, x, 1.62, z, .14, .22, 2.6, 0x8a694d, 9);
  for (const [dx,y,dz,s,c] of [[0,4.1,0,1.55,0x78a384],[-.86,3.5,.13,1.14,0x699674],[.78,3.72,-.23,1.18,0x87ac77]]) {
    oval(root,x+dx,y,z+dz,s,s*.86,s*.92,c,true);
  }
}

export function createCityCrossing(parent) {
  const { x, z, half, arm } = crossing;
  const root = group(parent, x, 0, z);
  // The main road already runs through the junction. Lay the side streets flush
  // over the graded shoulders, leaving the central square clear of lane paint.
  for (const side of [-1,1]) {
    const length = arm - half + 2;
    box(root, 0, -.036, side*(half + length/2), half*2, .095, length, 0xa19f94);
    for (const flank of [-1,1]) {
      box(root, flank*(half+1.55), -.025, side*(half+length/2), 3.1, .28, length, pavement);
    }
    box(root, 0, -.025, side*(arm+2.9), 17.2, .28, 2.1, pavement);
    box(root, 0, .58, side*(arm+4.2), 17.2, 1.22, .45, trim);
    for (const k of [-1,1]) planeTree(root, k*4, side*(arm+5.8));
  }

  const signalHeads = [];
  for (let i=0; i<4; i++) {
    const a = group(root);
    a.rotation.y = i*Math.PI/2;
    for (let j=-5; j<=5; j++) box(a, j*.92, .026, half+1.9, .47, .018, 2.35, paint);
    box(a, half/2, .026, half+4.0, half-.4, .018, .23, paint);
    for (const dx of [-.13,.13]) box(a, dx, .027, half+9.4, .09, .018, 10.4, 0xe3bd71);
    if (i%2 === 0) {
      for (let d=23; d<arm-2; d+=7) box(a, 0, .023, d, .12, .016, 2.8, 0xe5cc93);
    }
    const pole = group(a, half+1.1, 0, -(half+1.05));
    cylinder(pole, 0, .28, 0, .24, .32, .57, 0x777f74);
    cylinder(pole, 0, 2.84, 0, .085, .16, 5.34, metal);
    box(pole, -1.88, 5.41, 0, 3.92, .14, .14, metal);
    box(pole, -3.65, 4.77, 0, .66, 1.66, .42, ink, .09);
    for (let l=0; l<3; l++) {
      box(pole, -3.65, 5.35-l*.49, .23, .54, .095, .52, ink);
      const at = new THREE.Vector3(-3.65, 5.2-l*.49, .24);
      pole.localToWorld(at);
      root.worldToLocal(at);
      signalHeads.push({at, axis:i%2, lamp:l});
    }
  }
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    box(root, sx*17, -.025, sz*(half+1.45), 23, .28, 2.9, pavement);
    const east = sx>0, north = sz<0;
    const wall = east ? north ? 0xe9bb96 : 0xc5d1be : north ? 0xd2d8b6 : 0xe4cda7;
    const accent = east ? north ? 0xb26e55 : 0x748b78 : north ? 0x668f85 : 0xbb825e;
    block(root, sx*16.7, sz*14.0, 15, 10.4, east && !north ? 3 : 2, sx,sz,wall,accent,
      east ? north ? '榕湾百货' : '南方冰室' : north ? '春风书局' : '海棠茶行');
    for (const [j,d] of [25.5,38,48].entries()) {
      block(root, sx*(13.9+j%2), sz*d, 9.2, j===2?6.5:10.3, 1+(j+Number(east))%3, sx,sz,
        [0xddd1b3,0xcebbab,0xc1cebf][j], accent, '');
    }
    planeTree(root, sx*7.25, sz*20.3);
    planeTree(root, sx*24.8, sz*7.5);
    planeTree(root, sx*7.15, sz*36);
  }
  clockTower(root);
  // Enamel street blade at the east corner faces riders arriving from old town.
  const blade = group(root, 7.2, 0, 8.1);
  blade.rotation.y = -Math.PI/2;
  cylinder(blade, 0, 1.85, 0, .075,.095,3.7,metal);
  box(blade, 0, 3.48, 0, 3.1,.71,.13,metal);
  sign(blade, 0, 3.48, .075, 3,.65,'榕湾中路',{bg:'#346e69',ink:'#fff2cd',font:'hei'});
  bake(root);

  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8), new THREE.MeshBasicMaterial(), signalHeads.length);
  const disk = new THREE.Object3D(), color = new THREE.Color();
  signalHeads.forEach(({at},i) => {
    disk.position.copy(at);
    disk.scale.set(.198,.198,.117);
    disk.rotation.y = Math.floor(i/3)*Math.PI/2;
    disk.updateMatrix();
    lamps.setMatrixAt(i,disk.matrix);
  });
  root.add(lamps);
  let last = -1;
  return time => {
    const t = time%22, phase = t<9?0:t<11?1:t<20?2:3;
    if (last===phase) return;
    last=phase;
    signalHeads.forEach(({axis,lamp},i) => {
      const active = axis !== Math.floor(phase/2) ? 0 : phase%2 ? 1 : 2;
      lamps.setColorAt(i,color.setHex(active===lamp ? [0xff6045,0xffca50,0x6cf3ae][lamp] : 0x384641));
    });
    lamps.instanceColor.needsUpdate = true;
  };
}
