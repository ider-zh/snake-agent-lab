# Four additional planning policies

Dijkstra uses a heap ordered by accumulated unit cost g. Greedy best-first uses h alone; it is distinct from the existing one-step greedy agent. Both retain the existing dynamic path validation and shared safety fallback. With sufficient nodes Dijkstra matches BFS on this unit-cost grid; it is not presented as a quality improvement. Search teaching displays actual queue priority in the f column (g, h, or g+h as applicable).

Beam search simulates the complete body, keeps at most 24 candidates per layer and searches at most 16 layers. The ranking combines food, local exits, distance and depth; duplicate bodies are removed per layer. MCTS independently implements UCT selection, one-child expansion, seeded legal random rollout, and value/visit backpropagation. It chooses the most visited root child, with a limit of 512 iterations and depth 24. Both honor node/time budgets. Their simulations stop at current food after exact growth; neither reads future food randomness. They do not train parameters.

These are bounded heuristics, not safe-completion policies. Food leaf values and root mean values are not win probabilities. Beam can prune the only useful branch; MCTS can favor a short-term reward that creates a later trap. The default remains A*. Their actual failures below are retained.

## Bounded integration comparison

8×8, standard length-3 initialization, walls, one food; seeds 32001–32010. Each episode permits 1000 steps / 200 no-food steps, each decision 1000 work units without a time cutoff, episode wall cap 30 seconds. The obstacle map is [18,19,44,45]. This smaller-budget comparison is not interchangeable with the earlier 5000-step completion experiments. Work-unit accounting differs by algorithm (graph expansions versus simulated candidates/tree visits); it is not equal CPU work. The [script](../scripts/planning-benchmark.ts) and [all 120 episode rows](qa/planning/benchmark.json) preserve scores, reasons, latency and budget hits.

| Policy | Empty mean food | Empty outcomes | Obstacle mean food | Obstacle outcomes |
|---|---:|---|---:|---|
| A* | 28.1 | 10 no-progress | 25.9 | 10 no-progress |
| Tail detour | 49.0 | 1 filled, 7 no-progress, 2 step-limit | 41.2 | 1 filled, 4 no-progress, 5 step-limit |
| Dijkstra | 28.2 | 10 no-progress | 25.1 | 10 no-progress |
| Best-first | 28.0 | 10 no-progress | 25.4 | 10 no-progress |
| Beam | 26.6 | 4 body, 6 wall | 31.5 | 7 body, 3 wall |
| MCTS | 31.0 | 9 body, 1 wall | 29.9 | 7 body, 1 obstacle, 2 wall |

No episode hit the wall-clock cap. Differences between A* and Dijkstra under 1000 nodes can arise from search/fallback budget use. This sample does not establish superiority; Beam and MCTS have clearly worse collision outcomes than the conservative baselines. They are retained for comparison and teaching, not promoted as efficient full-board solutions.

## Teaching and verification

The classroom now has 17 lessons. Dijkstra and best-first expose real frozen search frames; Beam and MCTS show actual per-decision root statistics. All 17 standalone Python/JavaScript components were executed and matched expected outputs. Components are labeled as components, not falsely presented as full game solvers.

`npm run check` passed: typecheck, lint, 108 unit tests and production build. Targeted tests cover exact growth without food-oracle access, no observation mutation, deterministic replay, UCT counts/formula, correct graph priorities and zero/exhausted budgets. Browser evidence is recorded after the active run completes.

Algorithm references (concepts only; no source copied): [Berkeley CS188 informed search](https://inst.eecs.berkeley.edu/~cs188/textbook/search/informed.html), [MCTS](https://inst.eecs.berkeley.edu/~cs188/textbook/games/monte-carlo.html), [local beam search](https://inst.eecs.berkeley.edu/~cs188/textbook/search/local.html). This implementation uses depth-bounded path beams rather than the textbook's optimization-state initialization.

Final HP browser run: 4/4 passed in 3.2 minutes across Chromium desktop and emulated phone. All four policies executed, their replay hashes matched, and the classroom exercised real graph frames/root statistics without page errors or horizontal overflow. [Desktop screenshot](qa/planning/chromium-desktop-mcts.png) and [mobile screenshot](qa/planning/chromium-mobile-mcts.png) were visually inspected. This targeted run does not claim a fresh full-suite or physical-phone test.
