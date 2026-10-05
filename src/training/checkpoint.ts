import { Game } from '../core';
import { CHECKPOINT_FILE_LIMIT, finiteNumber, makeTrainingConfig, observationSize } from './config';
import { assertModelCompatible, networkShapes, parameterCount, validateFrozenModel, validateTensors } from './inference';
import { TRAINING_VERSION, type TrainingCheckpoint } from './types';
/** Lightweight import gate. Engines additionally validate decoded replay/genes and exact resume state. */
export function validateCheckpoint(value: unknown): TrainingCheckpoint {
  if (!value || typeof value !== 'object') throw new Error('Checkpoint must be a data object');
  const c = value as TrainingCheckpoint;
  if (c.version !== TRAINING_VERSION || !['dqn', 'ga'].includes(c.algorithm) || c.config?.algorithm !== c.algorithm) throw new Error('Unsupported training checkpoint');
  const config = makeTrainingConfig(c.algorithm, c.config);
  if (c.config.version !== TRAINING_VERSION || c.config.rewardVersion !== config.rewardVersion) throw new Error('Checkpoint version mismatch');
  for (const key of ['envSteps', 'samples', 'validationSteps', 'episodes', 'updates', 'generation'] as const) finiteNumber(c.counters?.[key], `counter ${key}`, 0, 100000000, true);
  if (c.counters.envSteps !== c.counters.samples + c.counters.validationSteps) throw new Error('Checkpoint counters disagree');
  finiteNumber(c.elapsedMs, 'elapsed time', 0, 172800000); finiteNumber(c.bestScore, 'best score', 0, config.game.width * config.game.height);
  if (!Array.isArray(c.scoreHistory) || c.scoreHistory.length > 100 || !Array.isArray(c.curve) || c.curve.length > 500) throw new Error('Checkpoint history cap exceeded');
  for (const score of c.scoreHistory) finiteNumber(score, 'score', 0, config.game.width * config.game.height, true);
  for (const point of c.curve) {
    for (const key of ['samples', 'generation', 'meanScore', 'bestScore'] as const) finiteNumber(point[key], `curve ${key}`, 0, 100000000);
    for (const v of [point.loss, point.validationMean]) if (v !== null) finiteNumber(v, 'curve value', 0, 1e12);
  }
  if (!c.rng || typeof c.rng !== 'object') throw new Error('Missing random streams');
  for (const n of Object.values(c.rng)) finiteNumber(n, 'rng state', 0, 0xffffffff, true);
  for (const mean of [c.validationMean, c.bestValidationMean]) if (mean !== null) finiteNumber(mean, 'validation score', 0, config.game.width * config.game.height);
  if (c.bestModel) assertModelCompatible(validateFrozenModel(c.bestModel), config);
  if (c.validation) { assertModelCompatible(validateFrozenModel(c.validation.model), config); if (JSON.stringify(c.validation.seeds) !== JSON.stringify(config.validationSeeds)) throw new Error('Validation seeds mismatch'); }
  const size = observationSize(config.game.width, config.game.height, config.profile);
  if (c.algorithm === 'dqn') {
    validateTensors(c.online, networkShapes(size)); validateTensors(c.target, networkShapes(size));
    if (!Array.isArray(c.optimizer) || ![1, 13].includes(c.optimizer.length)) throw new Error('Unsupported optimizer state');
    if (c.optimizer[0].name !== 'iter' || c.optimizer[0].tensor?.shape?.length !== 0 || c.optimizer[0].tensor.values.length !== 1 || c.optimizer[0].tensor.values[0] !== c.counters.updates) throw new Error('Optimizer counter mismatch');
    if (c.optimizer.length === 13) {
      validateTensors(c.optimizer.slice(1).map(w => w.tensor), [...networkShapes(size), ...networkShapes(size)]);
      if (c.optimizer.slice(7).some(w => w.tensor.values.some(v => v < 0))) throw new Error('Invalid negative Adam second moment');
    } else if (c.counters.updates !== 0) throw new Error('Missing Adam moments');
    const r = c.replay;
    if (!r || r.inputSize !== size || r.capacity !== config.dqn.replayCapacity) throw new Error('Replay schema mismatch');
    finiteNumber(r.size, 'replay size', 0, r.capacity, true); finiteNumber(r.cursor, 'replay cursor', 0, r.capacity - 1, true);
    for (const [key, bytes] of [['observations', r.size * size * 4], ['nextObservations', r.size * size * 4], ['actions', r.size], ['rewards', r.size * 4], ['flags', r.size]] as const) if (typeof r[key] !== 'string' || r[key].length !== Math.ceil(bytes / 3) * 4) throw new Error('Replay byte count mismatch');
    const game = new Game(config.game, 1); game.restore(c.environment);
    if (JSON.stringify(game.observe().config) !== JSON.stringify(config.game)) throw new Error('Checkpoint environment differs from training configuration');
  } else {
    if (!Array.isArray(c.population) || c.population.length !== config.ga.populationSize) throw new Error('GA population size mismatch');
    const length = Math.ceil(parameterCount(size) * 4 / 3) * 4;
    if (c.population.some(p => typeof p !== 'string' || p.length !== length)) throw new Error('GA chromosome size mismatch');
    if (c.champion) assertModelCompatible(validateFrozenModel(c.champion), config);
  }
  return c;
}
export function parseCheckpoint(text: string): TrainingCheckpoint {
  if (new TextEncoder().encode(text).byteLength > CHECKPOINT_FILE_LIMIT) throw new Error('Checkpoint exceeds the 128 MiB import limit');
  return validateCheckpoint(JSON.parse(text) as unknown);
}
