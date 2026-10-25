/*
 * 详情里「作品到作品」：横向一条整页纸（参考 Jesper Landberg「project to project」录屏）。
 *   - 当前这张纸就是真正的 DOM 面板（.panel）；左右各放一张同尺寸的「幽灵」纸，屏幕边上露一条
 *   - 鼠标 / 触摸横向拖动、触控板横向滚动：整条跟手移动（lerp），松手按速度吸附到最近一张，ease-out
 *   - 离开中间的纸压暗到约 50%，内容不动；进来的纸先是一张灰色空纸，靠近中间时变白，
 *     左侧文字、右侧图片依次（略错开）淡入上移
 *   - 吸附到邻居后：真面板换成那件作品（和幽灵纸逐像素一致）、地址改成它的路由、
 *     背后的转鼓同步转到那张卡，所以关闭时会形变回这件作品的卡片
 *   - 竖向滚动和点图片放大不受影响：横向位移比竖向多 8px 以上才算拖动
 */
import { renderWork } from './detail.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

export function createStrip({ detailEl, panel, works, stage, trans, gsap, RM, onCommit }) {
  const N = works.length;
  const wrap = (i) => ((i % N) + N) % N;
  const mk = () => {
    const g = panel.cloneNode(false);
    g.classList.remove('is-settled'); g.classList.add('ghost'); g.removeAttribute('aria-labelledby'); g.setAttribute('aria-hidden', 'true');
    g.innerHTML = '<div class="panel-close" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><div class="panel-text"></div><div class="panel-media"></div>';
    detailEl.append(g);
    return g;
  };
  const prev = mk(), next = mk();
  const ghostWork = { [-1]: -1, [1]: -1 };

  const s = { x: 0, tx: 0, on: false, anim: null, base: 0 };   // x：整条的位移（px），负数 = 往下一件
  const gap = () => (innerWidth <= 760 ? 12 : 18);
  const W = () => panel.offsetWidth + gap();

  function fill(g, dir) {
    const i = wrap(trans.current + dir);
    if (ghostWork[dir] === i) return;
    ghostWork[dir] = i;
    renderWork(g, works[i], works);
    g.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    g.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
    g._parts = [g.querySelector('.panel-close'), ...g.querySelectorAll('.panel-text > *'), ...g.querySelectorAll('.panel-media .fig')];
  }

  /* 一张纸相对中间的位置 p（-1…1，0 = 正中）→ 压暗、内容显隐 */
  function paint(g, p, ghost) {
    const a = Math.min(1, Math.abs(p));
    const dim = .5 * ease(a);
    g.style.transform = Math.abs(p) < 1e-4 ? '' : `translate3d(${p * W()}px,0,0)`;
    g.style.filter = dim > .002 ? `brightness(${1 - dim})` : '';
    if (!ghost || !g._parts) return;
    const near = 1 - a;                 // 0 在边上，1 在正中
    const n = g._parts.length;
    g._parts.forEach((el, k) => {
      const isFig = el.classList.contains('fig');
      const d = RM ? 0 : (isFig ? .18 + k / n * .2 : k / n * .14);   // 图片比文字稍晚、彼此错开
      const t = clamp((near - .42 - d) / .3, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      el.style.opacity = e;
      el.style.transform = e >= 1 ? '' : `translate3d(0,${(1 - e) * (isFig ? 46 : 24)}px,0)`;
    });
  }

  function render() {
    if (!s.on) return;
    const w = W(), p = s.x / w;
    paint(panel, p, false);
    paint(prev, p - 1, true);
    paint(next, p + 1, true);
    // 背后的转鼓跟着转：关闭时，正中那张卡就是当前作品
    stage.state.pos = stage.state.target = s.base - p;
  }

  gsap.ticker.add((t, dtMs) => {
    if (!s.on) return;
    if (!s.anim) {
      const k = RM ? 1 : 1 - Math.exp(-(dtMs / 1000) * 18);
      s.x += (s.tx - s.x) * k;
      if (Math.abs(s.tx - s.x) < .05) s.x = s.tx;
    }
    render();
  });

  /* 打开完成（DOM 面板接手）后启用；关闭开始前停用 */
  function enable() {
    ghostWork[-1] = ghostWork[1] = -1;
    fill(prev, -1); fill(next, 1);
    s.x = s.tx = 0; s.base = Math.round(stage.state.pos); s.on = true;
    detailEl.classList.add('strip-on');
    render();
    gsap.fromTo([prev, next], { opacity: 0 }, { opacity: 1, duration: RM ? .001 : .45, ease: 'power2.out', overwrite: true });
  }
  function disable() {
    s.anim?.kill(); s.anim = null; s.drag = null;
    if (Math.abs(s.x) > .5) { s.x = s.tx = 0; render(); }
    s.on = false;
    detailEl.classList.remove('is-strip-drag');
    gsap.to([prev, next], { opacity: 0, duration: RM ? .001 : .2, overwrite: true, onComplete: () => detailEl.classList.remove('strip-on') });
  }

  /* 吸附到 d（-1 / 0 / 1）张之外；到位后换成那件作品 */
  function snap(d, { duration = .72, fromRoute = false } = {}) {
    s.anim?.kill();
    const w = W();
    return new Promise((res) => {
      s.anim = gsap.to(s, {
        x: -d * w, duration: RM ? .001 : duration, ease: 'power3.out',
        onUpdate: () => { s.tx = s.x; },
        onComplete: () => { s.anim = null; if (d) commit(d, fromRoute); res(); }
      });
    });
  }

  function commit(d, fromRoute) {
    const i = wrap(trans.current + d);
    const g = d > 0 ? next : prev;
    // 真面板直接接过正中那张幽灵纸的节点（图片已解码，排版一致 → 逐像素看不出切换）
    g._parts?.forEach((el) => { el.style.opacity = ''; el.style.transform = ''; });
    g.querySelectorAll('[tabindex="-1"]').forEach((el) => el.removeAttribute('tabindex'));
    ['.panel-text', '.panel-media'].forEach((sel) => {
      const to = panel.querySelector(sel);
      to.replaceChildren(...g.querySelector(sel).childNodes);
      to.scrollTop = 0;
    });
    panel.scrollTop = 0;
    panel.querySelector('.p-title')?.setAttribute('id', 'panel-title');
    trans.commit(i);
    s.base = Math.round(stage.state.pos);
    s.x = s.tx = 0;
    ghostWork[-1] = ghostWork[1] = -1;
    fill(prev, -1); fill(next, 1);
    render();
    onCommit?.(i, fromRoute);
  }

  /* ←/→、上一件/下一件链接 */
  const go = (d, opts) => (s.on ? snap(d, opts) : Promise.resolve());

  /* ---------- 拖动：鼠标 / 笔 / 触摸 ---------- */
  let suppressClick = false;
  detailEl.addEventListener('pointerdown', (e) => {
    if (!s.on || e.button > 0 || document.querySelector('#lightbox:not([hidden])')) return;
    s.anim?.kill(); s.anim = null;
    s.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, tx0: s.tx, mode: 0, lx: e.clientX, lt: performance.now(), v: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    const g = s.drag; if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.mode) {
      if (Math.abs(dx) > Math.abs(dy) + 8) {
        g.mode = 1; g.x0 = e.clientX;        // 从这里开始跟手，避免跳一下
        detailEl.classList.add('is-strip-drag');
        getSelection()?.removeAllRanges();
        try { detailEl.setPointerCapture(e.pointerId); } catch {}
      } else if (Math.abs(dy) > Math.abs(dx) + 8) { s.drag = null; return; }
      else return;
    }
    const w = W();
    let t = g.tx0 + (e.clientX - g.x0);
    if (Math.abs(t) > w) t = Math.sign(t) * (w + (Math.abs(t) - w) * .25);   // 一次只跨一张，超出有阻尼
    s.tx = t;
    const now = performance.now(), dt = Math.max(1, now - g.lt);
    g.v = g.v * .6 + (e.clientX - g.lx) / dt * .4; g.lx = e.clientX; g.lt = now;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    const g = s.drag; if (!g || e.pointerId !== g.id) return;
    s.drag = null;
    if (!g.mode) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    detailEl.classList.remove('is-strip-drag');
    const w = W(), proj = s.tx + (RM ? 0 : g.v * 220);   // 带一点惯性
    snap(clamp(Math.round(-proj / w), -1, 1));
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // 拖完松手不算点击（不会误开放大图、不会误关面板）
  detailEl.addEventListener('click', (e) => {
    if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    const g = e.target.closest('.panel.ghost');
    if (g && s.on) { e.stopImmediatePropagation(); go(g === next ? 1 : -1); }   // 点边上露出的那一条也能过去
  }, true);

  /* ---------- 触控板 / 横向滚轮 ---------- */
  let wheelT = 0;
  detailEl.addEventListener('wheel', (e) => {
    if (!s.on || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    s.anim?.kill(); s.anim = null;
    const w = W();
    s.tx = clamp(s.tx - e.deltaX, -w, w);
    clearTimeout(wheelT);
    wheelT = setTimeout(() => snap(clamp(Math.round(-s.tx / w), -1, 1)), 140);
  }, { passive: false });

  window.addEventListener('resize', () => { if (s.on && !s.anim) { s.x = s.tx = 0; render(); } });

  return {
    enable, disable, go,
    get active() { return s.on; },
    get dragging() { return !!s.drag?.mode; },
    get moving() { return !!s.anim || Math.abs(s.x) > .5; },
    ghosts: [prev, next],
    _s: s
  };
}
