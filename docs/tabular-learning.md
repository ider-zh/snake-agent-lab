# Q-learning and SARSA

Both algorithms perform actual TD updates in a dedicated browser Worker. They do not call a path planner to choose training or frozen-policy actions. Q-learning bootstraps from the greatest legal next Q value; SARSA bootstraps from the actual sampled next action. SARSA checkpoints preserve that pending action along with the environment, table and independent policy/episode random streams. Terminal states and experiment truncations do not bootstrap.

The observation is a 5,832-state mixed-radix discretization of three danger flags, two relative food signs, three clear-ray bins and three length bins. Each state has three relative action values. This local observation is not a complete Markov state; no convergence or completion guarantee is asserted. Inference and behavior both filter immediate collisions. If every action collides, they retain the three-action choice, with failure recorded normally.

The model schema is `snake-tabular-v1`, distinct from `snake-mlp-v1`. Import checks dimensions, finite bounds, metadata, split separation and unsupported fields. Checkpoints additionally validate the common engine snapshot, counters, pending action and RNG. Old DQN/GA models, checkpoints and defaults remain supported by their original path. The training route selector prevents concurrent old/new training jobs. A frozen tabular model can run in the experiment and arena views through the shared model interface.

## Fixed-budget learning evidence

For each algorithm, training seeds 1, 7 and 42 each receive 50,000 environment transitions with a 60-second wall cap. Configuration: α=.2, γ=.95, ε=1→.05 over 20,000 transitions; 8×8 empty board, standard length 3, 1,000 episode steps and 200 no-food steps. Training episode seeds are generated excluding validation 41001–41005 and test 42001–42020. The final parameters are evaluated; neither validation nor test chooses a checkpoint.

| Algorithm | Training seed | Changed entries | Before mean food | After mean food | Filled |
|---|---:|---:|---:|---:|---:|
| Q-learning | 1 | 777 | .05 | 15.20 | 0/20 |
| Q-learning | 7 | 784 | .05 | 14.15 | 0/20 |
| Q-learning | 42 | 764 | .05 | 14.30 | 0/20 |
| SARSA | 1 | 801 | .05 | 17.50 | 0/20 |
| SARSA | 7 | 795 | .05 | 15.50 | 0/20 |
| SARSA | 42 | 792 | .05 | 19.60 | 0/20 |

All runs completed 50,000 real updates. The baseline is specifically the zero-initialized table with deterministic greedy legal-action tie breaking, not a random agent or a search baseline. Improved held-out food scores and changed entries support learning in this experiment; they do not demonstrate superiority to planning. All 120 final test episodes eventually collided (94 body, 26 wall); none filled the board. No failures are discarded. Failure to complete the board does not mean parameters failed to learn.

The [complete evaluation](qa/tabular/evaluation.json) contains training curves, validation and test episode rows, failures and wall times. Six importable final models are alongside it. The [reproduction script](../scripts/tabular-evaluation.ts) uses the same engine, trainer and frozen evaluator as the UI. Timings are Node CPU measurements without browser rendering, not a cross-device performance claim.

## Verification

Core tests cover different Q-learning/SARSA targets, real table changes, exact resumed actions/tables/snapshots, held-out evaluation without mutation, malformed model rejection, serialized Worker pause/checkpoint/resume and stale command isolation. Nineteen Python/JavaScript teaching examples were actually executed with matching outputs. Classroom arithmetic is explicitly labeled fixed teaching data; real learning is in the training workspace.

Browser and final check results are appended after completion. Current exclusions: physical phones, Safari/Firefox, long-duration training and obstacle-map learning-effect comparisons.

Final HP check passed after missing-metadata import hardening: typecheck, lint, 112 unit tests and production build. Targeted classroom/new-learning browser regression passed 4/4 in 1.7 minutes, including actual Worker training, pause/resume, checkpoint file and IndexedDB storage, restore, malformed model rejection, frozen evaluation, loaded-model play and replay. Existing DQN/GA training/checkpoint/evaluation compatibility passed separately on desktop and emulated mobile (2/2, 24.7 seconds). [Desktop](qa/tabular/chromium-desktop-training.png) and [mobile](qa/tabular/chromium-mobile-training.png) screenshots were visually inspected; transient import notifications are visible in those captures. No physical-phone test is claimed.

## Added legal-random baseline

Using exactly test seeds 42001–42020, the same 8×8 standard empty board and 1000-step / 200-no-food limits, the independently seeded legal-random agent scored mean food **3.25**: 14 wall collisions, 3 body collisions and 3 no-progress truncations, with 0 fills. All six trained tabular models scored higher means on this finite shared test set (14.15–19.60); this is not a universal dominance or completion claim. Full per-seed rows and state hashes: [legal-random-baseline.json](qa/tabular/legal-random-baseline.json); reproduction: [script](../scripts/tabular-baseline.ts).
