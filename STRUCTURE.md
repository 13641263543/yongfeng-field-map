# 结构

门 → 地图 → 窗，同一个静态站。界面文字必须是中文（按钮、载入、标题、aria）。不要用 `file://` 打开：ES module、`fetch` 和高程图都要 HTTP。在仓库根目录：

```
python3 -m http.server 8780
```

打开 http://127.0.0.1:8780/ 。路径都是相对的，GitHub Pages 的 `/yongfeng-field-map/` 不用改基址。依赖已放进仓库，不走 CDN：地图的 `vendor/d3.min.js`（等高线）、`vendor/fonts/GeistMono.ttf`；退潮线的 `window/vendor/three.module.min.js`（0.170.0，import map 名 `three`）、`window/vendor/gsap.min.js`（3.12.5）。退潮线字体优先 Noto，断网时退回系统宋体 / 黑体。

## 门与地图

- `index.html`：地图 DOM。门楼由脚本插入 `#gate`。`#field-window` 是退潮线的外框（「窗 · 退潮线」「回地图」）。左上角 `#site-version` 显示版本。
- `version.js`：全站版本 `VERSION`，`stampVersion()` 写角标和 `<meta name="version">`。地图和退潮线都读这一处。
- `style.css`：地图外观。颜色在 `:root` 的 `--bg` `--cyan` `--amber` `--text` `--muted`，字体 `--sans` `--serif` `--mono`。
- `app.js`：粒子、门、相机、线稿、村子面板。入口 `boot()` → `showGate()` 或 `startMap()`。调试对象 `window.__app`。
- `shell.js`：窗的开关和哈希。`parse` / `toParent` / `openWindow` / `closeWindow`。村子对应的第一件作品在 `FIRST`。
- `data.json`：文案与地图线。`site` 标题，`villages[]` 四村，`map.river` / `map.roads`，以及 `about` `timeline` `compare` `themes`。
- `data/height.png`：高程图，`loadHM()` → `sampleHM()` / `terrain()`。
- `assets/photos/<村id>/`：照片，`t/` 是缩略图。`assets/sat/`：卫星底图。
- `serve.ps1`：Windows 上的本地静态服务。

## 窗 `window/`（退潮线）

嵌在地图里时外层地址是 `#/tuichao`、`#/tuichao/index`、`#/tuichao/work/01`…`10`。单独打开本目录时仍是 `#/`、`#/index`、`#/work/NN`（`main.js` 的 `EMBED`、`navigate()`）。

- `index.html`：转鼓页。`#gl` 画布，`#detail` 详情，`#lightbox` 线稿，`#loader` 载入。右上角 `#site-version` 用 `../version.js` 盖章（只在本目录起服务时上一级不存在，角标省略）。
- `site.js`：`window.SITE`，标题、页脚、提示语。
- `works.js`：`window.WORKS`，十件作品的文字和图片路径。由 `tools/import-proposal.mjs` 生成，不要手改。
- `css/style.css`：配色 `--bg` `--ink` `--tint` `--paper` `--paper-ink`，字体 `--serif` `--sans`。
- `js/main.js`：载入、路由、索引、光标。`route()` / `doRoute()`，视图 `setView()`。
- `js/stage.js`：three.js 转鼓、鼠标扭曲、形变用的 `focus`。`createStage()`。
- `js/transition.js`：卡片 ↔ 详情。`createTransition()` 的 `open` / `close` / `swap`。
- `js/detail.js`：面板正文 `renderWork()`，滚动条 `attachBars()`，几何 `measure()`。
- `js/strip.js`：详情里拖到相邻作品。`createStrip()` 的 `snap` / `commit`。
- `js/lightbox.js`：线稿全屏。`createLightbox()`。
- `js/typecards.js`：卡片贴图排字。
- `assets/works/NN.webp`：效果图。`NN-line.webp`：线稿。`lines-overview.webp`：索引底图。
- `assets/field/`：面板里的田野照片。

## 改什么去哪里

