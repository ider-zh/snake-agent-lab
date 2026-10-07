# HP repair verification — 2026-10-06

This repair follows local commit `b8a65927f4e6efae5472e641c74952f7ead3f781` on `feat/algorithm-lessons`. Changes remain local. The original task-2 checkout is preserved.

## Worker failure: observed evidence and injected reproduction

At the start of this repair the HP loopback preview on port 4173 was not listening. Git was clean at b8a6592. Restarting the existing `dist` served exactly the index, JavaScript and CSS bytes on disk; the recorded JavaScript was `index-DGV20j7P.js` (SHA-256 `5efc11616dbe321241dc5d706dabe54b48b5057e823f6a0d936d1701fbaa92a0`). This is evidence about the inspected HP build, not an assertion about a separate browser tab or hosted deployment.

With resources loading normally, the original build passed actual DQN training, frozen evaluation and GA training. Blocking its training Worker script request through Playwright's browser request interception reproduced **“训练 Worker 出错：undefined”** exactly. The browser delivered a generic error event without `message`; the UI interpolated that missing property. The saved report and screenshot distinguish this fault injection from a naturally observed computation failure. No evidence identifies why the user's original request failed (network, stale resources, browser policy or another cause).

The new shared Worker owner retries a bootstrap failure once, before receiving any Worker message, and resends the initial command to that fresh instance. Persistent loading failures give a useful refresh/retry explanation. Runtime messages retain their text and source location in the UI, with the original event in the browser console. Failed instances are terminated; stale messages are ignored. A running trainer is never silently restarted. Evaluation always attaches a fresh Worker instead of reusing a failed or disposed instance. Both classic and newer learning routes use the same ownership logic.

Browser regression separately checks one failed request followed by successful actual training, persistent failures, restored requests, repeated start/pause/resume/stop, frozen evaluation, checkpoint restore and import errors. Unit tests cover constructor exceptions, generic events, dead-instance isolation and cancelling during the retry boundary.

## Strategy repair

The rule core, environment RNG, learned model inference and conceptual random/greedy baselines retain their behavior. No strategy switches to a Hamiltonian controller or a learned model's teacher.

- Static food search previously treated most body cells as permanent walls. At high occupancy this misses paths through cells released by future tail motion. BFS, A*, Dijkstra and best-first retain their original static search, then use a bounded search over exact body configurations when crowded or stagnant. Debug output identifies this recovery.
- A static flood-area threshold rejected many valid dense food paths even when the grown body still had a tail exit. Food-path acceptance now requires a completed escape check rather than a region as large as the whole snake. This remains a heuristic, not a general survival proof.
- When only one cell remains empty after eating, its next food location is forced by occupancy. A bounded exact finishing search can establish a legal completion route; it reads no future RNG.
- Repeated-state counts penalize revisiting the same body/direction/food state during search fallback. Accepted dynamic food paths are executed while the observed body and food match their predicted state, avoiding expensive replanning of the same route. A mismatch invalidates the stored route. Body-state search uses parent links and rolling-hash buckets to avoid repeatedly allocating full path strings; exact body comparisons resolve hash collisions. A recorded four-policy full-episode comparison verifies identical actions, paths and node counts before and after this allocation optimization.
- Tail detours remain an explicit optional policy, with exact path simulation, rotating tie order after extended starvation, and the same shared work budget.
- Beam and MCTS previously rewarded eating based mainly on immediate exits. Their food leaves now also check the grown body's tail escape. Those flood expansions consume the same decision budget as tree search. The search/tree algorithms remain distinct.
- The imitation trainer explicitly retains its stateless `astar-nodes1000-v1` teacher. Existing teacher provenance and exact checkpoint continuation are preserved; interactive planner improvements do not silently change old training protocols.

### Comparison protocol

`scripts/late-game-evaluation.ts` runs all 13 built-in strategies on 8×8 and 12×12 empty boards with length 3, plus an 8×8 dense initialization of length 40. All policies in these paired comparisons receive the same cycle initialization, environment seed, agent seed derivation and episode budgets: `N²` steps and `4N` without food, where N is board area. Decision work is capped at 2,000 expanded nodes; offline wall time is unlimited to make node-limited outcomes reproducible. This differs from the interactive 10,000-node/20-ms cap.

Development used seeds 61001–61005. The initial 62001–62005 check exposed excessive repeated dynamic searching; its partial results are retained as development evidence. After adding verified-path continuation, the final paired run uses fresh seeds **63001–63005**, with the original b8a6592 implementation bundled before edits and the final implementation bundled separately. Completion, collision, stagnation, steps and exact-state repetitions are retained per episode. These small, finite samples do not establish universal completion.

The final complete comparison is in [the paired-results table](qa/repair/late-results.md), with all 294 pairs / 588 episodes checked for matching seeds and protocol. A supplemental suite covers standard initialization on 8×8 and 12×12 plus an 8×8 obstacle map, using seeds 64001–64003, 5,000 steps and a 500-step starvation budget. Cycle-only agents are excluded from that incompatible suite.

## Arena and wording

The old arena hard-coded four built-in strategies and only optionally replaced its fourth board with the current model. Four visible, independent selectors now sit directly above the enlarged boards, with current strategy, score, steps and terminal reason. Changing any selector or shared rule pauses and resets all four games; repeated selections and restart preserve fair common rules and seed.

Trained/imported frozen models are validated, saved in IndexedDB and listed after page reload. Selecting a model adopts its exact game rules for all four boards. Models with conflicting rules and incompatible cycle policies are disabled. All four slots can use models. Each slot can change to a different model when the remaining slots permit its rules.

Navigation and classroom labels read **策略课堂**. The sidebar now describes local computation, model storage and exploration positively. Similar defensive marketing copy was removed from training and empty states. Concise technical statements about observation limits, independent evaluation, budgets and supported maps remain where they help make a decision.

