# SnakeLab 品牌落地页

2026-10-15；基于远端 main `de71d2d1c764a60a169cb10087cd25936c078d18`，功能分支 `feat/brand-landing`。仅本地开发，不操作 Cloudflare。

## 路由与状态

根入口 `/` 为品牌落地页，`/#/lab` 为首次实验室入口。`/#/play`、`/#/arena`、`/#/lessons/astar`、`/#/training`、`/#/batch`、`/#/replay` 等旧深链继续使用现有 Dashboard。路由位于 hash，刷新仍请求根 HTML，Cloudflare Pages 不需要新增 rewrite 规则。

`App.tsx` 负责品牌/实验区边界；原实验区移入 `Dashboard.tsx`，按需加载。品牌页不读取或写入实验区设置，也不启动训练 Worker。进入 `#/lab` 时仍由既有 GameLab 判断首次演示与已存偏好；首次运行安全捷径，回访保持暂停和已选配置。离开实验区会卸载其组件及计时器，持久偏好与模型/回放存储不变。

## 设计与真实交互

深色编辑式布局：大字号首屏、绿色棋盘、策略分栏、双视频画面、可点击代码预览、线性工作区入口、技术与开源信息、浅绿色收尾 CTA。没有外部素材、虚构胜率、训练成绩、用户数量或背书。

首屏轻量 SVG 棋盘直接调用现有 Game 和真实 Hamiltonian 安全捷径 Agent。8×8、cycle 初态、seed 42、20 步/秒，真实终局为 675 步、61 食物、64 格；单元测试锁定这一结果。独立于实验区的状态，不把品牌展示进度写入用户设置。策略比较区使用同样规则和种子，提供安全捷径、A*、纯贪心的真实单步/运行与说明。

实时棋盘仅在视口可见且页面前台时运行，用户暂停不被滚动夺回；终局不自动重开。视频在进入视口后才绑定 src，离开视口或后台暂停，手动暂停保持。reduced motion 下实时计时器和 CSS 动效停止，视频不加载，保留 poster 和可手动单步的静态棋盘。键盘焦点可见，策略 tabs 支持方向键、Home、End，图片/视频预览链接可直接进入相应模块。

## 原创视频资产

由 Chromium `canvas.captureStream(20)` + MediaRecorder 从已发布 SnakeLab 的真实 Pixi canvas 录制，使用 VP9/WebM，目标码率 700 kbps，无音轨、无第三方素材。不是截图轮播或伪装成视频的静态图片。

| 文件 | 实际尺寸 | 时长 | 大小 | 内容 |
| --- | --- | --- | --- | --- |
| `public/media/arena.webm` | 838×890 | 11.76 秒 | 210,358 字节 | A*、BFS、安全贪心、合法随机四棋盘真实运行 |
| `public/media/shortcut.webm` | 720×720 | 23.87 秒 | 511,755 字节 | 8×8、seed 42 安全捷径运行片段 |

两视频共 722,113 字节；PNG posters 共 31,359 字节。后者是运行片段，不宣传视频片段本身包含完整通关。素材源、SHA-256 和录制参数见 [manifest](../public/media/manifest.json)；复录脚本为 [capture-brand.mjs](../scripts/capture-brand.mjs)，先在 4189 启动生产预览。浏览器加载结果见 [桌面](qa/brand/chromium-desktop-media.json)、[手机](qa/brand/chromium-mobile-media.json)：两段均成功解码，readyState=4，真实 currentTime 推进并接受暂停。

视频有 `muted`、`playsInline`、`loop`、播放/暂停按钮及加载失败 poster 回退。保持生产 CSP 原样，所有媒体同源，未增加 unsafe-eval。实验区 Pixi 静态 CSP 兼容模块保留。

## 性能、视觉自审与验证

Node 24.15.0，Windows，锁定依赖。品牌首包 JS 约 269 KB / 86 KB gzip，Dashboard 约 636 KB / 215 KB gzip 按需加载；首屏没有视频请求和训练 Worker。

首轮桌面/手机 8 项品牌浏览器测试通过后，实际查看首屏、整页和视频截图。发现手机首屏文本将实时棋盘推到下方，以及滚动动画初始透明度偏低。已收紧移动首屏、缩放棋盘并提升最低透明度，新增首屏棋盘可见面积断言；未通过滚动劫持来隐藏问题。

最终组合浏览器回归 24 项全部通过（桌面 12 + 手机 12），耗时 3.5 分钟。追加媒体后台/前台事件契约断言后，品牌页桌面/手机 8 项再次通过；对应精确计时器 2 项单元测试也复测通过。真实长程终局记录桌面 58,511 ms、手机 38,467 ms；都通过 675 步、61 食物、19e52bf6 校验。

自动化覆盖：

- `npm run check`：typecheck、lint、19 文件共 132 项单元测试、生产 build。
- 新增真实品牌引擎的 StrictMode 单一定时器、离开视口暂停、手动暂停保持、reduced motion、675 步填满后停止测试。
- `tests/brand.spec.ts`：入口/回访偏好、hash 刷新与旧课堂深链、具体模块跳转、键盘 tabs、真实视频解码/播放/暂停/离屏暂停、失败 poster、reduced motion、无横向溢出、严格 CSP。
- `tests/welcome.spec.ts` 和 `tests/lab.spec.ts`：原实验区启动、终局回放、后台事件契约、手动、竞技、批量评测、真实 DQN/GA 训练回归。

截图：[桌面首屏](qa/brand/chromium-desktop-hero.png)、[桌面整页](qa/brand/chromium-desktop-page.png)、[桌面视频](qa/brand/chromium-desktop-cinema.png)、[手机首屏](qa/brand/chromium-mobile-hero.png)、[手机整页](qa/brand/chromium-mobile-page.png)、[手机视频](qa/brand/chromium-mobile-cinema.png)。

## 已发布版本 CI 超时修复

父线程提供的 [run 38690132257](https://github.com/ider-zh/snake-game-lab/actions/runs/38690132257) 诊断：桌面 SwiftShader 在原 90 秒整例截止时仍前进到第 534 步、39 食物，手机相同断言 55.8 秒通过。该证据与本地确定性引擎和真实浏览器完成结果一致，未发现算法停滞；软件渲染可使真实时间步进低于标称速度。

因此拆分短程「首次启动/暂停/重开」与长程「真实通关/回放」用例，长程总预算 240 秒、等待终局 210 秒，并在开始后检查步数继续变化。没有加速游戏时钟、替换引擎或删除通关断言；仍要求 675 步、61 食物和 `19e52bf6` 回放哈希。单独记录本地真实耗时于 welcome JSON 证据。后台行为按 visibilitychange 事件契约验证，未声称操作系统级切窗验收。此调整尚需发布后的 Linux CI 复验，不声称本地测试已经证明所有 CI 机器的完成耗时。

复现：`npm ci`、`npx playwright install chromium`、`npm run check`、`npm run test:e2e -- tests/brand.spec.ts tests/welcome.spec.ts tests/lab.spec.ts`。本地预览：`npm run preview -- --port 4189 --strictPort`。
