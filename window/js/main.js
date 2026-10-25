/*
 * 入口：载入、路由、索引视图、光标。
 *   #/            转鼓（十件作品）
 *   #/index       索引
 *   #/work/NN     作品详情（由卡片连续形变而来，见 transition.js）
 */
import { createStage } from './stage.js';
import { createTransition } from './transition.js';
import { createLightbox } from './lightbox.js';
import { createStrip } from './strip.js';

const SITE = window.SITE, WORKS = window.WORKS.works;
const gsap = window.gsap;
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = RM ? 0.001 : 1;
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 嵌在田野地图里时，地址由外层写成 #/tuichao…，这里仍用原来的 #/、#/work/NN。 */
const EMBED = window.parent !== window;
let virtualHash = location.hash || '#/';
const hashNow = () => (EMBED ? virtualHash : (location.hash || '#/'));
function publishTitle() {
  if (!EMBED) return;
  window.parent.postMessage({ source: 'yongfeng-window', type: 'title', title: document.title }, location.origin);
}
function navigate(hash, { replace = false } = {}) {
  if (!hash) return;
  if (hash.charAt(0) !== '#') hash = '#' + hash;
  if (EMBED) {
    const changed = hash !== virtualHash;
    virtualHash = hash;
    window.parent.postMessage({ source: 'yongfeng-window', type: 'navigate', hash, replace: !!replace }, location.origin);
    if (!replace && changed) route(hash);
    return;
  }
  if (replace) {
    if (location.hash !== hash) history.replaceState(history.state, '', hash);
    return;
  }
  if ((location.hash || '#/') !== hash) location.hash = hash;
  else route(hash);
}
if (EMBED) {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== 'yongfeng-map') return;
    if (d.type === 'visible') { window.__yf?.stage?.setRunning(!!d.on); return; }
    if (d.type !== 'apply') return;
    if (d.hash === virtualHash) return;
    virtualHash = d.hash;
    route(d.hash);
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
}

const app = $('#app'), canvas = $('#gl'), labelsEl = $('#labels'), detailEl = $('#detail');
document.title = SITE.title;
$('#site-title a').textContent = SITE.title;
$('#footer-right').textContent = SITE.footerRight;
$('#hint').textContent = SITE.hint;

/* ---------------- 舞台 ---------------- */
const items = WORKS.map((w) => ({
  label: w.name, sub: `${w.num} · ${w.village}`, firstPhase: w.firstPhase,
  hero: w.images?.[0]?.src, line: w.lines?.src,
  card: { layout: 'workphoto', src: w.images?.[0]?.src, num: w.num, firstPhase: w.firstPhase,
    fallback: { layout: 'worknum', num: w.num, name: w.name, village: w.village, firstPhase: w.firstPhase } }
}));
const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().replace('#', '');
const paperRGB = [0, 2, 4].map((k) => parseInt(paper.slice(k, k + 2), 16) / 255);

const loaderDashes = [...document.querySelectorAll('#loader .dashes i')];
const setProgress = (p) => loaderDashes.forEach((d, i) => gsap.to(d, { scaleX: Math.min(1, Math.max(0, p * 3 - i)), duration: .5 * D, ease: 'power2.out', overwrite: true }));
const hint = $('#hint');
const interacted = () => hint.classList.remove('show');

const stage = createStage({
  canvas, labelsEl, progressEl: $('#progress'), eventsEl: app, items, paper: paperRGB,
  onOpen: (i) => { navigate(`#/work/${WORKS[i].num}`); },
  onInteract: interacted, onProgress: setProgress
});

let returnTo = '#/';
const trans = createTransition({ stage, detailEl, works: WORKS });
// 详情里左右拖到相邻作品；吸附后只替换地址（不新增历史），返回键仍然是关闭
const strip = createStrip({
  detailEl, panel: $('.panel', detailEl), works: WORKS, stage, trans, gsap, RM,
  onCommit: (i, fromRoute) => {
    document.title = `${WORKS[i].num} ${WORKS[i].name} · ${SITE.title}`;
    publishTitle();
    if (!fromRoute) navigate(`#/work/${WORKS[i].num}`, { replace: true });
  }
});
trans.setStrip(strip);

