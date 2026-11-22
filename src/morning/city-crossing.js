// Warm miniature city crossing: a handcrafted bridge between Old Street and the gate.
import * as THREE from 'three';
import { placeInstances } from './kit-instances.js';
import { crossing } from './country-route.js';
import { cityTreePits, cityTreePitRadius, CURB_H } from './street-layout.js';
import { CITY_PALETTE as P, CROSSING_TREE_SCALE } from './city-palette.js';
import { bake, box, cylinder, group, oval, piece, rod, sign } from './shapes.js';

const { Shape, ExtrudeGeometry } = THREE;

function layeredWindow(parent, x, y, z, w, h, accent, shutters = false) {
  // Local +Z is the street-facing side for both rotated facade groups.
  box(parent, x, y, z, w + .22, h + .22, .12, P.trimCream, .035);
  box(parent, x, y, z + .10, w, h, .06, P.glass, .018);
  box(parent, x - w * .22, y + h * .20, z + .14, w * .38, h * .24, .025, P.glassLight);
  box(parent, x, y, z + .16, .055, h, .035, P.trimWarm);
  box(parent, x, y - h / 2 - .05, z + .19, w + .30, .10, .24, P.trimWarm, .03);
  if (shutters) {
    box(parent, x - (w / 2 + .19), y, z + .02, .12, h + .10, .10, accent, .02);
    box(parent, x + (w / 2 + .19), y, z + .02, .12, h + .10, .10, accent, .02);
  }
}

function facade(parent, width, floors, accent, style = 'standard') {
  const bays = Math.max(2, Math.floor(width / 2.8)), step = width / bays;
  for (let i = 0; i < bays; i++) {
    const x = (i + .5) * step - width / 2;
    for (let f = 0; f < floors; f++) {
      const y = 4.78 + f * 2.72;
      layeredWindow(parent, x, y, .04, step * .62, 1.34, accent,
        style === 'jade' || (style === 'heritage' && (i + f) % 2 === 0));
      if (style === 'flower' && f > 0) {
        box(parent, x, y - .78, .27, step * .38, .12, .22, P.terracotta);
        oval(parent, x - step * .13, y - .62, .10, .10, .13, .08, P.jade, true);
        oval(parent, x + step * .10, y - .61, .09, .09, .12, .07, P.jade, true);
      }
    }
  }
  for (let f = 0; f <= floors; f++) box(parent, 0, 3.28 + f * 2.72, .28, width + .28, .14, .34, f % 2 ? P.trimWarm : P.trimCream);
}

function scallopedAwning(parent, width, y = 3.05, accent = P.teal) {
  box(parent, 0, y, .62, width, .12, .76, accent, .04).rotation.x = .20;
  for (let i = 0; i < Math.ceil(width / .54); i++) {
    const x = (i + .5) * .54 - width / 2;
    box(parent, x, y - .27, 1.18, .52, .24, .16, i % 2 ? P.trimCream : accent, .06);
  }
}

function balcony(parent, width, y, z, accent = P.woodDark) {
  box(parent, 0, y, .48, width, .12, .95, P.wood);
  rod(parent, [-width / 2, y, .90], [width / 2, y, .90], .055, accent);
  for (let x = -width / 2 + .18; x < width / 2; x += .42) {
    rod(parent, [x, y - .05, .48], [x, y + .54, .90], .035, accent);
  }
  rod(parent, [-width / 2, y + .54, .90], [width / 2, y + .54, .90], .05, accent);
}

