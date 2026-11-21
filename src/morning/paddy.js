// A planted headland, narrow irrigation cuts and a continuous far canopy share one wind field.
// The hand-shaped leaves and panicles repeat only in the first rows visible from the lane.
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { litMaterial } from '../core/materials.js';
import { rngFrom } from '../core/rng.js';
import { centerZ } from './country-route.js';

export const fieldStart = 690;
export const fieldEnd = 894;
export const fieldWindTime = { value: 0 };
const soilY = -.22;
const parcelEnds = [690, 724, 767, 815, 851, 894];
const canopyColors = [0x839c45, 0xa1aa49, 0x788e43, 0x929f43, 0x9faa51];
const material = litMaterial({ vertexColors: true, grid: false, side: THREE.DoubleSide, roughness: .94 });
function patchWind(surface) {
  const worldLighting = surface.onBeforeCompile;
  surface.onBeforeCompile = (shader, renderer) => {
    worldLighting(shader, renderer);
    shader.uniforms.uPaddyTime = fieldWindTime;
    const wind = `
      varying vec2 vPaddy;
      varying float vBladeHeight;
      uniform float uPaddyTime;
      float gust(vec2 p) {
        float phase = dot(p, vec2(.26,.68)) - 1.9*uPaddyTime + 1.1*sin(p.x*.092 + p.y*.06);
        return .60*sin(phase) + .24*sin(phase*1.52 + .43*uPaddyTime) + .16*sin(p.x*.57 + p.y*.23 - 2.3*uPaddyTime);
      }
    `;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + wind)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBladeHeight = position.y;
        #ifdef USE_INSTANCING
          vPaddy = (instanceMatrix * vec4(position, 1.0)).xz;
          float sway = (.14+.24*gust(vPaddy))*position.y*position.y;
          // Inverse-rotate the world wind into each plant's randomly turned local frame.
          vec2 windDir = vec2(.36,.93);
          transformed.x += dot(normalize(instanceMatrix[0].xz),windDir)*sway;
          transformed.z += dot(normalize(instanceMatrix[2].xz),windDir)*sway;
          transformed.y -= .12*abs(sway);
        #else
          vPaddy = position.xz;
          transformed.y += .046*gust(vPaddy)*smoothstep(-.15,.18,position.y);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + wind)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        #if defined(DOUBLE_SIDED) && defined(USE_MAP)
          normal *= faceDirection;
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wave = smoothstep(-.55,.88,gust(vPaddy));
        diffuseColor.rgb *= mix(vec3(.78,.85,.73), vec3(1.19,1.14,.91), wave);
        #ifdef USE_MAP
          // Colour the lower leaves in the shared shade beneath the panicles.
          float tip = smoothstep(.18,.89,vBladeHeight);
          float shade = .5 + .5*sin(vPaddy.x*.29 + vPaddy.y*.21);
          diffuseColor.rgb *= mix(vec3(.39,.61,.42),vec3(.79,.89,.69),tip);
          diffuseColor.rgb *= .85 + .15*shade;
        #else
          float row = vPaddy.y*5.9 + sin(vPaddy.x*.075)*2.2 + vPaddy.x*.29;
          float rowContrast = 1.-smoothstep(.1,2.5,fwidth(row));
          diffuseColor.rgb *= 1. + .12*sin(row)*rowContrast;
        #endif`);
  };
  surface.customProgramCacheKey = () => 'rongwan-paddy-wind-2';
}
patchWind(material);

