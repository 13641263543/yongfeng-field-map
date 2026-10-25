/*
 * 舞台：three.js 渲染器、黑底透视网格、无限循环的卡片转鼓、卡片上的 DOM 标签、鼠标扰动。
 * 只管「画」和「滚」，不知道路由和 DOM 面板；要打开作品时调用 opts.onOpen(i)。
 *
 * 卡片 → 详情的连续形变由 js/transition.js 驱动，这里只读 stage.focus：
 *   focus.index   正在形变的卡片（-1 表示没有）
 *   focus.morph   0 = 在转鼓上，1 = 压平、放大到面板的位置和大小（位置/旋转/缩放/圆角/弯曲都按它插值）
 *   focus.mix     0 = 卡片画面，1 = 纸色面板 + 右侧图位里的原图
 *   focus.target  面板与图位的屏幕矩形（px），由 setMorphTarget() 写入
 *   focus.hidden  形变结束、DOM 面板接手后把这张卡藏起来
 */
import * as THREE from 'three';
import { makeTypeCanvas, ensureFonts, loadImage } from './typecards.js';

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const arrowSvg = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const MORPH_DIST = 6;                 // 形变终点：卡片停在相机前方 6 个单位、正对相机

/* 卡片顶点：鼓面 + 速度弯折/错切（形变时按 uMorph 收平）+ 鼠标处的鼓包 */
const cardVert = /* glsl */`
  uniform vec2 uSize, uMouse, uMDir;
  uniform float uVel, uBulge, uBend, uShear, uMorph, uPush;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    float nx = p.x / (uSize.x * .5);
    float ny = p.y / (uSize.y * .5);
    float k = 1. - uMorph;
    p.z += uBulge * cos(nx * 1.5708) * k;
    p.z -= abs(uVel) * uBend * nx * nx * k;
    p.z += uVel * uBend * .35 * nx * k;
    p.x += uVel * uShear * ny * uSize.y * .5 * k;
    p.y -= abs(uVel) * .06 * uSize.y * nx * nx * k;
    // 鼠标：以光标为中心、半径约 0.35 张卡的软鼓包，往光标运动方向拖一点
    vec2 d = (uv - uMouse) * vec2(1., uSize.y / uSize.x);
    float f = 1. - smoothstep(0., .35, length(d));
    f = f * f * (3. - 2. * f);
    p.z += uPush * f * uSize.y * .16 * k;
    p.xy += uMDir * uPush * f * uSize.y * .035 * k;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }`;

