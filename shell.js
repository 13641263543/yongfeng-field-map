/* 门 → 地图 → 窗
   退潮线挂在 #/tuichao（作品 #/tuichao/work/01 … 10），不和四村哈希冲突。
   窗是同一页上的一层，回地图不重新加载。 */
(() => {
  'use strict';
  const MAP_TITLE = '田埂退潮之后 · 永丰四村田野地图';
  const FIRST = { dongan: '01', hengshanyao: '05', jiangjiaao: '07', wuan: '09' };

  const el = document.getElementById('field-window');
  const frame = document.getElementById('fw-frame');
  const back = document.getElementById('fw-back');
  if (!el || !frame || !back) return;

  let shown = false;
  let booted = false;
  let frameReady = false;
  let childHash = '#/';
  let loadedHash = '#/';
  let pendingApply = null;
  let hideTimer = 0;
  frame.inert = true;

  function parse(hash) {
    if (!hash) return null;
    if (hash === '#/tuichao' || hash === '#/tuichao/') return '#/';
    if (hash.startsWith('#/tuichao/')) {
      const rest = hash.slice('#/tuichao/'.length);
      return rest ? '#/' + rest : '#/';
    }
    if (hash === '#/' || hash === '#/index') return hash;
    if (/^#\/work\/\d{2}$/.test(hash)) return hash;
    return null;
  }
  function toParent(internal) {
    const rest = String(internal || '#/').replace(/^#\/?/, '');
    return rest ? '#/tuichao/' + rest : '#/tuichao';
  }
  function post(msg) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage(Object.assign({ source: 'yongfeng-map' }, msg), location.origin);
  }
  function reveal() {
    shown = true;
    clearTimeout(hideTimer);
    el.hidden = false;
    el.classList.remove('is-parked');
    el.style.pointerEvents = '';
    frame.inert = false;
    document.body.classList.add('window-open');
    const app = document.getElementById('app');
    if (app) app.setAttribute('aria-hidden', 'true');
    if (frameReady) post({ type: 'visible', on: true });
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  }
  function conceal() {
    if (!shown && (el.hidden || el.classList.contains('is-parked'))) return;
    shown = false;
    document.body.classList.remove('window-open');
    el.classList.remove('is-in');
    el.style.pointerEvents = 'none';
    frame.inert = true;
    const app = document.getElementById('app');
    if (app) {
      app.removeAttribute('aria-hidden');
      app.focus({ preventScroll: true });
    }
    document.title = MAP_TITLE;
    const finish = () => {
      if (shown) return;
      el.classList.add('is-parked');
      if (frameReady) post({ type: 'visible', on: false });
    };
    el.addEventListener('transitionend', finish, { once: true });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(finish, 700);
  }
  function showAndSync(internal) {
    reveal();
    if (!booted) {
      booted = true;
      loadedHash = internal;
      childHash = internal;
      frame.src = 'window/index.html' + internal;
    } else if (internal !== childHash) {
      childHash = internal;
      if (frameReady) post({ type: 'apply', hash: internal });
      else pendingApply = internal;
    }
    frame.focus();
  }
  function openWindow(internal) {
    const target = internal || (booted ? childHash : '#/');
    const next = toParent(target);
    if (location.hash !== next) history.pushState({ yf: 'window' }, '', next);
    const gate = window.__app && window.__app.GATE;
    if (gate && gate.on && !gate.leaving && window.__app.enter) window.__app.enter('skip');
    showAndSync(target);
  }
  function closeWindow() {
    const focus = window.__app && window.__app.S && window.__app.S.focus;
    const gateOn = window.__app && window.__app.GATE && window.__app.GATE.on;
    if (focus && !gateOn) {
      if (location.hash !== '#' + focus.id) history.pushState({ yf: 'map' }, '', '#' + focus.id);
    } else if (location.hash) {
      history.pushState({ yf: 'map' }, '', location.pathname + location.search);
    }
    conceal();
  }
  function onLocation() {
    const internal = parse(location.hash);
    if (internal) {
      const canon = toParent(internal);
      if (location.hash !== canon) history.replaceState({ yf: 'window' }, '', canon);
      const gate = window.__app && window.__app.GATE;
      if (gate && gate.on && !gate.leaving && window.__app.enter) window.__app.enter('skip');
      showAndSync(internal);
      return;
    }
    if (shown) conceal();
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || d.source !== 'yongfeng-window') return;
    if (d.type === 'ready') {
      frameReady = true;
      post({ type: 'visible', on: shown });
      if (pendingApply && pendingApply !== loadedHash) post({ type: 'apply', hash: pendingApply });
      pendingApply = null;
      return;
    }
    if (d.type === 'navigate') {
      childHash = d.hash;
      if (!shown) return;
      const next = toParent(d.hash);
      if (location.hash === next) return;
      history[d.replace ? 'replaceState' : 'pushState']({ yf: 'window' }, '', next);
      return;
    }
    if (d.type === 'title' && shown && d.title) document.title = d.title;
  });

  window.addEventListener('hashchange', onLocation);
  window.addEventListener('popstate', onLocation);
  back.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeWindow(); });

  document.addEventListener('click', (e) => {
    const village = e.target.closest && e.target.closest('#p-window');
    if (village) {
      e.preventDefault();
      const id = window.__app && window.__app.S && window.__app.S.focus && window.__app.S.focus.id;
      const num = FIRST[id];
      openWindow(num ? '#/work/' + num : '#/');
      return;
    }
    if (e.target.closest && e.target.closest('#nav-window')) {
      e.preventDefault();
      openWindow(null);
      return;
    }
    const generic = e.target.closest && e.target.closest('[data-window]');
    if (!generic) return;
    e.preventDefault();
    const ov = document.getElementById('overlay');
    if (ov && ov.classList.contains('open')) {
      const c = document.getElementById('ov-close');
      if (c) c.click();
    }
    openWindow(null);
  });

  window.FieldWindow = {
    parse,
    onMapReady() {
      if (parse(location.hash)) onLocation();
    },
    open: openWindow,
    close: closeWindow,
    get openNow() { return shown; }
  };
})();