function cornerShop(front, end, name, accent) {
  if (name === '榕湾百货') {
    // Deep arcade bays and showcase blocks make the ground floor read at chase scale.
    box(front, 0, 2.15, .12, 12.9, 2.5, .08, P.wallApricot, .04);
    for (const x of [-4.25, 0, 4.25]) {
      box(front, x, 2.15, .06, 3.52, 2.05, .08, P.glass, .02);
      rod(front, [x - 1.56, 1.13, -.02], [x - 1.56, 3.15, -.02], .045, P.trimCream);
      rod(front, [x + 1.56, 1.13, -.02], [x + 1.56, 3.15, -.02], .045, P.trimCream);
      box(front, x, 1.09, .02, 3.40, .18, .28, P.terracottaDeep);
      box(front, x, 3.35, .04, 3.55, .18, .30, P.trimCream);
    }
    box(front, 0, 3.62, .16, 13.9, .56, .68, P.trimCream);
    sign(front, 0, 3.67, .58, 10.9, .50, name, { bg:'#f5dfad', ink:'#345e56' });
    const blade = group(end, 2.9, 6.45, .76);
    box(blade, 0, 0, 0, 1.22, 4.55, .36, P.terracottaDeep, .07);
    sign(blade, 0, 0, .20, 1.03, 4.34, name, { bg:'#a65748', ink:'#fff0c9', vertical:true });
    for (const y of [-1.55, 1.55]) rod(end, [2.9, 6.4 + y, .32], [2.9, 6.4 + y, -.25], .055, P.woodDark);
  } else if (name === '南方冰室') {
    box(end, 0, 1.7, .12, 9.7, 2.72, .08, P.jade, .03);
    for (const x of [-3.65, -.9, 1.85, 4.6]) box(end, x, 1.88, .18, 2.25, 2.04, .08, P.glass, .02);
    scallopedAwning(front, 12.0, 3.05, P.teal); scallopedAwning(end, 9.5, 3.05, P.teal);
    sign(front, 0, 3.68, .46, 8.8, .56, name, { bg:'#f4e3b8', ink:'#356d68' });
    balcony(front, 5.4, 7.75, .48, P.woodDark);
    balcony(end, 4.2, 7.75, .48, P.woodDark);
    for (const x of [-2.25, 2.25]) { cylinder(front, x, 8.0, .78, .23, .23, .16, P.terracotta); oval(front, x, 8.18, .78, .18, .16, .18, P.jade, true); }
    // Recessed third-floor sunroom / terrace.
    box(front, 0, 10.05, .22, 7.1, 2.35, 2.0, P.wallSage, .05);
    for (const x of [-2.45, 0, 2.45]) layeredWindow(front, x, 10.10, .04, 1.55, 1.18, P.jade, true);
    box(front, 0, 8.86, .62, 7.8, .12, 2.55, P.wood);
    for (const x of [-3.25, -1.65, 0, 1.65, 3.25]) rod(front, [x, 8.9, .90], [x, 9.64, .90], .035, P.woodDark);
    rod(front, [-3.7, 9.64, .90], [3.7, 9.64, .90], .055, P.woodDark);
  } else if (name === '春风书局') {
    box(front, 0, 1.72, .12, 11.6, 2.6, .08, P.wood, .04);
    for (const x of [-3.65, 0, 3.65]) {
      box(front, x, 2.1, .06, 2.85, 1.92, .08, P.glass, .02);
      rod(front, [x - 1.25, 1.12, .14], [x - 1.25, 3.05, .14], .04, P.woodDark);
      rod(front, [x + 1.25, 1.12, .14], [x + 1.25, 3.05, .14], .04, P.woodDark);
    }
    scallopedAwning(front, 11.8, 3.05, P.jade);
    box(front, 0, .86, .82, 4.6, .92, .70, P.wood);
    for (let row=0; row<2; row++) for (let i=0; i<9; i++) box(front, (i-4)*.45, .62+row*.52, 1.18, .30, .42+.05*(i%2), .12, [P.terracotta,P.jade,P.trimWarm,P.wallBlush][(i+row)%4]).rotation.z=(i%3-1)*.06;
    sign(front, 0, 3.72, .46, 8.0, .54, name, { bg:'#f4e3b8', ink:'#356d68' });
    // Strong pitched roof silhouette and central dormer.
    const roof = group(front, 0, 8.55, .15);
    box(roof, -3.1, 0, 0, 6.2, .22, 2.8, P.jade).rotation.z = -.16;
    box(roof, 3.1, 0, 0, 6.2, .22, 2.8, P.jade).rotation.z = .16;
    box(roof, 0, .28, -.05, 1.65, .80, 1.5, P.wallCream, .04);
    layeredWindow(roof, 0, .30, .04, .78, .45, P.woodDark);
  } else {
    box(front, 0, 1.72, .12, 11.9, 2.55, .08, P.wood, .04);
    for (const x of [-3.65, 0, 3.65]) {
      box(front, x, 2.05, .06, 2.86, 1.95, .08, P.glass, .02);
      for (const dx of [-.88, 0, .88]) rod(front, [x+dx, 1.12, .14], [x+dx, 3.0, .14], .033, P.wood);
      for (const dy of [1.66, 2.35]) rod(front, [x-.98, dy, .15], [x+.98, dy, .15], .033, P.wood);
    }
    box(front, 0, 3.58, .06, 8.8, .70, .34, P.wood);
    sign(front, 0, 3.74, .46, 7.5, .50, name, { bg:'#edc981', ink:'#533b2c' });
    sign(end, 0, 3.74, .46, 7.5, .50, name, { bg:'#edc981', ink:'#533b2c' });
    box(front, 0, 8.65, .62, 12.4, .30, 2.65, P.jade).rotation.z = .10;
    box(end, 0, 8.65, .62, 12.4, .30, 2.65, P.jade).rotation.z = .10;
    for (const x of [-3.0, 2.2]) { cylinder(front, x, 5.0, .78, .25, .25, .92, P.terracotta); oval(front, x, 5.55, .78, .28, .45, .28, P.jade, true); }
    for (const x of [-2.9, 2.9]) { const lantern = group(front, x, 4.65, .96); cylinder(lantern, 0, -.32, 0, .17, .22, .48, P.terracotta, 12); cylinder(lantern, 0, -.04, 0, .23, .16, .08, P.trimWarm, 12); }
  }
}