- 粒子门外观：`app.js` 的 `gateSampler()`（柱、门扇、屋顶、匾额都在这里画）。约 44% 的粒子组成门，比例是 `buildParticles()` 里的 `vf`（桌面 `0.44`，手机 `0.7`）。
- 拖动 / 点击进入：`GATE`，拖动在文件后部的 `pointerdown` / `pointermove` / `pointerup`。点在门内调用 `enterFromGate('burst')`。回车是 `skip`，空格是 `burst`。点击范围 `inGate()`。弹性拖曳进着色器的 `uGDrag`。
- 粒子聚合成地图：着色器 `VS` 里的 `uGateOn`、`uMorph`、`uBurst`，由 `gateUniforms()` 驱动。`enterFromGate()` 开始离开，`returnToGate()` 倒放回门。地形高度 `terrain()`，世界尺寸 `MW` `MH`，抬升 `HS`（`0.36`）。粒子数量 `buildParticles()` 的 `N`（桌面 11 万 / 手机 4 万）。
- 房屋、道路、农田：道路与河在 `data.json` 的 `map.roads`、`map.river`。房屋数量、田间格子在 `buildLines()` 的 `G.houses` 和 `fieldZones`。等高线用 d3，阈值在同一函数的 `levels`。描线样式在 `drawLines()`。
- 快捷键、缩放、平移：`app.js` 的 `keydown`。`+`/`-` 走 `zoomBy()`（倍数 `1.18`），滚轮在 `#gl` 上。方向键和 WASD 写入 `S.keys`，`keyboardCam()` 平移。`0` 或空格 `resetView()`。`G`、退格，或没有面板时的 Esc，调用 `returnToGate()`。
- 顶部「退潮线」：`index.html` 的 `#nav-window`。村子面板是 `#p-window`，项目浮层按钮带 `data-window`。点击进 `shell.js` 的 `openWindow()`。从村子进入时用 `FIRST`（东安 01、横山腰 05、姜家岙 07、吴岸 09）。
- 「回地图」与路由：按钮 `#fw-back` → `closeWindow()`。外层哈希 `#/tuichao…` 与窗内 `#/`、`#/work/NN` 的对译在 `parse()` / `toParent()`。窗内改地址用 `navigate()`，不要直接写 `location.hash`（嵌在地图里时要同步外层）。
- 退潮线作品文字和图片：改方案后重跑 `window/tools/import-proposal.mjs`，它覆盖 `works.js` 和 `assets/works/*.webp`。只改站名、页脚、提示语时改 `site.js`。人像打码字段 `face` 不要删。
- 卡片轮播与鼠标扭曲：`stage.js` 的 `createStage()` 和内部 `frame()`。扭曲在卡片着色器的 `uMouse`、`uPush`、`uMDir`。系统开了「减少动态效果」时 `RM` 会把 `uPush` 置 0。
- 卡片变成详情：`transition.js` 的 `open()` / `close()`。进度在 `stage.focus` 的 `morph`（0 转鼓 → 1 面板）和 `mix`（0 画面 → 1 纸色）。终点矩形来自 `detail.js` 的 `measure()`，相机距离常量 `MORPH_DIST`（`6`）在 `stage.js`。
- 详情滚动条：原生滚动条在 `window/css/style.css` 里被藏掉（`.panel-text` / `.panel-media`）。细指示条由 `attachBars()` 画成 `.sb`，面板带 `.is-settled` 才显示。
- 作品之间拖动：`strip.js`。横向位移比竖向多 8px 才算拖。松手 `snap()`，吸附后 `commit()` → `onCommit` 用 `navigate(..., { replace: true })`。左右键也走 `strip.go()`。
- 灯箱：退潮线线稿是 `lightbox.js` 的 `createLightbox()`，入口是详情里的 `[data-zoom]`。地图照片灯箱是 `app.js` 的 `openLightbox()` / `LB`，DOM 在根上的 `#lightbox`。
- 字体和配色：地图改 `style.css` 的 `:root`。退潮线改 `window/css/style.css` 的 `:root`；卡片贴图上的字色在 `typecards.js` 的 `INK` / `TINT` / `SERIF`。
- 载入页：地图是根上的 `#loader`，进度在 `boot()`。退潮线是 `window/index.html` 的 `#loader`，进度条 `setProgress()`，时间轴在 `main.js` 的 `start()`。
- 版本号：只改 `version.js` 的 `VERSION`，并在文末「版本记录」加一行。角标样式是两处 `.site-version`（`style.css` 左上，`window/css/style.css` 右上）。

## 版本记录

每次改动都抬版本，并在这里留一行。小修加次版本（1.0 → 1.1）。页面上的「版本 x.x」从 `version.js` 读，不要在 HTML 里另写数字。

- 1.0：门 → 地图 → 窗 合站。

## 不要动的约定

作品标题和方案字段以 `works.js` 为准。嵌在地图里时，窗收起用 `is-parked`（不销毁 iframe），渲染循环由 `stage.setRunning()` 暂停。村庄哈希没有斜杠；带 `#/` 的地址都属于退潮线。
