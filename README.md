# SnakeLab

A browser-based Snake playground for human play, AI agents, and in-browser training experiments.

SnakeLab（仓库名 `snake-agent-lab`）计划把手动贪吃蛇、自动策略对比和浏览器内训练放在同一套可复现规则下，兼顾游戏体验、算法研究与工程实践。

**当前状态：设计评审阶段。** 本次初始化提供设计文档；游戏、训练器、演示站点及性能数据尚未实现。文中技术栈、参数和验收指标均为待验证方案。

## 计划体验

| 模式 | 可以观察或操作什么 | 阶段 |
| --- | --- | --- |
| 手动经典 | 键盘/触控移动、暂停、重开、分数 | MVP |
| AI 观看 | 切换策略、调速、单步、查看搜索过程 | MVP 起步 |
| 同种子多策略竞技 | 独立棋盘共享规则与种子集，对比表现 | 第二阶段 |
| 批量实验 | 关闭绘图运行多局，导出结果 | 第二阶段 |
| 浏览器训练实验室 | DQN 与 GA/神经进化，暂停、取消、保存恢复 | 第三、四阶段 |
| 种子与动作回放 | 重现失败、逐步检查决策 | 第二阶段 |

自动策略路线：随机/合法随机 → Greedy → BFS/A* 与安全检查 → 有适用条件的 Hamiltonian 环基线 → DQN → GA/神经进化。障碍挑战与高级强化学习算法安排在后续。

## 建议技术方案

采用 TypeScript + Vite；PixiJS 负责棋盘渲染，React 负责控制与统计面板。纯 TypeScript 核心提供 `reset(seed)`、`step(action)`、`observe()`，与 DOM 和绘图解耦。单渲染器展示多个棋盘，Worker 池承担仿真，训练按计算预算运行，界面抽样刷新。

TensorFlow.js 是浏览器内训练候选；ONNX Runtime Web 定位为可选模型导入与推理。后端兼容、训练算子和渲染争用需用实际设备验证后确定。Phaser 是需要更完整场景、音效及 Tween 时的备选。

## 评审入口

- [完整设计与分阶段验收](docs/design-plan.md)：规则、架构、算法、训练预算、公平比较与风险。
- [参考项目与技术依据](docs/references.md)：固定版本的源码入口、可借鉴点及许可边界。
- [维护约定](AGENTS.md)：计划状态与验证记录的维护准则。

建议优先评估：首版是否采用 12×12 无障碍棋盘；PixiJS + React 的职责划分；第二阶段先完成可复现对比再开展训练；浏览器训练预算是否符合目标设备。当前没有安装或启动命令，待 MVP 工程建立后补充可执行步骤。

## Related Work

- [dmitryshelomanov/snake](https://github.com/dmitryshelomanov/snake)：TypeScript/React 贪吃蛇，提供 BFS、DFS、Dijkstra、Greedy、A* 及搜索可视化，可借鉴策略接口与手动/AI 共用规则的组织方式。
- [gargimahale/Snake](https://github.com/gargimahale/Snake)：Python/Tkinter 项目，提供 Path、Greedy、Hamilton 与 DQN 路线，可借鉴安全检查、实验模式与训练/评估划分。

引用与研究记录见[参考文档](docs/references.md)。两个指定仓库在本次核查中均未见 LICENSE；本次只借鉴设计理念，未复制源码或沿用其成绩。本仓库许可证由维护者后续决定。
