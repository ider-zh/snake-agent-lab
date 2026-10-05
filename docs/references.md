# 参考项目与技术依据

核查日期：2026-10-05。以下区分已有项目事实与 SnakeLab 的设计取舍。外部实验数据不作为本项目结果。

## 1. dmitryshelomanov/snake

固定版本：[6536f90a46a7017704b01de1d88ee996c8cc3b47](https://github.com/dmitryshelomanov/snake/tree/6536f90a46a7017704b01de1d88ee996c8cc3b47)。这是 TypeScript/React 浏览器项目。

- [算法注册](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/models/algorithms/store.ts)统一提供 BFS、DFS、Dijkstra、Greedy、A*；[接口类型](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/typings/alghorithms.d.ts)定义共用输入和 path/processed 输出。SnakeLab 拟采用统一 Agent 接口和可选 debugInfo。
- [初始化与更新](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/initialize.ts)展示手动/AI 共用规则及搜索可视化的组织方式；[tick](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/models/tick.ts)区分逻辑与绘图职责，但仍在同一 tick 内调度。这不构成 Worker 训练实现。
- [A* 实现](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/algorithms/a-star.ts)的首次入队 processed 标记与发现目标邻居即退出，需要额外审查最优性；SnakeLab 计划独立实现 gScore 更新及预算处理。[Graph](https://github.com/dmitryshelomanov/snake/blob/6536f90a46a7017704b01de1d88ee996c8cc3b47/src/algorithms/graph.ts)默认边界环绕，启发式必须与地图规则一致。

重点借鉴接口组织、共享规则和可视化，而非直接采用其算法正确性或性能结论。

## 2. gargimahale/Snake

固定版本：[0e471a244bc34891b2422d32dd365da7055a8f53](https://github.com/gargimahale/Snake/tree/0e471a244bc34891b2422d32dd365da7055a8f53)。这是 Python/Tkinter 项目，提供 Path、Greedy、Hamilton、DQN 路线。

- [Greedy](https://github.com/gargimahale/Snake/blob/0e471a244bc34891b2422d32dd365da7055a8f53/snake/solver/greedy.py)模拟吃食后的尾部可达性；SnakeLab 借鉴其安全检查思路，将其明确标作启发式而非必胜保证。
- [DQN](https://github.com/gargimahale/Snake/blob/0e471a244bc34891b2422d32dd365da7055a8f53/snake/solver/dqn/__init__.py)含多通道/局部危险观察、相对三动作与绝对四动作配置，以及 replay、target、Double DQN/Dueling 相关路径。它使用 Python TensorFlow 1.x 路线，不是浏览器训练方案。SnakeLab 先验证基础 DQN，再做高级变体消融。
- [游戏模式](https://github.com/gargimahale/Snake/blob/0e471a244bc34891b2422d32dd365da7055a8f53/snake/game.py)区分 GUI、benchmark 与 train，评估关闭 epsilon。训练与 benchmark 的步数限制不完全相同；SnakeLab 因此计划统一记录 terminated/truncated 与预算，而非直接横比其模式分数。
- [Hamilton](https://github.com/gargimahale/Snake/blob/0e471a244bc34891b2422d32dd365da7055a8f53/snake/solver/hamilton.py)与[算法说明](https://github.com/gargimahale/Snake/blob/0e471a244bc34891b2422d32dd365da7055a8f53/docs/algorithms.md)提供环与路径构造参考；SnakeLab 首版使用条件明确的纯环基线。

参考项目的奖励系数、网络形状及实验分数仅属于其配置，不自动成为 SnakeLab 默认值。两个指定仓库的核查文件树均未发现遗传算法实现；GA/神经进化是 SnakeLab 的独立规划。

## 3. 来源与许可记录

本次查询两个指定仓库均返回 `license: null`，文件树中未见 LICENSE 文件。当前文档仅讨论设计理念并链接来源，未复制其源码、素材或模型。本仓库尚未选择许可证。

gargimahale/Snake 中部分文件与 [chynl/snake 的早期版本 a1e06097bbf64b32f98f882f96103eb45aab81d8](https://github.com/chynl/snake/tree/a1e06097bbf64b32f98f882f96103eb45aab81d8)存在相同 Git blob 的来源关联，包括游戏、路径及求解器相关文件。该上游的 [LICENSE](https://github.com/chynl/snake/blob/a1e06097bbf64b32f98f882f96103eb45aab81d8/LICENSE)为 MIT，署名 Chuyang Liu（2016–2018）。这项记录不等于认定指定仓库全部内容均获相同授权；未来若复用具体文件，需要核对来源、后续修改及保留声明。

## 4. 官方技术依据

| 官方来源 | 核实的能力与本项目取舍 |
| --- | --- |
| [TensorFlow.js：训练模型](https://www.tensorflow.org/js/guide/train_models) | Layers 的 fit/fitDataset 和 Core 的 optimizer.minimize 可训练；DQN 的经验采样及 TD target 仍需项目实现 |
| [TensorFlow.js：平台与后端](https://www.tensorflow.org/js/guide/platform_environment) | 浏览器后端有内存、精度和 UI 阻塞差异；WASM 优先推理支持，训练需核实算子；采用真实更新、内存及延迟验证 |
| [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) | 主要入门接口围绕 InferenceSession，并链接 Web training 示例；本方案选择其作为可选推理通道，不声称它完全不支持训练 |
| [PixiJS Application](https://pixijs.com/8.x/guides/components/application) | 提供渲染器与 ticker；单渲染器多棋盘和抽样绘图是本项目架构选择 |
| [Phaser Game](https://docs.phaser.io/phaser/concepts/game) | 提供游戏系统与场景集成；HEADLESS 不作为 Node 训练可运行性的证明，核心保持独立 |

这里不锁定版本号或宣称后端性能排名。实施时记录精确版本、浏览器/设备、支持算子及实测结果，再更新[设计计划](design-plan.md)。

返回 [README](../README.md)。
