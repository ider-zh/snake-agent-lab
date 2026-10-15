# PPO-Clip and imitation learning

These are real parameter-learning implementations with a deliberately small, explicitly labeled model: 12 relative features plus a bias feed a linear softmax actor (39 coefficients) and a linear critic (13 coefficients). They are not deep networks. Gradients are implemented analytically in JavaScript and checked against finite differences; existing DQN still uses its original TF.js implementation and defaults.

PPO collects on-policy rollouts while actor parameters remain fixed. It stores old action log-probabilities and value estimates, computes GAE with γ=.99 and λ=.95, normalizes advantages while preserving unnormalized critic targets, then optimizes the clipped surrogate with clip=.2 and entropy coefficient .01. Actor and critic use independent Adam states, rates .003 and .01, and gradient norm clipping .5. Rollouts contain at most 128 transitions; four epochs use shuffled minibatches of 32. Both terminations and experiment truncations stop bootstrap; rollout-only boundaries bootstrap the critic. No future food or teacher labels enter PPO actions.

Imitation learning collects trajectories from the existing A* policy with a 1000-node budget and no decision time limit. It trains the separate linear student with supervised cross entropy and Adam using the same bounded buffer/epoch sizes. The training food curve belongs to teacher trajectories, not the student. Frozen student inference computes only its own actor probabilities; it does not call the teacher. This is behavior cloning, not DAgger.

Both algorithms filter immediate collisions, and choose the highest-probability action for frozen evaluation. The policy model schema is `snake-policy-v1`. Checkpoints include actor/critic coefficients, both Adam moments and step counts, the unfinished rollout, old probabilities, normalized advantages/targets, minibatch permutation/cursor/epoch, current environment, and separate policy/episode/shuffle RNG states. Worker command boundaries are serialized and yield after at most 128 operations or approximately 8 ms between operations. A single gradient/teacher operation cannot be interrupted mid-call, but the small model and teacher node bound limit that work. Explicit wall and environment budgets remain enforced.

## Fixed protocol and measured outcomes

Three training seeds (1, 7, 42), final parameters only; no checkpoint selection or tuning against the reported test results. PPO receives 50,000 transitions; imitation receives 10,000 teacher transitions. Each run has a 60-second wall budget and all completed their transition/update work. Environment: 8×8, empty board, standard length 3, walls, one food, 1000-step / 200-no-food episode limits. Training episode seeds exclude validation 51001–51005 and test 52001–52020.

| Algorithm | Training seed | Updates | Before test mean food | After test mean food | Filled |
|---|---:|---:|---:|---:|---:|
| PPO | 1 | 6252 | .05 | 16.10 | 0/20 |
| PPO | 7 | 6252 | .05 | 15.65 | 0/20 |
| PPO | 42 | 6252 | .05 | 14.60 | 0/20 |
| Imitation | 1 | 1252 | .05 | 2.85 | 0/20 |
| Imitation | 7 | 1252 | .05 | 2.55 | 0/20 |
| Imitation | 42 | 1252 | .05 | 1.45 | 0/20 |

The before model has zero actor coefficients and deterministic greedy legal-action tie breaking; it is not a random or planning baseline. All 60 final PPO episodes collided (58 body, 2 wall). Imitation had 57 no-progress truncations and 3 body collisions. No failures or truncations were removed. These results support PPO learning in the stated small experiment, not reliable completion or superiority over search.

On 1000 held-out teacher states from the five validation seeds (at most 200 steps per seed), imitation accuracy rose from 44.9% to 76.0%, 76.6%, 75.1%; cross entropy fell from .8103 to .5707, .5479, .5534. The student learned labels but still performed poorly when controlling its own trajectory. State-distribution shift and limited local/linear representation are plausible explanations, not experimentally isolated causes. More training or a larger model was not silently substituted after seeing these results.

The [complete raw evaluation](qa/policy/evaluation.json) retains curves, every episode, losses, final metrics and teacher agreement. Six importable final models are stored alongside it. [Reproduction script](../scripts/policy-evaluation.ts). Node timings exclude rendering and are not browser or GPU throughput claims.

## Tests and teaching

Finite-difference tests cover positive/negative PPO advantages, both clipping sides, entropy gradients, legal-action masking, supervised cross entropy and critic regression. GAE tests verify terminal masking and unnormalized targets. Both algorithms restore exactly during collection and during optimizer epochs, including parameters, Adam state, buffer, permutation and environment/RNG state. Import tests reject malformed shapes, non-finite parameters, inconsistent optimizer counters and teacher provenance.

The classroom contains 21 lessons. PPO and imitation examples are separately executed Python/JavaScript objective components, clearly distinguished from full training; real training occurs in the Worker. All 21 pairs matched expected outputs. Final full-project and browser status is recorded in the implementation handoff.

Algorithm reference: [OpenAI Spinning Up PPO-Clip](https://spinningup.openai.com/en/latest/algorithms/ppo.html). The implementation is independently authored; its small linear model and numerical budgets are project choices, not claims about that reference's defaults or performance.

Imitation updates only the actor; its exported critic coefficients remain unused zeros. PPO exploration samples its softmax policy, not an epsilon-greedy rule.

Final HP validation: full-project check passed with 116 unit tests; complete Chromium suite passed 34/34. After wording/order-only changes, the six affected desktop/mobile classroom and PPO/imitation tests passed again. Details and all exclusions: [final handoff](final-handoff.md).