function residentialRoof(root, variant, width, depth, h) {
  if (variant === 0) {
    const roof = group(root, 0, h + .28, 0);
    box(roof, -width*.25, 0, 0, width*.58, .24, depth+.48, P.jade).rotation.z = -.18;
    box(roof, width*.25, 0, 0, width*.58, .24, depth+.48, P.jade).rotation.z = .18;
    box(root, 0, h + .72, 0, 1.15, .72, 1.1, P.wallCream, .03);
    layeredWindow(root, 0, h + .75, -.58, .52, .38, P.woodDark);
    cylinder(root, width*.30, h + .72, depth*.20, .24, .28, .88, P.terracottaDeep);
  } else if (variant === 1) {
    box(root, 0, h + .22, 0, width+.32, .32, depth+.32, P.trimCream);
    cylinder(root, width*.23, h + 1.02, 0, .58, .58, 1.18, P.metalDark, 18);
    rod(root, [-width*.32, h+.56, -.35], [width*.32, h+.56, -.35], .035, P.woodDark);
    for (let i=-2;i<=2;i++) { rod(root, [i*.35, h+.56, -.35], [i*.35, h+.22, -.35], .024, P.woodDark); oval(root, i*.35+.08, h+.35, -.35, .10,.15,.03, [P.wallBlush,P.trimWarm][(i+2)%2], true); }
  } else {
    box(root, 0, h+.23, 0, width-.8, .34, depth-.7, P.wallCream);
    balcony(root, width*.72, h+.28, -depth*.34, P.woodDark);
    scallopedAwning(root, width * .62, h - .55, P.jade);
  }
}

