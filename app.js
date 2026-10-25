/* 田埂退潮之后 · 永丰四村田野地图 v2
   WebGL 粒子地形 + Canvas 线条层 + DOM 标记/面板。无外部依赖（仅 d3 用于等高线）。 */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const IS_MOBILE = matchMedia('(max-width:760px)').matches || matchMedia('(pointer:coarse)').matches;
const SPRING_STR = 'linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001 85.9%, 1)';
const SPRING = (window.CSS && CSS.supports && CSS.supports('transition-timing-function', SPRING_STR)) ? SPRING_STR : 'cubic-bezier(.16,1,.3,1)';
const EASE = 'cubic-bezier(.16,1,.3,1)';

/* ---------- mat4 (column-major) ---------- */
const M4 = {
  persp(fy, a, n, f) { const t = 1 / Math.tan(fy / 2), nf = 1 / (n - f); return new Float32Array([t / a,0,0,0, 0,t,0,0, 0,0,(f + n) * nf,-1, 0,0,2 * f * n * nf,0]); },
  look(e, c, u) {
    let zx = e[0]-c[0], zy = e[1]-c[1], zz = e[2]-c[2]; let l = Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;
    let xx = u[1]*zz-u[2]*zy, xy = u[2]*zx-u[0]*zz, xz = u[0]*zy-u[1]*zx; l = Math.hypot(xx,xy,xz); xx/=l; xy/=l; xz/=l;
    const yx = zy*xz-zz*xy, yy = zz*xx-zx*xz, yz = zx*xy-zy*xx;
    return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+j] * b[i*4+k]; o[i*4+j] = s; } return o; },
  inv(m) {
    const [a00,a01,a02,a03,a10,a11,a12,a13,a20,a21,a22,a23,a30,a31,a32,a33] = m;
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let d = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06; if (!d) return null; d = 1/d;
    return new Float32Array([(a11*b11-a12*b10+a13*b09)*d,(a02*b10-a01*b11-a03*b09)*d,(a31*b05-a32*b04+a33*b03)*d,(a22*b04-a21*b05-a23*b03)*d,(a12*b08-a10*b11-a13*b07)*d,(a00*b11-a02*b08+a03*b07)*d,(a32*b02-a30*b05-a33*b01)*d,(a20*b05-a22*b02+a23*b01)*d,(a10*b10-a11*b08+a13*b06)*d,(a01*b08-a00*b10-a03*b06)*d,(a30*b04-a31*b02+a33*b00)*d,(a21*b02-a20*b04-a23*b00)*d,(a11*b07-a10*b09-a12*b06)*d,(a00*b09-a01*b07+a02*b06)*d,(a31*b01-a30*b03-a32*b00)*d,(a20*b03-a21*b01+a22*b00)*d]);
  }
};

/* ---------- noise ---------- */
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  return lerp(lerp(hash(xi,yi), hash(xi+1,yi), u), lerp(hash(xi,yi+1), hash(xi+1,yi+1), u), v); }
function fbm(x, y) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x*f, y*f); f *= 2.03; a *= .5; } return s / .9375; }
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/* ---------- world ---------- */
const MW = 2, MH = 2 * 1720 / 1206, HS = 0.36;
const uv2w = (u, v) => [(u - .5) * MW, (v - .5) * MH];
let HM = null, HW = 0, HH = 0;
function sampleHM(u, v) { u = clamp(u, 0, 1) * (HW - 1); v = clamp(v, 0, 1) * (HH - 1); const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
  const x1 = Math.min(x+1, HW-1), y1 = Math.min(y+1, HH-1);
  return lerp(lerp(HM[y*HW+x], HM[y*HW+x1], fx), lerp(HM[y1*HW+x], HM[y1*HW+x1], fx), fy); }
function inMask(x, z) { const u = x / MW + .5, v = z / MH + .5; return sstep(-0.03, 0.07, Math.min(u, 1-u, v, 1-v)); }
function terrain(x, z) {
  const u = x / MW + .5, v = z / MH + .5, m = inMask(x, z);
  const n = fbm(x * 1.25 + 11.3, z * 1.25 + 4.1);
  const outside = clamp((n - .32) * 1.7, 0, 1) * .8;
  return lerp(outside, sampleHM(u, v) * .86 + (n - .5) * .16 + .07, m);
}

/* ---------- state ---------- */
let DATA, V = [];
const S = { W: 0, H: 0, pr: 1, t: 0, t0: null, intro: 0, mouse: { x: -1e4, y: -1e4, in: false, vx: 0, vy: 0, lastMove: 0 }, wm: [9, 9], wmT: [9, 9], mstr: 0, mstrT: 0, focus: null, focusAmt: 0, ripples: [], hover: null, fps: 60, theme: null, themeAmt: 0, keys: Object.create(null), userZoom: 1, panX: 0, panZ: 0 };
const cam = { tx: 0, tz: .05, dist: 6, pitch: 1.35, yaw: -.55, sx: 0, sy: 0 };
const goal = { tx: 0, tz: .05, dist: 4, pitch: .98, yaw: 0, sx: 0, sy: 0 };
let overviewDist = 4, VP = null, VPinv = null;

/* ---------- GL ---------- */
const glc = $('#gl'), gl = glc.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
const lc = $('#lines'), ctx = lc.getContext('2d');
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
const VS = `
attribute vec3 aP; attribute vec4 aR; attribute vec4 aG;
uniform mat4 uGVP; uniform float uGateOn, uMorph, uBurst, uGHover, uAspect; uniform vec2 uGMouse, uGDrag;
uniform mat4 uVP; uniform vec2 uShift; uniform float uZ, uT, uHS, uIntro, uPR, uK, uFocusAmt, uMStr;
uniform vec2 uMouse, uFocus; uniform vec4 uRip[4]; uniform vec4 uHL[4]; uniform vec3 uHLC[4]; uniform float uThemeAmt;
varying vec3 vC;
void main(){
  float h=aP.y; vec2 xz=aP.xz; float t=uT;
  float r=length(xz*vec2(.40,.44));
  float rev=smoothstep(0.,.18,uIntro*1.35-r-aR.x*.18);
  float km=1.;
  if(uGateOn>.5){ km=smoothstep(0.,.42,uMorph*2.25-r*.95-aR.x*.3); rev=km; }
  xz+=vec2(sin(t*.33+aR.y*6.283+xz.y*1.7),cos(t*.29+aR.z*6.283+xz.x*1.9))*.0065;
  float y=h*uHS*(.08+.92*rev)+sin(t*.75+aR.x*6.283+xz.x*3.1+xz.y*2.3)*.007*(.35+h);
  vec2 dm=xz-uMouse; float d=length(dm);
  float f=exp(-d*d/.075)*uMStr;
  xz+=dm/(d+.0001)*f*.09;
  y+=f*.2+sin(d*30.-t*4.2)*exp(-d*d/.1)*uMStr*.014;
  float glow=f;
  for(int i=0;i<4;i++){ float age=t-uRip[i].z; if(age>0. && age<3.5){ float rr=age*.85; float dd=length(xz-uRip[i].xy); float w=exp(-pow((dd-rr)/.055,2.))*exp(-age*1.2)*uRip[i].w; y+=w*.08; glow+=w; } }
  vec4 p=uVP*vec4(xz.x,y,xz.y,1.);
  p.xy+=uShift*p.w;
  float gsz=0., ga=0.; vec3 gc=vec3(0.);
  if(uGateOn>.5){
    vec3 g=aG.xyz;
    // elastic lag while dragging
    g.xy-=uGDrag*(.12+aR.z*.55+aR.y*.15);
    g.z+=sin(t*.9+aR.x*6.283)*.006+sin(g.y*3.+t*.6)*.004;
    float th=aR.y*6.283+aR.x*11., ph=acos(clamp(fract(aR.x*17.31+aR.z*3.7)*2.-1.,-1.,1.));
    vec3 dir=vec3(sin(ph)*cos(th),cos(ph)*.8,sin(ph)*sin(th));
    float fr=fract(aR.x*31.7); float br=uBurst*(.3+fr*fr*1.5);
    dir.y*=.7; // flattened vortex-like nebula
    vec3 cl=g+dir*br;
    float sw=uBurst*(.6+t*.12); float cs=cos(sw*(.4+aR.z)), sn=sin(sw*(.4+aR.z));
    cl.xz=mat2(cs,-sn,sn,cs)*cl.xz;
    cl+=vec3(sin(t*1.3+aR.y*20.),cos(t*1.1+aR.x*20.),sin(t*.7+aR.z*20.))*.035*uBurst;
    vec4 gp=uGVP*vec4(cl,1.);
    vec2 nd=gp.xy/gp.w; vec2 dm2=(nd-uGMouse)*vec2(uAspect,1.); float dd=length(dm2);
    float rf=exp(-dd*dd/.018)*uGHover*(1.-uBurst);
    gp.xy+=(dm2/(dd+.0001))/vec2(uAspect,1.)*rf*.07*gp.w;
    float e=km*km*(3.-2.*km);
    vec4 mid=mix(gp,p,e); mid.y+=sin(e*3.1416)*.18*mid.w*(.5+aR.y);
    gl_Position=mid;
    float vis=step(.5,aG.w);
    float amb=step(1.5,aG.w);
    ga=(vis*(.42+.4*aR.w)*(1.+rf*2.5)*(1.+uBurst*.6*(1.-fr))+(1.-vis)*.2*uBurst*(1.-fr*.7))*(.75+.25*sin(t*(1.+aR.y*2.)+aR.z*40.));
    gc=mix(vec3(.45,.9,1.),vec3(1.,.74,.38),amb);
    gc=mix(gc,vec3(1.,.95,.85),clamp(rf*1.2,0.,1.));
    gc=mix(gc,vec3(1.,.86,.62),uBurst*(1.-fr)*.45*(1.-km));
    gsz=(1.+aR.z*1.7)*uPR*uK*.62*(1.+rf*.8)*(1.-uBurst*.25);
  } else gl_Position=p;
  float tw=.72+.28*sin(t*(.8+aR.y*2.2)+aR.z*40.);
  float a=(.12+1.9*pow(h,1.1))*aR.w*tw*rev;
  float keep=smoothstep(1.1,.2,length(aP.xz-uFocus));
  a*=mix(1.,.25+1.5*keep,uFocusAmt); a+=keep*keep*.22*uFocusAmt*aR.w*rev;
  a+=glow*1.3*aR.w*rev;
  float hk=0.; vec3 hc=vec3(0.);
  for(int i=0;i<4;i++){ float w=uHL[i].z*smoothstep(.5,.06,length(aP.xz-uHL[i].xy)); hc+=uHLC[i]*w; hk+=w; }
  hc/=max(hk,.0001); hk=clamp(hk,0.,1.);
  a*=mix(1.,.3+1.7*hk,uThemeAmt); a+=hk*.18*uThemeAmt*aR.w*rev;
  vec3 lo=vec3(.05,.26,.36), hi=vec3(.55,.96,1.);
  vec3 c=mix(lo,hi,smoothstep(.05,.92,h));
  c=mix(c,hc,hk*.6*max(uThemeAmt,uFocusAmt));
  c=mix(c,vec3(1.,.9,.72),clamp(glow*.7,0.,1.));
  vC=c*a;
  gl_PointSize=(1.+aR.z*1.9)*(1.+glow*1.1)*uPR*uK/sqrt(p.w*uZ);
  if(uGateOn>.5){ vC=mix(gc*ga,vC,km); gl_PointSize=mix(gsz,gl_PointSize,km); }
}`;
const FS = `precision mediump float; varying vec3 vC;
void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d); gl_FragColor=vec4(vC*a,1.); }`;
const BGVS = `attribute vec2 p; varying vec2 v; void main(){ v=p*.5+.5; gl_Position=vec4(p,0.,1.); }`;
const BGFS = `precision mediump float; varying vec2 v; uniform vec2 uRes; uniform vec2 uC;
void main(){ vec2 q=(v-uC)*vec2(uRes.x/uRes.y,1.); float r=length(q);
  vec3 c=mix(vec3(.035,.085,.11),vec3(.012,.02,.027),smoothstep(0.,1.1,r)); gl_FragColor=vec4(c,1.); }`;
