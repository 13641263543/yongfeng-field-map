/*
 * 作品详情面板的内容（纯 DOM）。面板本身怎么出现，见 transition.js。
 * 字段名和顺序都照 md 原文（works.js 由 tools/import-proposal.mjs 生成），这里不编任何内容。
 */
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function figure(img, cls = '') {
  const pic = `<img src="${esc(img.src)}" alt="${esc(img.caption)}" ${cls.includes('hero') ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  // 线稿：白底，点开全屏可缩放（lightbox.js）
  const body = img.kind === 'line'
    ? `<button type="button" class="zoom" data-zoom="${esc(img.src)}" data-caption="${esc(img.caption)}" aria-label="全屏查看：${esc(img.caption)}">${pic}<span class="zoom-hint" aria-hidden="true">点开放大</span></button>`
    : pic;
  return `<figure class="fig ${cls}${img.kind === 'line' ? ' line' : ''}${img.kind !== 'render' ? ' rv' : ''}">
    ${body}${img.face ? '<span class="tag">人像已打码 · 待授权</span>' : ''}
    <figcaption class="rv">${esc(img.caption)}</figcaption>
  </figure>`;
}

export function renderWork(panel, w, works) {
  const n = works.length, i = works.indexOf(w);
  const prev = works[(i - 1 + n) % n], next = works[(i + 1) % n];
  const pills = [
    w.firstPhase ? '<span class="pill first">首期</span>' : '',
    `<span class="pill">${esc(w.village)}</span>`,
    w.cost ? `<span class="pill">粗估 ${esc(w.cost)}</span>` : ''
  ].join('');
  const slots = Object.entries(w.slots || {}).map(([k, v]) =>
    `<div class="slot rv"><h4>${esc(k)}</h4><p>${v ? esc(v) : '<em>待补充</em>'}</p></div>`).join('');
  panel.querySelector('.panel-text').innerHTML = `
    <p class="p-kicker rv">方案 ${esc(w.num)} / ${String(n).padStart(2, '0')} · ${esc(w.place)}</p>
    <h2 class="p-title rv" id="panel-title"><span class="p-no">${esc(w.num)}</span>${esc(w.name)}</h2>
    ${w.oneLine ? `<p class="p-lede rv">${esc(w.oneLine)}</p>` : ''}
    <div class="p-pills rv">${pills}</div>
    ${w.unit ? `<p class="p-unit rv">单元 × 数量：${esc(w.unit)}</p>` : ''}
    ${w.highlight ? `<p class="p-h rv">艺术性</p><p class="p-highlight rv">${esc(w.highlight)}</p>` : ''}
    <div class="p-slots">${slots}</div>
    <nav class="p-nav rv" aria-label="上一件 / 下一件">
      <a href="#/work/${esc(prev.num)}">← ${esc(prev.num)} ${esc(prev.name)}</a>
      <a href="#/work/${esc(next.num)}">${esc(next.num)} ${esc(next.name)} →</a>
    </nav>`;
  const [hero, ...rest] = w.images || [];
  panel.querySelector('.panel-media').innerHTML =
    (hero ? figure(hero, 'hero') : `<figure class="fig hero ph"><div><strong>方案图待补充</strong></div></figure>`) +
    rest.map((im) => figure(im, 'wide')).join('');
  panel.scrollTop = 0;
  panel.querySelectorAll('.panel-text, .panel-media').forEach((el) => { el.scrollTop = 0; });
}

/* 形变终点要对齐的几何：面板矩形 + 圆角，图位矩形 + 圆角（全部是屏幕 px） */
export function measure(panel) {
  const P = panel.getBoundingClientRect();
  const heroEl = panel.querySelector('.fig.hero');
  const I = heroEl ? heroEl.getBoundingClientRect() : { left: P.right - 10, top: P.top, width: 1, height: 1 };
  return {
    panel: { left: P.left, top: P.top, width: P.width, height: P.height },
    radius: parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0,
    img: { left: I.left, top: I.top, width: I.width, height: I.height },
    imgRadius: heroEl ? parseFloat(getComputedStyle(heroEl).borderTopLeftRadius) || 0 : 0
  };
}

/* 细滚动指示条：原生滚动条全部隐藏（见 style.css），这里给左右两栏各画一根，面板 .is-settled 后才显示 */
export function attachBars(panel) {
  const cols = [...panel.querySelectorAll('.panel-text, .panel-media')];
  const bars = cols.map((col) => {
    const sb = document.createElement('i'); sb.className = 'sb'; sb.setAttribute('aria-hidden', 'true');
    const th = document.createElement('b'); sb.append(th); panel.append(sb);
    let idle = 0;
    const update = () => {
      const P = panel.getBoundingClientRect(), C = col.getBoundingClientRect();
      const over = col.scrollHeight - col.clientHeight;
      sb.classList.toggle('has-overflow', over > 4 && getComputedStyle(col).display !== 'contents');
      if (over <= 4) return;
      const pad = 18, h = C.height - pad * 2;
      sb.style.left = `${C.right - P.left - 9}px`; sb.style.top = `${C.top - P.top + pad}px`; sb.style.height = `${h}px`;
      const tH = Math.max(28, h * col.clientHeight / col.scrollHeight);
      th.style.height = `${tH}px`;
      th.style.transform = `translateY(${(h - tH) * col.scrollTop / over}px)`;
    };
    col.addEventListener('scroll', () => {
      update(); sb.classList.add('is-active');
      clearTimeout(idle); idle = setTimeout(() => sb.classList.remove('is-active'), 700);
    }, { passive: true });
    return update;
  });
  const all = () => bars.forEach((u) => u());
  window.addEventListener('resize', all);
  panel.addEventListener('load', all, true);   // 图片载入后内容变高
  return all;
}