/* ---------------- 索引视图 ---------------- */
const indexView = $('#index-view'), indexList = $('#index-list');
indexList.innerHTML = WORKS.map((w, i) => `<li><a href="#/work/${w.num}" data-i="${i}"><span class="w">${esc(w.name)}</span></a></li>`).join('');
const floatCard = $('#float-card'), floatInner = $('.float-inner', floatCard);
const floatCv = document.createElement('canvas');
floatCv.width = 640; floatCv.height = 400;
floatCv.style.cssText = 'width:100%;height:100%;display:block';
floatInner.append(floatCv);
const fx = gsap.quickTo(floatCard, 'x', { duration: .75 * D, ease: 'power3.out' });
const fy = gsap.quickTo(floatCard, 'y', { duration: .75 * D, ease: 'power3.out' });
// 跟随卡：滞后 + 倾斜 + 按鼠标速度做的「速度扭曲」（错切 + 拉伸）
const fv = { x: 0, y: 0, lx: null, ly: null, lt: 0, vx: 0, vy: 0 };
indexView.addEventListener('pointermove', (e) => {
  fx(e.clientX - 150); fy(e.clientY - 190);
  const now = performance.now();
  if (fv.lx !== null) {
    const dt = Math.max(8, now - fv.lt);
    fv.vx = fv.vx * .5 + (e.clientX - fv.lx) / dt * 500;
    fv.vy = fv.vy * .5 + (e.clientY - fv.ly) / dt * 500;
  }
  fv.lx = e.clientX; fv.ly = e.clientY; fv.lt = now;
});
const fs = { skx: 0, sky: 0, st: 0, rot: 0 };
gsap.ticker.add((t, dtMs) => {
  if (indexView.hidden) return;
  const k = 1 - Math.exp(-(dtMs / 1000) * 8);
  fv.vx *= Math.exp(-(dtMs / 1000) * 5); fv.vy *= Math.exp(-(dtMs / 1000) * 5);
  const vx = RM ? 0 : Math.max(-2400, Math.min(2400, fv.vx)), vy = RM ? 0 : Math.max(-2400, Math.min(2400, fv.vy));
  fs.skx += (-vx * .006 - fs.skx) * k;
  fs.sky += (vy * .003 - fs.sky) * k;
  fs.st += (Math.min(.18, Math.hypot(vx, vy) * .00008) - fs.st) * k;
  fs.rot += (vx * .004 - fs.rot) * k;
  gsap.set(floatInner, { skewX: fs.skx, skewY: fs.sky * .4, scaleX: 1 + fs.st, scaleY: 1 - fs.st * .5, rotation: fs.rot * .6, rotationY: fs.rot * 1.4, transformPerspective: 800 });
});
indexList.addEventListener('pointerover', (e) => {
  const a = e.target.closest('a'); if (!a) return;
  const c = stage.cards[+a.dataset.i];
  if (c.canvas) floatCv.getContext('2d').drawImage(c.canvas, 0, 0, 640, 400);
  gsap.to(floatCard, { opacity: 1, scale: 1, duration: .4 * D, overwrite: 'auto' });
});
indexList.addEventListener('pointerleave', () => gsap.to(floatCard, { opacity: 0, scale: .9, duration: .4 * D, overwrite: 'auto' }));