let P, BG, pBuf, rBuf, gBuf, bgBuf, NPTS = 0, U = {};

/* ---------- entry gate geometry (浙南台门 / 门楼 silhouette) ---------- */
function gateSampler() {
  const prims = [];
  const box = (x0, y0, x1, y1, z0, z1, w, cls = 1, edge = .6) => prims.push({ w, f: () => {
    let x = lerp(x0, x1, rnd()), y = lerp(y0, y1, rnd()), z = lerp(z0, z1, rnd());
    if (rnd() < edge) { const k = (rnd() * 4) | 0; if (k === 0) x = x0; else if (k === 1) x = x1; else if (k === 2) y = y0; else y = y1; }
    return [x, y, z, cls]; } });
  const seg = (ax, ay, bx, by, z, w, cls = 1, jit = .004) => prims.push({ w, f: () => { const t = rnd(); return [lerp(ax, bx, t) + (rnd() - .5) * jit, lerp(ay, by, t) + (rnd() - .5) * jit, z + (rnd() - .5) * jit, cls]; } });
  const ring = (cx, cy, r, z, w, cls = 2) => prims.push({ w, f: () => { const a = rnd() * 6.283; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, cls]; } });
  const ell = (cx, cy, rx, ry, z, w, cls = 2) => prims.push({ w, f: () => { const a = rnd() * 6.283, k = Math.sqrt(rnd()); const edge = rnd() < .55 ? 1 : k; return [cx + Math.cos(a) * rx * edge, cy + Math.sin(a) * ry * edge, z + (rnd() - .5) * .03, cls]; } });
  // steps
  box(-.78, -.92, .78, -.86, -.06, .14, 4); box(-.66, -.86, .66, -.8, -.04, .1, 3.5);
  // pillars
  box(-.56, -.8, -.44, .46, -.05, .07, 7); box(.44, -.8, .56, .46, -.05, .07, 7);
  // door leaves (recessed) + panel lines + center seam
  box(-.42, -.8, -.01, .34, -.04, -.02, 9, 1, .35); box(.01, -.8, .42, .34, -.04, -.02, 9, 1, .35);
  [-.32, -.11, .11, .32].forEach(x => seg(x, -.7, x, .25, -.015, 1.2));
  [-.55, -.1, .2].forEach(y => { seg(-.4, y, -.03, y, -.015, 1); seg(.03, y, .4, y, -.015, 1); });
  // door rings & studs (amber)
  ring(-.07, -.12, .045, .0, 1.4); ring(.07, -.12, .045, .0, 1.4);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) { const x = -.36 + i * .085, y = -.6 + j * .13; [x, -x].forEach(xx => prims.push({ w: .06, f: () => [xx + (rnd() - .5) * .01, y + (rnd() - .5) * .01, -.012, 2] })); }
  // threshold
  box(-.44, -.8, .44, -.76, -.03, .05, 1.5);
  // lintel + bracket (斗拱) row
  box(-.66, .46, .66, .56, -.06, .1, 6);
  for (let i = 0; i < 9; i++) { const x = -.56 + i * .14; box(x - .035, .56, x + .035, .64, -.04, .08, .9); }
  // plaque 匾额
  box(-.26, .64, .26, .8, .06, .08, 3, 2, .75);
  // side walls (马头墙) — stepped tops
  const wall = sgn => {
    const x0 = sgn * .58, x1 = sgn * 1.12;
    box(Math.min(x0, x1), -.8, Math.max(x0, x1), .38, -.12, -.1, 9, 1, .25);
    // two stepped horse-head caps
    [[.58, .86, .62], [.86, 1.16, .44]].forEach(([a, b, y]) => {
      const xa = sgn * a, xb = sgn * b;
      box(Math.min(xa, xb), y - .02, Math.max(xa, xb), y + .05, -.16, -.06, 2.6);
      seg(xb, y + .05, xb + sgn * .05, y + .11, -.11, .5, 1);
    });
    box(Math.min(sgn * .58, sgn * .86), .38, Math.max(sgn * .58, sgn * .86), .6, -.12, -.1, 2.2, 1, .3);
    // little window
    box(sgn * .78 - .07, .02, sgn * .78 + .07, .16, -.09, -.09, .7, 1, .85);
  };
  wall(-1); wall(1);
  // roof: curved eave with upturned corners + tile ridges
  const roofY = x => .9 + .14 * Math.pow(Math.abs(x) / .82, 3.2);
  prims.push({ w: 12, f: () => { const x = (rnd() * 2 - 1) * .82, t = rnd(); const y0 = roofY(x), y = lerp(y0 - .02, y0 + .2 - .04 * Math.abs(x), t); return [x, y, lerp(.16, -.12, t), 1]; } });
  for (let i = -15; i <= 15; i++) { const x = i * .052; prims.push({ w: .35, f: () => { const t = rnd(); const y0 = roofY(x); return [x, lerp(y0, y0 + .2 - .04 * Math.abs(x), t), lerp(.17, -.12, t), 1]; } }); }
  prims.push({ w: 2.2, f: () => { const x = (rnd() * 2 - 1) * .86; return [x, roofY(x) - .025 + (rnd() - .5) * .006, .17, 1]; } });
  // ridge with upturned ends
  prims.push({ w: 2.8, f: () => { const x = (rnd() * 2 - 1) * .62; return [x, 1.12 + .06 * Math.pow(Math.abs(x) / .62, 4) + (rnd() - .5) * .012, -.12, 1]; } });
  // lanterns (amber)
  ell(-.72, .2, .07, .095, .2, 2.2); ell(.72, .2, .07, .095, .2, 2.2);
  seg(-.72, .3, -.72, .5, .2, .25, 2); seg(.72, .3, .72, .5, .2, .25, 2);
  // ground line
  seg(-1.5, -.93, 1.5, -.93, .05, 2.5, 1, .02);
  const tot = prims.reduce((a, q) => a + q.w, 0);
  return () => { let r = rnd() * tot; for (const q of prims) { r -= q.w; if (r <= 0) return q.f(); } return prims[0].f(); };
}

function buildParticles() {
  const N = IS_MOBILE ? 40000 : 110000;
  const pos = new Float32Array(N * 3), rr = new Float32Array(N * 4);
  let i = 0, tries = 0;
  while (i < N && tries < N * 40) {
    tries++;
    const x = (rnd() * 2 - 1) * 2.8, z = (rnd() * 2 - 1) * 2.6;
    const r = Math.hypot(x / 2.8, z / 2.6); const fade = sstep(1.0, .42, r); if (fade < .02) continue;
    const m = inMask(x, z), h = clamp(terrain(x, z), 0, 1);
    let near = 0; for (const v of V) near = Math.max(near, Math.exp(-((x - v.x) ** 2 + (z - v.z) ** 2) / .028));
    const p = Math.max((.07 + .93 * Math.pow(h, 1.05)) * lerp(.5, 1, m) * (.35 + .65 * fade), .55 * near);
    if (rnd() > p) continue;
    pos[i*3] = x; pos[i*3+1] = h; pos[i*3+2] = z;
    rr[i*4] = rnd(); rr[i*4+1] = rnd(); rr[i*4+2] = Math.pow(rnd(), 2.2); rr[i*4+3] = Math.max(fade * lerp(.5, 1, m), near) * (1 + 1.5 * near * (1 - h));
    i++;
  }
  NPTS = i;
  // gate positions — ~44% of particles form the 门楼, the rest wait hidden and join the burst cloud
  const gs = gateSampler(), gp = new Float32Array(NPTS * 4), vf = IS_MOBILE ? .7 : .44;
  for (let k = 0; k < NPTS; k++) {
    if (rnd() < vf) { const q = gs(); gp[k*4] = q[0]; gp[k*4+1] = q[1]; gp[k*4+2] = q[2]; gp[k*4+3] = q[3]; }
    else { const a = rnd() * 6.283, rr2 = .3 + rnd() * 1.4; gp[k*4] = Math.cos(a) * rr2 * 1.3; gp[k*4+1] = (rnd() - .5) * 1.6; gp[k*4+2] = Math.sin(a) * rr2 * .6 - .3; gp[k*4+3] = 0; }
  }
  gBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gBuf); gl.bufferData(gl.ARRAY_BUFFER, gp, gl.STATIC_DRAW);
  P = prog(VS, FS); BG = prog(BGVS, BGFS);
  pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferData(gl.ARRAY_BUFFER, pos.subarray(0, i*3), gl.STATIC_DRAW);
  rBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rBuf); gl.bufferData(gl.ARRAY_BUFFER, rr.subarray(0, i*4), gl.STATIC_DRAW);
  bgBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  ['uVP','uZ','uShift','uT','uHS','uIntro','uPR','uK','uFocusAmt','uMStr','uMouse','uFocus','uRip','uHL','uHLC','uThemeAmt','uGVP','uGateOn','uMorph','uBurst','uGHover','uAspect','uGMouse','uGDrag'].forEach(n => U[n] = gl.getUniformLocation(P, n));
  U.bgRes = gl.getUniformLocation(BG, 'uRes'); U.bgC = gl.getUniformLocation(BG, 'uC');
  $('#s-pts').textContent = NPTS.toLocaleString('zh-CN');
}

