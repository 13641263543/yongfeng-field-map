/**
 * 全站版本。只改这一处，并在 STRUCTURE.md「版本记录」加一行。
 * 小修加次版本，例如 1.0 → 1.1。这一版是门 → 地图 → 窗合站。
 */
export const VERSION = '1.0';

/** 把「版本 x.x」写进 #site-version，并同步 <meta name="version">。 */
export function stampVersion() {
  let meta = document.querySelector('meta[name="version"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'version');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', VERSION);
  const el = document.getElementById('site-version');
  if (el) el.textContent = `版本 ${VERSION}`;
}
