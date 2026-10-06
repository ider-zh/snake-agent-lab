# SnakeLab

> 2026-10-05 HP training correction: new jobs use versioned relative features, shaped DQN rewards and a 75-coefficient GA policy. Original 0/1-score defaults were reproduced. Actual learning comparisons, budgets, failed pilots and compatibility are in [training effectiveness](docs/training-effectiveness.md). Earlier full-board training descriptions below are the v1 design/history; they do not describe the new UI defaults.

A local-first playground for Snake, search agents, and real browser training.

SnakeLab 将手动游戏、自动策略、批量实验、回放和 DQN / GA 训练放在统一、确定性的规则核心上。React 管理界面，PixiJS 单画布绘制最多四局，Web Worker 隔离批量仿真与训练。

**当前状态：P1–P5 功能已实现，并完成 HP 上一轮真实 Chromium 桌面与手机尺寸验收。** 最终复验记录、覆盖范围和限制见 [HP 验证记录](docs/hp-validation.md)，视觉迭代与截图见 [视觉审查](docs/visual-review.md)。Cloudflare 部署由维护者后续执行。

## 运行

推荐 Node 24；依赖精确版本见 `package-lock.json`。

```sh
npm ci
npm run dev
# http://127.0.0.1:5173
```

```sh
npm run check       # TypeScript + ESLint + Vitest + production build
npm run preview     # static production preview
npx playwright install chromium
npm run test:e2e     # desktop + mobile Chromium workflows
```

受限环境如果默认 npm cache 不可写，可为 npm 命令加 `--cache=/tmp/snake-agent-lab-npm-cache`。开发服务器默认只绑定回环；需要局域网访问时由操作者显式选择 `--host`。

## 功能

- **实验台**：键盘/WASD/触控、单步/暂停/重开、种子与棋盘、路径/搜索可视化、回放保存
- **策略竞技**：同配置四棋盘；训练或导入的冻结模型可替换第四个策略
- **经典策略**：Random、Legal Random、Greedy、Safe Greedy、BFS、A*、有条件的 Hamiltonian 环
- **批量评测**：默认100共同种子，失败/截断分开，原始JSON/CSV、分布、配对差与95%CI；特殊环初态另分组
- **训练实验室**：真实 TF.js CPU DQN / Double DQN 更新、目标网络、紧凑 replay、Adam 检查点；真实 GA 种群、锦标赛、精英、交叉/变异；暂停、取消、预算、冻结独立评估、导入导出与本地存储
- **回放档案**：动作、配置、版本与逐步状态哈希验证；本地库与文件导入
- **P5 扩展**：障碍地图通道、禁用不适用的环策略、Double DQN 独立变体标记

所有模型与数据留在当前浏览器，不含账号、后端、遥测或外部模型下载。浏览器清理站点数据会删除 IndexedDB 存档，重要结果应导出备份。停止训练会释放 replay；要精确续训，请先暂停并导出完整检查点。达到正常预算上限后保留可导出的检查点。

## 训练与比较边界

8×8 新训练使用 12 维相对特征与即时碰撞过滤。DQN 为 12→64→64→3，使用真实 Huber loss / Adam 和距离奖励；GA 固定特征投影，进化 75 个输出系数。终止不 bootstrap，新预设也不对截断 bootstrap。训练、验证和测试种子分离，冻结评估不更新权重。旧版全盘模型和检查点仍按原编码恢复。

UI 的轻量预设为了缩短反馈周期，与设计草案中的研究默认参数不同；完整配置写入模型/检查点。短训练不保证学会，更不能据此宣称胜过搜索。搜索的尾部可达/空间检查是启发式。墙钟决策上限可能受设备负载影响；仅节点预算模式用于严格动作重现。

## 部署到 Cloudflare Pages

这是纯静态 Vite 应用：构建 `npm run build`，输出 `dist`，Node 24。仓库提供 `_headers`、`_redirects` 和 `wrangler.jsonc`。没有云函数、数据库、token 或费用依赖。详见 [部署说明](docs/deployment.md)。部署由维护者后续执行。

## 项目文档

- [实现与验证记录 / HP 交接](docs/implementation.md)
- [完整设计与分阶段验收](docs/design-plan.md)
- [参考项目与技术依据](docs/references.md)
- [维护约定](AGENTS.md)

## Related Work

- [dmitryshelomanov/snake](https://github.com/dmitryshelomanov/snake)：TypeScript/React 贪吃蛇，提供 BFS、DFS、Dijkstra、Greedy、A* 及搜索可视化，可借鉴策略接口与手动/AI 共用规则的组织方式。
- [gargimahale/Snake](https://github.com/gargimahale/Snake)：Python/Tkinter 项目，提供 Path、Greedy、Hamilton 与 DQN 路线，可借鉴安全检查、实验模式与训练/评估划分。

引用与研究记录见[参考文档](docs/references.md)。两个指定仓库在本次核查中均未见 LICENSE；本次只借鉴设计理念，未复制源码或沿用其成绩。本仓库许可证由维护者后续决定。

## 算法教学

新增「算法课堂」：17 课中文原理、真实搜索单步、Python/JavaScript 可运行构件、边界与练习。标准 A* 等规划无需训练，DQN/GA 需学习参数。实现与逐项验收见 [教学记录](docs/algorithm-lessons.md)。

## 高效填满策略（2026-10-06）

新增有条件 Hamiltonian 安全捷径；同协议独立 30 种子中，8/12/20 三种尺寸充足预算均 30/30 填满，环境步数较纯环减少约 36%/44%/47%。20×20 的 5000 步预算仍全部截断，不宣称任意图必胜。详见 [通关效率报告](docs/efficient-completion.md)。

Optional A* + bounded tail detours, with all 240 comparison episodes and limitations: [tail strategy report](docs/tail-detour.md).

Dijkstra, greedy best-first, bounded Beam and UCT MCTS are available as comparison policies: [implementation and retained failures](docs/planning-policies.md).
