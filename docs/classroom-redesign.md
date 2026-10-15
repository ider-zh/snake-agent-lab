# 策略课堂：文档式阅读改版

2026-10-07，HP Windows，本地分支 `feat/algorithm-lessons`，起点 `a86932f245d7067d5304ade20a44e8ae901a1e25`。

## 阅读与导航

课程总览解释三条阅读路线和使用方法。三组目录直接链接全部 21 课，并以文字、背景和 `aria-current` 标出当前课程。每课包含独立标题、直觉说明、两个学习目标、决策步骤、原有交互演示、双语代码、适用边界、练习和前后课导航。第一课返回总览，最后一课回顾目录。

课程地址使用 `/#/lessons/<id>`；总览是 `/#/lessons`。可刷新、收藏、前进和后退，无服务器路由要求。未知课程回到总览。工作区切换也进入浏览器历史；训练和批量工作区仍保留原有挂载方式。

桌面目录固定在阅读区旁，手机目录为有界滚动区域，并提供返回目录按钮。正文按文章顺序排版，演示棋盘最大 680px；代码在自身区域滚动。

## 代码与演示

保留原有全部 42 份 JavaScript/Python 示例。新增无依赖词法高亮，通过 React 文本节点呈现，既不注入 HTML，也不执行用户代码。语言选项使用 tablist/tab/tabpanel，支持方向键、Home、End。复制使用未高亮的原文；失败时给出提示并聚焦可选择的代码框。

移除课堂的示例下载按钮。模型、检查点、评测及回放导出保持原有功能。预期输出和完整训练伪代码仍可展开查看。

真实搜索冻结、搜索前后步、执行建议动作、重置场景、Beam/MCTS 统计、观察编码和逐步计算保留。教学计算仍明确标为固定数据，不冒充训练成果。本轮界面改版未修改策略、训练算法或示例源代码。全部 21 课现已补充面向初学者的原理、术语、手算棋盘或数值例子、代码对照、失败情形、练习详解与每课来源。正文默认展开，答案和补充输出可折叠；页内按钮可直接定位原理、算例、演示、代码与练习，不改变课程地址。

## 验证

第一轮完整 check 通过（124 项单测、TypeScript、ESLint、生产构建）；桌面与手机 Chromium 16/16 回归通过，包含课堂、实验台、竞技、回放、训练、规划策略与尾部绕行。人工审查随后发现手机目录受全局导航样式影响，已修复，并补充目录内部宽度检查。最终样式复验 10/10 通过，扩写后再进行的桌面/手机回归也为 10/10。后者遍历全部 21 课与 42 份代码，检查正文、学习目标、页内跳转及焦点、来源、练习解答、目录宽度、前后课边界、刷新与历史导航、键盘标签、复制及失败反馈、搜索冻结/执行/重置、规划统计与回放。

高亮六种文字颜色相对背景 #17241d 的对比度经 sRGB 计算为 6.95:1–12.77:1。颜色之外保留原文、字体变化和语言标签。

## 扩写内容与实现核对

正文共约 25,564 个中文字符（不计来源注释、原有简介和代码），每课至少 978 个，引用 34 个不同的一手资料、官方教程或作者教程链接。详见 [逐课清单](qa/classroom/content-inventory.json)。来源解释基础概念，原创 Snake 棋盘与数字用于教学；不复制参考仓库代码，不引用其成绩作为本项目结果。

以下差异已明确写进相应课程：Random 抽四个方向且反向由核心替换；Greedy 不做碰撞过滤；SafeGreedy 的简化冻结面积例子与实际尾部出口模型分开；当前 Dijkstra 是单位边权，收费地图是拓展算例；A* 使用发现顺序平局；最佳优先的七步反例特别使用后进先出平局；Beam 概念例的食后延伸与项目在当前食物处停止并检查出口的做法不同。静态搜索最优性始终限定于输入图。

学习侧核对了十二个输入槽位、左/直/右索引、归一化尺度、环境终止和截断、PPO 的 rollout 批次边界、线性 actor/critic、GA 的 75 个输出基因，以及独立学生推理不调用教师。PPO clip 不是概率比硬约束，教师一致率不是自主成功率，有限 MCTS 和尾部绕行不是通关证明。历史晚局失败、停滞和预算限制未删改。

## 最终可复验结果

- TypeScript、ESLint、125 项 Vitest 全通过；生产构建通过。最后的测试/脚本变更未改变浏览器验证的应用资源。
- [扩写后的浏览器摘要](qa/classroom/browser-summary.json)：10/10；[工作区回归](qa/classroom/workspace-regression.json)：16/16；[最终布局复验](qa/classroom/layout-regression.json)：10/10。三个阶段有重复覆盖，不合并宣称 36 个不同测试。
- Node 24.15.0 / Python 3.13.12 实际执行 21 对程序，输出互相一致且符合预期：运行 `node scripts/verify-lesson-examples.mjs`，设置 `LESSON_PYTHON` 为解释器路径。[结果](qa/classroom/example-results.json)。
- 17 项独立教材核对通过：BFS 5 步、特定平局最佳优先 7 步、冻结面积 17/2/17、回路闭合与捷径邻接/距离、食后角落死局、TD/Double/GAE/PPO/UCT/BC/GA 算术。运行 `node scripts/verify-curriculum-examples.mjs`。[结果](qa/classroom/worked-example-checks.json)。这些不是游戏性能成绩。
- 相对文档链接与 `git diff --check` 在提交前检查；生产预览资源与本机 dist 逐字节核对。

## 人工截图审查

已查看桌面与手机目录、正文、棋盘和代码细节。代码保持内部横向滚动，页面没有横向溢出；核心正文不藏在折叠区。全篇截图很长，固定底部工作区导航出现在拍摄时的视口位置，阅读局部图更方便。

- [桌面阅读首屏](qa/classroom/desktop-reading-viewport.png) · [手机阅读首屏](qa/classroom/mobile-reading-viewport.png)
- [桌面手算图](qa/classroom/desktop-worked-example.png) · [手机手算图](qa/classroom/mobile-worked-example.png)
- [桌面代码](qa/classroom/chromium-desktop-code-detail.png) · [手机代码](qa/classroom/chromium-mobile-code-detail.png)
- [桌面 A* 全文](qa/classroom/chromium-desktop-astar.png) · [手机 A* 全文](qa/classroom/chromium-mobile-astar.png)

## 范围限制

浏览器验证是 HP 上的 Chromium 桌面与 iPhone 13 尺寸模拟，不等于实体手机、Safari、Firefox 或屏幕阅读器验收。复制测试替换剪贴板传输，核对原文和失败反馈；不声称跨系统剪贴板权限已经验证。代码高亮是针对内置示例的词法着色，不是完整语法分析器。

未推送、未建 PR、未合并，未部署 Cloudflare。预览地址：`http://127.0.0.1:4173/#/lessons`。