function block(root, x, z, width, depth, floors, sideX, sideZ, wall, accent, name, variant = 0) {
  const b = group(root, x, 0, z), h = 3.9 + floors * 2.7;
  box(b, 0, .17, 0, width + .24, .34, depth + .24, P.curbFace);
  box(b, 0, .34 + (h - .34) / 2, 0, width, h - .34, depth, wall);
  box(b, 0, h - .12, 0, width + .35, .24, depth + .35, P.trimCream);
  const front = group(b, 0, 0, -sideZ * depth / 2); front.rotation.y = sideZ < 0 ? 0 : Math.PI;
  const end = group(b, -sideX * width / 2, 0, 0); end.rotation.y = -sideX * Math.PI / 2;
  facade(front, width, floors, accent, name === '南方冰室' ? 'jade' : name === '榕湾百货' ? 'heritage' : name === '春风书局' ? 'flower' : 'standard');
  facade(end, depth, floors, accent, name === '南方冰室' ? 'jade' : 'standard');
  if (name) {
    cornerShop(front, end, name, accent);
    if (name === '榕湾百货') {
      box(b, 0, h + .22, 0, width + .42, .24, depth + .42, P.trimCream);
      box(b, 0, h + .48, 0, width * .62, .24, depth * .34, P.jade);
      box(b, 0, h + .70, 0, width * .34, .20, depth * .22, P.trimCream);
    }
    if (name !== '榕湾百货' && name !== '南方冰室') sign(end, 0, 3.68, .46, depth*.72, .48, name, { bg:'#f3dfb0', ink:'#345e56' });
  } else {
    for (const y of [4.52, 7.22].slice(0, floors)) balcony(end, depth*.62, y, .48, accent);
    residentialRoof(b, variant, width, depth, h);
  }
}

function clockTower(root) {
  const tower = group(root, 12.7, 0, -12.6);
  box(tower, 0, 8.7, 0, 3.65, 7.9, 3.65, P.wallApricot, .04);
  for (const x of [-1.55, 1.55]) box(tower, x, 8.7, -1.88, .18, 7.65, .22, P.trimCream);
  box(tower, 0, 12.72, 0, 4.1, .36, 4.1, P.trimCream);
  box(tower, 0, 13.10, 0, 3.20, .46, 3.20, P.jade);
  box(tower, 0, 13.48, 0, 2.20, .30, 2.20, P.teal);
  rod(tower, [0,13.65,0], [0,14.2,0], .06, P.trimWarm);
  for (const angle of [0, -Math.PI/2]) {
    const face = group(tower, 0, 10.92, 0); face.rotation.y = angle;
    const rim = cylinder(face, 0, 0, 1.84, 1.16, 1.16, .15, P.metalDark, 32); rim.rotation.x=Math.PI/2;
    const dial = cylinder(face, 0, 0, 1.94, 1.03, 1.03, .09, P.trimCream, 32); dial.rotation.x=Math.PI/2;
    for (let i=0;i<12;i++) { const a=i*Math.PI/6; box(face,.86*Math.sin(a),.86*Math.cos(a),2.01,.05,.15,.035,P.metalDark).rotation.z=-a; }
    box(face,.21,.20,2.06,.08,.62,.05,P.metalDark).rotation.z=-.80;
    box(face,-.14,-.32,2.08,.07,.76,.05,P.metalDark).rotation.z=-.42;
  }
}

function brickTreePit(root, x, z, i) {
  const pit = group(root, x, CURB_H, z), count = 16, pitch = Math.PI * 2 / count;
  const shape = new Shape(); shape.absarc(0,0,cityTreePitRadius-.012,.025,pitch-.025,false); shape.absarc(0,0,cityTreePitRadius-.17,pitch-.025,.025,true); shape.closePath();
  const brick = new ExtrudeGeometry(shape, { depth:.18, curveSegments:2, bevelEnabled:true, bevelSegments:1, bevelSize:.012, bevelThickness:.012 }); brick.rotateX(-Math.PI/2);
  cylinder(pit, 0, .05, 0, cityTreePitRadius - .023, cityTreePitRadius - .023, .10, P.soil, 48);
  cylinder(pit,0,.107,0,cityTreePitRadius-.17,cityTreePitRadius-.17,.02,P.soilClod[2],48);
  for (let j=0;j<count;j++) piece(pit, brick, P.brickClay[(j+Math.floor(j/3)+i)%P.brickClay.length],0,.015,0).rotation.y=pitch*j;
  for (let j=0;j<9;j++) { const a=j*2.4, r=.25+(j%4)*.1; oval(pit,r*Math.cos(a),.13,r*Math.sin(a),.035,.018,.028,P.soilClod[j%P.soilClod.length],true); }
}

