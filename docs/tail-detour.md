# A* + bounded tail detours

This optional strategy preserves A*'s accepted food decisions. On fallback it searches a static path to the current tail, avoiding intermediate body cells, obstacles and current food. It attempts at most 16 two-cell rectangular extensions, then validates the entire candidate with the shared movement simulator. All work shares the original A* node/time budget; failed validation or exhausted budget preserves the baseline action. It reads no future environment randomness. The default strategy remains A*.

This is a bounded heuristic, not an exact longest-path solver or a completion proof. The validated route avoids growth; replanning can still stall. The extra work can reduce frame throughput. The independently authored implementation copies no reference source.

## Held-out comparison

Seeds 31001–31030, standard initialization length 3, walls, one food, 5,000 steps / 500 no-food steps, 10,000 decision nodes, no decision time cutoff in this research harness, 120-second episode wall cap. Obstacle maps contain four fixed cells; exact coordinates are in the reproducible [script](../scripts/tail-benchmark.ts). No model selection uses these seeds. A prior five-seed development pilot is retained separately.

| Board | Obstacles | A* mean food | Tail mean food | A* filled | Tail filled | Tail no-progress / step-limit |
|---|---|---:|---:|---:|---:|---:|
| 8×8 | No | 27.20 | 53.43 | 0/30 | 8/30 | 22 / 0 |
| 8×8 | Yes | 24.83 | 41.67 | 0/30 | 3/30 | 27 / 0 |
| 12×12 | No | 58.63 | 108.90 | 0/30 | 1/30 | 22 / 7 |
| 12×12 | Yes | 58.40 | 85.00 | 0/30 | 0/30 | 29 / 1 |

All 120 baseline episodes ended by no-progress. Across all 240 episodes there were no collisions or wall-clock cutoffs. Mean per-episode decision p95 milliseconds for baseline → tail were 0.103→0.168, 0.080→0.144, 0.154→0.441, 0.172→0.425 in table order. These are Node measurements without rendering, under concurrent local test/build load, not browser frame-time guarantees. Every failure and raw score is retained in [benchmark.json](qa/tail/benchmark.json); the [development pilot](qa/tail/development-pilot.json) is not independent evaluation.

The improvement is useful but insufficient for reliable full-board play. For supported empty boards, use the [invariant-checked Hamiltonian shortcut](efficient-completion.md) with sufficient budgets when completion matters most.

## Verification

Unit coverage checks dynamic path validity, shared budget exhaustion, unchanged accepted A* food decisions, deterministic obstacle replay and no observation/RNG mutation. The classroom adds a real step and separately executable Python/JavaScript rectangle component; the component explicitly does not claim to implement the entire policy. Browser coverage checks selection, stepping, pause, replay hash, the classroom and horizontal overflow at desktop and emulated phone sizes.

Grouped fill rates and successful-step mean/median/p95: [summary.json](qa/tail/summary.json). Regenerate with `node scripts/summarize-tail.mjs` after running the benchmark.

Final HP validation: `npm run check` passed (typecheck, ESLint, 104 unit tests, production build). All 13 Python/JavaScript examples executed with matching results. The final targeted Playwright run passed 4/4 desktop/mobile cases in 1.7 minutes, after correcting a test-only selector typo; this is not a new full-suite run. Desktop and emulated mobile screenshots were visually inspected: [desktop](qa/tail/chromium-desktop-lesson.png), [mobile](qa/tail/chromium-mobile-lesson.png). No physical phone, Firefox or Safari testing is claimed. The local loopback preview returned HTTP 200.
