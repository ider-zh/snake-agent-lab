# 棋盘面积修正

基线提交：`b43873904cee7979e41f38091e4214ffd69a449e`。本轮针对棋盘过小，保留柔和深色、策略和训练算法。

移除 `100vh - 560px` 带来的高度缩放限制。桌面竞技使用主区域加 260px 参数侧栏，1180px 以下把参数移到棋盘下方；单局上限增至 720px。四板画布按宽度排成 2×2，另外保留 52px 策略标题空间。矮窗口正常纵向滚动，不牺牲每格尺寸。

手机继续逐板观察四个同时模拟的策略，棋盘使用可用宽度；查看棋盘时运行控制可吸附到顶部。未用展开模式代替默认放大。

## 同视口实际绘制尺寸

单位为 CSS 像素，每块棋盘均为正方形；不包含策略标签。前版由实际画布尺寸和当时的渲染布局计算，后版读取 Pixi 绘制使用的矩形，并校验画布物理像素与 DPR。数据来自真实 Chromium。

| 视口 | 竞技每板：前 → 后 | 边长增加 | 四板总面积倍数 |
| --- | --- | ---: | ---: |
| 1440×1000 | 184 → 409 | 122.3% | 4.94× |
| 1920×1080 | 204 → 550 | 169.6% | 7.27× |
| 1024×768 | 104 → 369 | 254.8% | 12.59× |
| 1440×720 | 104 → 409 | 293.3% | 15.47× |
| 390×664 手机 | 244 → 318 | 30.3% | 单板聚焦，面积 1.70× |
| 320×664 手机 | 244 → 272 | 11.5% | 单板聚焦，面积 1.24× |

单局桌面：1440px 下从 440 增至 720，1920px 下从 480 增至 720，1024px 下从 280 增至 720。手机单局保持可用宽度 318/272px，消除初始化画布默认高度产生的空白。

1440×1000 下，四板总绘制面积/视口面积从 9.4% 增至 46.5%；1920×1080 下从 8.0% 增至 58.4%。这是总绘制面积比，不是首屏可见比例；较大棋盘需要纵向滚动，四板始终保留完整 2×2 布局。

## 同视口截图与原始数据

| 视图 | 修改前 | 修改后 |
| --- | --- | --- |
| 1440×1000 竞技 | [前](qa/board-size/1440-before.png) | [后](qa/board-size/arena-enlarged-1440.png) |
| 1920×1080 竞技 | [前](qa/board-size/1920-before.png) | [后](qa/board-size/arena-enlarged-1920.png) |
| 390×664 聚焦 | [前](qa/board-size/mobile-before.png) | [后](qa/board-size/arena-enlarged-mobile.png) |

[修改前尺寸](qa/board-size/before.json) · [修改后尺寸](qa/board-size/after.json)。相同 seed 42、12×12、六步；手机观察 BFS。完整页截图展示可滚动区域。

## 验证方法

`ResizeObserver` 根据实际容器尺寸调整 renderer，窗口变化时同步 DPR（上限 2），卸载时清理观察器。画布脱离普通文档流，避免初始化 800×600 尺寸反向撑大手机容器。

`tests/board-layout.spec.ts` 在两个浏览器配置中检查七次视口变化、实际绘制矩形、完整边界、物理像素/DPR、四策略选择、步数保持、运行/暂停、焦点和模式切换；额外检查单局手机画布没有多余高度。`scripts/board-size-qa.ts` 生成六种视口的单局/竞技尺寸及截图；`scripts/theme-qa.ts` 检查全模式视觉状态。最终检查结果见 [HP 验证记录](hp-validation.md)。

仍未验证实体手机或硬件 GPU；本机 Chromium 使用 SwiftShader。不把本次布局调整作为性能提升结论。

Final verification: `npm run check` passed (86 unit tests); all 20 desktop/mobile Playwright tests passed in 9.3 minutes; all 41 theme audit states passed. Actual HP Chromium uses SwiftShader, so these are not physical mobile GPU performance results.