/* ---------- line geometry ---------- */
const G = { contours: [], river: null, roads: [], paths: [], routes: [], grid: [], frame: null, crosses: [], houses: [], fields: [] };
function catmull(pts, seg = 10) { const o = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || p2;
  for (let s = 0; s < seg; s++) { const t = s / seg, t2 = t*t, t3 = t2*t; o.push([0,1].map(k => .5 * (2*p1[k] + (-p0[k]+p2[k])*t + (2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2 + (-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3))); } }
  o.push(pts[pts.length-1]); return o; }
function drape(uvPts, lift = .006, seg = 10) { const s = catmull(uvPts, seg), a = new Float32Array(s.length * 3);
  s.forEach(([u, v], i) => { const [x, z] = uv2w(u, v); a[i*3] = x; a[i*3+1] = Math.max(0, terrain(x, z)) * HS + lift; a[i*3+2] = z; }); return a; }
function buildLines() {
  // contours from sampled terrain inside map
  const gw = 150, gh = Math.round(150 * MH / MW), vals = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const [x, z] = uv2w(i / (gw-1), j / (gh-1)); vals[j*gw+i] = terrain(x, z); }
  const levels = [.16, .28, .4, .52, .64, .76, .88];
  const cs = d3.contours().size([gw, gh]).smooth(true).thresholds(levels)(vals);
  cs.forEach((c, li) => {
    const lines = [];
    c.coordinates.forEach(poly => poly.forEach(ring => {
      let cur = [];
      const flush = () => { if (cur.length > 3) lines.push(Float32Array.from(cur)); cur = []; };
      ring.forEach(([gx, gy], k) => {
        if (gx <= .6 || gy <= .6 || gx >= gw - .6 || gy >= gh - .6) { flush(); return; }
        if (k % 2) return;
        const [x, z] = uv2w(gx / (gw-1), gy / (gh-1)); cur.push(x, c.value * HS, z);
      }); flush();
    }));
    G.contours.push({ level: c.value, li, lines });
  });
  G.river = drape(DATA.map.river, .004, 14);
  G.roads = DATA.map.roads.map(r => drape(r, .008, 10));
  // extra footpaths near villages
  G.paths = [];
  V.forEach(v => {
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2, L = .04 + rnd() * .09;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const ang = a + Math.sin(t * 3 + i) * .35;
        pts.push([v.uv[0] + Math.cos(ang) * L * t, v.uv[1] + Math.sin(ang) * L * t * .85]);
      }
      G.paths.push(drape(pts, .007, 4));
    }
  });
  // stylized house footprints clustered at each village
  G.houses = [];
  V.forEach(v => {
    const n = v.id === 'wuan' ? 28 : v.id === 'jiangjiaao' ? 22 : v.id === 'dongan' ? 18 : 14;
    const spread = v.id === 'wuan' ? .055 : .04;
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2, rad = Math.pow(rnd(), .55) * spread;
      const cx = v.x + Math.cos(ang) * rad, cz = v.z + Math.sin(ang) * rad * (v.id === 'wuan' ? 1.3 : .9);
      const w = .006 + rnd() * .01, d = .004 + rnd() * .008, rot = rnd() * Math.PI;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const corners = [[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z]) => {
        const rx = x * cos - z * sin, rz = x * sin + z * cos;
        const y = Math.max(0, terrain(cx + rx, cz + rz)) * HS + .01;
        return [cx + rx, y, cz + rz];
      });
      G.houses.push({ corners, color: v.hex, v });
    }
  });
  // farmland terrace / field line patterns (valley floors + near 吴岸)
  G.fields = [];
  const fieldZones = [
    { u0: .72, v0: .78, u1: .98, v1: .99, rows: 14, cols: 10, terrace: false }, // 吴岸平原
    { u0: .48, v0: .48, u1: .72, v1: .62, rows: 8, cols: 6, terrace: true },
    { u0: .05, v0: .35, u1: .22, v1: .5, rows: 6, cols: 5, terrace: true },
    { u0: .55, v0: .62, u1: .78, v1: .78, rows: 7, cols: 5, terrace: false },
  ];
  fieldZones.forEach(z => {
    for (let r = 0; r < z.rows; r++) {
      const pts = [];
      for (let c = 0; c <= z.cols; c++) {
        const u = z.u0 + (z.u1 - z.u0) * (c / z.cols);
        let v = z.v0 + (z.v1 - z.v0) * (r / (z.rows - 1));
        if (z.terrace) v += Math.sin(c * .7 + r) * .004;
        pts.push([u, v]);
      }
      G.fields.push({ arr: drape(pts, .003, 3), terrace: z.terrace });
    }
    if (!z.terrace) {
      for (let c = 0; c < z.cols; c++) {
        const pts = [];
        for (let r = 0; r <= z.rows; r++) {
          const u = z.u0 + (z.u1 - z.u0) * (c / (z.cols - 1 || 1));
          const v = z.v0 + (z.v1 - z.v0) * (r / z.rows);
          pts.push([u, v]);
        }
        G.fields.push({ arr: drape(pts, .003, 3), terrace: false });
      }
    }
  });
  // route arcs between villages in visit order (research gradient)
  for (let i = 0; i < V.length - 1; i++) {
    const a = V[i], b = V[i+1], n = 64, arr = new Float32Array((n+1) * 3), L = Math.hypot(b.x-a.x, b.z-a.z);
    for (let k = 0; k <= n; k++) { const t = k / n; arr[k*3] = lerp(a.x, b.x, t); arr[k*3+2] = lerp(a.z, b.z, t); arr[k*3+1] = lerp(a.y, b.y, t) + Math.sin(Math.PI * t) * (.08 + L * .22); }
    G.routes.push(arr);
  }
  for (let g = -2.4; g <= 2.401; g += .2) { G.grid.push([g, -2.2, g, 2.2], [-2.6, g * 0.92, 2.6, g * 0.92]); }
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 11; j++) { const x = -MW/2 + i * MW/8, z = -MH/2 + j * MH/11; G.crosses.push([x, z, i, j]); }
}

/* ---------- camera ---------- */
function computeVP(c) {
  const e = [c.tx + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist];
  const p = M4.persp(34 * Math.PI / 180, S.W / S.H, .05, 60);
  return M4.mul(p, M4.look(e, [c.tx, 0, c.tz], [0, 1, 0]));
}
const _o = [0, 0, 0];
function proj(x, y, z, sx = cam.sx, sy = cam.sy, m = VP) {
  const cx = m[0]*x + m[4]*y + m[8]*z + m[12], cy = m[1]*x + m[5]*y + m[9]*z + m[13], cw = m[3]*x + m[7]*y + m[11]*z + m[15];
  _o[0] = ((cx / cw + sx) + 1) * .5 * S.W; _o[1] = (1 - (cy / cw + sy)) * .5 * S.H; _o[2] = cw; return _o;
}
function fitOverview() {
  const c = { ...goal, tx: 0, tz: .06, yaw: 0, pitch: IS_MOBILE ? 1.02 : .9 };
  const target = IS_MOBILE ? [.92, .62] : [.62, .84];
  let lo = 1, hi = 25;
  for (let it = 0; it < 30; it++) {
    c.dist = (lo + hi) / 2; const m = computeVP(c); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a, b]) => { const p = proj(a*MW/2, 0, b*MH/2, 0, 0, m); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    ((x1 - x0) > S.W * target[0] || (y1 - y0) > S.H * target[1]) ? (lo = c.dist) : (hi = c.dist);
  }
  overviewDist = hi;
  return c;
}
function setOverviewGoal() { const c = fitOverview(); Object.assign(goal, { tx: c.tx + S.panX, tz: c.tz + S.panZ, dist: overviewDist / S.userZoom, pitch: c.pitch, yaw: -.08, sx: IS_MOBILE ? 0 : .07, sy: IS_MOBILE ? .04 : -.03 }); }
function setFocusGoal(v) {
  const pw = Math.min(600, S.W * .44);
  Object.assign(goal, { tx: v.x, tz: v.z + .05, dist: overviewDist * (IS_MOBILE ? .6 : .56), pitch: .88, yaw: .14 + (v.x > 0 ? -.1 : .1), sx: IS_MOBILE ? 0 : -pw / S.W, sy: IS_MOBILE ? .5 : -.12 });
}
function screenToWorld(mx, my, Y = .06) {
  if (!VPinv) return null;
  const nx = mx / S.W * 2 - 1 - cam.sx, ny = 1 - my / S.H * 2 - cam.sy;
  const t4 = (x, y, z) => { const m = VPinv; const w = m[3]*x+m[7]*y+m[11]*z+m[15]; return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w, (m[1]*x+m[5]*y+m[9]*z+m[13])/w, (m[2]*x+m[6]*y+m[10]*z+m[14])/w]; };
  const a = t4(nx, ny, -1), b = t4(nx, ny, 1); const t = (Y - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0]-a[0]) * t, a[2] + (b[2]-a[2]) * t];
}

/* ---------- resize ---------- */
function resize() {
  S.pr = Math.min(window.devicePixelRatio || 1, 2); S.W = innerWidth; S.H = innerHeight;
  for (const c of [glc, lc]) { c.width = Math.round(S.W * S.pr); c.height = Math.round(S.H * S.pr); }
  gl.viewport(0, 0, glc.width, glc.height);
  if (S.focus) { fitOverview(); setFocusGoal(S.focus); } else setOverviewGoal();
}

/* ---------- markers / index ---------- */
function buildMarkers() {
  const wrap = $('#markers'), nav = $('#index');
  V.forEach((v, i) => {
    const el = document.createElement('div'); el.className = 'marker enter';
    el.style.setProperty('--vcolor', v.hex || '#ffb547');
    const tipTags = (v.themes || []).slice(0, 3).map(tid => (DATA.themes.find(t => t.id === tid) || {}).name).filter(Boolean);
    el.innerHTML = `<div class="mag"><div class="pulse"></div><div class="pulse p2"></div><div class="ring"></div><div class="core"></div>
      <div class="lab"><b>${v.short || v.name}</b><span>${String(i+1).padStart(2,'0')} · ${v.belt || v.en}</span></div>
      <div class="tip"><em>${v.date}</em><br>${tipTags.join(' / ') || v.belt || '田野'} · 点击查看</div></div><div class="hit"></div>`;
    el.querySelector('.hit').addEventListener('click', e => { e.stopPropagation(); openVillage(v); });
    wrap.appendChild(el); v.el = el; v.mag = el.querySelector('.mag');
    const it = document.createElement('button'); it.className = 'idx-item'; it.style.transitionDelay = (2.6 + i * .08) + 's';
    it.innerHTML = `<span class="n" style="color:${v.hex}">${String(i+1).padStart(2,'0')}</span><span class="bar" style="background:${v.hex}"></span><span>${v.short || v.name}</span><span class="e">${v.belt || v.en}</span>`;
    it.addEventListener('mouseenter', () => { S.navHover = v; }); it.addEventListener('mouseleave', () => { S.navHover = null; });
    it.addEventListener('click', () => openVillage(v)); it.dataset.interactive = '查看';
    nav.appendChild(it); v.nav = it;
  });
}

/* ---------- intro text ---------- */
function splitChars(el, text, base = 0, step = .07) {
  el.innerHTML = ''; [...text].forEach((ch, i) => { const s = document.createElement('span'); s.className = 'ch' + (ch === '·' ? ' dot' : ''); const k = document.createElement('i'); k.textContent = ch === ' ' ? '\u00a0' : ch; k.style.transitionDelay = (base + i * step) + 's'; s.appendChild(k); el.appendChild(s); });
}
function scramble(el, text, dur = 1200) {
  const chars = '〇一二三四五六七八九十·—', st = performance.now();
  (function f(now) { const p = clamp((now - st) / dur, 0, 1), n = Math.floor(text.length * p);
    el.textContent = text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0]).join('').slice(0, Math.max(0, Math.ceil((text.length - n) * Math.min(1, p * 3))));
    if (p < 1) requestAnimationFrame(f); else el.textContent = text; })(st);
}