/* 索引背后：十方案线稿总览（works.js 里的 linesOverview），很淡，跟着鼠标上下慢慢移动露出不同的方案 */
const bgImg = $('.index-bg img');
const overview = window.WORKS.linesOverview;
let bgOn = false;
if (!overview) bgImg.parentElement.remove();
function showIndexBg() {
  if (!overview || bgOn) return;
  bgOn = true;
  bgImg.src = overview;
  bgImg.decode().then(() => bgImg.classList.add('is-ready')).catch(() => {});
  const by = gsap.quickTo(bgImg, 'y', { duration: 1.6 * D, ease: 'power3.out' });
  gsap.set(bgImg, { xPercent: -50 });
  const move = (fy) => {
    const over = bgImg.offsetHeight - indexView.clientHeight;
    by(over > 0 ? -over * fy : (indexView.clientHeight - bgImg.offsetHeight) / 2);
  };
  move(.2);
  indexView.addEventListener('pointermove', (e) => move(e.clientY / indexView.clientHeight), { passive: true });
}

let view = 'works';
function setView(v, { instant = false } = {}) {
  if (view === v) return;
  view = v;
  const on = v === 'index';
  $('#v-index').classList.toggle('is-active', on);
  $('#v-works').classList.toggle('is-active', !on);
  $(on ? '#v-index' : '#v-works').setAttribute('aria-current', 'page');
  $(on ? '#v-works' : '#v-index').removeAttribute('aria-current');
  $('#progress').style.opacity = on ? 0 : '';
  stage.interactive = !on;
  const d = instant ? .001 : D;
  if (on) {
    indexView.hidden = false;
    showIndexBg();
    gsap.to([canvas, labelsEl], { opacity: 0, duration: .6 * d, ease: 'power2.out' });
    gsap.fromTo(indexList.children, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .8 * d, stagger: .03 * d, ease: 'power3.out', delay: .15 * d });
  } else {
    gsap.to(floatCard, { opacity: 0, duration: .2 * d });
    gsap.to(indexList.children, { opacity: 0, y: -14, duration: .35 * d, stagger: .01 * d, ease: 'power2.in', onComplete: () => { if (view === 'works') indexView.hidden = true; } });
    gsap.to([canvas, labelsEl], { opacity: 1, duration: (instant ? .001 : .8 * D), delay: instant ? 0 : .2 * D, ease: 'power2.out' });
  }
}

/* ---------------- 路由：一次只跑一个转场，按顺序排队 ---------------- */
let queue = Promise.resolve();
const route = (snap) => {
  const hash = snap || hashNow();
  queue = queue.then(() => doRoute(hash)).catch((e) => console.error(e));
};
async function doRoute(snap) {
  if (EMBED && snap && snap !== virtualHash) return;
  const h = (snap || hashNow()).replace(/^#\/?/, '');
  const [kind, id] = h.split('/');
  const i = kind === 'work' ? WORKS.findIndex((w) => w.num === id) : -1;
  if (i >= 0) {
    document.title = `${WORKS[i].num} ${WORKS[i].name} · ${SITE.title}`;
    publishTitle();
    if (trans.current === i) return;
    if (trans.current >= 0) {
      const d = (i - trans.current + WORKS.length) % WORKS.length;
      if (strip.active && (d === 1 || d === WORKS.length - 1)) return strip.go(d === 1 ? 1 : -1, { fromRoute: true });
      return trans.swap(i);
    }
    const fromIndex = view === 'index';
    returnTo = fromIndex ? '#/index' : '#/';
    if (fromIndex) {
      view = 'works';
      stage.jumpTo(i);
      gsap.to(indexList.children, { opacity: 0, duration: .25 * D });
      gsap.to(floatCard, { opacity: 0, duration: .2 * D });
      gsap.set(labelsEl, { opacity: 1 });
      await gsap.to(canvas, { opacity: 1, duration: .3 * D });
      indexView.hidden = true;
      view = 'index-hidden';
    }
    return trans.open(i, { fromIndex });
  }
  document.title = SITE.title;
  publishTitle();
  const wantIndex = kind === 'index';
  if (trans.current >= 0) {
    if (view === 'index-hidden') view = 'works';
    await trans.close();
    if (wantIndex) { view = 'works'; setView('index'); }
    return;
  }
  if (view === 'index-hidden') view = 'works';
  setView(wantIndex ? 'index' : 'works');
}
if (!EMBED) window.addEventListener('hashchange', () => route());

const lightbox = createLightbox($('#lightbox'), { gsap, reduced: RM });
detailEl.addEventListener('click', (e) => {
  const z = e.target.closest('[data-zoom]');
  if (z) { lightbox.open(z.dataset.zoom, z.dataset.caption, z); return; }
  if (e.target.closest('[data-close]')) navigate(returnTo);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && trans.current >= 0) { navigate(returnTo); return; }
  if (trans.current >= 0) {
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !lightbox.isOpen()) {
      e.preventDefault();
      strip.go(e.key === 'ArrowRight' ? 1 : -1);
    }
    return;
  }
  if (view !== 'works') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stage.step(1); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stage.step(-1); e.preventDefault(); }
  if (e.key === 'Enter' && document.activeElement === document.body) stage.cards[stage.active()].arrow.click();
});

