#!/usr/bin/env node
// 从《十方案_前期介绍.md》和「方案图」文件夹重新生成 works.js，并把效果图转成 webp 放进 assets/works/。
// 用法（在 site 目录里）：node tools/import-proposal.mjs [md 路径] [方案图文件夹]
// 默认路径：../十方案_前期介绍_v2.md 和 ../方案图_v2/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD = path.resolve(process.argv[2] || path.join(SITE, '..', '十方案_前期介绍_v2.md'));
const RENDERS = path.resolve(process.argv[3] || path.join(SITE, '..', '方案图_v2'));
const LINES = path.resolve(process.argv[4] || path.join(SITE, '..', '线稿_v2'));
const OUT_JS = path.join(SITE, 'works.js');
const OUT_IMG = path.join(SITE, 'assets', 'works');
const MAX_W = 1600, QUALITY = 82;
const LINE_W = 2000, LINE_Q = 92;          // 线稿：细线在 2000px 宽时仍清楚，质量放高

// 每件作品配一张田野照片（面板里放在效果图后面），（10 号用的是卫星图，不加「田野照片」前缀）。
// 这些不在 md 里，需要时直接改这里。
const FIELD = {
  '01': { src: 'assets/field/dongan-01-tengkuang-shou.webp', caption: '正在编的藤筐 · 东安村' },
  '02': { src: 'assets/field/dongan-04-chaihuo.webp', caption: '路边堆起的柴火 · 东安村' },
  '03': { src: 'assets/field/dongan-03-zhubian-liangshai.webp', caption: '竹匾里的晾晒 · 东安村' },
  '06': { src: 'assets/field/hengshanyao-03-daotian-zhugan.webp', caption: '稻田边挂着塑料袋的竹竿 · 横山腰村' },
  '07': { src: 'assets/field/jiangjiaao-05-huangdi.webp', caption: '新楼与旧房之间的荒地 · 姜家岙' },
  '08': { src: 'assets/field/jiangjiaao-04-taijie.webp', caption: '民居间的台阶 · 姜家岙' },
  '09': { src: 'assets/field/wuan-02-dianmen-blur.webp', caption: '敞开的店门 · 吴岸村', face: true },   // 店里有人：脸已在图上打码，标「待授权」
  '10': { src: 'assets/field/sat-wuan.webp', caption: '吴岸村 · 卫星图（始丰溪在村东侧）', label: '卫星图' }
};
// 每件作品下面「- **标签**：内容」的条目，按 md 里的原标签和顺序原样搬进 slots；
// 下面这些不进 slots：艺术性单独显示在面板顶部，生图提示词不上网站。
const HIGHLIGHT_KEYS = ['艺术性', '艺术性亮点'];
const SKIP_KEYS = ['生图提示词'];
const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`/g, '').trim();   // 去掉 md 的加粗记号
const warn = (...a) => console.warn('⚠', ...a);

const md = fs.readFileSync(MD, 'utf8').replace(/\r\n/g, '\n');
const mdStat = fs.statSync(MD);

// 1. 总览表：按表头找列（一句话 / 村 / 点位 / 单元 × 数量 / 造价粗估），列的顺序变了也不怕
const table = {};
let cols = null;
for (const line of md.split('\n')) {
  if (!line.startsWith('|')) { cols = null; continue; }
  const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim());
  if (cells[0] === '#') { cols = cells.includes('一句话') ? cells : null; continue; }
  if (!cols || !/^\d{2}$/.test(cells[0])) continue;
  const get = (re) => { const k = cols.findIndex((c) => re.test(c)); return k >= 0 ? cells[k] || '' : ''; };
  table[cells[0]] = { spot: get(/村|点位/), oneLine: get(/一句话/), unit: get(/单元/), finding: get(/对应发现/), cost: get(/造价/) };
}

// 2. 首期：「首期 … ：01 代工檐 + 08 … + 09 …（07 … 可作替补）」
const firstLine = md.split('\n').find((l) => /首期/.test(l) && /\d{2}\s*\S+\s*\+/.test(l)) || '';
const firstPhase = ((firstLine.split(/[：:]/).slice(1).join('：').split(/[（(]/)[0]).match(/\b\d{2}(?=\s*[\u4e00-\u9fff])/g) || []);

// 3. 每件作品：### 方案 01｜代工檐 —— 东安村 · 路边做活的地方
const heads = [...md.matchAll(/^###\s*方案\s*(\d{2})\s*[｜|]\s*(.+?)\s*(?:——|—|--)\s*(.+)$/gm)];
if (!heads.length) throw new Error('没有找到「### 方案 01｜名字 —— 地点」格式的标题');
const works = heads.map((h, i) => {
  const num = h[1];
  const start = h.index + h[0].length;
  const end = i + 1 < heads.length ? heads[i + 1].index : md.indexOf('\n## ', start) > 0 ? md.indexOf('\n## ', start) : md.length;
  const body = md.slice(start, end);
  const fields = {};
  for (const m of body.matchAll(/^- \*\*(.+?)\*\*\s*[：:]\s*(.*)$/gm)) fields[m[1].trim()] = plain(m[2]);
  const slots = {};
  for (const [k, v] of Object.entries(fields)) if (!HIGHLIGHT_KEYS.includes(k) && !SKIP_KEYS.includes(k)) slots[k] = v;
  if (!Object.keys(slots).length) warn(`方案 ${num} 没有任何「- **标签**：内容」条目`);
  const t = table[num] || {};
  const place = h[3].trim();
  const costMatch = (fields['落地性'] || fields['落地分析'] || '').match(/造价粗估\s*([\d.]+\s*[–-]\s*[\d.]+\s*万元?)/);
  const images = [];
  const render = `assets/works/${num}.webp`;
  images.push({ src: render, caption: `方案效果图 · ${h[2].trim()}（生图示意，非实景）`, kind: 'render' });
  if (FIELD[num]) images.push({ src: FIELD[num].src, caption: FIELD[num].label ? FIELD[num].caption : `田野照片 · ${FIELD[num].caption}`, kind: 'field', ...(FIELD[num].face ? { face: true } : {}) });
  return {
    num,
    name: h[2].trim(),
    village: (t.spot || place).split(/\s*·\s*/)[0],
    place,
    oneLine: plain(t.oneLine || ''),
    highlight: fields[HIGHLIGHT_KEYS.find((k) => fields[k])] || '',
    unit: t.unit || '',
    cost: t.cost ? t.cost.replace(/\s*万$/, ' 万元') : costMatch ? costMatch[1] : '',
    firstPhase: firstPhase.includes(num),
    slots,
    images
  };
});

// 4. 效果图：方案图/NN_名字.png → assets/works/NN.webp（跳过「废弃稿」和 00 总览）
fs.mkdirSync(OUT_IMG, { recursive: true });
for (const f of fs.readdirSync(OUT_IMG)) if (/^\d{2}\.webp$/.test(f)) fs.unlinkSync(path.join(OUT_IMG, f));
let sharp = null;
try { sharp = (await import('sharp')).default; } catch {}
async function toWebp(full, out, maxW, q) {
  if (sharp) return sharp(full).resize({ width: maxW, withoutEnlargement: true }).webp({ quality: q }).toFile(out);
  execFileSync('python3', ['-c', `