/* ---------- panel / fan / gallery ---------- */
const panel = $('#panel'), fan = $('#fan');
let fanCards = [], fanAnimKey = 0;
function openVillage(v) {
  if (S.focus === v) return;
  const switching = !!S.focus;
  S.focus = v; document.body.classList.add('focus'); panel.setAttribute('aria-hidden', 'false');
  V.forEach(o => { o.el.classList.toggle('active', o === v); o.nav.classList.toggle('on', o === v); });
  setFocusGoal(v);
  if (!document.body.classList.contains('window-open')) history.replaceState(null, '', '#' + v.id);
  S.ripples.push([v.x, v.z, S.t + .15, 1.4]);
  fillPanel(v, switching);
  spawnFan(v);
}
function closeVillage() {
  if (!S.focus) return;
  S.focus = null; document.body.classList.remove('focus'); panel.classList.remove('panel-in'); panel.setAttribute('aria-hidden', 'true');
  V.forEach(o => { o.el.classList.remove('active'); o.nav.classList.remove('on'); });
  setOverviewGoal();
  if (!document.body.classList.contains('window-open')) history.replaceState(null, '', location.pathname);
  dismissFan();
}
function fillPanel(v, switching) {
  panel.classList.remove('panel-in');
  const i = V.indexOf(v);
  const go = () => {
    $('#p-idx').textContent = `村落 ${String(i+1).padStart(2,'0')} / ${String(V.length).padStart(2,'0')}`;
    splitChars($('#p-name'), v.name, .12, .07);
    $('#p-en').textContent = v.belt || '';
    const note = $('#p-window-note');
    if (note) note.textContent = '窗 · ' + (v.short || v.name) + '的装置在退潮线里';
    panel.style.setProperty('--vcolor', v.hex);
    const tn = (v.themes || []).map(id => (DATA.themes.find(t => t.id === id) || {}).name).filter(Boolean);
    $('#p-meta').innerHTML = `<span class="chip amber">${v.date}</span>` + tn.map(t => `<span class="chip">${t}</span>`).join('');
    $('#p-stats').innerHTML = `<div><b>${v.photos.length}</b>张照片</div><div><b>${(v.people || []).length}</b>位村民</div><div><b>${(v.stories || []).length}</b>条记录</div>`;
    const q = (v.quotes || [])[0], qe = $('#p-quote');
    if (q) { qe.hidden = false; qe.innerHTML = `${q.text}<cite>— ${q.by || ''}</cite>`; } else qe.hidden = true;
    $('#p-summary').textContent = v.summary;
    const gal = $('#gallery'); gal.innerHTML = '';
    const heroes = [...v.photos.filter(p => !p.face), ...v.photos.filter(p => p.face)].slice(0, 5);
    $('#all-photos').textContent = `查看全部 ${v.photos.length} 张照片 →`; $('#all-photos').onclick = () => openMasonry(v);
    heroes.forEach((p, k) => {
      const d = document.createElement('div'); d.className = 'photo'; d.dataset.interactive = '放大';
      d.innerHTML = `<div class="pi" style="position:absolute;inset:0;opacity:0"><img src="${p.src}" alt="${p.caption}" loading="eager">${p.face ? '<span class="tag face">人像</span>' : ''}<div class="glare"></div><div class="cap">${p.caption}</div><div class="frame"></div></div>`;
      if (k === 0) d.style.minHeight = '220px'; else if (k < 3) d.style.minHeight = '105px';
      gal.appendChild(d);
      bindTilt(d, 9);
      d.addEventListener('click', () => openLightbox(d.querySelector('img'), heroes, k));
    });
    $('#people').innerHTML = (v.people || []).map(p => `<div class="person"><div class="av" style="color:${v.hex}">${p.name.slice(0, 1)}</div><b>${p.name}</b><small>${p.role}</small><p>${p.note || ''}</p></div>`).join('') || '<p class="mem-note">待补充</p>';
    $('#stories').innerHTML = (v.stories || []).map(s => `<li><span class="d">${s.d || ''}</span><b>${s.t}</b><p>${s.v}</p></li>`).join('');
    $('#findings').innerHTML = (v.findings || []).map(f => `<li>${typeof f === 'string' ? f : (f.k + '：' + f.v)}</li>`).join('');
    $('#sec-memory').hidden = !(v.memory && v.memory.length);
    if (v.memory && v.memory.length) $('#memory').innerHTML = `<table class="mem-table"><tr><th>事项</th><th>从前</th><th>现在</th></tr>${v.memory.map(m => `<tr><td>${m.item}</td><td>${m.then || '—'}</td><td>${m.now || '—'}</td></tr>`).join('')}</table>`;
    $('#gaps').innerHTML = (v.gaps || []).map(g => `<li>${g}</li>`).join('');
    $('#panel-scroll').scrollTop = 0;
    document.querySelectorAll('#panel .reveal').forEach((el, k) => el.style.transitionDelay = (.25 + k * .08) + 's');
    void panel.offsetWidth;
    requestAnimationFrame(() => panel.classList.add('panel-in'));
    gal.querySelectorAll('.pi').forEach((el, k) => el.animate([
      { opacity: 0, transform: 'translateY(110px) rotateX(28deg) scale(.9)', filter: 'blur(16px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 1300, delay: (switching ? 250 : 650) + k * 95, easing: SPRING, fill: 'both' }));
  };
  switching ? setTimeout(go, 120) : go();
}
function bindTilt(el, amt) {
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(700px) rotateY(${(px - .5) * amt}deg) rotateX(${(.5 - py) * amt}deg) translateZ(6px)`; el.style.transition = 'transform .15s ease-out';
    el.style.setProperty('--gx', px * 100 + '%'); el.style.setProperty('--gy', py * 100 + '%'); });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; el.style.transition = 'transform .8s ' + EASE; });
}
function fanLayout() {
  const s = IS_MOBILE ? .62 : clamp(S.H / 950, .75, 1.1);
  return { w: 150 * s, pos: [[-235, -300, -9], [-78, -345, 1.5], [78, -292, 10]].map(([x, y, r]) => [x * s, y * s, r]) };
}
function spawnFan(v) {
  dismissFan(true);
  const key = ++fanAnimKey, L = fanLayout();
  fan.style.setProperty('--fw', L.w + 'px');
  const fp = [...v.photos.filter(p => !p.face), ...v.photos.filter(p => p.face)].slice(0, 3);
  const crowdR = V.some(o => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < .5 && o.x > v.x - .02 && o.z < v.z + .05);
  const crowdL = V.some(o => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < .5 && o.x < v.x + .02 && o.z < v.z + .05);
  const mir = crowdL && !crowdR ? -1 : 1, shiftX = crowdR && crowdL ? 0 : 0;
  L.pos = L.pos.map(([x, y, r]) => [x * mir + shiftX, y, r * mir]);
  if (crowdR && !crowdL) L.pos = L.pos.map(([x, y, r]) => [x - 60 * (L.w / 150), y, r]);
  if (crowdL && !crowdR) L.pos = L.pos.map(([x, y, r]) => [x + 60 * (L.w / 150), y, r]);
  fanCards = fp.map((p, k) => {
    const c = document.createElement('div'); c.className = 'fcard'; c.dataset.interactive = '放大';
    c.innerHTML = `<div class="in" style="animation-delay:${-k * 1.7}s"><img src="${p.src}" alt=""><div class="cap">${p.caption}</div></div>`;
    const [x, y, r] = L.pos[k];
    c._pos = [x, y]; c._shown = 0;
    c.style.marginLeft = (-L.w / 2) + 'px'; c.style.marginTop = (-L.w * 4 / 3) + 'px';
    fan.appendChild(c);
    const a = c.animate([
      { transform: `translate(0px, ${L.w * .9}px) scale(.12) rotateX(70deg) rotate(0deg)`, opacity: 0, filter: 'blur(18px)' },
      { opacity: 1, offset: .35 },
      { transform: `translate(${x}px, ${y + L.w * 4 / 3}px) scale(1) rotateX(0deg) rotate(${r}deg)`, opacity: 1, filter: 'blur(0px)' }],
      { duration: 1500, delay: 520 + k * 120, easing: SPRING, fill: 'both' });
    setTimeout(() => { if (key === fanAnimKey) c._shown = 1; }, 520 + k * 120 + 600);
    c.addEventListener('click', e => { e.stopPropagation(); openLightbox(c.querySelector('img'), fp, k); });
    return c;
  });
}
function dismissFan(instant) {
  const old = fanCards; fanCards = [];
  old.forEach((c, k) => { c._shown = 0; c.style.pointerEvents = 'none';
    if (instant) { c.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(10px)' }], { duration: 260, fill: 'forwards' }).onfinish = () => c.remove(); return; }
    c.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, transform: `translate(0px,40px) scale(.2) rotateX(60deg)`, filter: 'blur(14px)' }], { duration: 600, delay: k * 50, easing: 'cubic-bezier(.6,0,.8,.2)', fill: 'forwards' }).onfinish = () => c.remove(); });
}

/* ---------- lightbox (FLIP shared element) ---------- */
const LB = { el: $('#lightbox'), img: null, src: null, list: null, i: 0, open: false };
function fitRect(nw, nh) { const mw = S.W * (IS_MOBILE ? .94 : .78), mh = S.H * (IS_MOBILE ? .7 : .78), s = Math.min(mw / nw, mh / nh); const w = nw * s, h = nh * s; return { left: (S.W - w) / 2, top: (S.H - h) / 2 - 10, width: w, height: h }; }
const px = r => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
function openLightbox(srcImg, list, i) {
  if (LB.open) return;
  LB.open = true; LB.src = srcImg; LB.list = list; LB.i = i; LB.i0 = i;
  const r = srcImg.getBoundingClientRect();
  const img = document.createElement('img'); img.className = 'lb-img'; img.src = srcImg.currentSrc || srcImg.src; LB.img = img;
  if (list[i] && list[i].src && !img.src.endsWith(list[i].src)) { const hi = new Image(); hi.onload = () => { if (LB.img === img && LB.i === i) img.src = hi.src; }; hi.src = list[i].src; }
  const to = fitRect(srcImg.naturalWidth || 1200, srcImg.naturalHeight || 900);
  Object.assign(img.style, px(to)); LB.el.appendChild(img);
  img.animate([{ ...px(r), borderRadius: '6px' }, { ...px(to), borderRadius: '10px' }], { duration: 820, easing: EASE });
  srcImg.style.visibility = 'hidden';
  LB.el.classList.add('open'); LB.el.setAttribute('aria-hidden', 'false'); setLBText();
}
function setLBText() { $('#lb-idx').textContent = `${String(LB.i + 1).padStart(2, '0')} / ${String(LB.list.length).padStart(2, '0')}`; $('#lb-cap').textContent = LB.list[LB.i].caption || ''; }
function stepLightbox(d) {
  if (!LB.open) return; LB.i = (LB.i + d + LB.list.length) % LB.list.length;
  const img = LB.img, n = new Image(); n.src = LB.list[LB.i].src;
  n.onload = () => { img.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-d * 40}px) scale(.97)`, filter: 'blur(8px)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
    img.src = n.src; Object.assign(img.style, px(fitRect(n.naturalWidth, n.naturalHeight)));
    img.animate([{ opacity: 0, transform: `translateX(${d * 40}px) scale(.97)`, filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 520, easing: EASE, fill: 'forwards' }); setLBText(); }; };
}
function closeLightbox() {
  if (!LB.open) return; LB.open = false;
  const img = LB.img, src = LB.src, from = img.getBoundingClientRect();
  LB.el.classList.remove('open'); LB.el.setAttribute('aria-hidden', 'true');
  const sameImg = LB.i === LB.i0;
  const r = src.getBoundingClientRect();
  const a = sameImg ? img.animate([{ ...px(from), borderRadius: '10px' }, { ...px(r), borderRadius: '6px' }], { duration: 700, easing: EASE, fill: 'forwards' })
                    : img.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.94)' }], { duration: 400, easing: EASE, fill: 'forwards' });
  a.onfinish = () => { src.style.visibility = ''; img.remove(); };
}

/* ---------- interaction ---------- */
const cursor = $('#cursor'), cDot = cursor.querySelector('.c-dot'), cRing = cursor.querySelector('.c-ring'), cLabel = $('#c-label');
const ring = { x: -100, y: -100 };
addEventListener('pointermove', e => {
  const m = S.mouse, now = performance.now(), dt = Math.max(1, now - m.lastMove);
  m.vx = (e.clientX - m.x) / dt; m.vy = (e.clientY - m.y) / dt; m.x = e.clientX; m.y = e.clientY; m.in = true; m.lastMove = now;
  m.overUI = !!e.target.closest('#panel,#lightbox,.hud-bl,.fcard');
  const inter = e.target.closest('[data-interactive]');
  const label = inter ? inter.dataset.interactive : (S.hover ? '进入' : '');
  cursor.classList.toggle('big', !!label); if (label) cLabel.textContent = label;
}, { passive: true });
addEventListener('pointerleave', () => { S.mouse.in = false; });
document.addEventListener('mouseleave', () => { S.mouse.in = false; });
glc.addEventListener('click', () => {
  if (GATE.on) return;
  if (S.hover) { openVillage(S.hover); return; }
  const w = screenToWorld(S.mouse.x, S.mouse.y); if (w) { S.ripples.push([w[0], w[1], S.t, 1]); if (S.ripples.length > 4) S.ripples.shift(); }
});
$('#back').addEventListener('click', closeVillage);
$('#prev').addEventListener('click', () => openVillage(V[(V.indexOf(S.focus) - 1 + V.length) % V.length]));
$('#next').addEventListener('click', () => openVillage(V[(V.indexOf(S.focus) + 1) % V.length]));
$('#lb-close').addEventListener('click', closeLightbox); LB.el.querySelector('.lb-bg').addEventListener('click', closeLightbox);
$('#lb-prev').addEventListener('click', () => stepLightbox(-1)); $('#lb-next').addEventListener('click', () => stepLightbox(1));
addEventListener('keydown', e => {
  if (document.body.classList.contains('window-open')) {
    if (e.key === 'Escape' && e.target.closest && e.target.closest('#field-window') && window.FieldWindow) {
      e.preventDefault(); window.FieldWindow.close();
    }
    return;
  }
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (GATE.leaving || GATE.returning) return;
  if (GATE.on) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterFromGate(e.key === 'Enter' ? 'skip' : 'burst'); } return; }
  if (e.key === 'Escape' && $('#masonry').classList.contains('open') && !LB.open) { closeMasonry(); return; }
  if (e.key === 'Escape' && $('#overlay').classList.contains('open') && !LB.open) { closeOverlay(); return; }
  if (e.key === 'Escape' && LB.open) { closeLightbox(); return; }
  if (e.key === 'Escape' && S.focus) { closeVillage(); return; }
  if (e.key === 'Escape') { e.preventDefault(); returnToGate(); return; }
  const k = e.key.toLowerCase();
  if ((k === 'g' || e.key === 'Backspace') && !LB.open && !$('#overlay').classList.contains('open') && !$('#masonry').classList.contains('open') && !S.focus) {
    e.preventDefault(); returnToGate(); return;
  }
  if (!LB.open && !$('#overlay').classList.contains('open') && !$('#masonry').classList.contains('open')) {
    if (k === '+' || k === '=') { zoomBy(1.18); e.preventDefault(); }
    else if (k === '-' || k === '_') { zoomBy(1 / 1.18); e.preventDefault(); }
    else if (k === '0' || k === ' ') { resetView(); e.preventDefault(); }
    else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { S.keys[k] = 1; e.preventDefault(); }
  }
  if (LB.open && e.key === 'ArrowRight') stepLightbox(1); if (LB.open && e.key === 'ArrowLeft') stepLightbox(-1);
});
addEventListener('keyup', e => { delete S.keys[e.key.toLowerCase()]; });
addEventListener('blur', () => { S.keys = Object.create(null); });
glc.addEventListener('wheel', e => { if (GATE.on) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * .0015)); }, { passive: false });
addEventListener('resize', resize);
['#back', '#prev', '#next', '#lb-close', '#lb-prev', '#lb-next'].forEach(s => $(s).dataset.interactive = s === '#back' ? '返回' : '');