/* ---------------- 光标：点 + 滞后的圈，压在卡片上变大显示「打开」 ---------------- */
const cursor = $('#cursor');
if (window.matchMedia('(pointer: fine)').matches) {
  app.classList.add('has-cursor');
  const ring = $('.c-ring', cursor), dot = $('.c-dot', cursor);
  const c = { x: -100, y: -100, rx: -100, ry: -100, over: null };
  window.addEventListener('pointermove', (e) => { c.x = e.clientX; c.y = e.clientY; c.over = e.target; cursor.classList.remove('is-hidden'); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
  gsap.ticker.add((t, dtMs) => {
    const k = RM ? 1 : 1 - Math.exp(-(dtMs / 1000) * 12);
    c.rx += (c.x - c.rx) * k; c.ry += (c.y - c.ry) * k;
    dot.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
    ring.style.transform = `translate3d(${c.rx}px,${c.ry}px,0)`;
    const open = trans.current >= 0;
    const link = !!c.over?.closest?.('a, button');
    cursor.classList.toggle('is-card', !open && view === 'works' && stage.interactive && stage.hovered >= 0 && !link);
    cursor.classList.toggle('is-link', link && !strip.dragging);
    // 拖动中、或停在两边露出的那条纸上：显示「拖动」
    cursor.classList.toggle('is-drag', open && (strip.dragging || (strip.active && !!c.over?.closest?.('.panel.ghost'))));
    cursor.classList.toggle('on-paper', (open && !!c.over?.closest?.('.panel')) || lightbox.isOpen());
  });
}

/* ---------------- 启动 ---------------- */
async function start() {
  const t0 = performance.now();
  try { await stage.buildTextures(JSON.stringify(WORKS.map((w) => [w.name, w.village, w.num])) + SITE.title); }
  catch (err) { console.error('贴图载入失败', err); }
  await new Promise((r) => setTimeout(r, Math.max(0, (RM ? 200 : 1300) - (performance.now() - t0))));
  setProgress(1);
  const deep = /^#\/(work|index)/.test(hashNow());
  const startPos = deep ? 0 : -2.6;
  stage.state.pos = stage.state.target = startPos;
  const tl = gsap.timeline({ delay: .45 * D });
  tl.to('#loader .dashes', { opacity: 0, duration: .4 * D })
    .to('#loader', { opacity: 0, duration: .8 * D, ease: 'power2.out', onComplete: () => { $('#loader').remove(); app.classList.remove('is-loading'); } }, '-=.1')
    .to(stage.state, { intro: 1, duration: 1.6 * D, ease: 'power2.out' }, '<')
    .to(stage.grid.uniforms.uAlpha, { value: 1, duration: 2 * D, ease: 'power2.out' }, '<')
    .add(() => { if (trans.current < 0 && !deep) stage.state.target = 0; }, '<')
    .add(() => { if (!deep) hint.classList.add('show'); setTimeout(interacted, 6000); }, '+=1.4');
  if (deep) route(hashNow());
  if (EMBED) window.parent.postMessage({ source: 'yongfeng-window', type: 'ready' }, location.origin);
}
window.__yf = { stage, trans, lightbox, strip };   // 调试 / 截图脚本用
start();
