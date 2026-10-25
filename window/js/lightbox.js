/*
 * 线稿全屏查看：白底；滚轮 / 双指缩放（以指针为中心），拖动平移，双击在「适应」和「原大」之间切换。
 * Esc 只关这一层，不会顺带关掉下面的作品面板（keydown 在捕获阶段先拦下）。
 */
export function createLightbox(root, { gsap, reduced = false } = {}) {
  const img = root.querySelector('img'), cap = root.querySelector('.lb-caption'), zoomBtn = root.querySelector('.lb-zoom');
  const st = { s: 1, x: 0, y: 0, fit: 1, w: 1, h: 1 };
  const MAX = 3;                        // 最大放到原图像素的 3 倍
  let opener = null, tween = null;
  const D = reduced ? 0.001 : 1;

  const apply = () => {
    img.style.transform = `translate3d(${st.x}px,${st.y}px,0) scale(${st.s})`;
    zoomBtn.textContent = `${Math.round(st.s / st.fit * 100)}%`;
  };
  const clampPan = () => {
    const vw = root.clientWidth, vh = root.clientHeight, w = st.w * st.s, h = st.h * st.s;
    st.x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, st.x));
    st.y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, st.y));
  };
  const fitScale = () => Math.min(root.clientWidth * .92 / st.w, root.clientHeight * .86 / st.h, 1.5);
  // 以 (px,py) 为不动点缩放到 s
  function zoomTo(s, px = root.clientWidth / 2, py = root.clientHeight / 2, animate = false) {
    s = Math.min(Math.max(s, st.fit), Math.max(MAX, st.fit));
    const k = s / st.s;
    const to = { s, x: px - (px - st.x) * k, y: py - (py - st.y) * k };
    tween?.kill();
    if (!animate) { Object.assign(st, to); clampPan(); apply(); return; }
    const from = { ...st };
    const end = { ...st, ...to }; Object.assign(st, end); clampPan(); Object.assign(end, { x: st.x, y: st.y }); Object.assign(st, from);
    tween = gsap.to(st, { s: end.s, x: end.x, y: end.y, duration: .45 * D, ease: 'power3.out', onUpdate: apply });
  }
  function fit(animate) {
    st.fit = fitScale();
    const to = { s: st.fit, x: (root.clientWidth - st.w * st.fit) / 2, y: (root.clientHeight - st.h * st.fit) / 2 };
    tween?.kill();
    if (animate) tween = gsap.to(st, { ...to, duration: .45 * D, ease: 'power3.out', onUpdate: apply });
    else { Object.assign(st, to); apply(); }
  }

  async function open(src, caption, from) {
    opener = from || document.activeElement;
    cap.textContent = caption || '';
    img.alt = caption || '线稿';
    img.src = src;
    root.hidden = false;
    try { await img.decode(); } catch {}
    st.w = img.naturalWidth || 2000; st.h = img.naturalHeight || 1500;
    img.style.width = st.w + 'px'; img.style.height = st.h + 'px';
    fit(false);
    gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: .35 * D, ease: 'power2.out' });
    gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: .5 * D, delay: .05 * D, ease: 'power2.out' });
    root.querySelector('[data-lb="close"]').focus({ preventScroll: true });
  }
  function close() {
    if (root.hidden) return;
    tween?.kill();
    gsap.to(root, { opacity: 0, duration: .25 * D, ease: 'power2.in', onComplete: () => { root.hidden = true; img.removeAttribute('src'); } });
    opener?.focus?.({ preventScroll: true });
  }
  const isOpen = () => !root.hidden;

  // 滚轮 / 触控板缩放
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomTo(st.s * Math.exp(-dy * (e.ctrlKey ? .01 : .0018)), e.clientX, e.clientY);
  }, { passive: false });

  // 拖动平移 + 双指缩放
  const pts = new Map();
  let pinch = null, moved = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    root.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.s };
    }
    root.classList.add('is-panning');
  });
  root.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      zoomTo(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pts.size === 1) {
      tween?.kill();
      st.x += dx; st.y += dy; clampPan(); apply();
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) root.classList.remove('is-panning');
  };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    const one = 1;   // 原图像素 1:1
    zoomTo(st.s < Math.max(one, st.fit) * .98 ? Math.max(one, st.fit * 2) : st.fit, e.clientX, e.clientY, true);
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (!b) return;
    const a = b.dataset.lb;
    if (a === 'close') close();
    else if (a === 'fit') fit(true);
    else zoomTo(st.s * (a === 'in' ? 1.6 : 1 / 1.6), undefined, undefined, true);
  });
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); return; }
    if (e.key === '+' || e.key === '=') { zoomTo(st.s * 1.6, undefined, undefined, true); }
    else if (e.key === '-') { zoomTo(st.s / 1.6, undefined, undefined, true); }
    else if (e.key === '0') { fit(true); }
    else if (e.key === 'Tab') {     // 焦点留在这一层
      const f = [...root.querySelectorAll('button')]; const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    e.stopImmediatePropagation();   // 方向键等不要传到下面的面板 / 转鼓
  }, true);
  window.addEventListener('resize', () => { if (isOpen()) fit(false); });
  window.addEventListener('hashchange', close);

  return { open, close, isOpen };
}
