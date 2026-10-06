
## Final paired results

Each cell reports **before → after** on exactly the same seeds and budgets. Collision and stagnation are separate; a filled board is the only completion. Mean steps includes every episode, so a higher value may mean surviving longer or stalling.

### Common cycle initialization, seeds 63001–63005

| Scenario | Strategy | Filled | Collision | Stagnation | Mean food | Mean steps |
|---|---|---:|---:|---:|---:|---:|
| 8-open | random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 0.2 → 0.2 | 8 → 8 |
| 8-open | legal-random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 4.2 → 4.2 | 249 → 249 |
| 8-open | greedy | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 3.6 → 3.6 | 20 → 20 |
| 8-open | safe-greedy | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 23.6 → 23.6 | 458 → 458 |
| 8-open | bfs | 0 → 2 / 5 | 0 → 0 | 5 → 3 | 24.0 → 59.8 | 472 → 1012 |
| 8-open | astar | 0 → 2 / 5 | 0 → 0 | 5 → 3 | 24.6 → 59.8 | 457 → 1072 |
| 8-open | dijkstra | 0 → 2 / 5 | 0 → 0 | 5 → 3 | 24.0 → 59.8 | 472 → 1012 |
| 8-open | best-first | 0 → 1 / 5 | 0 → 0 | 5 → 4 | 26.4 → 59.4 | 479 → 1069 |
| 8-open | beam | 0 → 2 / 5 | 5 → 2 | 0 → 1 | 24.4 → 55.4 | 163 → 832 |
| 8-open | mcts | 0 → 5 / 5 | 5 → 0 | 0 → 0 | 41.0 → 61.0 | 396 → 665 |
| 8-open | tail-safe | 2 → 2 / 5 | 0 → 0 | 3 → 3 | 51.6 → 59.4 | 941 → 969 |
| 8-open | hamiltonian | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 61.0 → 61.0 | 919 → 919 |
| 8-open | hamiltonian-shortcut | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 61.0 → 61.0 | 612 → 612 |
| 12-open | random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 0.0 → 0.0 | 9 → 9 |
| 12-open | legal-random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 4.8 → 4.8 | 676 → 676 |
| 12-open | greedy | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 4.8 → 4.8 | 47 → 47 |
| 12-open | safe-greedy | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 49.2 → 49.2 | 1384 → 1384 |
| 12-open | bfs | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 63.2 → 135.0 | 1794 → 4351 |
| 12-open | astar | 0 → 1 / 5 | 0 → 0 | 5 → 4 | 61.0 → 133.8 | 1609 → 4527 |
| 12-open | dijkstra | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 63.2 → 135.0 | 1794 → 4351 |
| 12-open | best-first | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 60.8 → 135.0 | 1645 → 4343 |
| 12-open | beam | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 43.2 → 63.2 | 469 → 859 |
| 12-open | mcts | 0 → 3 / 5 | 5 → 2 | 0 → 0 | 48.2 → 126.4 | 620 → 2924 |
| 12-open | tail-safe | 0 → 4 / 5 | 0 → 0 | 5 → 1 | 111.0 → 140.2 | 4405 → 3797 |
| 12-open | hamiltonian | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 141.0 → 141.0 | 5046 → 5046 |
| 12-open | hamiltonian-shortcut | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 141.0 → 141.0 | 2913 → 2913 |
| 8-dense | random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 0.0 → 0.0 | 6 → 6 |
| 8-dense | legal-random | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 0.4 → 0.4 | 18 → 18 |
| 8-dense | greedy | 0 → 0 / 5 | 5 → 5 | 0 → 0 | 2.4 → 2.4 | 10 → 10 |
| 8-dense | safe-greedy | 0 → 0 / 5 | 0 → 0 | 5 → 5 | 1.4 → 1.4 | 270 → 270 |
| 8-dense | bfs | 0 → 5 / 5 | 0 → 0 | 5 → 0 | 2.2 → 24.0 | 312 → 492 |
| 8-dense | astar | 0 → 5 / 5 | 0 → 0 | 5 → 0 | 2.2 → 24.0 | 312 → 492 |
| 8-dense | dijkstra | 0 → 5 / 5 | 0 → 0 | 5 → 0 | 2.2 → 24.0 | 312 → 492 |
| 8-dense | best-first | 0 → 5 / 5 | 0 → 0 | 5 → 0 | 2.2 → 24.0 | 312 → 492 |
| 8-dense | beam | 0 → 2 / 5 | 5 → 1 | 0 → 2 | 7.6 → 21.8 | 100 → 571 |
| 8-dense | mcts | 0 → 4 / 5 | 5 → 1 | 0 → 0 | 7.0 → 23.8 | 67 → 397 |
| 8-dense | tail-safe | 2 → 5 / 5 | 0 → 0 | 3 → 0 | 12.8 → 24.0 | 421 → 423 |
| 8-dense | hamiltonian | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 24.0 → 24.0 | 174 → 174 |
| 8-dense | hamiltonian-shortcut | 5 → 5 / 5 | 0 → 0 | 0 → 0 | 24.0 → 24.0 | 174 → 174 |

