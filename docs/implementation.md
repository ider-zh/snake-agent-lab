# 实现、验证与 HP 交接

> 2026-10-05 HP training correction: new jobs use versioned relative features, shaped DQN rewards and a 75-coefficient GA policy. Original 0/1-score defaults were reproduced. Actual learning comparisons, budgets, failed pilots and compatibility are in [training effectiveness](training-effectiveness.md). Earlier full-board training descriptions below are the v1 design/history; they do not describe the new UI defaults.

日期：2026-10-05。实现分支：`feat/snakelab-full-lab`。

## 当前状态

P1–P5 功能已实现，并在 HP 上执行真实 Chromium 端到端验证。最终复验结果、截图和设备限制见 [HP 验证记录](hp-validation.md)。Cloudflare 部署由维护者后续执行；不以短训练宣称策略收敛。

## 交付模块

| 阶段 | 已实现 | 验证边界 |
| --- | --- | --- |
| P1 | 纯核心、输入、经典策略、单步/观看、Pixi 单画布 | 核心/策略测试已覆盖规则与100种子重现；真实键盘/触控/GPU仍待测 |
| P2 | 四棋盘、chunked batch Worker、Hamiltonian、分组统计、导出、IndexedDB、回放 | 单元测试含100共同种子、取消/暂停、损坏数据拒绝；UI端到端待测 |
| P3 | TF.js CPU真实DQN、target/Double DQN、Huber/Adam、紧凑replay、完整检查点、冻结评估 | 数值更新/目标/恢复/有限值/张量释放测试；浏览器内存与取消耗时待测 |
| P4 | GA 特征策略进化、精英/锦标赛/高斯变异；保留旧版全网交叉；共同训练种子、独立验证、任务恢复 | 三训练种子、独立测试对照见训练有效性报告；不保证收敛或优于搜索 |
| P5 | 障碍协议、第五观察通道、Double DQN标识、搜索叠层/训练曲线/GA分布 | 自动化协议/数值测试；不包含Dueling、ONNX导入或WebGPU训练等可选后续路线 |

## 实际配置与架构

- React19.3 / Vite7.3.6 / TypeScript6 / PixiJS8.22 / TF.js4.22；精确依赖和传递依赖锁定
- Node24 验证；运行时不请求外部模型、字体、分析或用户数据服务
- UI最多四棋盘共享一个Pixi Application。观看策略有20ms/10,000节点预算；训练/批量在专用Worker
- 保守并发：一个batch Worker、一个training Worker。移动用户应避免同时启动两个重任务
- DQN验证后端为CPU。WebGL/WASM/WebGPU训练未验证，不自动启用
- 新 UI 使用 compact-v2：12 维相对特征；DQN 12→64→64→3，GA 固定正负特征投影并进化 75 个输出系数。旧 324 维全盘 v1 可导入和续训。
- UI 预算 2k/10k/100k/500k，总墙钟上限均 60 秒；DQN 默认 100k，GA 默认 500k。预热 128、batch 32；GA 16 个体/3 个共同种子，最多 50 代。
- 训练样本与验证步分开计数，合计计入总环境预算；冻结测试费用另列
- 模型10MiB、回放/结果10MiB、完整检查点128MiB。文件只含固定结构数据，不执行上传代码
- 完整恢复包括Adam、target、replay、随机流、当前环境；推理模型不声称可精确续训
- 取消立即释放训练状态。要完整续训先暂停保存；正常预算完成会保留导出检查点
- 训练/验证/测试种子记录在模型。导入文件的来源声明由提供者负责，无法证明外部权重从未见过测试数据

## 已执行验证

HP 的 `npm run check`（TypeScript、ESLint、92 项 Vitest、生产构建）已通过；Chromium 桌面和手机尺寸共 20 项端到端测试已通过。新增交互覆盖包括重复暂停、焦点、后台训练不重置游戏、DQN/GA 检查点恢复、错误模型导入、回放及 IndexedDB。完整结果与最终复验记录见 [HP 验证记录](hp-validation.md)。

测试不等同于长期稳定性、实体手机、Safari、硬件 GPU 或策略优越性验证。可选 Dueling、ONNX、WASM/WebGPU 训练后端未实现；研究级多种子训练对照仍需后续执行。

## 许可

没有复制两个无明确许可证参考仓库的源码、模型或资源。概念参考保留在 [references.md](references.md)。本项目许可证尚由维护者决定。