function sidewalkDetails(root, half, arm) {
  const roadSpan = arm * 2;
  // Four quadrant sidewalks on the east-west road, tucked beneath the corner plinths.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const z = sz * (half + 2.25);
      box(root, sx * 17.2, .075, z, 23.6, .15, 4.5, P.sidewalkTop);
      box(root, sx * 17.2, .065, sz * (half + .04), 23.6, .16, .18, P.curbFace);
      for (let i = 0; i < 14; i++) {
        const x = sx * (5.8 + i * 1.8);
        box(root, x, .145, sz * (half + .17), 1.55, .035, .22, (Math.round(Math.abs(x)) % 2) ? P.curbTop : P.curbAlt);
      }
      box(root, sx * 17.2, .014, sz * (half - .18), 23.6, .02, .30, P.gutter);
      for (let i = 0; i < 12; i++) {
        const x = sx * (6.0 + i * 2.0);
        box(root, x, .142, z, .018, .012, 4.0, P.sidewalkJoint);
      }
    }
  }
  // Side-street sidewalks and the far-end garden walls.
  for (const side of [-1, 1]) {
    const zStart = side * (half + 4.2);
    box(root, 0, .075, side * (half + arm) / 2, 4.5, .15, arm - half + 4.2, P.sidewalkTop);
    box(root, 0, .13, zStart, 4.5, .24, .18, P.wallSage);
    box(root, 0, .014, side * (half + .18), 4.5, .02, .30, P.gutter);
  }
  // Clean radial intersection markings: zebra, stop lines, and double-yellow approaches.
  for (const side of [-1, 1]) {
    for (let i = -4; i <= 4; i++) {
      box(root, i * .56, .028, side * (half + 1.9), .38, .012, .20, P.roadPaint);
    }
    box(root, 0, .028, side * (half + 4.0), 4.8, .012, .12, P.roadPaint);
  }
  for (const sx of [-1, 1]) {
    for (let i = -4; i <= 4; i++) {
      box(root, sx * (half + 9.4), .028, i * .56, .20, .012, .38, P.laneYellow);
    }
  }
  // Flush grates sit at the road edge, not on top of the paving.
  for (const side of [-1, 1]) for (const sx of [-1, 1]) {
    const grate = group(root, sx * (half + .24), .018, side * (half + .95));
    box(grate, 0, 0, 0, .48, .025, .72, P.metalDark, .04);
    for (let i = -2; i <= 2; i++) box(grate, 0, .018, i * .12, .34, .018, .035, P.metal);
  }
  for (const [x, z] of [[-2.0, 1.65], [2.25, -2.05], [0, 22]]) {
    cylinder(root, x, .016, z, .52, .52, .035, P.metalDark, 32);
    cylinder(root, x, .034, z, .42, .42, .012, P.asphaltEdge, 32);
  }
}