/* ---------- draw lines ---------- */
function polyline(arr, upto = 1) {
  const n = arr.length / 3, m = Math.floor(n * clamp(upto, 0, 1)); if (m < 2) return;
  let p = proj(arr[0], arr[1], arr[2]); ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < m; i++) { p = proj(arr[i*3], arr[i*3+1], arr[i*3+2]); ctx.lineTo(p[0], p[1]); }
}
function pointAt(arr, t) { const n = arr.length / 3 - 1, f = clamp(t, 0, 1) * n, i = Math.min(Math.floor(f), n - 1), k = f - i;
  return [lerp(arr[i*3], arr[i*3+3], k), lerp(arr[i*3+1], arr[i*3+4], k), lerp(arr[i*3+2], arr[i*3+5], k)]; }
function drawLines(T) {
  const W = S.W, H = S.H; ctx.setTransform(S.pr, 0, 0, S.pr, 0, 0); ctx.clearRect(0, 0, W, H);
  const fa = S.focusAmt, it = T; // seconds since intro start
  const pGrid = easeOut((it - .2) / 1.5), pFrame = easeOut((it - .7) / 1.6), pCont = easeInOut((it - .7) / 2.6), pRoad = easeInOut((it - 1.3) / 2.0), pRoute = easeInOut((it - 2.9) / 1.6);
  // grid
  if (pGrid > 0) {
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(127,244,255,${.035 * pGrid})`; ctx.beginPath();
    G.grid.forEach(([x0, z0, x1, z1]) => { const a = proj(x0, 0, z0); const ax = a[0], ay = a[1]; const b = proj(x1, 0, z1); ctx.moveTo(ax, ay); ctx.lineTo(b[0], b[1]); });
    ctx.stroke();
  }
  // frame + crosses + labels
  if (pFrame > 0) {
    ctx.strokeStyle = `rgba(127,244,255,${.32 * pFrame})`; ctx.lineWidth = 1; ctx.beginPath();
    const cl = .16 * pFrame;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a, b]) => { const x = a*MW/2, z = b*MH/2;
      let p = proj(x - a*cl*0, 0, z - b*cl); ctx.moveTo(p[0], p[1]); p = proj(x, 0, z); ctx.lineTo(p[0], p[1]); p = proj(x - a*cl, 0, z); ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    ctx.fillStyle = `rgba(127,244,255,${.22 * pFrame * (1 - fa * .6)})`;
    G.crosses.forEach(([x, z]) => { const p = proj(x, 0, z); ctx.fillRect(p[0] - 2.5, p[1] - .5, 5, 1); ctx.fillRect(p[0] - .5, p[1] - 2.5, 1, 5); });
    ctx.font = '9px GeistMonoLocal, monospace'; ctx.fillStyle = `rgba(127,244,255,${.45 * pFrame * (1 - fa * .7)})`; ctx.textAlign = 'center';
    for (let i = 0; i < 8; i++) { const p = proj(-MW/2 + (i + .5) * MW/8, 0, -MH/2 - .06); ctx.fillText(String.fromCharCode(65 + i), p[0], p[1]); }
    ctx.textAlign = 'right';
    for (let j = 0; j < 11; j++) { const p = proj(-MW/2 - .05, 0, -MH/2 + (j + .5) * MH/11); ctx.fillText(String(j + 1).padStart(2, '0'), p[0], p[1] + 3); }
  }
  // contours
  if (pCont > 0) {
    G.contours.forEach(c => {
      const a = (.07 + c.li * .035) * (1 - fa * .45);
      ctx.strokeStyle = c.li === 3 ? `rgba(160,250,255,${a * 1.6})` : `rgba(127,244,255,${a})`; ctx.lineWidth = c.li === 3 ? 1.1 : .8;
      const lp = clamp(pCont * 1.3 - c.li * .05, 0, 1);
      ctx.beginPath(); c.lines.forEach(l => polyline(l, lp)); ctx.stroke();
    });
  }
  // roads
  if (pRoad > 0) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(230,240,240,${.32 * (1 - fa * .3)})`; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); G.roads.forEach(r => polyline(r, pRoad)); ctx.stroke();
    // river: glow + core + flow
    ctx.strokeStyle = 'rgba(90,190,255,.10)'; ctx.lineWidth = 9; ctx.beginPath(); polyline(G.river, pRoad); ctx.stroke();
    ctx.strokeStyle = 'rgba(130,210,255,.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); polyline(G.river, pRoad); ctx.stroke();
    ctx.setLineDash([2, 16]); ctx.lineDashOffset = -S.t * 26; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); polyline(G.river, pRoad); ctx.stroke(); ctx.setLineDash([]);
    if (pRoad > .9) { const p = pointAt(G.river, .38), q = proj(p[0], p[1], p[2]); ctx.font = '9px GeistMonoLocal, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = `rgba(130,210,255,${.7 * (pRoad - .9) * 10})`; ctx.fillText('河道 / RIVER', q[0] + 12, q[1]); }
  }
  // farmland — terrace / field strips
  const pField = easeInOut((it - 1.5) / 2.2), pHouse = (it - 2.1) / 1.6;
  if (pField > 0 && G.fields.length) {
    ctx.lineWidth = .8;
    G.fields.forEach((f, k) => {
      const lp = clamp(pField * 1.4 - (k % 9) * .04, 0, 1); if (lp <= 0) return;
      ctx.strokeStyle = f.terrace ? `rgba(170,235,150,${.2 * (1 - fa * .4)})` : `rgba(150,215,255,${.16 * (1 - fa * .4)})`;
      ctx.beginPath(); polyline(f.arr, lp); ctx.stroke();
    });
  }
  if (pRoad > 0 && G.paths.length) {
    ctx.setLineDash([1.5, 3.5]); ctx.strokeStyle = `rgba(230,240,240,${.28 * (1 - fa * .3)})`; ctx.lineWidth = .9;
    ctx.beginPath(); G.paths.forEach(r => polyline(r, pRoad)); ctx.stroke(); ctx.setLineDash([]);
  }
  // houses — glowing footprints
  if (pHouse > 0 && G.houses.length) {
    G.houses.forEach((h, k) => {
      const a = clamp(pHouse * 1.6 - (k % 23) * .05, 0, 1); if (a <= 0) return;
      const dimK = S.theme && !(h.v.themes || []).includes(S.theme) ? .35 : 1;
      const foc = S.focus ? (S.focus === h.v ? 1.4 : .45) : 1;
      const c = h.rgb || (h.rgb = hex3(h.color).map(x => Math.round(x * 255)).join(','));
      ctx.beginPath(); h.corners.forEach((q, i) => { const pp = proj(q[0], q[1] + (1 - easeOut(a)) * .05, q[2]); i ? ctx.lineTo(pp[0], pp[1]) : ctx.moveTo(pp[0], pp[1]); }); ctx.closePath();
      ctx.fillStyle = `rgba(${c},${.18 * a * dimK * foc})`; ctx.fill();
      ctx.strokeStyle = `rgba(${c},${.7 * a * dimK * Math.min(1, foc)})`; ctx.lineWidth = .8; ctx.stroke();
    });
  }
  // route arcs
  if (pRoute > 0) {
    G.routes.forEach((r, i) => {
      const lp = clamp(pRoute * G.routes.length - i, 0, 1); if (lp <= 0) return;
      ctx.strokeStyle = 'rgba(255,181,71,.16)'; ctx.lineWidth = 5; ctx.beginPath(); polyline(r, lp); ctx.stroke();
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -S.t * 14; ctx.strokeStyle = 'rgba(255,190,90,.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); polyline(r, lp); ctx.stroke(); ctx.setLineDash([]);
      if (lp >= 1) { // comet
        const t = ((S.t * .28 + i * .37) % 1), p = pointAt(r, t), q = proj(p[0], p[1], p[2]);
        const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 10); g.addColorStop(0, 'rgba(255,230,180,.95)'); g.addColorStop(1, 'rgba(255,181,71,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], 10, 0, 7); ctx.fill();
      }
    });
  }
  // village ground rings + stems
  V.forEach(v => {
    if (!v.shown) return;
    const act = S.focus === v, hov = S.hover === v || S.navHover === v;
    const R = .055 + (act ? .03 : 0) + (hov ? .015 : 0);
    v.ringR = lerp(v.ringR || R, R, .12);
    const vc = hex3(v.hex).map(x => Math.round(x * 255)).join(','), dimK = S.theme && !(v.themes || []).includes(S.theme) ? .3 : 1;
    ctx.strokeStyle = `rgba(${vc},${(act ? .8 : .45) * dimK})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, p = proj(v.x + Math.cos(a) * v.ringR, v.y + .004, v.z + Math.sin(a) * v.ringR); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
    // radar sweep
    const sw = S.t * 1.6 + v.i;
    ctx.fillStyle = `rgba(${vc},${(act ? .22 : .1) * dimK})`; ctx.beginPath(); let p = proj(v.x, v.y, v.z); ctx.moveTo(p[0], p[1]);
    for (let k = 0; k <= 16; k++) { const a = sw + k / 16 * .9; p = proj(v.x + Math.cos(a) * v.ringR, v.y + .004, v.z + Math.sin(a) * v.ringR); ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fill();
    const g = proj(v.x, v.y, v.z), gx = g[0], gy = g[1]; const t = proj(v.x, v.y + .075, v.z);
    const gr = ctx.createLinearGradient(gx, gy, t[0], t[1]); gr.addColorStop(0, `rgba(${vc},0)`); gr.addColorStop(1, `rgba(${vc},${.8 * dimK})`);
    ctx.strokeStyle = gr; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(t[0], t[1]); ctx.stroke();
  });
  // mouse scanner ring draped on terrain
  if (S.mstr > .04 && !S.focus) {
    const R = .3, a = S.mstr; ctx.setLineDash([3, 5]); ctx.lineDashOffset = S.t * 10; ctx.strokeStyle = `rgba(127,244,255,${.45 * a})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 0; k <= 72; k++) { const an = k / 72 * Math.PI * 2, x = S.wm[0] + Math.cos(an) * R, z = S.wm[1] + Math.sin(an) * R, p = proj(x, Math.max(0, terrain(x, z)) * HS + .06 * a, z); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke(); ctx.setLineDash([]);
    const cy = Math.max(0, terrain(S.wm[0], S.wm[1])) * HS, c0 = proj(S.wm[0], cy + .2 * a, S.wm[1]), c0x = c0[0], c0y = c0[1], c1 = proj(S.wm[0], 0, S.wm[1]);
    ctx.strokeStyle = `rgba(127,244,255,${.35 * a})`; ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c0x, c0y); ctx.stroke();
    ctx.fillStyle = `rgba(127,244,255,${.8 * a})`; ctx.fillRect(c1[0] - 2, c1[1] - 2, 4, 4);
    ctx.font = '9px GeistMonoLocal, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = `rgba(200,250,255,${.75 * a})`;
    const u = S.wm[0] / MW + .5, v = S.wm[1] / MH + .5;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) ctx.fillText(`${String.fromCharCode(65 + Math.min(7, Math.floor(u * 8)))}-${String(Math.min(11, Math.floor(v * 11) + 1)).padStart(2, '0')}  高 ${terrain(S.wm[0], S.wm[1]).toFixed(2)}`, c0x + 10, c0y - 8);
  }
  // fan tethers
  if (S.focus && fanCards.length) {
    const o = S.focus.screen; ctx.lineWidth = 1;
    fanCards.forEach(c => { if (!c._shown) return; c._a = lerp(c._a || 0, 1, .06);
      const ex = o[0] + c._pos[0], ey = o[1] + c._pos[1] + 6;
      const gr = ctx.createLinearGradient(o[0], o[1], ex, ey); gr.addColorStop(0, `rgba(255,181,71,${.7 * c._a})`); gr.addColorStop(1, 'rgba(255,181,71,0)');
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.quadraticCurveTo(o[0], ey + 30, ex, ey); ctx.stroke(); });
  }
}