### Standard initialization and obstacles, seeds 64001–64003

| Scenario | Strategy | Filled | Collision | Stagnation | Mean food | Mean steps |
|---|---|---:|---:|---:|---:|---:|
| 8-standard | random | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 0.0 → 0.0 | 10 → 10 |
| 8-standard | legal-random | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 4.7 → 4.7 | 437 → 437 |
| 8-standard | greedy | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 9.3 → 9.3 | 50 → 50 |
| 8-standard | safe-greedy | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 19.7 → 19.7 | 651 → 651 |
| 8-standard | bfs | 0 → 2 / 3 | 0 → 0 | 3 → 1 | 31.3 → 60.3 | 840 → 919 |
| 8-standard | astar | 0 → 2 / 3 | 0 → 0 | 3 → 1 | 31.3 → 60.3 | 858 → 1033 |
| 8-standard | dijkstra | 0 → 2 / 3 | 0 → 0 | 3 → 1 | 31.3 → 60.3 | 840 → 919 |
| 8-standard | best-first | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 30.3 → 59.0 | 785 → 1271 |
| 8-standard | beam | 0 → 1 / 3 | 3 → 1 | 0 → 1 | 25.7 → 50.3 | 210 → 793 |
| 8-standard | mcts | 0 → 2 / 3 | 3 → 1 | 0 → 0 | 38.7 → 60.3 | 320 → 827 |
| 8-standard | tail-safe | 0 → 3 / 3 | 0 → 0 | 3 → 0 | 48.7 → 61.0 | 1191 → 795 |
| 12-standard | random | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 0.0 → 0.0 | 18 → 18 |
| 12-standard | legal-random | 0 → 0 / 3 | 1 → 1 | 2 → 2 | 1.0 → 1.0 | 399 → 399 |
| 12-standard | greedy | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 11.0 → 11.0 | 89 → 89 |
| 12-standard | safe-greedy | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 42.0 → 42.0 | 1033 → 1033 |
| 12-standard | bfs | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 64.7 → 127.7 | 1596 → 4277 |
| 12-standard | astar | 0 → 1 / 3 | 0 → 0 | 3 → 2 | 58.7 → 135.7 | 1371 → 4501 |
| 12-standard | dijkstra | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 64.7 → 127.7 | 1596 → 4277 |
| 12-standard | best-first | 0 → 2 / 3 | 0 → 0 | 3 → 1 | 64.7 → 140.3 | 1741 → 4116 |
| 12-standard | beam | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 47.0 → 74.3 | 569 → 1096 |
| 12-standard | mcts | 0 → 0 / 3 | 3 → 1 | 0 → 2 | 56.0 → 113.0 | 786 → 2784 |
| 12-standard | tail-safe | 0 → 1 / 3 | 0 → 0 | 3 → 2 | 107.3 → 139.0 | 4075 → 4354 |
| 8-obstacles | random | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 0.3 → 0.3 | 10 → 10 |
| 8-obstacles | legal-random | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 4.0 → 4.0 | 224 → 224 |
| 8-obstacles | greedy | 0 → 0 / 3 | 3 → 3 | 0 → 0 | 4.7 → 4.7 | 28 → 28 |
| 8-obstacles | safe-greedy | 0 → 0 / 3 | 0 → 0 | 3 → 3 | 14.0 → 14.0 | 606 → 606 |
| 8-obstacles | bfs | 0 → 1 / 3 | 0 → 0 | 3 → 2 | 27.0 → 55.0 | 819 → 1055 |
| 8-obstacles | astar | 0 → 3 / 3 | 0 → 0 | 3 → 0 | 26.3 → 57.0 | 752 → 938 |
| 8-obstacles | dijkstra | 0 → 1 / 3 | 0 → 0 | 3 → 2 | 27.0 → 55.0 | 819 → 1055 |
| 8-obstacles | best-first | 0 → 3 / 3 | 0 → 0 | 3 → 0 | 23.7 → 57.0 | 706 → 929 |
| 8-obstacles | beam | 0 → 1 / 3 | 3 → 2 | 0 → 0 | 23.0 → 55.0 | 186 → 1068 |
| 8-obstacles | mcts | 0 → 2 / 3 | 3 → 0 | 0 → 1 | 29.0 → 56.3 | 248 → 833 |
| 8-obstacles | tail-safe | 0 → 2 / 3 | 0 → 0 | 3 → 1 | 40.0 → 56.3 | 1124 → 1043 |

Per-episode step-limit outcomes, repeated-state counts and all raw outcomes are retained in [the summary](late-summary.json), [cycle before](late-final-before.json), [cycle after](late-final-after.json), [standard before](late-standard-before.json) and [standard after](late-standard-after.json).