function streetFurniture(root, half) {
  // Four slimmer signal poles with short cantilevers and rounded visors.
  const signalHeads=[];
  for(let i=0;i<4;i++) {
    const a=group(root); a.rotation.y=i*Math.PI/2;
    const pole=group(a,half+1.05,0,-(half+1.25));
    cylinder(pole,0,.12,0,.32,.36,.24,P.trimCream,12);
    cylinder(pole,0,2.84,0,.075,.13,5.35,P.metalDark,12);
    rod(pole, [0, 5.36, 0], [-3.15, 5.36, 0], .065, P.metalDark);
    box(pole, -3.15, 4.78, 0, .54, 1.56, .38, P.metalDark, .12);
    for (let l = 0; l < 3; l++) {
      const at = new THREE.Vector3(-3.15, 5.18 - l * .48, .22);
      pole.localToWorld(at);
      root.worldToLocal(at);
      signalHeads.push({ at, axis: i % 2, lamp: l });
    }
  }
  // Six slender vintage lamps, spaced clear of corner signs and crosswalks.
  for (const [x, z, flip] of [
    [-13.5, -6.6, -1], [13.5, -6.6, 1], [-13.5, 6.6, -1], [13.5, 6.6, 1],
    [-6.6, -16.5, -1], [6.6, 16.5, 1],
  ]) {
    const lamp = group(root, x, .14, z);
    cylinder(lamp, 0, 1.6, 0, .06, .08, 3.2, P.metalDark, 10);
    rod(lamp, [0, 3.08, 0], [flip * .42, 3.35, 0], .045, P.metalDark);
    oval(lamp, flip * .48, 3.30, 0, .17, .20, .17, P.trimCream, true);
  }
  for (const [sx,sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) for (let i=0;i<3;i++) {
    const a=(i-1)*.48, b=group(root,sx*(half+1.5)+a, .14, sz*(half+1.2)+a);
    cylinder(b,0,.28,0,.10,.10,.56,P.trimCream,12); oval(b,0,.58,0,.11,.04,.11,P.jade,true);
  }
  const post = group(root, -9.2, .14, -6.9);
  cylinder(post, 0, .86, 0, .27, .30, 1.42, P.jade, 20);
  cylinder(post, 0, 1.60, 0, .31, .31, .10, P.trimCream, 20);
  return signalHeads;
}

export function createCityCrossing(parent, banyan) {
  const {x,z,half,arm}=crossing, root=group(parent,x,0,z), trees=[];
  sidewalkDetails(root,half,arm);
  // Deliberate, shared tree-pit composition; no foreground SW clipping tree.
  cityTreePits.forEach(([ox,oz,scale],i)=>{ brickTreePit(root,ox,oz,i); trees.push([ox,.31,oz,.90+i*2.4,scale,scale,scale]); });
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    const north=sz<0,east=sx>0;
    const wall=east ? north?P.wallApricot:P.wallSage : north?P.wallOlive:P.wallSand;
    const accent=east ? north?P.terracottaDeep:P.jade : north?P.teal:P.terracotta;
    block(root,sx*16.7,sz*14.0,15,10.4,east&&north?3:2,sx,sz,wall,accent,east?north?'榕湾百货':'南方冰室':north?'春风书局':'海棠茶行');
    for(const [j,d] of [25.5,38,48].entries()) block(root,sx*(13.9+j%2),sz*d,9.2,j===2?6.5:10.3,1+(j+Number(east))%3,sx,sz,[P.wallSand,P.wallBlush,P.wallSage][j],accent,'',j%3);
  }
  clockTower(root);
  const blade=group(root,7.2,0,8.1); blade.rotation.y=-Math.PI/2; cylinder(blade,0,1.85,0,.075,.095,3.7,P.metalDark); box(blade,0,3.48,0,3.1,.71,.13,P.teal); sign(blade,0,3.48,.075,3,.65,'榕湾中路',{bg:'#346e69',ink:'#fff2cd',font:'hei'});
  const signalHeads=streetFurniture(root,half);
  bake(root); placeInstances(root,banyan,trees);
  const lamps=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial(),signalHeads.length),disk=new THREE.Object3D(),color=new THREE.Color();
  signalHeads.forEach(({at},i)=>{disk.position.copy(at);disk.scale.set(.17,.17,.10);disk.rotation.y=Math.floor(i/3)*Math.PI/2;disk.updateMatrix();lamps.setMatrixAt(i,disk.matrix);}); root.add(lamps);
  let last=-1;
  return time=>{const t=time%22,phase=t<9?0:t<11?1:t<20?2:3;if(last===phase)return;last=phase;signalHeads.forEach(({axis,lamp},i)=>{const active=axis!==Math.floor(phase/2)?0:phase%2?1:2;lamps.setColorAt(i,color.setHex(active===lamp?[0xff6045,0xffca50,0x6cf3ae][lamp]:0x384641));});lamps.instanceColor.needsUpdate=true;};
}
