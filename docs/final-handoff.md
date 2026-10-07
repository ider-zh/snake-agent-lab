# HP local handoff — 2026-10-06

Subsequent user-feedback repairs are documented in [the repair report](repair-report.md). The validation below describes the original b8a6592 delivery.

Work is on `feat/algorithm-lessons`, based on merged main `10c40747f265fb1d302f4ad2e806aa91d9b8df6e`. The original task-2 checkout was preserved. All changes remain local; no push, new PR, merge or Cloudflare deployment was performed. Publication still requires the parent's pending authorization. The archive's `SOURCE_COMMIT.txt` identifies its exact commit.

## Delivered scope

- 21 Chinese lessons: intuition, real search/decision steps or clearly labeled fixed learning arithmetic, independently executable Python/JavaScript components, limits and exercises. Standard A* and other planning policies are explicitly distinguished from training algorithms.
- All nine requested additions: Q-learning, SARSA, Beam, MCTS, Dijkstra, greedy best-first, invariant-checked Hamiltonian shortcuts, PPO-Clip and imitation learning. Bounded tail detours are an additional optional comparison policy. No default was replaced by an experimental policy.
- New learning models use separate versioned schemas; real Worker updates, bounded work, pause/cancel/resume, exact checkpoints, import validation, IndexedDB saves, frozen evaluation and loaded-model play/replay work alongside the original DQN/Double DQN/GA flows.
- Exact SARSA pending-action/RNG recovery, PPO rollout/old-probability/Adam/minibatch recovery, finite-difference gradients and independent held-out evaluations are included. Imitation inference uses student parameters without invoking the teacher.

## Validation

Final `npm run check`: typecheck, ESLint, **116 tests in 15 files**, and production build passed. Node 24.15.0 and Python 3.13.12 executed all **21 bilingual pairs**, matching expected outputs. All repository Markdown relative links checked successfully.

The complete HP Chromium suite passed **34/34**, with zero failures, skips or retries, in **10.1 minutes**. It covers manual keyboard/touch controls, repeated pause, mode changes, responsive boards, arena, batch Worker lifecycle, replay hashes/storage, old DQN/GA training/checkpoint/import/evaluation, all new planning and training workflows, and the classroom. [Full-suite summary and measured performance](qa/final/browser-summary.json).

After that run, only the PPO exploration/status wording and lesson order changed. The affected classroom and policy-training cases are rerun separately; their final result is appended below. This is explicitly distinct from claiming a second full-suite run.

Desktop viewport was 1440×1000; phone testing was Chromium emulation (measured viewport 390×664), not a physical iPhone or Safari. Rendering used SwiftShader. Four-board measured input-to-next-frame p95 was 5.6 ms desktop / 3.2 ms emulated mobile; frame p95 was 83.3 / 50.0 ms. These are this bounded HP run's measurements, not a 60 FPS or hardware-GPU claim.

## Measured algorithm limits

| Area | Measured result | Limit |
|---|---|---|
| Hamiltonian shortcut | Sufficient-budget 8/12/20 boards each filled 30/30; roughly 36%/44%/47% fewer steps than the pure ring | Empty supported cycle initializations only; 20×20 at 5000 steps still truncated |
| Tail detours | Better average food in all four 30-seed groups; 8×8 empty filled 8/30 | Still many no-progress/step-limit outcomes; no completion proof |
| Beam / MCTS | Independent bounded comparison retained | Many collisions; not promoted as superior or default |
| Q-learning / SARSA | Six 50k-step models scored 14.15–19.60 mean food, versus legal-random 3.25 on the same 20 seeds | All 120 final learned-policy episodes eventually collided |
| PPO | Three 50k-step models scored 16.10 / 15.65 / 14.60 | Linear actor/critic, all 60 test episodes eventually collided |
| Imitation | Validation teacher accuracy improved 44.9% → 75–77%; student mean food only 1.45–2.85 | 57/60 no-progress truncations; label learning did not yield reliable long games |

Do not rank rows across different seed sets or episode/decision budgets. Full protocols, raw failures and importable learned models are in [shortcut](efficient-completion.md), [tail](tail-detour.md), [planning](planning-policies.md), [tabular](tabular-learning.md), and [PPO/imitation](policy-learning.md) reports.

Not tested or guaranteed: physical phones, Firefox/Safari, hardware GPU performance, long-duration training/soak behavior, arbitrary obstacle layouts or universal full-board completion. PPO/imitation are deliberately small linear models, not deep-network performance claims.

## Run locally

The HP preview is bound to **http://127.0.0.1:4173**. To restart on this machine with the tested temporary Node runtime:

```powershell
$env:PATH="$env:TEMP\snake-node-runtime\node-v24.15.0-win-x64;$env:PATH"
npm run check
npm run preview -- --host 127.0.0.1 --port 4173
```

From another checkout, first install dependencies with `npm ci` using a supported Node version. Browser regression uses `npm run test:e2e` after installing Playwright Chromium. Reports link the exact bounded experiment scripts; bundle TypeScript scripts with the installed esbuild before running them, as used in this HP session. Deployment remains with the user.

Representative screenshots: [PPO desktop](qa/policy/chromium-desktop-ppo.png), [PPO mobile](qa/policy/chromium-mobile-ppo.png), [imitation mobile](qa/policy/chromium-mobile-imitation.png), [shortcut filled board](qa/shortcut/chromium-desktop-filled.png).

Final display verification completed: **6/6 passed in 2.1 minutes**, zero failures, skips or retries, on the rebuilt final UI. It re-executed all classroom flows plus real PPO/imitation training, checkpoint restore, invalid imports, frozen evaluation and replay on desktop and emulated mobile. [Final display-run summary](qa/final/display-browser-summary.json). Final typecheck/lint/116 unit tests/build passed again. Updated desktop and phone learning screenshots were visually inspected.
