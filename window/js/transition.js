/*
 * 卡片 ↔ 详情的连续形变（共享元素，不换页、不弹窗）。
 *
 * 打开：
 *   glide   卡片不在正中就先滑到正中（转鼓位置补间，速度会带出弯折）
 *   morph   同一个 WebGL 平板：长向镜头、压平（弯/鼓/错切归零）、圆角变成面板圆角、
 *           尺寸和位置对齐到 DOM 面板（约 93% 视口）；邻居往两边推开并压暗
 *   paper   画面褪成纸色，原图从整张卡收进右侧图位
 *   text    平板快铺满时，DOM 文字分批淡入上滑
 *   handoff 最后一帧：DOM 面板换上纸色底和真图，WebGL 平板隐藏（两者逐像素重合）
 * 关闭是倒放：先收文字，再把平板还原、弯回去、回到转鼓，邻居滑回来。
 */
import { renderWork, measure, attachBars } from './detail.js';

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap;

export function createTransition({ stage, detailEl, works, onClosed }) {
  const panel = detailEl.querySelector('.panel');
  const bars = attachBars(panel);
  let strip = null;
  // 交接完成：DOM 面板接手 → 才显示滚动指示条、启用左右拖动
  const settle = () => { panel.classList.add('is-settled'); bars(); strip?.enable(); };
  // 收起前：先藏指示条、停用拖动（滚动容器在 is-morphing 下 overflow: hidden）
  const unsettle = () => { panel.classList.remove('is-settled'); strip?.disable(); };
  const focus = stage.focus;
  let current = -1, tl = null;
  const T = RM ? 0.001 : 1;

  const revealEls = () => [panel.querySelector('.panel-close'), ...panel.querySelectorAll('.rv')];

  function glideTo(i) {
    const st = stage.state, N = stage.N;
    let t = Math.round(st.target / N) * N + i;
    if (t - st.pos > N / 2) t -= N; if (st.pos - t > N / 2) t += N;
    const dist = Math.abs(t - st.pos);
    if (dist < .01) { st.pos = st.target = t; return Promise.resolve(); }
    return new Promise((res) => {
      st.target = t; st.gliding = true;
      gsap.to(st, { pos: t, duration: RM ? .001 : Math.min(.9, .35 + dist * .18), ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { st.gliding = false; res(); } });
    });
  }

  async function open(i, { fromIndex = false } = {}) {
    tl?.kill();
    stage.interactive = false;
    if (fromIndex) stage.jumpTo(i); else await glideTo(i);
    current = i;
    renderWork(panel, works[i], works);
    detailEl.hidden = false;
    detailEl.classList.add('is-morphing');
    gsap.set(revealEls(), { autoAlpha: 0, y: 18 });
    stage.setMorphTarget(measure(panel));
    Object.assign(focus, { index: i, morph: 0, mix: 0, hidden: false });

    return new Promise((res) => {
      tl = gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: res });
      tl.addLabel('morph', 0)
        .to(focus, { morph: 1, duration: .75 * T, ease: 'expo.out' }, 'morph')
        .to(focus, { mix: 1, duration: .66 * T, ease: 'power2.inOut' }, `morph+=${.1 * T}`)
        .addLabel('text', .5 * T)
        .to(revealEls(), { autoAlpha: 1, y: 0, duration: .55 * T, ease: 'power3.out', stagger: .035 * T }, 'text')
        .addLabel('handoff', .8 * T)
        .call(() => {
          detailEl.classList.remove('is-morphing'); focus.hidden = true;
          panel.querySelector('.panel-close').focus({ preventScroll: true });
          settle();
        }, null, 'handoff');
    });
  }

  /* 已经打开时换到另一件：WebGL 那张卡在 DOM 面板后面直接换，DOM 内容交叉淡入 */
  async function swap(i) {
    tl?.kill();
    strip?.disable();
    const els = revealEls();
    await gsap.to(els, { autoAlpha: 0, y: -10, duration: .22 * T, ease: 'power2.in', stagger: .01 * T });
    gsap.set(panel.querySelector('.panel-media'), { autoAlpha: 0 });
    current = i;
    stage.jumpTo(i);
    focus.index = i;
    renderWork(panel, works[i], works);
    gsap.set(revealEls(), { autoAlpha: 0, y: 18 });
    gsap.to(panel.querySelector('.panel-media'), { autoAlpha: 1, duration: .35 * T });
    await gsap.to(revealEls(), { autoAlpha: 1, y: 0, duration: .5 * T, ease: 'power3.out', stagger: .03 * T });
    bars(); strip?.enable();
  }

  /* 拖动吸附到邻居后：只记下当前作品（转鼓位置由 strip.js 同步） */
  function commit(i) {
    current = i; focus.index = i;
    stage.jumpTo(i);
    requestAnimationFrame(bars);
  }

  async function close() {
    if (current < 0) return;
    tl?.kill();
    unsettle();
    // 把平板放回 DOM 面板正下方（此刻两者重合），再交给 WebGL
    stage.setMorphTarget(measure(panel));
    Object.assign(focus, { index: current, morph: 1, mix: 1, hidden: false });
    detailEl.classList.add('is-morphing');
    await new Promise((res) => {
      tl = gsap.timeline({ onComplete: res });
      tl.addLabel('text', 0)
        .to(revealEls().reverse(), { autoAlpha: 0, y: 12, duration: .22 * T, ease: 'power2.in', stagger: .012 * T }, 'text')
        .addLabel('morph', '-=.08')
        .to(focus, { mix: 0, duration: .62 * T, ease: 'power2.inOut' }, 'morph')
        .to(focus, { morph: 0, duration: .72 * T, ease: 'power3.inOut' }, 'morph');
    });
    detailEl.hidden = true;
    detailEl.classList.remove('is-morphing');
    Object.assign(focus, { index: -1, morph: 0, mix: 0, hidden: false });
    current = -1;
    stage.interactive = true;
    onClosed?.();
  }

  return {
    open, close, swap, commit,
    setStrip(st) { strip = st; },
    get settled() { return panel.classList.contains('is-settled'); },
    get current() { return current; },
    get busy() { return !!tl && tl.isActive(); }
  };
}
