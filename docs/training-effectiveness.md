# HP training effectiveness investigation

Date: 2026-10-05. Learning quality is measured separately from unit tests, UI operation, and screenshots. The previous smoke checks proved that training executed; they did not prove that a useful policy was learned.

## Reproduction of the previous defaults

The original UI used an 8×8 board, a 324→64→64→3 network, 10,000 total environment steps or 60 seconds, DQN epsilon decay over 50,000 samples, and GA population 16 with three common seeds per individual. Training seeds were 7, 42, and 123; evaluation used 30 seeds 30001–30030, excluded from training and validation. Food count is the score.

| Algorithm | Seed 7 mean | Seed 42 mean | Seed 123 mean |
| --- | ---: | ---: | ---: |
| Original DQN, after training | 0.033 | 0.300 | 0.433 |
| Original GA, after training | 0.033 | 0.100 | 0.067 |
| Legal random baseline | 2.767 | 2.767 | 2.767 |
| Legal nearest-food greedy baseline | 16.367 | 16.367 | 16.367 |

Raw scores and actual budgets: [baseline](qa/training/training-baseline.json).

Confirmed findings:

- DQN finished at epsilon 0.940 / 0.867 / 0.875. It collected 3,184 / 7,000 / 6,560 training samples; validation consumed another 1,729 / 3,000 / 3,440 steps. Its exploration schedule and validation frequency were poorly matched to the advertised default budget.
- GA completed only one generation in all three original runs. A large population chromosome, sparse food fitness, and short total-step budget did not provide a useful search.
- Real TF.js gradients and Adam updates were present. Replay used the correct relative action, terminal flags suppressed bootstrap, target updates were counted in optimizer updates, and evaluation used frozen exported weights with epsilon zero. The bug was not that training weights were discarded or replaced with random weights.
- Both old policies could choose immediate collisions. Absolute whole-board coordinates also required learning equivalent behavior separately at different head locations. These were representation and sample-efficiency problems, not a reward-sign reversal.
- Five validation seeds can give noisy champion selection. Ties keep the earlier model; the final test set never selects the champion.

## Implemented repair

New UI jobs explicitly request `compact-v2`; old jobs remain available and old checkpoints retain their behavior.

- Twelve bounded egocentric inputs: immediate danger for left/straight/right, signed forward/right food displacement, three wall distances, three occupied-ray distances, and snake length fraction. No path planner, future food, RNG state, or teacher actions are supplied.
- Immediate collision masking is consistent across exploration, greedy behavior, frozen inference, and the DQN bootstrap action. If no safe action exists, the game still terminates normally. The untrained v2 comparator has the same mask, so masking alone is not counted as learning.
- DQN still trains all weights in a 12→64→64→3 TF.js network. New defaults use Double DQN, gamma 0.9, target sync every 100 optimizer updates, epsilon decay over 5,000 samples, and validation every 5,000 samples. Truncations end the finite training episode without bootstrap.
- DQN reward v2 is +10 for food, −10 for collision, +20 for a filled board, and −0.01 plus 0.5 times the reduction in Manhattan food distance for other steps. This is an explicit shaped training objective; the core game rewards and all reported food scores are unchanged.
- GA fixes a positive/negative feature projection and evolves 75 output coefficients (72 weights and three biases). Its hidden feature weights remain fixed; this is **not full-network evolution**. Elite preservation, tournaments, mutation, and shared per-generation environment seeds remain real. New presets disable crossover to preserve each policy; legacy full-network crossover remains supported.
- DQN defaults to at most 100,000 total steps / 60 seconds; GA defaults to 500,000 steps / 60 seconds / 50 generations. These are ceilings, not promises of throughput. Pause excludes paused time. No unbounded training is started.
- Worker slices now allow up to 256 transitions, still capped at 16ms with pending-command checks. The previous 32-step cap unnecessarily throttled cheap GA transitions through repeated timer yields. A single optimizer operation can still exceed the slice cap; cancellation timing is measured in the browser tests.

Earlier failed experiments are retained: [full-network v2 at 100k](qa/training/training-compact-default.json), [full-network v2 GA at 500k](qa/training/training-compact-ga-500k.json), and [feature-head GA at 100k](qa/training/training-feature-ga-default.json). They show why increasing only the old budget was insufficient. These pilot variants predate the final GA implementation and must not be confused with its results.

## Learnability before the default board

On 4×4, three independent DQN runs improved from means 2.17 / 0.17 / 0.23 to 9.77 / 8.67 / 8.93 in at most 60 seconds each. The feature-head GA improved from 0.20 / 1.33 / 0.53 to 9.07 / 11.00 / 9.13 in 100,000 total steps, completing 10–14 generations. All used the separate 30-seed evaluation set.

Raw evidence: [DQN small board](qa/training/training-compact-small.json), [GA small board](qa/training/training-feature-ga-small.json). The earlier DQN file also contains the superseded full-network GA pilot; use only its DQN rows for this claim.

## Compatibility and verification boundaries

The model container remains `snake-mlp-v1`; its checked `observationVersion` distinguishes `board-five-channels-v1` from `relative-features-v2`. Architecture, channel metadata, and tensor shapes must agree. Checkpoints explicitly record `profile` and `rewardVersion`; signed v2 replay features and shaped rewards are validated under that profile. No stored model/checkpoint is deleted or silently reinterpreted.