/* ---------- loop ---------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
function frame(now) {
  if (document.body.classList.contains('window-open') && !GATE.on && !GATE.leaving && !GATE.returning) {
    last = now; requestAnimationFrame(frame); return;
  }
  const dt = Math.min(.05, (now - last) / 1000); last = now; S.t += dt;
  fpsAcc += dt; fpsN++; if (now - fpsT > 500) { S.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; fpsT = now; $('#s-fps').textContent = S.fps; }
  if (!P || !V.length || !VP && !S.W) { requestAnimationFrame(frame); return; }
  const T = S.t0 == null ? -1 : (now - S.t0) / 1000;
  S.intro = clamp(T / 2.8, 0, 1);
  // camera easing (+ mouse parallax)
  const rate = T < 3.2 ? 1.25 : 2.6, k = 1 - Math.exp(-dt * rate);
  if (T >= 0) for (const key of ['tx', 'tz', 'dist', 'pitch', 'yaw', 'sx', 'sy']) cam[key] = lerp(cam[key], goal[key], k);
  keyboardCam(dt);
  const mxn = S.mouse.in && !S.mouse.overUI ? S.mouse.x / S.W - .5 : 0, myn = S.mouse.in && !S.mouse.overUI ? S.mouse.y / S.H - .5 : 0;
  S.par = S.par || [0, 0]; S.par[0] = lerp(S.par[0], mxn, 1 - Math.exp(-dt * 2)); S.par[1] = lerp(S.par[1], myn, 1 - Math.exp(-dt * 2));
  const c = { ...cam, yaw: cam.yaw + S.par[0] * .16, pitch: cam.pitch - S.par[1] * .06 };
  VP = computeVP(c); VPinv = M4.inv(VP);
  // mouse in world
  const idle = (now - S.mouse.lastMove) / 1000;
  const speed = Math.min(1, Math.hypot(S.mouse.vx, S.mouse.vy) * .6);
  S.mstrT = S.mouse.in && !S.mouse.overUI && T > 1.5 ? (.6 + .4 * speed) * (idle > 4 ? .55 : 1) : 0;
  S.mstr = lerp(S.mstr, S.mstrT, 1 - Math.exp(-dt * 4));
  if (S.mouse.in) { const w = screenToWorld(S.mouse.x, S.mouse.y); if (w) S.wmT = w; }
  S.wm[0] = lerp(S.wm[0], S.wmT[0], 1 - Math.exp(-dt * 9)); S.wm[1] = lerp(S.wm[1], S.wmT[1], 1 - Math.exp(-dt * 9));
  S.focusAmt = lerp(S.focusAmt, S.focus ? 1 : 0, 1 - Math.exp(-dt * 2.5));
  // ---- GL draw
  gl.disable(gl.DEPTH_TEST); gl.clearColor(.012, .02, .027, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(BG); gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf); const bl = gl.getAttribLocation(BG, 'p'); gl.enableVertexAttribArray(bl); gl.vertexAttribPointer(bl, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(U.bgRes, S.W, S.H); gl.uniform2f(U.bgC, .5 + cam.sx * .5, .55 + cam.sy * .5); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(bl);
  gl.useProgram(P); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  const aP = gl.getAttribLocation(P, 'aP'), aR = gl.getAttribLocation(P, 'aR');
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, rBuf); gl.enableVertexAttribArray(aR); gl.vertexAttribPointer(aR, 4, gl.FLOAT, false, 0, 0);
  const aGl = gl.getAttribLocation(P, 'aG');
  if (aGl >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, gBuf); gl.enableVertexAttribArray(aGl); gl.vertexAttribPointer(aGl, 4, gl.FLOAT, false, 0, 0); }
  gateUniforms(dt);
  gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform2f(U.uShift, cam.sx, cam.sy); gl.uniform1f(U.uT, S.t); gl.uniform1f(U.uHS, HS);
  gl.uniform1f(U.uIntro, easeOut(S.intro)); gl.uniform1f(U.uPR, S.pr); gl.uniform1f(U.uK, 1.75 * clamp(S.H / 900, .7, 1.4)); gl.uniform1f(U.uZ, overviewDist);
  gl.uniform1f(U.uFocusAmt, S.focusAmt); gl.uniform1f(U.uMStr, S.mstr); gl.uniform2f(U.uMouse, S.wm[0], S.wm[1]);
  gl.uniform2f(U.uFocus, S.focus ? S.focus.x : 0, S.focus ? S.focus.z : 0);
  const rip = new Float32Array(16); S.ripples.slice(-4).forEach((r, i) => rip.set(r, i * 4)); for (let i = S.ripples.length; i < 4; i++) rip[i*4+2] = -99;
  gl.uniform4fv(U.uRip, rip);
  // theme highlight
  const hl = new Float32Array(16), hlc = new Float32Array(12);
  V.forEach((v, i) => { if (i > 3) return; const on = S.theme ? ((v.themes || []).includes(S.theme) ? 1 : 0) : 0; v.hlA = lerp(v.hlA || 0, on, 1 - Math.exp(-dt * 3));
    hl.set([v.x, v.z, Math.max(v.hlA, S.focus === v ? S.focusAmt : 0), 0], i * 4); const c = hex3(v.hex); hlc.set(c, i * 3); });
  S.themeAmt = lerp(S.themeAmt, S.theme ? 1 : 0, 1 - Math.exp(-dt * 3));
  gl.uniform4fv(U.uHL, hl); gl.uniform3fv(U.uHLC, hlc); gl.uniform1f(U.uThemeAmt, S.themeAmt);
  gl.drawArrays(gl.POINTS, 0, NPTS);
  // ---- markers
  let hov = null, best = 1e9;
  V.forEach((v, i) => {
    const p = proj(v.x, v.y + .075, v.z); v.screen = [p[0], p[1]];
    if (!v.shown && T > 2.5 + i * .16) { v.shown = true; v.el.classList.remove('enter'); }
    const dx = S.mouse.x - p[0], dy = S.mouse.y - p[1], d = Math.hypot(dx, dy);
    const near = S.mouse.in && !S.mouse.overUI && d < 70 && v.shown;
    if (near && d < 34 && d < best) { best = d; hov = v; }
    v.mag.style.transform = near ? `translate(${dx * .22}px,${dy * .22}px)` : 'translate(0,0)';
    v.el.style.transform = `translate3d(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px,0)`;
    v.el.style.zIndex = String(Math.round(1000 - p[2] * 10));
  });
  if (hov !== S.hover) { S.hover = hov; if (!document.querySelector('[data-interactive]:hover')) { cursor.classList.toggle('big', !!hov); if (hov) cLabel.textContent = '进入'; } }
  V.forEach(v => v.el.classList.toggle('hover', v === S.hover || v === S.navHover));
  glc.style.cursor = S.hover ? 'pointer' : '';
  // fan follows village
  if (S.focus) { const o = S.focus.screen; fan.style.transform = `translate3d(${o[0]}px,${o[1]}px,0)`; }
  // ---- lines
  drawLines(T < 0 ? -1 : T);
  // ---- HUD
  if (T > 0) {
    $('#s-cam').textContent = (c.pitch * 180 / Math.PI).toFixed(1) + '°';
    $('#s-zoom').textContent = (overviewDist / cam.dist).toFixed(2) + 'x';
    const u = S.wm[0] / MW + .5, v = S.wm[1] / MH + .5;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { $('#r-grid').textContent = String.fromCharCode(65 + Math.min(7, Math.floor(u * 8))) + '-' + String(Math.min(11, Math.floor(v * 11) + 1)).padStart(2, '0'); $('#r-elev').textContent = terrain(S.wm[0], S.wm[1]).toFixed(2); }
    else { $('#r-grid').textContent = '—'; $('#r-elev').textContent = '—'; }
    $('#compass').style.transform = `rotate(${(c.yaw * 180 / Math.PI).toFixed(1)}deg)`;
  }
  // cursor
  ring.x = lerp(ring.x, S.mouse.x, 1 - Math.exp(-dt * 14)); ring.y = lerp(ring.y, S.mouse.y, 1 - Math.exp(-dt * 14));
  cDot.style.transform = `translate3d(${S.mouse.x}px,${S.mouse.y}px,0)`; cRing.style.transform = `translate3d(${ring.x}px,${ring.y}px,0)`;
  requestAnimationFrame(frame);
}

/* ---------- helpers: color ---------- */
function hex3(h) { h = (h || '#ffb547').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }

/* ---------- entry gate (particle 门楼) ---------- */
const GATE = { on: false, leaving: false, returning: false, mode: 'burst', t0: 0, yaw: -.25, pitch: .04, vy: 0, vp: 0, drag: null, dv: [0, 0], hover: 0, burst: 0, morph: 0, bbox: null, shownAt: 0 };
function rotYX(y, x) { const cy = Math.cos(y), sy = Math.sin(y), cx = Math.cos(x), sx = Math.sin(x);
  // R = Ry * Rx (column-major)
  return new Float32Array([cy, 0, -sy, 0,  sy * sx, cx, cy * sx, 0,  sy * cx, -sx, cy * cx, 0,  0, 0, 0, 1]); }
function gateVP() {
  const asp = S.W / S.H, t = Math.tan(17 * Math.PI / 180);
  const dist = Math.max(5.4, 2.75 / (2 * t * asp));
  const pr = M4.persp(34 * Math.PI / 180, asp, .05, 60);
  const v = M4.look([0, .05, dist], [0, IS_MOBILE ? -.05 : -.3, 0], [0, 1, 0]);
  return M4.mul(M4.mul(pr, v), rotYX(GATE.yaw, GATE.pitch));
}
function gateUniforms(dt) {
  if (!GATE.on) { gl.uniform1f(U.uGateOn, 0); return; }
  const now = performance.now();
  if (!GATE.drag) {
    const tgtY = (GATE.leaving || GATE.returning ? GATE.yaw : Math.sin(S.t * .35) * .22 - .08), tgtP = .04 + Math.sin(S.t * .27) * .03;
    GATE.vy += (tgtY - GATE.yaw) * 3.2 * dt; GATE.vp += (tgtP - GATE.pitch) * 5 * dt;
    GATE.vy *= Math.exp(-dt * 1.6); GATE.vp *= Math.exp(-dt * 2.4);
    GATE.yaw += GATE.vy * dt * 6; GATE.pitch += GATE.vp * dt * 6;
  }
  GATE.pitch = clamp(GATE.pitch, -.6, .6);
  // elastic lag vector decays toward 0
  GATE.dv[0] *= Math.exp(-dt * 3.2); GATE.dv[1] *= Math.exp(-dt * 3.2);
  GATE.hover = lerp(GATE.hover, S.mouse.in && !GATE.leaving && !GATE.returning ? 1 : 0, 1 - Math.exp(-dt * 4));
  let burst = 0, morph = 0;
  if (GATE.leaving) {
    const tl = (now - GATE.t0) / 1000, sk = GATE.mode === 'skip';
    const bD = sk ? .35 : .95, mS = sk ? .12 : .6, mD = sk ? 1.5 : 2.9;
    burst = easeOut(tl / bD);
    morph = clamp((tl - mS) / mD, 0, 1);
    if (tl > mS && S.t0 == null) startMap();
    GATE.yaw += dt * (sk ? .2 : .9) * (1 - morph);
    if (morph >= 1 && tl > mS + mD + .1) { GATE.on = false; GATE.leaving = false; $('#gate') && $('#gate').remove(); document.body.classList.remove('gate'); }
  } else if (GATE.returning) {
    const tl = (now - GATE.t0) / 1000;
    const mD = 2.4, bRise = .55, bFallS = 1.85, bFallD = 1.05;
    morph = 1 - easeInOut(tl / mD);
    if (tl < bRise) burst = easeOut(tl / bRise);
    else if (tl < bFallS) burst = 1;
    else burst = 1 - easeInOut((tl - bFallS) / bFallD);
    GATE.yaw += dt * .35 * (1 - morph);
    if (tl > bFallS + bFallD + .12) finishReturnToGate();
  }
  GATE.burst = burst; GATE.morph = morph;
  const m = gateVP(); GATE.vp4 = m;
  gl.uniformMatrix4fv(U.uGVP, false, m);
  gl.uniform1f(U.uGateOn, GATE.on ? 1 : 0); gl.uniform1f(U.uMorph, morph); gl.uniform1f(U.uBurst, burst);
  gl.uniform1f(U.uGHover, GATE.hover); gl.uniform1f(U.uAspect, S.W / S.H);
  gl.uniform2f(U.uGMouse, S.mouse.x / S.W * 2 - 1, 1 - S.mouse.y / S.H * 2);
  gl.uniform2f(U.uGDrag, GATE.dv[0], GATE.dv[1]);
  // bbox for click test
  const pts = [[-1.15, -.95, 0], [1.15, -.95, 0], [-1.15, 1.2, 0], [1.15, 1.2, 0]].map(([x, y, z]) => proj(x, y, z, 0, 0, m).slice(0, 2));
  GATE.bbox = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}
function inGate(x, y) { const b = GATE.bbox; return b && x > b[0] - 20 && x < b[2] + 20 && y > b[1] - 20 && y < b[3] + 20; }
function showGate(opts) {
  opts = opts || {};
  GATE.on = true; GATE.leaving = false; GATE.returning = !!opts.fromReturn; GATE.shownAt = performance.now();
  GATE.burst = 0; GATE.morph = 0; GATE.drag = null; GATE.dv = [0, 0]; GATE.hover = 0;
  GATE.yaw = -.25; GATE.pitch = .04; GATE.vy = 0; GATE.vp = 0;
  document.body.classList.add('gate');
  document.body.classList.remove('ready', 'focus');
  let el = $('#gate');
  if (!el) {
    el = document.createElement('div'); el.id = 'gate';
    el.innerHTML = `<div class="g-title"><span class="g-k mono">田野笔记 · 永丰四村</span><h1>《田埂退潮之后》</h1><p class="mono">一扇由粒子组成的门 · 推开它，门会散成整座村落的地形</p></div>
      <div class="g-hint mono"><span>拖动门</span><i></i><span>点击进入</span><i></i><span><kbd>回车</kbd> 直接进入</span></div>
      <button class="g-skip mono" id="gate-skip">跳过 →</button>`;
    document.getElementById('app').appendChild(el);
    $('#gate-skip').addEventListener('click', e => { e.stopPropagation(); enterFromGate('skip'); });
  }
  el.classList.remove('out', 'in');
  if (opts.reveal) requestAnimationFrame(() => el.classList.add('in'));
  else if (!opts.fromReturn) requestAnimationFrame(() => el.classList.add('in'));
}
function finishReturnToGate() {
  if (!GATE.returning) return;
  GATE.returning = false; GATE.leaving = false; GATE.burst = 0; GATE.morph = 0;
  GATE.shownAt = performance.now();
  const el = $('#gate'); if (el) { el.classList.remove('out'); requestAnimationFrame(() => el.classList.add('in')); }
}
function returnToGate() {
  if (GATE.on || GATE.leaving || GATE.returning) return;
  // close any map UI first
  if (LB.open) closeLightbox();
  if ($('#masonry').classList.contains('open')) closeMasonry();
  if ($('#overlay').classList.contains('open')) closeOverlay();
  if (S.focus) closeVillage();
  // freeze map intro / clear HUD
  S.t0 = null; S.intro = 0; S.focusAmt = 0; S.theme = null; S.themeAmt = 0;
  S.userZoom = 1; S.panX = 0; S.panZ = 0; S.ripples = [];
  document.body.classList.remove('ready', 'focus');
  if (typeof setTheme === 'function') setTheme(null);
  V.forEach(v => { v.shown = false; v.el.classList.add('enter'); v.el.classList.remove('active', 'hover'); if (v.nav) v.nav.classList.remove('on'); });
  // reset camera to pre-intro fly-in so next enter animates again
  Object.assign(cam, { tx: 0, tz: .05, dist: 6, pitch: 1.35, yaw: -.55, sx: 0, sy: 0 });
  setOverviewGoal();
  Object.assign(goal, { dist: overviewDist, pitch: .98, yaw: -.08 });
  if (!document.body.classList.contains('window-open')) history.replaceState(null, '', location.pathname);
  // mount gate DOM (hidden until settle) and start reverse morph
  showGate({ fromReturn: true });
  GATE.returning = true; GATE.t0 = performance.now(); GATE.morph = 1; GATE.burst = 0;
  const el = $('#gate'); if (el) el.classList.add('out');
}
function enterFromGate(mode) {
  if (!GATE.on || GATE.leaving || GATE.returning) return;
  GATE.leaving = true; GATE.returning = false; GATE.mode = mode; GATE.t0 = performance.now(); GATE.drag = null;
  const el = $('#gate'); if (el) el.classList.add('out');
  cursor.classList.remove('big');
}
addEventListener('pointerdown', e => {
  if (!GATE.on || GATE.leaving || GATE.returning || e.target.closest('#gate-skip')) return;
  GATE.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
});
addEventListener('pointermove', e => {
  if (!GATE.on || GATE.leaving || GATE.returning) return;
  const over = inGate(e.clientX, e.clientY);
  cursor.classList.toggle('big', over || !!GATE.drag); cLabel.textContent = GATE.drag ? '拖动' : '推门';
  const d = GATE.drag; if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
  d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.sx, e.clientY - d.sy));
  GATE.yaw += dx * .006; GATE.pitch += dy * .004;
  GATE.vy = dx * .05; GATE.vp = dy * .03;
  GATE.dv[0] = clamp(GATE.dv[0] + dx * .004, -.35, .35); GATE.dv[1] = clamp(GATE.dv[1] - dy * .004, -.35, .35);
}, { passive: true });
addEventListener('pointerup', e => {
  if (!GATE.on || GATE.leaving || GATE.returning) return;
  const d = GATE.drag; GATE.drag = null; if (!d) return;
  if (d.moved < 6 && performance.now() - GATE.shownAt > 500) {
    if (inGate(e.clientX, e.clientY)) enterFromGate('burst');
    else { const h = $('#gate .g-hint'); if (h) { h.classList.remove('nudge'); void h.offsetWidth; h.classList.add('nudge'); } }
  }
});

/* ---------- keyboard / wheel camera ---------- */
function zoomBy(f) {
  if (GATE.on) return;
  if (S.focus) { goal.dist = clamp(goal.dist / f, overviewDist * .18, overviewDist * 1.1); }
  else { S.userZoom = clamp(S.userZoom * f, .6, 4.5); setOverviewGoal(); }
  flashHint();
}
function resetView() { S.userZoom = 1; S.panX = 0; S.panZ = 0; if (S.focus) closeVillage(); else setOverviewGoal(); flashHint(); }
function keyboardCam(dt) {
  if (GATE.on) return;
  const K = S.keys; let dx = 0, dz = 0;
  if (K.arrowleft || K.a) dx -= 1; if (K.arrowright || K.d) dx += 1; if (K.arrowup || K.w) dz -= 1; if (K.arrowdown || K.s) dz += 1;
  if (!dx && !dz) return;
  const sp = .9 * dt / (S.focus ? 2 : S.userZoom), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const wx = (dx * cy + dz * sy) * sp, wz = (-dx * sy + dz * cy) * sp;
  if (S.focus) { goal.tx = clamp(goal.tx + wx, -1.4, 1.4); goal.tz = clamp(goal.tz + wz, -1.6, 1.6); }
  else { S.panX = clamp(S.panX + wx, -1.2, 1.2); S.panZ = clamp(S.panZ + wz, -1.4, 1.4); setOverviewGoal(); }
}
let hintT = 0;
function flashHint() { const h = $('#hint'); if (!h) return; h.classList.add('flash'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('flash'), 900); }

