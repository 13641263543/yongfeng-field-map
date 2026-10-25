// 文字章节的卡片贴图：用 canvas 排字，再交给 three.js 当贴图。
// 版式只有几种（layout），文字全部来自 data.js。
const W = 1600, H = 1000;
const SERIF = '"Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC","Songti SC",serif';
const SANS = '"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
const INK = '#ece6da', DIM = 'rgba(236,230,218,.55)', TINT = '#b3a77f', GROUND = '#13120e', GROUND2 = '#1c1a15';

export function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export async function ensureFonts(text) {
  if (!document.fonts || !document.fonts.load) return;
  const t = Promise.all([
    document.fonts.load(`700 120px "Noto Serif SC"`, text),
    document.fonts.load(`500 120px "Noto Serif SC"`, text),
    document.fonts.load(`400 40px "Noto Sans SC"`, text),
    document.fonts.load(`500 40px "Noto Sans SC"`, text)
  ]).catch(() => {});
  // 网络字体最多等 3.5 秒，超时就用本机的思源宋体 / 宋体
  await Promise.race([t, new Promise((r) => setTimeout(r, 3500))]);
}

function cover(ctx, im, x, y, w, h, fy = 0.5) {
  if (!im) { ctx.fillStyle = GROUND2; ctx.fillRect(x, y, w, h); return; }
  const s = Math.max(w / im.width, h / im.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) * fy, sw, sh, x, y, w, h);
}

function lines(ctx, text, x, y, size, lh, weight = 700, color = INK, family = SERIF) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  text.split('\n').forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
}

function small(ctx, text, x, y, color = DIM, size = 26, spacing = 6) {
  ctx.font = `500 ${size}px ${SANS}`;
  ctx.fillStyle = color;
  if ('letterSpacing' in ctx) { ctx.letterSpacing = spacing + 'px'; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; }
  else ctx.fillText(text, x, y);
}

function grain(ctx) {
  // 一点胶片颗粒，让纯色底不那么平
  const cw = ctx.canvas.width, chh = ctx.canvas.height;
  const g = ctx.getImageData(0, 0, cw, chh), d = g.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(g, 0, 0);
}

export async function makeTypeCanvas(card, size = 1280) {
  const c = document.createElement('canvas');
  c.width = size; c.height = Math.round(size * H / W);
  const ctx = c.getContext('2d');
  ctx.scale(size / W, size / W);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GROUND; ctx.fillRect(0, 0, W, H);
  const M = 96;

  if (card.layout === 'workphoto') {
    const im = await loadImage(card.src);
    cover(ctx, im, 0, 0, W, H, card.focusY ?? 0.5);
    ctx.fillStyle = 'rgba(10,9,7,.22)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,9,7,.55)'; ctx.fillRect(0, 0, 330, 250);
    ctx.font = `700 150px ${SERIF}`; ctx.fillStyle = INK; ctx.fillText(card.num, 64, 196);
    if (card.firstPhase) firstTag(ctx);
  } else {
    // 效果图缺失时的退路：只排编号、名字和村名，不画任何示意图
    ctx.font = `700 150px ${SERIF}`; ctx.fillStyle = INK; ctx.fillText(card.num, M - 30, 220);
    lines(ctx, card.name || '', M - 24, 330, 76, 1.2);
    small(ctx, card.village || '', M - 20, 400, DIM, 26, 5);
    small(ctx, '方案图待补充', W - M - 260, H - 64, DIM, 22, 4);
    if (card.firstPhase) firstTag(ctx);
  }
  grain(ctx);
  return c;
}

function firstTag(ctx) {
  ctx.fillStyle = TINT;
  roundRect(ctx, W - 96 - 170, 64, 170, 64, 32); ctx.fill();
  ctx.font = `500 30px ${SANS}`; ctx.fillStyle = '#16150f'; ctx.textAlign = 'center';
  ctx.fillText('首期', W - 96 - 85, 107); ctx.textAlign = 'left';
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