Regression tests cover rotation invariance, legal-move semantics including tail release, reward direction, masked TD targets, actual gradients, target synchronization, exact Adam/replay/RNG continuation, GA fixed-feature heredity and elite survival, old/new import rejection, and weight-preserving export/import. Browser checks cover real Worker training and checkpoint pause/cancel/resume in addition to learning measurements.

The feature representation is partial: it does not encode the complete body topology. Immediate masking is not a long-term safety guarantee. Three training seeds are a small study; a single good seed does not establish convergence or superiority over search. Obstacle-map learning, physical phone hardware, long-duration stability, and broader hyperparameter studies remain unverified.

## Reproduce the final measurements

With Node 24 and the repository dependencies installed:

```sh
node scripts/training-effectiveness.mjs qa-artifacts/training-final-dqn.json compact 8 100000 dqn 100
node scripts/training-effectiveness.mjs qa-artifacts/training-final-ga.json compact 8 500000 ga 100
npm run check
# Start npm run preview -- --port 4173, then:
node scripts/training-ui-qa.ts
npm run test:e2e
```

The script saves per-seed scores, actual samples/updates/generations/time, stop reason, immutable model provenance, configuration, source hash, and frozen model files. The first 30 test seeds were used in development; final 100-seed runs add 70 reserved seeds. Report both rather than treating repeated development evaluation as a new untouched test set.

## Final DQN results on 8×8

Each row evaluates the exported validation-selected model on all 100 seeds 30001–30100. Training is capped at 60 seconds per seed. The same test set gives legal random **3.46** and greedy **16.86** mean food.

| Training seed | Untrained mean | Trained mean | Median / range | Mean on additional 70 seeds | Training samples / updates | Training episodes |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| 7 | 0.84 | 16.17 | 16 / 4–28 | 15.786 | 22,165 / 5,510 | 196 |
| 42 | 0.02 | 16.96 | 16 / 6–33 | 16.529 | 20,856 / 5,183 | 163 |
| 123 | 0.04 | 16.41 | 16 / 3–32 | 16.514 | 15,626 / 3,875 | 126 |

Every trained DQN evaluation scored at least three food, while 48–98% of the corresponding untrained episodes scored zero. The three trained means do **not** establish superiority over greedy. Wall-clock caps produce different sample counts under machine load. Raw evidence: [DQN final](qa/training/training-final-dqn.json).

The browser-exported DQN seed-7 weights matched the Node experiment exactly (SHA-256 of JSON weights: `924203167240a7a8400c85f8611df634550a8d935d43e564d74392bd3ff7bd66`). This directly checks that the UI/Worker export path carries the trained weights.

One loaded-machine GA run is deliberately retained: [raw record](qa/training/training-ga-loaded-machine.json). Seeds 7/42 completed the step budget (100-seed means 8.47/17.82), but seed 123 reached its wall cap at only 14 generations and scored 0.90. A budget limit is not a learning guarantee, especially during simultaneous browser/CPU work. The follow-up browser run checks the scheduling repair; it does not erase this failure.

## Final GA results on 8×8

These serial runs completed all 500,000 total steps each, with the same 100 evaluation seeds. No model was selected using test scores.

| Seed | Untrained mean | First-generation champion | Trained mean | Median / range | Additional 70 mean | Generations / samples | Seconds |
| --- | ---: | ---: | ---: | --- | ---: | --- | ---: |
| 7 | 0.04 | 2.92 | 8.47 | 5 / 0–27 | 8.129 | 41 / 448,774 | 8.41 |
| 42 | 0.04 | 0.87 | 17.82 | 18 / 13–26 | 17.714 | 39 / 450,469 | 8.12 |
| 123 | 0.09 | 0.90 | 6.19 | 6 / 4–13 | 6.071 | 41 / 452,590 | 7.84 |

GA improves beyond first-generation selection in all three completed runs, but its performance varies substantially. Seed 7 still has 17 zero-score episodes; seed 123 frequently loops until the no-food limit. This is evidence of learning, not convergence or a solved Snake policy. [Raw final GA record](qa/training/training-final-ga.json).

The exact application Greedy strategy scores **7.63** on these 100 seeds. The stronger legal-greedy comparator scores **16.86**; earlier pilot JSON keys named `greedy` refer to this explicitly collision-filtered comparator. [All three baseline definitions and scores](qa/training/baselines.json).

## Actual HP browser result

Using the visible default controls, seed 7, and the production build: DQN collected 9,001 samples / 2,219 updates / 78 episodes in 60.00 seconds and scored **17.54** on 100 frozen test episodes. GA completed 500,000 total steps / 448,774 samples / 41 generations / 2,016 training episodes in **26.50 seconds**, then scored **8.47** on the same 100 test episodes. Each model was downloaded, reimported through the UI, and evaluated without exploration; downloaded JSON exactly matched the Worker model event. Desktop and 390px mobile checks had no page errors or horizontal overflow.

[Browser raw metrics and episodes](qa/training/browser-results.json) · [DQN desktop](qa/training/dqn-desktop.png) · [DQN phone](qa/training/dqn-mobile.png) · [GA desktop](qa/training/ga-desktop.png) · [GA phone](qa/training/ga-mobile.png). Screenshots were visually inspected. Full-page captures retain viewport-fixed navigation/toast positioning.

Default replay allocation is 2,040,000 bytes (about 1.95 MiB); the GA population is 331,968 bytes (about 0.32 MiB). These are allocated data buffers, not measured process peak RAM. Global memory/import caps remain enforced.
