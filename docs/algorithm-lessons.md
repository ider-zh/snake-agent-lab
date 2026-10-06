# 算法课堂：实现与验收

2026-10-06，HP，分支 `feat/algorithm-lessons`，基于合并后的 main `10c40747f265fb1d302f4ad2e806aa91d9b8df6e`。

## 第一批已实现

入口「算法课堂」提供 11 课：7 种经典策略、compact-v2 观察编码、DQN/Double DQN、GA、独立评估。每课含中文直觉、真实策略单步或明确标记的教学计算、JavaScript/Python 切换与复制下载、适用限制和练习解答。

首页区分无需训练的规则/规划策略与需要训练的学习/进化策略。标准 A* 不需要训练，调整搜索预算不算训练。教学数字不冒充实时训练曲线。

搜索教学调用真实 `pathToFood`。实际动作完成计算后，按相同扩展数量再次调用同一搜索函数采集冻结前缀，最多 256 帧；不会消耗原决策墙钟预算或环境/策略随机数。BFS FIFO 与 A* 最小堆顺序、frontier、visited、g/h/f 都来自搜索。演示用节点预算 10000、无墙钟上限的小型固定场景；正式实验台仍使用原墙钟预算。后退/前进只移动游标，「执行建议动作」才推进 `Game.step`。动态身体模拟和空间检查不被误称为静态搜索帧。

双语程序是无依赖的独立可运行构件，明确注明与完整策略的差别。BFS/A* 示例是静态路径；SafeGreedy 示例是洪泛构件；DQN/GA 示例分别计算 TD 目标和 fitness，完整训练流程明确标为不可运行伪代码。编码示例与真实 12 特征核对。页面不执行任意用户代码。

## 自动化与真实验收

- Node 24.15.0、Python 3.13.12：11 对程序实际运行，数值逐项一致（1e-10 容差），见 [原始结果](qa/lessons/example-results.json)。运行脚本：`LESSON_PYTHON=<python path> node scripts/verify-lesson-examples.mjs`。
- `npm run check`：类型检查、ESLint、97 项单测、生产构建通过。测试包括 trace 与无 trace 动作/路径/预算一致、冻结状态不变、帧数限制、随机流重建以及编码/路径与示例对照。
- 浏览器最终状态在本文件后续验收记录中补充。截图：[桌面 A*](qa/lessons/chromium-desktop-astar.png)、[桌面 DQN](qa/lessons/chromium-desktop-dqn.png)。

复制 E2E 使用浏览器 clipboard transport stub 检查精确文本，不代表操作系统剪贴板权限已经跨浏览器验证。手机是 Chromium 视口模拟，不是实体手机。Safari、Firefox、屏幕阅读器与长时间训练仍不在此次验收范围。

## 已授权的后续扩展（此时尚未实现）

依次增加 Q-learning/SARSA 与 Beam/MCTS；Dijkstra/贪心最佳优先/条件 Hamiltonian 捷径；PPO 与模仿学习。每批独立本地提交，补充模型校验、Worker 生命周期、课程示例和真实多种子实验。不得以菜单、伪代码或训练前后单局差异代替真实实现/学习证据。现有 DQN/GA 默认参数不变。分支发布待维护者确认，未部署。

## 第一批最终验收

完整 Chromium 桌面/手机回归 22/22 通过（5.0 分钟），含原有 20 项与新增教学 2 项。已人工查看上述桌面截图，以及[手机 A*](qa/lessons/chromium-mobile-astar.png)、[手机 DQN](qa/lessons/chromium-mobile-dqn.png)：柔和深色、大棋盘、内部代码滚动、控制区及练习可用，无页面横向溢出或浏览器异常。全页截图中的固定底栏位置随拍摄时滚动位置变化，不代表页面内容被永久截断。后续新增算法改为优先验证高效填满，不先堆叠训练算法。

## 第二批：安全捷径优先

新增第 12 课和双语环距离构件；12 对示例实际运行一致。新增策略、通关预算和 30 种子对照见 [通关效率报告](efficient-completion.md)。原 11 课交付已独立提交；其后授权的算法仍按用户质量优先顺序推进。

## Third batch: bounded tail detours

Added an optional A* fallback policy and lesson 13. The default A* remains unchanged. Held-out 240-episode results improve mean food across all four groups, but show persistent no-progress and step-limit failures. Full protocol, raw data and limits: [tail detour report](tail-detour.md). The remaining eight authorized algorithms are still pending; this is not full-scope completion.

## Fourth batch: planning comparisons

Dijkstra, greedy best-first, Beam and UCT MCTS now have independent decision logic, classroom examples and bounded multi-seed comparisons. Beam/MCTS failures are retained and neither replaces the default. See [planning policies](planning-policies.md). Q-learning, SARSA, PPO and imitation learning remain pending at this stage.