/* ---------- UI: themes, quotes, overlays, masonry ---------- */
function buildUI() {
  const th = $('#themes'); th.innerHTML = '';
  const all = document.createElement('button'); all.className = 'theme-chip on'; all.textContent = '全部'; all.dataset.id = ''; th.appendChild(all);
  DATA.themes.forEach(t => { const b = document.createElement('button'); b.className = 'theme-chip'; b.textContent = t.name; b.dataset.id = t.id; th.appendChild(b); });
  th.addEventListener('click', e => { const b = e.target.closest('.theme-chip'); if (b) setTheme(b.dataset.id || null); });
  // quote ticker
  const qs = DATA.quotes || []; let qi = 0;
  const showQ = () => { if (!qs.length) return; const q = qs[qi++ % qs.length], tEl = $('#qt-text'), bEl = $('#qt-by');
    const box = $('#quote-ticker'); box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = () => {
      tEl.textContent = '「' + q.text + '」'; const v = q.vid && V.find(x => x.id === q.vid); bEl.textContent = '— ' + (q.by || '') + (v ? ' · ' + (v.short || v.name) : '');
      box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' }); }; };
  showQ(); setInterval(showQ, 7000);
  document.querySelectorAll('#top-nav [data-overlay]').forEach(b => b.addEventListener('click', () => b.dataset.overlay === 'gallery' ? openMasonry(null) : openOverlay(b.dataset.overlay)));
  $('#ov-close').addEventListener('click', closeOverlay); $('#ov-bg').addEventListener('click', closeOverlay);
  $('#ms-close').addEventListener('click', closeMasonry);
  const gb = $('#gate-back'); if (gb) gb.addEventListener('click', e => { e.stopPropagation(); returnToGate(); });
  $('#ov-body').addEventListener('click', e => { const t = e.target.closest('[data-vid]'); if (t) { closeOverlay(); setTimeout(() => openVillage(V.find(v => v.id === t.dataset.vid)), 350); } });
}
function setTheme(id) {
  S.theme = id || null;
  document.querySelectorAll('.theme-chip').forEach(b => b.classList.toggle('on', (b.dataset.id || null) === S.theme));
  V.forEach(v => v.el.classList.toggle('dim', !!S.theme && !(v.themes || []).includes(S.theme)));
  V.forEach(v => v.el.classList.toggle('hi', !!S.theme && (v.themes || []).includes(S.theme)));
}
const esc = t => String(t == null ? '' : t);
function vName(id) { const v = V.find(x => x.id === id); return v ? `<b data-vid="${v.id}" style="color:${v.hex};cursor:pointer">${v.short || v.name}</b>` : ''; }
function openOverlay(name) {
  const b = $('#ov-body'), A = DATA.about; let h = '';
  if (name === 'about') {
    const kv = (arr) => `<div class="ov-grid">${(arr || []).map(x => `<div class="ov-card-item"><b>${esc(x.k)}</b><span>${esc(x.v)}</span></div>`).join('')}</div>`;
    h = `<div class="mono" style="font-size:10px;color:var(--cyan);letter-spacing:.2em">项目</div><h2>${esc(DATA.site.title)}</h2>
      <p class="lead">${esc(DATA.site.author || '')}</p>
      ${(A.titles || []).length ? `<h3>题目</h3><ul>${A.titles.map(t => `<li><b>${esc(t.t)}</b>${t.s ? ' — ' + esc(t.s) : ''}${t.m ? `<br><span style="color:var(--muted);font-size:12px">${esc(t.m)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <h3>缘起</h3><p>${esc(A.origin)}</p><h3>假设</h3><p>${esc(A.hypothesis)}</p><h3>问题</h3><p>${esc(A.question)}</p>
      <h3>方法</h3>${kv(A.methods)}<h3>发现</h3>${kv(A.findings)}<h3>回答</h3><p style="font-family:var(--serif);font-size:17px;color:#fff">${esc(A.answer)}</p>
      ${(A.install || []).length ? `<h3>装置</h3>${kv(A.install)}` : '<h3>装置</h3>'}<p><button type="button" class="to-window" data-window="1" data-interactive="退潮线">打开窗 · 退潮线</button></p>${(A.senses || []).length ? `<h3>感官</h3>${kv(A.senses)}` : ''}
      ${(A.limits || []).length ? `<h3>局限</h3><ul>${A.limits.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(A.refs || []).length ? `<h3>延伸参照</h3>${A.refs.map(r => `<div class="ref-q">${esc(r.q)}<cite>— ${esc(r.by)}</cite></div>`).join('')}<p class="mem-note">${esc(A.refsNote)}</p>` : ''}
      <h3>致谢</h3><p>${esc(A.thanks)}</p>`;
  } else if (name === 'timeline') {
    h = `<div class="mono" style="font-size:10px;color:var(--cyan);letter-spacing:.2em">时间线</div><h2>走访顺序</h2><p class="lead">${esc(DATA.timelineNote || '')}</p>
      <div class="tl">${DATA.timeline.map(x => `<div class="tl-item"><span class="d">${esc(x.d)}</span><b>${esc(x.t)}</b><p>${esc(x.v)}</p>${x.vid ? vName(x.vid) + ' <span class="mono" style="font-size:10px;color:var(--muted)">→ 在地图上打开</span>' : ''}</div>`).join('')}</div>`;
  } else if (name === 'compare') {
    const C = DATA.compare;
    h = `<div class="mono" style="font-size:10px;color:var(--cyan);letter-spacing:.2em">四村对比</div><h2>${esc(C.tagline)}</h2><p class="lead">从深山到平原：土地流转越彻底，身体越往屋檐下聚。</p>
      <table class="cmp"><tr><th></th>${C.cols.map(id => `<th class="v">${vName(id)}</th>`).join('')}</tr>
      ${C.rows.map(r => `<tr><td class="k">${esc(r.k)}</td>${r.v.map((x, i) => `<td>${esc(x)}${r.lv ? `<br><span class="lv" style="width:${r.lv[i] * 22}%;background:${(V.find(v => v.id === C.cols[i]) || {}).hex}"></span>` : ''}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  b.innerHTML = h; $('#overlay').classList.add('open'); $('#overlay').setAttribute('aria-hidden', 'false');
  document.querySelectorAll('#top-nav button').forEach(x => x.classList.toggle('on', x.dataset.overlay === name));
  b.parentElement.scrollTop = 0;
}
function closeOverlay() { $('#overlay').classList.remove('open'); $('#overlay').setAttribute('aria-hidden', 'true'); document.querySelectorAll('#top-nav button').forEach(x => x.classList.remove('on')); }
function openMasonry(v) {
  const list = v ? v.photos.map(p => ({ ...p, v })) : V.flatMap(vv => vv.photos.map(p => ({ ...p, v: vv })));
  $('#ms-title').textContent = v ? v.name + ' · 全部照片' : '图库 · 四村';
  $('#ms-count').textContent = `${list.length} 张 · 点击放大`;
  const gw = $('#ms-grid'); gw.innerHTML = ''; gw.scrollTop = 0; const g = document.createElement('div'); g.className = 'ms-cols'; gw.appendChild(g);
  list.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'ms-item' + (p.face ? ' face' : '');
    d.innerHTML = `<img src="${p.thumb || p.src}" alt="" loading="lazy" width="${p.w || 400}" height="${p.h || 300}" style="height:auto;aspect-ratio:${p.w || 4}/${p.h || 3}"><div class="cap">${esc(p.caption)}${v ? '' : ' · ' + (p.v.short || p.v.name)}</div>`;
    d.addEventListener('click', () => openLightbox(d.querySelector('img'), list, i));
    g.appendChild(d); setTimeout(() => d.classList.add('in'), 40 + Math.min(i, 40) * 30);
  });
  $('#masonry').classList.add('open'); $('#masonry').setAttribute('aria-hidden', 'false');
}
function closeMasonry() { $('#masonry').classList.remove('open'); $('#masonry').setAttribute('aria-hidden', 'true'); }

/* ---------- boot ---------- */
async function loadHM(src) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; HW = c.width; HH = c.height; HM = new Float32Array(HW * HH);
  for (let i = 0; i < HW * HH; i++) HM[i] = d[i * 4] / 255;
}
async function boot() {
  const ldNum = $('#ld-num'), ldBar = $('#ld-bar'); const st = performance.now(); let prog = 0, target = .15;
  const tick = () => { prog = lerp(prog, target, .12); const n = Math.round(prog * 100); ldNum.textContent = String(n).padStart(2, '0'); ldBar.style.width = n + '%'; if (prog < .995) requestAnimationFrame(tick); };
  tick();
  const [data] = await Promise.all([fetch('data.json').then(r => r.json()), loadHM('data/height.png')]);
  DATA = data; target = .45;
  V = DATA.villages.map((v, i) => { const [x, z] = uv2w(v.uv[0], v.uv[1]); return { ...v, i, x, z, y: Math.max(0, terrain(x, z)) * HS }; });
  // preload first photos
  const pre = V.flatMap(v => v.photos.slice(0, 3).map(p => { const im = new Image(); im.src = p.src; return im.decode().catch(() => {}); }));
  buildParticles(); target = .7;
  buildLines(); buildMarkers(); resize();
  await Promise.race([Promise.all(pre), new Promise(r => setTimeout(r, 2500))]);
  target = 1;
  const wait = Math.max(0, 1300 - (performance.now() - st)); await new Promise(r => setTimeout(r, wait));
  $('#loader').classList.add('done');
  buildUI();
  const win = window.FieldWindow && window.FieldWindow.parse(location.hash);
  const h = location.hash.slice(1); const hv = !win && V.find(v => v.id === h);
  const noGate = hv || win || /[?&]nogate/.test(location.search);
  if (noGate) { startMap(); if (hv) setTimeout(() => openVillage(hv), 3200); }
  else showGate();
  if (window.FieldWindow) window.FieldWindow.onMapReady();
}
function startMap() {
  if (S.t0 != null) return;
  $('#title').textContent = ''; splitChars($('#title'), DATA.site.title, .35, .085);
  $('#intro').textContent = DATA.site.intro; $('#note').textContent = DATA.site.note;
  if (DATA.site.kicker) $('#kicker').textContent = DATA.site.kicker;
  if (DATA.site.author) $('#author').textContent = DATA.site.author;
  S.t0 = performance.now();
  requestAnimationFrame(() => document.body.classList.add('ready'));
  setTimeout(() => scramble($('#subtitle'), DATA.site.subtitle, 1300), 900);
}
requestAnimationFrame(frame);
boot().catch(e => { console.error(e); $('#ld-num').textContent = '失败'; });
window.__app = { S, V: () => V, open: id => openVillage(V.find(v => v.id === id)), close: closeVillage, cam, goal, GATE, enter: m => enterFromGate(m || 'burst'), back: () => returnToGate(), theme: id => setTheme(id), overlay: n => openOverlay(n), masonry: id => openMasonry(id ? V.find(v => v.id === id) : null), zoomBy: z => zoomBy(z), reset: () => resetView() };
})();