// Three small curved cards carry a drawn rice plant. The same paintwork stays legible
// for a close inspection and mipmaps into a soft, coherent crown in the middle distance.
function ricePaint() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const g = canvas.getContext('2d');
  const rand = rngFrom('稻穗与剑叶');
  const leafColors = ['#68873c','#8ba549','#769747','#9bb255','#adc064'];
  for (let k=0;k<24;k++){
    const x=rand.range(79,174), y=263, direction=k%2 ? 1 : -1;
    const reach=direction*rand.range(31,100), bend=rand.range(58,172);
    const tipX=THREE.MathUtils.clamp(x+reach,2,254), tipY=bend+rand.range(2,42);
    const grad=g.createLinearGradient(x,y,tipX,bend);
    grad.addColorStop(0,'#486e40'); grad.addColorStop(.56,leafColors[k%5]); grad.addColorStop(1,'#bed075');
    g.fillStyle=grad; g.beginPath(); g.moveTo(x-3,y);
    g.bezierCurveTo(x+reach*.06,182,x+reach*.26,bend-34,tipX,tipY);
    g.bezierCurveTo(x+reach*.47,bend-11,x+reach*.19,165,x+5,y);
    g.fill();
  }
  for(const [base,tip,h] of [[99,59,48],[140,197,21],[159,133,50],[112,168,59]]){
    const dir=Math.sign(tip-base), arch=tip-dir*21;
    g.lineCap='round'; g.strokeStyle='#aec06a'; g.lineWidth=3.4;
    g.beginPath();g.moveTo(base,257);g.bezierCurveTo(base-3,167,arch-dir*15,h+12,arch,h+3);
    g.quadraticCurveTo(tip,h-9,tip+dir*14,h+33);g.stroke();
    for(let j=0;j<6;j++){
      const t=j/5, x=arch+dir*35*t, y=h+3-17*t+43*t*t;
      const grainX=x+dir*(4+6*t), grainY=y+8;
      g.strokeStyle='#c6ad61';g.lineWidth=1.6;g.beginPath();g.moveTo(x,y);g.lineTo(grainX,grainY);g.stroke();
      for(let n=0;n<3;n++){
        const gx=grainX+(n-1)*2.5, gy=grainY+n*3;
        g.beginPath();g.ellipse(gx,gy,2.45,5.1,-dir*.38,0,Math.PI*2);
        g.fillStyle=['#dcbf72','#cdb465','#ac9653'][n];g.fill();
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=4;
  return map;
}
function riceClump() {
  const geo=new GeoBuilder();
  for(let k=0;k<3;k++){
    const theta=k*Math.PI/3,dx=Math.cos(theta),dz=Math.sin(theta);
    const p=(half,y,curve)=>[half*dx-curve*dz,y,half*dz+curve*dx];
    const heights=[0,.46,.92], curves=[0,.035,.12];
    for(let i=1;i<=2;i++){
      const a=i-1,b=i;
      geo.quad(p(-.46,heights[a],curves[a]),p(.46,heights[a],curves[a]),
        p(.46,heights[b],curves[b]),p(-.46,heights[b],curves[b]),
        {normal:[0,1,0],uv:[0,a*.5,1,b*.5]});
    }
  }
  return geo.build();
}
const clump=riceClump();
let riceMaterial;
function edgeDistance(x, side) {
  return 6.05 + .43*Math.sin(x*.057+side) + .28*Math.cos(x*.11);
}

// Raised banks separate water from the crop. Their gently irregular edges follow each parcel.
function boundary(x, side, row) {
  const near = edgeDistance(x, side);
  return near + [0, 14.8, 34.5, 61.5, 93][row] + row*1.15*Math.sin(x*.033 + side*2.3 + row);
}

export function addPaddies(group, ground, start, end) {
  const from=Math.max(fieldStart,start), to=Math.min(fieldEnd,end);
  if (from>=to) return;
  const crowns=new GeoBuilder(), plants=[], rng=rngFrom('风过稻田',start);
  const strip=(geo,a,b,side,lo0,hi0,lo1,hi1,y0,y1,color)=>{
    const pos=(x,d,h)=>[x,h,centerZ(x)+side*d];
    const quad=[pos(a,lo0,y0),pos(a,hi0,y1),pos(b,hi1,y1),pos(b,lo1,y0)];
    if(side<0) quad.reverse();
    geo.quad(...quad,{color});
  };
  for(let ix=0;ix<parcelEnds.length-1;ix++){
    const left=parcelEnds[ix], right=parcelEnds[ix+1];
    if(right<=from || left>=to) continue;
    for(const side of [-1,1]){
      for(let row=0;row<4;row++){
        const color=canopyColors[(ix+row+(side+1))%canopyColors.length];
        const a=Math.max(from,left+.62), b=Math.min(to,right-.62);
        for(let x=a; x<b; x+=2){
          const n=Math.min(x+2,b);
          const lo=boundary(x,side,row), hi=boundary(x,side,row+1);
          const ln=boundary(n,side,row), hn=boundary(n,side,row+1);
          // A narrow strip of reflected sky shows between the planted plots.
          strip(ground,x,n,side,lo-.70,hi,ln-.70,hn,soilY+.026,soilY+.026,0x86aea0);
          strip(ground,x,n,side,lo-.52,lo-.24,ln-.52,ln-.24,soilY+.04,.035,0x8a774b);
          strip(ground,x,n,side,lo-.24,lo+.08,ln-.24,ln+.08,.035,.035,0xa29c62);
          strip(ground,x,n,side,lo+.08,lo+.25,ln+.08,ln+.25,.035,soilY+.04,0x79784b);
          // Outward-facing slopes hide the join with the individually modelled front rows.
          if (row===0) continue;
          const top=.38+.07*Math.sin(ix*.7+row+side);
          const gap=.66;
          strip(crowns,x,n,side,lo+gap,lo+gap+.62,ln+gap,ln+gap+.62,soilY+.04,top,color);
          // Broad ribbon ridges merge optically into planted rows from the road.
          const beds=9;
          for(let r=0;r<beds;r++){
            const t=r/beds,u=(r+1)/beds, mid=(t+u)*.5;
            const l=lo+gap+.62,lnn=ln+gap+.62, w=hi-1.45-l, wn=hn-1.45-lnn;
            const trough=top-.058, crest=top+.037*Math.sin(r*1.79+x*.12);
            strip(crowns,x,n,side,l+w*t,l+w*mid,lnn+wn*t,lnn+wn*mid,trough,crest,color);
            strip(crowns,x,n,side,l+w*mid,l+w*u,lnn+wn*mid,lnn+wn*u,crest,trough,color);
          }
          strip(crowns,x,n,side,hi-1.45,hi-1.08,hn-1.45,hn-1.08,top,soilY+.04,color);
        }
        // A transverse earthen path stops the long fields from reading as parallel stripes.
        if(left>=from && left<to){
          const a=left,b=Math.min(to,left+.56);
          strip(ground,a,b,side,boundary(a,side,row)-.65,boundary(a,side,row+1),
            boundary(b,side,row)-.65,boundary(b,side,row+1),soilY+.115,soilY+.115,0xaf9e67);
        }
      }
      for(let x=Math.max(from,left+.84); x<Math.min(to,right-.70); x+=.73){
        for(let r=0;r<21;r++){
          const px=x+rng.range(-.13,.13);
          const pz=centerZ(px)+side*(edgeDistance(px,side)+.56+r*.65+rng.range(-.11,.11));
          plants.push([px,pz,rng.range(.89,1.19),rng.range(0,2*Math.PI)]);
        }
      }
    }
  }
  if(!crowns.empty) group.add(crowns.mesh(material));
  if(!riceMaterial){
    riceMaterial=litMaterial({map:ricePaint(),grid:false,side:THREE.DoubleSide,alphaTest:.28,roughness:1});
    patchWind(riceMaterial);
  }
  const crop=new THREE.InstancedMesh(clump,riceMaterial,plants.length);
  const plant=new THREE.Object3D();
  plants.forEach(([x,z,h,angle],i)=>{
    plant.position.set(x,soilY+.04,z); plant.rotation.y=angle;
    plant.scale.set(1.33,h,1.33); plant.updateMatrix(); crop.setMatrixAt(i,plant.matrix);
  });
  crop.computeBoundingSphere(); group.add(crop);
}