/* 卡片片元：画面（漂移、去饱和、底部压暗、光标处液态波纹 + 色差）→ 纸色面板 + 图位 */
const cardFrag = /* glsl */`
  uniform sampler2D uTex, uRaw, uLine;
  uniform vec2 uSize, uDim, uMouse, uMDir;
  uniform vec3 uPaper;
  uniform vec4 uImg;
  uniform float uRad, uImgRad, uRawAspect, uLineAspect, uLineOn, uMix, uTime, uSeed, uFade, uMotion, uHover, uPush;
  varying vec2 vUv;
  float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.), f.x), f.y); }
  // 溶解用的颗粒：两层值噪声，按实际尺寸取样，所以卡片和面板上颗粒一样大
  float grain(vec2 p){ return vnoise(p) * .65 + vnoise(p * 2.7 + 7.1) * .35; }
  // cover 方式把一张 aspect 的图铺进 aspect 为 ra 的矩形
  vec2 cover(vec2 uv, float ra, float aspect){
    if (ra > aspect) uv.y = (uv.y - .5) * aspect / ra + .5; else uv.x = (uv.x - .5) * ra / aspect + .5;
    return uv; }
  void main(){
    // 光标附近的液态波纹和色差，随鼠标速度出现、静止时归零
    vec2 dm = (vUv - uMouse) * vec2(1., uSize.y / uSize.x);
    float dist = length(dm);
    float f = (1. - smoothstep(0., .35, dist)) * uPush * (1. - uMix);
    vec2 dir = dist > 1e-4 ? dm / dist : vec2(0.);
    vec2 ripple = dir * sin(dist * 70. - uTime * 9.) * .007 * f;
    vec2 co = (uMDir + dir * .4) * .007 * f;

    float z = 1.05 + .03 * sin(uTime * .11 + uSeed) * uMotion + .015 * uHover;
    vec2 dr = vec2(sin(uTime * .07 + uSeed), cos(uTime * .053 + uSeed * 1.7)) * .014 * uMotion;
    vec2 uv = (vUv - .5) / z + .5 + dr + ripple;
    vec3 col = vec3(texture2D(uTex, uv + co).r, texture2D(uTex, uv).g, texture2D(uTex, uv - co).b);
    float l = dot(col, vec3(.299, .587, .114));
    col = mix(vec3(l), col, .86) * vec3(1.02, 1., .95);
    col *= mix(.5, 1., smoothstep(.0, .34, vUv.y));

    // 线稿「先画后建」：鼠标划过时，光标周围的效果图被颗粒状地溶回线稿，停下就长回效果图
    vec2 pw = vUv * uDim;
    float gn = grain(pw / uDim.y * 11. + uSeed);
    if (uLineOn > .5) {
      float reveal = (1. - smoothstep(.04, .3, dist)) * smoothstep(.16, .75, uPush) * (1. - uMix);
      float t = reveal * 1.2;
      float m = smoothstep(gn - .07, gn + .07, t);
      float ink = clamp((1. - texture2D(uLine, cover(uv, uSize.x / uSize.y, uLineAspect)).r) * 2.4, 0., 1.);   // 不放进分支：mipmap 取样要连续导数；细线缩小后会变淡，加一点墨
      vec3 drawn = uPaper * (1. - ink * .86);                    // 纸上的线稿
      col = mix(col, drawn, m);
      col *= 1. - .35 * (smoothstep(gn - .1, gn, t) - smoothstep(gn, gn + .1, t));   // 溶解边缘一圈淡墨
    }

    // 形变：原图从整张卡收进右侧图位，其余部分褪成纸色
    col = mix(col, uPaper, smoothstep(.25, .75, uMix));   // 先带着作品图长大，快压平时才褪成纸色（对照 Awwwards 录屏 f028–f035）
    vec2 r0 = uImg.xy * uDim, r1 = uImg.zw * uDim;
    vec2 rh = max((r1 - r0) * .5, vec2(1e-5));
    float di = sdBox(pw - (r0 + r1) * .5, rh, uImgRad);
    float ai = 1. - smoothstep(-max(fwidth(di), 1e-5), max(fwidth(di), 1e-5), di);
    vec2 luv = (pw - r0) / (rh * 2.);
    float ra = rh.x / rh.y;
    vec3 slot = texture2D(uRaw, cover(luv, ra, uRawAspect)).rgb;
    col = mix(col, slot, ai * smoothstep(.0, .22, uMix));   // 一开始就换成原图（同一张图，去掉卡片排字），再随图位矩形收进右侧

    float d = sdBox(pw - uDim * .5, uDim * .5, uRad);
    float aa = max(fwidth(d) * 1.2, 1e-5);
    float a = 1. - smoothstep(-aa, aa, d);
    if (a < .01) discard;
    gl_FragColor = vec4(col * uFade, a);
  }`;

