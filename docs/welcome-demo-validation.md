# 首页演示与严格 CSP 验收

日期：2026-10-15。基线及最终复查远端 main 均为 e9fa9a2f8dcbf01c1e31918af0d2ac3fff7214d6。独立 clone，未改其他项目。

## 实现

- Board 在 app.init 前导入 PixiJS 8.22.0 官方 pixi.js/unsafe-eval 静态兼容模块。public/_headers 不变，script-src 仍为 'self'，没有 unsafe-eval，未修改浏览器安全设置。
- 错误文案区分 CSP、WebGL 图形上下文及一般初始化失败，不再一律建议更换 WebGL 浏览器。
- 首次无 hash / 查询参数的首页自动运行 Hamiltonian 安全捷径：8×8、无障碍、cycle 初态、长度 3、种子 42、20 步/秒、maxSteps 5000、maxNoFood 500。
- 此配置真实完成 675 步，61 食物，填满 64 格，终局哈希 19e52bf6；理论播放时间 33.75 秒，实际时间会随渲染及设备调度增加。不宣称所有配置通关或算法绝对最优。
- 完成后停止并展示成功状态，无自动重播。暂停、重开、切策略、切手动不会被自动启动覆盖。回访恢复校验后的内置策略、规则、速度、手动和叠加显示偏好，并暂停；指定深链保持指定工作区。
- reduced motion 首次暂停，运行中启用也暂停；后台暂停，前台需手动继续。首次手机演示收起重复标题和上方指标，保留可访问标题，让棋盘及暂停按钮进入首屏；策略切换后恢复普通实验布局。

## 自动化与真实浏览器验证

环境：Windows，Node 24.15.0，锁定依赖 npm ci，Playwright 1.63.0，Chromium 153.0.8010.12。运行时与浏览器安装在本任务专属临时目录，未改系统默认版本。

- npm run check：typecheck、lint、18 个单元测试文件共 130 项及生产 build 全部通过。
- 最终布局修改后再次执行 typecheck、lint、build，通过。
- 单元测试直接调用 Game 与真实 Hamiltonian 策略，逐步执行至终局，校验回放每一步哈希及终局快照；锁定 675 步和 19e52bf6。
- React StrictMode + 精确虚拟时钟覆盖首次启动、每秒恰好 20 步、暂停、重开、回访、后台返回后仍暂停、显式恢复后无重复定时器。
- 第一轮 tests/lab.spec.ts 与 tests/welcome.spec.ts：桌面/手机 12 项全部通过，涵盖生产 CSP、首次完整演示、回放、设置回访、reduced motion、手动操作、竞技、批量导出及真实 DQN/GA 训练。
- 最终 welcome 套件桌面 4 项通过；手机首屏断言发现垂直空间不足，修正后手机 4 项复测全部通过。覆盖首屏可见性、精确步数和哈希、visibilitychange 与运行中 reduced motion。visibilitychange 在真实浏览器中按事件契约模拟，不声称做过操作系统级切窗测试；无重复定时器由精确虚拟时钟断言验证。

预览从 public/_headers 读取全局生产响应头，监听独占端口 4187，不复用其他服务。每个 Playwright case 使用独立浏览器存储上下文；首次演示测试断言响应头 script-src 'self' 且不含 unsafe-eval，监听页面及控制台错误，确认 canvas 初始化、实际推进、填满、回放一致。

已实际查看桌面与手机的首屏、整页和终局截图，棋盘、暂停/重开按钮可见；移动端无水平溢出。

## 证据

- [桌面首屏](qa/welcome/chromium-desktop-first-viewport.png)、[桌面完整页面](qa/welcome/chromium-desktop.png)、[桌面填满](qa/welcome/chromium-desktop-filled.png)
- [手机首屏](qa/welcome/chromium-mobile-first-viewport.png)、[手机完整页面](qa/welcome/chromium-mobile.png)、[手机填满](qa/welcome/chromium-mobile-filled.png)
- [桌面实际 CSP 与回放结果](qa/welcome/chromium-desktop.json)、[手机实际 CSP 与回放结果](qa/welcome/chromium-mobile.json)

复现：npm ci；npx playwright install chromium；npm run check；npm run test:e2e -- tests/welcome.spec.ts tests/lab.spec.ts。

本次仅本地提交，未推送、未创建 PR、未操作 Cloudflare。部署由用户完成。