import sys; from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
if im.width > ${maxW}: im = im.resize((${maxW}, round(im.height * ${maxW} / im.width)), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=${q}, method=6)`, full, out]);
}
const files = fs.existsSync(RENDERS) ? fs.readdirSync(RENDERS) : [];
const converted = new Set();
for (const f of files.sort()) {
  const m = f.match(/^(\d{2})[_\-\s].*\.(png|jpe?g|webp)$/i);
  const full = path.join(RENDERS, f);
  if (!m || m[1] === '00' || !fs.statSync(full).isFile()) continue;
  if (converted.has(m[1])) { warn(`方案 ${m[1]} 有多张图，只用第一张：${f} 被跳过`); continue; }
  const out = path.join(OUT_IMG, `${m[1]}.webp`);
  await toWebp(full, out, MAX_W, QUALITY);
  converted.add(m[1]);
}

// 4b. 线稿：线稿/NN_名字.png → assets/works/NN-line.webp；图名栏里的视图名（主立面 / 南立面 + 平面…）从同名 svg 里读
for (const f of fs.readdirSync(OUT_IMG)) if (/^\d{2}-line\.webp$/.test(f) || f === 'lines-overview.webp') fs.unlinkSync(path.join(OUT_IMG, f));
const lineFiles = fs.existsSync(LINES) ? fs.readdirSync(LINES).sort() : [];
const lines = {};
let overview = '';
for (const f of lineFiles) {
  const m = f.match(/^(\d{2})[_\-\s].*\.png$/i);
  const full = path.join(LINES, f);
  if (!m || !fs.statSync(full).isFile()) continue;
  if (m[1] === '00') { await toWebp(full, path.join(OUT_IMG, 'lines-overview.webp'), 1720, 90); overview = 'assets/works/lines-overview.webp'; continue; }
  if (lines[m[1]]) { warn(`方案 ${m[1]} 有多张线稿，只用第一张：${f} 被跳过`); continue; }
  await toWebp(full, path.join(OUT_IMG, `${m[1]}-line.webp`), LINE_W, LINE_Q);
  let view = '';
  const svg = path.join(LINES, 'svg', f.replace(/\.png$/i, '.svg'));
  if (fs.existsSync(svg)) view = ((fs.readFileSync(svg, 'utf8').match(/[|｜]\s*([^|｜<>]+?)\s*[|｜]\s*单位/) || [])[1] || '').trim();
  if (!view) warn(`方案 ${m[1]} 的线稿读不到视图名，图注只写「方案线稿（示意）」`);
  lines[m[1]] = { src: `assets/works/${m[1]}-line.webp`, caption: view ? (/示意$/.test(view) ? `方案线稿 · ${view}` : `方案线稿 · ${view}（示意）`) : '方案线稿（示意）', kind: 'line', view };
}
for (const w of works) {
  w.lines = lines[w.num] || null;
  if (w.lines) w.images.splice(1, 0, w.lines);   // 顺序：效果图 → 线稿 → 田野照片
}

for (const w of works) {
  if (!converted.has(w.num)) { warn(`方案 ${w.num} 没有效果图，卡片会用线稿，面板显示「方案图 · 待补充」`); w.images = w.images.filter((im) => im.kind !== 'render'); }
}

// 5. 写 works.js
const fmt = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + '（新加坡时间）';
const data = {
  source: { file: path.basename(MD), renders: path.basename(RENDERS), lines: path.basename(LINES), title: (md.match(/^#\s+(.+)$/m) || [])[1] || '', mtime: fmt(mdStat.mtime), importedAt: fmt(new Date()) },
  firstPhase,
  linesOverview: overview,
  works
};
fs.writeFileSync(OUT_JS,
  `// 这个文件由 tools/import-proposal.mjs 自动生成，不要手改；改方案请改 md 后重新运行导入。\n` +
  `window.WORKS = ${JSON.stringify(data, null, 2)};\n`);
console.log(`已写入 ${path.relative(SITE, OUT_JS)}：${works.length} 件作品，首期 ${firstPhase.join('、') || '无'}，效果图 ${converted.size} 张，线稿 ${Object.keys(lines).length} 张${overview ? ' + 总览' : ''}`);