## Scope limits

Actual browser checks use Chromium on HP at desktop and emulated phone sizes. They are not Safari or a physical-phone test. Loopback preview is `http://127.0.0.1:4173`. Publication, PR creation and Cloudflare deployment remain outside this repair's authorization.

## Measured outcomes and verification

The 294 paired comparisons (588 episodes) are complete. Raw random, legal-random, pure greedy, safe-greedy and cycle-policy score/step/terminal outcomes were checked to be unchanged in every applicable pair. Search improvements are not substitutions for those baselines.

Selected final offline results (before → after):

| Common protocol | Strategy | Completion | Collision | Stagnation | Mean food | Mean steps |
|---|---|---:|---:|---:|---:|---:|
| 8×8 cycle, 5 seeds | A* | 0 → 2 | 0 → 0 | 5 → 3 | 24.6 → 59.8 | 457 → 1072 |
| 8×8 cycle, 5 seeds | MCTS | 0 → 5 | 5 → 0 | 0 → 0 | 41.0 → 61.0 | 396 → 665 |
| 12×12 cycle, 5 seeds | A* + tail detour | 0 → 4 | 0 → 0 | 5 → 1 | 111.0 → 140.2 | 4405 → 3797 |
| 8×8 length-40 body, 5 seeds | A* / BFS (each) | 0 → 5 | 0 → 0 | 5 → 0 | 2.2 → 24.0 | 312 → 492 |
| 12×12 standard, 3 seeds | A* | 0 → 1 | 0 → 0 | 3 → 2 | 58.7 → 135.7 | 1371 → 4501 |
| 8×8 obstacles, 3 seeds | A* | 0 → 3 | 0 → 0 | 3 → 0 | 26.3 → 57.0 | 752 → 938 |

BFS still stagnated on all three 12×12 standard tests. Beam still collided on all five 12×12 cycle tests and all three 12×12 standard tests. Tail detours, MCTS and the other search methods also retain failures in some groups. Random/greedy strategies remain conceptual baselines; cycle strategies remain the structural completion option on their supported maps. The results are finite seed-set evidence, not a universal ranking.

The production-budget desktop long-game browser run (8×8 cycle, seed 63001, four boards, 10,000 nodes / 20 ms) recorded A* colliding after **40 food / 479 steps**, while Beam filled in **825**, MCTS in **649**, and the shortcut in **580** steps. This failure is retained in [the initial production-budget record](qa/repair/production-browser-initial.json); offline unlimited-wall-time successes must not be substituted for it. The final small adjustment reserves time for fallback safety checks, and its browser rerun is recorded separately below.

The first full browser pass had 46/48 passes: two shortcut completion waits timed out because an unstable selected-model array restarted the run timer each render. Memoizing that array fixed the regression. The subsequent complete suite passed **50/50**, with no skips or retries, in **16.1 minutes**, including all training families and both viewports. [Complete suite summary](qa/repair/full-browser-summary.json). Early unoptimized body-search runs also exceeded two unit-test timeouts; parent-linked paths and exact-checked rolling-hash buckets reduced allocations, and the completed **121-unit-test** suite passed afterward. The latest typecheck and lint passed as well.

The final resource rebuild and targeted checks cover fallback-time reservation, actual model-rule display, incompatible-model selection, timer-based completion, and long-game replay; their completed outcome follows.

### Final rebuilt resources

The final production build passed after the fallback-time reservation and model-rule display adjustments. Typecheck, lint and all **121 tests in 16 files** passed against the final source. The eight affected desktop/mobile scenarios were run against that build: seven passed; the mobile model-rule assertion attempted to find a checkbox inside collapsed rule settings. The test was corrected to expand the settings exactly as a user would, without changing product code. Both desktop and mobile model-rule scenarios then passed (2/2). All eight affected scenarios therefore have passing final-build evidence. Reports: [targeted run](qa/repair/targeted-browser-summary.json), [corrected rule checks](qa/repair/model-rules-browser-summary.json). No product failure remains open.

The final real-browser long-game results are [recorded separately](qa/repair/production-browser-final.json):

| Strategy | Desktop | Emulated phone |
|---|---|---|
| A* | Filled, 61 food / 920 steps | Filled, 61 food / 931 steps |
| Beam | Filled, 61 food / 825 steps | Filled, 61 food / 825 steps |
| MCTS | Body collision, 60 food / 1422 steps | Body collision, 60 food / 1422 steps |
| Hamiltonian shortcut | Filled, 61 food / 580 steps | Filled, 61 food / 580 steps |

These runs use the actual UI controls and production agent budgets; stepping was accelerated through the UI instead of waiting at the display rate. Replay verification passed. The earlier A* collision is not discarded: reserving wall time for fallback checks changes bounded-time behavior, and these two runs show an improvement on this seed. MCTS remains heuristic, and device scheduling under wall-time limits can change its search trajectory. Neither the final A* successes nor the offline MCTS results establish a universal completion guarantee.

Screenshots were visually inspected for the enlarged boards, visible selectors, strategy labels, responsive layout and soft-dark theme: [desktop late game](qa/repair/chromium-desktop-late-arena.png), [phone late game](qa/repair/chromium-mobile-late-arena.png), [desktop selectors](qa/repair/chromium-desktop-arena-selectors.png), [phone saved models](qa/repair/chromium-mobile-arena-saved-models.png).

Existing HP preview logs contained startup information but no historical failed-request record, so the cause of the user's original Worker request failure remains unconfirmed. The exact undefined-message defect, recovery path and subsequent successful training are verified. Physical phones, Safari/Firefox, GPU performance and a long-duration soak were not tested in this repair.