export function createStage({ canvas, labelsEl, progressEl, eventsEl, items, paper, onOpen, onInteract, onProgress }) {
  const N = items.length;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(0, 0, 10);
  const group = new THREE.Group();          // 整个转鼓，跟着鼠标轻轻倾斜
  scene.add(group);

  const L = {};
  function layout() {
    const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
    L.w = w; L.h = h; L.mobile = aspect < 0.8;
    camera.fov = L.mobile ? 44 : 32;
    camera.aspect = aspect;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    L.tanHalf = Math.tan(half);
    L.visH = 2 * 10 * L.tanHalf; L.visW = L.visH * aspect;
    L.cw = L.mobile ? L.visW * 0.8 : Math.min(L.visW * 0.44, L.visH * 0.52 * 1.6);
    L.ch = L.cw / 1.6;
    L.spacing = L.cw * (L.mobile ? 1.1 : 1.07);
    L.R = L.cw * (L.mobile ? 3.2 : 2.5);
    const pitch = Math.atan(0.2 * L.tanHalf);
    camera.rotation.set(pitch, 0, 0);
    L.cardY = 10 * Math.tan(pitch) + (L.mobile ? L.ch * 0.08 : 0);
    L.floorY = -L.ch * (L.mobile ? 1.15 : 0.95);
    L.pxPerUnit = h / L.visH;
    L.wpp = 2 * MORPH_DIST * L.tanHalf / h;   // 形变终点处，1px 对应的世界长度
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setSize(w, h, false);
  }
  layout();

  /* ---------- 地面网格：光标投到地面的位置有一圈缓慢的波 ---------- */
  const gridMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: {
      uOffset: { value: 0 }, uCell: { value: 1 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Vector3(.85, .81, .72) },
      uM: { value: new THREE.Vector2(0, -999) }, uGPush: { value: 0 }, uTime: { value: 0 }
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uOffset, uCell, uAlpha, uGPush, uTime; uniform vec3 uColor; uniform vec2 uM; varying vec3 vW;
      void main(){
        vec2 dm = vW.xz - uM; float dd = length(dm);
        float fall = exp(-dd * dd / 7.) * uGPush;
        vec2 c = vec2(vW.x + uOffset, vW.z) / uCell;
        c += (dm / max(dd, 1e-3)) * sin(dd * 2.6 - uTime * 3.2) * .28 * fall;    // 一圈往外走的波
        vec2 f = fwidth(c);
        vec2 g = abs(fract(c - .5) - .5) / max(f, 1e-4);
        float line = 1. - min(min(g.x, g.y), 1.);
        float d = length(vW.xz - vec2(0., 10.));
        float fade = (1. - smoothstep(6., 46., d)) * smoothstep(0., 1.5, d);
        float side = 1. - smoothstep(14., 30., abs(vW.x));
        float alias = 1. - smoothstep(.2, .6, max(f.x, f.y));
        gl_FragColor = vec4(uColor, line * fade * side * alias * (.11 + fall * .22) * uAlpha);
      }`
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 1, 1), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.z = -40;
  grid.renderOrder = -10;
  scene.add(grid);

  /* ---------- 卡片 + 标签 ---------- */
  let geo = null;
  const cards = [];
  const paperVec = new THREE.Vector3(...paper);   // sRGB 原值直传（不走色彩管理），和 DOM 的纸色逐像素一致
  function buildGeometry() {
    if (geo) geo.dispose();
    geo = new THREE.PlaneGeometry(L.cw, L.ch, 64, 32);
    for (const c of cards) {
      c.mesh.geometry = geo;
      const u = c.mesh.material.uniforms;
      u.uSize.value.set(L.cw, L.ch);
      u.uDim.value.set(L.cw, L.ch);
      u.uRad.value = L.ch * 0.05;
      u.uBulge.value = L.cw * 0.06;
      u.uBend.value = L.cw * 0.22;
    }
  }
  items.forEach((it, i) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, vertexShader: cardVert, fragmentShader: cardFrag,
      uniforms: {
        uTex: { value: null }, uRaw: { value: null }, uRawAspect: { value: 4 / 3 },
        uLine: { value: null }, uLineAspect: { value: 4 / 3 }, uLineOn: { value: 0 },
        uSize: { value: new THREE.Vector2(1, 1) }, uDim: { value: new THREE.Vector2(1, 1) }, uRad: { value: .1 },
        uImg: { value: new THREE.Vector4(0, 0, 1, 1) }, uImgRad: { value: 0 }, uMix: { value: 0 }, uPaper: { value: paperVec },
        uVel: { value: 0 }, uBulge: { value: 0 }, uBend: { value: 0 }, uShear: { value: .22 }, uMorph: { value: 0 },
        uMouse: { value: new THREE.Vector2(.5, .5) }, uMDir: { value: new THREE.Vector2() }, uPush: { value: 0 },
        uTime: { value: 0 }, uSeed: { value: i * 1.913 }, uFade: { value: 0 }, uMotion: { value: RM ? 0 : 1 }, uHover: { value: 0 }
      }
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.userData.index = i;
    mesh.visible = false;
    mesh.frustumCulled = false;            // 顶点在着色器里变形，包围球不可靠
    group.add(mesh);
    const label = document.createElement('div');
    label.className = 'card-label';
    label.innerHTML = `<span class="t">${esc(it.label)}${it.firstPhase ? '<b class="tag-first">首期</b>' : ''}</span><span class="s">${esc(it.sub || '')}</span>`;
    const arrow = document.createElement('button');
    arrow.className = 'card-arrow';
    arrow.setAttribute('aria-label', `展开：${it.label}`);
    arrow.innerHTML = arrowSvg;
    arrow.addEventListener('pointerdown', (e) => e.stopPropagation());
    arrow.addEventListener('click', () => onOpen(i));
    arrow.addEventListener('focus', () => { if (api.interactive) goTo(i); });
    labelsEl.append(label, arrow);
    cards.push({ item: it, mesh, label, arrow, canvas: null, hover: 0, push: 0 });
  });
  buildGeometry();

  progressEl.innerHTML = items.map(() => '<i></i>').join('');
  const dots = [...progressEl.children];

  /* ---------- 贴图：卡片用排好字的 canvas，形变终点用原图 ---------- */
  async function buildTextures(fontText) {
    await ensureFonts(fontText + '0123456789–·「」首期');
    const size = L.mobile ? 1024 : 1280;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let loaded = 0;
    await Promise.all(cards.map(async (c) => {
      let spec = c.item.card;
      while (spec.fallback && !(await loadImage(spec.src))) spec = spec.fallback;
      const cv = await makeTypeCanvas(spec, size);
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = Math.min(8, maxAniso);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      const u = c.mesh.material.uniforms;
      u.uTex.value = tex;
      const raw = c.item.hero ? await loadImage(c.item.hero) : null;
      if (raw) {
        const rt = new THREE.Texture(raw);
        rt.needsUpdate = true; rt.anisotropy = Math.min(8, maxAniso); rt.minFilter = THREE.LinearMipmapLinearFilter;
        u.uRaw.value = rt; u.uRawAspect.value = raw.naturalWidth / raw.naturalHeight;
      } else { u.uRaw.value = tex; u.uRawAspect.value = 1.6; }
      const line = c.item.line ? await loadImage(c.item.line) : null;
      if (line) {
        const lt = new THREE.Texture(line);
        lt.needsUpdate = true; lt.anisotropy = Math.min(8, maxAniso); lt.minFilter = THREE.LinearMipmapLinearFilter;
        u.uLine.value = lt; u.uLineAspect.value = line.naturalWidth / line.naturalHeight; u.uLineOn.value = 1;
      } else { u.uLine.value = u.uRaw.value; u.uLineOn.value = 0; }
      c.canvas = cv;
      onProgress?.(++loaded / N);
    }));
  }

  /* ---------- 滚动状态（单位：张） ---------- */
  const state = { pos: 0, target: 0, vel: 0, velSm: 0, intro: 0, dragging: false, gliding: false };
  const wrapIdx = (i) => ((i % N) + N) % N;
  const active = () => wrapIdx(Math.round(state.pos));
  function goTo(i) {
    const cur = state.target;
    let t = Math.round(cur / N) * N + i;
    if (t - cur > N / 2) t -= N; if (cur - t > N / 2) t += N;
    state.target = t;
  }
  function jumpTo(i) { goTo(i); state.pos = state.target; }
  const settled = () => Math.abs(state.target - state.pos) < .015 && Math.abs(state.velSm) < .02;
  const step = (d) => { state.target = Math.round(state.target) + d; onInteract?.(); };
  let snapTimer = 0;
  function snapSoon(ms) {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => { if (!state.dragging) state.target = Math.round(state.target); }, ms);
  }

  eventsEl.addEventListener('wheel', (e) => {
    if (!api.interactive) return;
    e.preventDefault();
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 33;
    d = Math.max(-160, Math.min(160, d));
    state.target += d / 520;
    snapSoon(RM ? 60 : 200);
    onInteract?.();
  }, { passive: false });

  /* ---------- 鼠标 ---------- */
  const mouse = { x: -1, y: -1, px: -1, py: -1, inside: false, speed: 0, dx: 0, dy: 0, nx: 0, ny: 0 };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (mouse.px < 0) { mouse.px = mouse.x; mouse.py = mouse.y; }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { mouse.inside = false; });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorHit = new THREE.Vector3();
  const pickables = [];
  let hovered = -1, hoverUv = new THREE.Vector2(.5, .5), drag = null;
  function pick(clientX, clientY) {
    pointer.set(clientX / L.w * 2 - 1, -(clientY / L.h) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    pickables.length = 0;
    for (const c of cards) if (c.mesh.visible) pickables.push(c.mesh);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (hit && hit.uv) hoverUv.copy(hit.uv);
    return hit ? hit.object.userData.index : -1;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!api.interactive) return;
    drag = { x: e.clientX, t: performance.now(), v: 0, moved: 0, id: e.pointerId };
    state.dragging = true; eventsEl.classList.add('is-dragging');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, now = performance.now(), dt = Math.max(1, now - drag.t);
    state.target -= dx / (L.spacing * L.pxPerUnit) * (L.mobile ? 1.15 : 1);
    drag.v = drag.v * .6 + (dx / dt) * .4;
    drag.moved += Math.abs(dx); drag.x = e.clientX; drag.t = now;
    if (drag.moved > 6) onInteract?.();
  });
  function endDrag(e) {
    if (!drag) return;
    const wasClick = drag.moved < 6;
    if (!wasClick) state.target -= drag.v * (RM ? 0 : 260) / (L.spacing * L.pxPerUnit);
    state.target = Math.round(state.target);
    drag = null; state.dragging = false; eventsEl.classList.remove('is-dragging');
    if (wasClick && e.type === 'pointerup') {
      const i = pick(e.clientX, e.clientY);
      if (i >= 0) onOpen(i);                 // 偏离中心的卡片：先滑到中间，再展开（由 onOpen 处理）
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* ---------- 投影：CPU 上复刻顶点着色器的变形（标签用） ---------- */
  const v3 = new THREE.Vector3();
  function deform(nx, ny, vel, m) {
    const k = 1 - m;
    const x = nx * L.cw / 2 + vel * 0.22 * ny * L.ch / 2 * k;
    const y = ny * L.ch / 2 - Math.abs(vel) * .06 * L.ch * nx * nx * k;
    const z = (L.cw * .06 * Math.cos(nx * 1.5708) - Math.abs(vel) * L.cw * .22 * nx * nx + vel * L.cw * .22 * .35 * nx) * k;
    return [x, y, z];
  }
  function project(mesh, p) {
    v3.set(p[0], p[1], p[2]).applyMatrix4(mesh.matrixWorld).project(camera);
    return [(v3.x * .5 + .5) * L.w, (-v3.y * .5 + .5) * L.h, v3.z];
  }

  /* ---------- 形变终点：把屏幕上的面板矩形换成相机前的一块平板 ---------- */
  const focus = { index: -1, morph: 0, mix: 0, hidden: false, target: null };
  function setMorphTarget(t) { focus.target = t; }
  const tPos = new THREE.Vector3(), tQuat = new THREE.Quaternion(), gInv = new THREE.Quaternion(), dQuat = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  function applyMorph(c, m, mix) {
    const t = focus.target, u = c.mesh.material.uniforms;
    if (!t) return;
    const P = t.panel;
    // 面板中心在相机空间里的位置
    tPos.set((P.left + P.width / 2 - L.w / 2) * L.wpp, -(P.top + P.height / 2 - L.h / 2) * L.wpp, -MORPH_DIST);
    camera.localToWorld(tPos);
    group.worldToLocal(tPos);
    group.getWorldQuaternion(gInv).invert();
    tQuat.copy(gInv).multiply(camera.quaternion);
    c.mesh.position.lerp(tPos, m);
    dQuat.setFromAxisAngle(yAxis, c.mesh.rotation.y);
    c.mesh.quaternion.copy(dQuat).slerp(tQuat, m);
    const sx = P.width * L.wpp / L.cw, sy = P.height * L.wpp / L.ch;
    c.mesh.scale.set(1 + (sx - 1) * m, 1 + (sy - 1) * m, 1);
    u.uDim.value.set(L.cw * c.mesh.scale.x, L.ch * c.mesh.scale.y);
    u.uRad.value = L.ch * .05 + (t.radius * L.wpp - L.ch * .05) * m;
    u.uMorph.value = m;
    u.uMix.value = mix;
    // 图位：从整张卡 → 面板右侧的图
    const I = t.img;
    const x0 = (I.left - P.left) / P.width, x1 = (I.left + I.width - P.left) / P.width;
    const y0 = 1 - (I.top + I.height - P.top) / P.height, y1 = 1 - (I.top - P.top) / P.height;
    const e = smooth(.2, .95, mix);
    u.uImg.value.set(x0 * e, y0 * e, 1 + (x1 - 1) * e, 1 + (y1 - 1) * e);
    u.uImgRad.value = t.imgRadius * L.wpp * e + u.uRad.value * (1 - e);
  }

  /* ---------- 每帧 ---------- */
  let centreH = 1, last = performance.now(), time = 0;
  const tilt = { x: 0, y: 0 };
  let gridPush = 0;
  function frame(now) {
    const dt = Math.min(.05, Math.max(1e-3, (now - last) / 1000)); last = now; time += dt;
    const k = 1 - Math.exp(-dt * (RM ? 40 : 2.9));
    const prev = state.pos;
    if (!state.gliding) state.pos += (state.target - state.pos) * k;
    if (Math.abs(state.target - state.pos) < 1e-4) state.pos = state.target;
    state.vel = (state.pos - prev) / dt;
    const vTarget = RM ? 0 : Math.max(-1, Math.min(1, state.vel * .16));
    state.velSm += (vTarget - state.velSm) * (1 - Math.exp(-dt * 7));
    const vel = state.velSm;
    const fm = focus.index >= 0 ? focus.morph : 0;

    // 鼠标速度（px/s），平滑一下
    const mdx = mouse.x - mouse.px, mdy = mouse.y - mouse.py;
    mouse.px = mouse.x; mouse.py = mouse.y;
    const sp = Math.hypot(mdx, mdy) / dt;
    mouse.speed += (sp - mouse.speed) * (1 - Math.exp(-dt * 10));
    if (sp > 1) { mouse.dx += (mdx / Math.hypot(mdx, mdy) - mouse.dx) * .25; mouse.dy += (mdy / Math.hypot(mdx, mdy) - mouse.dy) * .25; }
    const live = api.interactive && mouse.inside && !RM;

    // 转鼓跟着鼠标倾斜几度
    const mx = live ? mouse.x / L.w * 2 - 1 : 0, my = live ? mouse.y / L.h * 2 - 1 : 0;
    tilt.y += (mx * .06 - tilt.y) * (1 - Math.exp(-dt * 3));
    tilt.x += (my * .035 - tilt.x) * (1 - Math.exp(-dt * 3));
    group.rotation.set(tilt.x * (1 - fm), tilt.y * (1 - fm), 0);
    group.updateMatrixWorld();

    // 悬停：每帧都射一次（卡片在动，光标不动也可能换卡）
    hovered = live && !state.dragging ? pick(mouse.x, mouse.y) : -1;
    const speedK = clamp01(mouse.speed / 1100);

    // 地面上的波
    let gTarget = 0;
    if (live && raycaster.ray.intersectPlane(floorPlane.set(floorPlane.normal, -L.floorY), floorHit)) {
      gridMat.uniforms.uM.value.set(floorHit.x, floorHit.z);
      gTarget = .35 + speedK * .9;
    }
    gridPush += (gTarget - gridPush) * (1 - Math.exp(-dt * (gTarget > gridPush ? 6 : 1.8)));
    gridMat.uniforms.uGPush.value = gridPush;
    gridMat.uniforms.uTime.value = time;
    gridMat.uniforms.uOffset.value = state.pos * L.spacing * .5;
    grid.position.y = L.floorY;

    const act = active();
    for (let i = 0; i < N; i++) {
      const c = cards[i];
      const isFocus = i === focus.index;
      let off = i - state.pos;
      off = ((off % N) + N + N / 2) % N - N / 2;
      if (!isFocus && fm > 0) off += Math.sign(off || 1) * fm * 1.4;     // 邻居被推开
      const th = off * L.spacing / L.R;
      const vis = Math.abs(th) < 1.45 || (isFocus && fm > 0);
      c.mesh.visible = vis && state.intro > 0 && !(isFocus && focus.hidden);
      const u = c.mesh.material.uniforms;
      if (!vis) { c.label.style.opacity = 0; c.arrow.style.opacity = 0; c.arrow.style.pointerEvents = 'none'; c.arrow.tabIndex = -1; continue; }
      c.mesh.position.set(L.R * Math.sin(th), L.cardY, L.R * Math.cos(th) - L.R);
      c.mesh.rotation.set(0, th, 0);
      c.mesh.scale.set(1, 1, 1);
      u.uDim.value.set(L.cw, L.ch); u.uRad.value = L.ch * .05; u.uMorph.value = 0; u.uMix.value = 0; u.uImg.value.set(0, 0, 1, 1);
      c.mesh.renderOrder = isFocus ? 1000 : 100 - Math.round(Math.abs(off) * 4);
      if (isFocus && fm > 0) applyMorph(c, fm, focus.mix);
      c.mesh.updateMatrixWorld();
      u.uVel.value = vel;
      u.uTime.value = time;
      c.hover += ((hovered === i ? 1 : 0) - c.hover) * (1 - Math.exp(-dt * 6));
      u.uHover.value = c.hover;
      // 鼠标扰动：强度跟速度走，约 0.6 秒衰减到零
      const pTarget = hovered === i ? .12 + speedK * .88 : 0;
      c.push += (pTarget - c.push) * (1 - Math.exp(-dt * (pTarget > c.push ? 10 : 5)));
      if (hovered === i) u.uMouse.value.lerp(hoverUv, 1 - Math.exp(-dt * 14));
      u.uPush.value = RM ? 0 : c.push;
      u.uMDir.value.set(mouse.dx, -mouse.dy);
      const sideFade = 1 - Math.min(1, Math.max(0, (Math.abs(th) - .35) / 1.0)) * .6;
      u.uFade.value = isFocus ? Math.max(state.intro * sideFade, fm) : state.intro * sideFade * (1 - .75 * fm);

      const pad = .055, m = u.uMorph.value;
      const bl = project(c.mesh, deform(-1 + pad * 1.1, -1 + pad * 1.6, vel, m));
      const br = project(c.mesh, deform(1 - pad * 1.1, -1 + pad * 1.6, vel, m));
      const tl = project(c.mesh, deform(-1 + pad * 1.1, 1, vel, m));
      const tlc = project(c.mesh, deform(-1, 1, vel, m)), blc = project(c.mesh, deform(-1, -1, vel, m));
      const hgt = Math.hypot(tlc[0] - blc[0], tlc[1] - blc[1]);
      if (i === act && Math.abs(off) < .02 && fm === 0) centreH = hgt;
      const a = Math.atan2(br[1] - bl[1], br[0] - bl[0]);
      const vx = tl[0] - bl[0], vy = tl[1] - bl[1];
      const rx = vx * Math.cos(a) + vy * Math.sin(a), ry = -vx * Math.sin(a) + vy * Math.cos(a);
      const skew = Math.atan2(rx, -ry);
      const s = Math.max(.35, Math.min(1.6, hgt / (centreH || hgt)));
      const op = Math.max(0, Math.min(1, 1 - (Math.abs(th) - .45) / .5)) * state.intro * (1 - Math.min(1, fm * 3));
      c.label.style.transform = `translate3d(${bl[0]}px,${bl[1]}px,0) rotate(${a}rad) skewX(${-skew}rad) scale(${s}) translateY(-100%)`;
      c.label.style.opacity = op;
      const ap = project(c.mesh, deform(1 - pad * 1.1 - .055, -1 + pad * 1.6 + .09, vel, m));
      c.arrow.style.transform = `translate3d(${ap[0]}px,${ap[1]}px,0) rotate(${a}rad) scale(${Math.min(1, s)})`;
      c.arrow.style.opacity = op;
      const clickable = op > .5 && api.interactive;
      c.arrow.style.pointerEvents = clickable ? 'auto' : 'none';
      c.arrow.tabIndex = clickable ? 0 : -1;
    }
    dots.forEach((d, i) => d.classList.toggle('on', i === act));
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  window.addEventListener('resize', () => { layout(); buildGeometry(); centreH = 1; });
  let running = true;
  const setRunning = (on) => {
    if (on === running) return;
    running = on;
    renderer.setAnimationLoop(on ? frame : null);
  };

  const api = {
    interactive: true,
    focus, state, cards, camera, layout: L, grid: gridMat,
    get hovered() { return hovered; },
    goTo, jumpTo, active, settled, step, setMorphTarget, buildTextures, setRunning, N
  };
  return api;
}
