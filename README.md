# 田埂退潮之后 · 永丰四村田野地图 (v2)

纯静态站点，无 CDN、无 Python 依赖。原生 WebGL 粒子（桌面约 11 万 / 手机约 4 万）+ Canvas2D 线稿。

## 在 Windows 上运行
1. 把整个 `v2` 文件夹放到 `C:\Users\lqy13\xiaxiang-map\v2`（覆盖旧文件）。
2. 用已有的 `serve.ps1`（PowerShell HttpListener）启动，或运行本目录里的 `serve.ps1`：
   `powershell -ExecutionPolicy Bypass -File C:\Users\lqy13\xiaxiang-map\v2\serve.ps1`
3. 浏览器打开 http://127.0.0.1:8780/ ，按 Ctrl+F5 强制刷新，避免读到旧缓存。

## 交互
- 入口门楼：拖动门（带惯性和弹性形变），鼠标悬停时附近粒子会有反应；点击门 → 粒子爆散成云，再重组成地图。
- 跳过：按 `Enter` 或点右上角「跳过」。深链接 `#dongan` `#hengshanyao` `#jiangjiaao` `#wuan` 或 `?nogate` 不进门楼，直接进地图。地图上点「回到门」或按 `G` / `Esc`（无面板时）可反向回到门楼。
- 地图：`+`/`=`/`-` 缩放，`WASD`/方向键平移，滚轮缩放，`0` 或空格复位，`Esc` 关闭面板/浮层。
- 顶部：项目 / 时间线 / 对比 / 图库；右侧主题筛选；点村子打开详情面板，照片可放大查看。

## 数据
- 内容全在 `data.json`。研究内容只取自「下乡视频制作」文字稿和 PPT，资料里没有的写「待补充」。
- 照片：`assets/photos/<村id>/`（webp，`t/` 下是缩略图）。照片没有 EXIF，拍摄日期一律待补充。
- 东安村与横山腰只对调了地图位置（东安在东北深山 uv 0.67,0.505；横山腰在中部半山 uv 0.58,0.56），内容和照片都没动。
