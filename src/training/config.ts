import { normalizeConfig } from '../core';
import { TRAINING_VERSION, type TrainingAlgorithm, type TrainingConfig, type TrainingConfigInput } from './types';
export const REPLAY_MEMORY_LIMIT = 96 * 1024 * 1024;
export const MODEL_FILE_LIMIT = 10 * 1024 * 1024;
export const CHECKPOINT_FILE_LIMIT = 128 * 1024 * 1024;
export function finiteNumber(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${label}: expected ${integer ? 'integer' : 'number'} in [${min}, ${max}]`);
  return value;
}
export function validateSeeds(seeds: unknown, label = 'seeds'): number[] {
  if (!Array.isArray(seeds) || seeds.length < 1 || seeds.length > 1000) throw new Error(`Invalid ${label}: provide 1–1000 seeds`);
  const result = seeds.map(v => finiteNumber(v, label, 0, 0xffffffff, true));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique`);
  return result;
}
export function observationSize(width: number, height: number, profile?: 'compact-v2'): number { return profile === 'compact-v2' ? 12 : width * height * 5 + 4; }
export function replayBytes(capacity: number, inputSize: number): number { return capacity * (inputSize * 8 + 6); }
export function makeTrainingConfig(algorithm: TrainingAlgorithm, input: TrainingConfigInput = {}): TrainingConfig {
  if (algorithm !== 'dqn' && algorithm !== 'ga') throw new Error('Unknown training algorithm');
  if (input.profile !== undefined && input.profile !== 'compact-v2') throw new Error('Unsupported training profile');
  const game = normalizeConfig({ width: 8, height: 8, maxSteps: 5000, maxNoFood: 500, ...input.game });
  if (game.initialLength >= game.width * game.height - game.obstacles.length) throw new Error('Training needs at least one empty cell');
  if (!game.maxSteps || !game.maxNoFood) throw new Error('Training requires finite positive episode and no-food limits');
  const dqn = { learningRate: 0.001, gamma: 0.99, batchSize: 32, replayCapacity: 20000, warmup: 1000, trainEvery: 4, targetEvery: 1000, epsilonStart: 1, epsilonEnd: 0.05, epsilonDecaySteps: 50000, doubleDQN: false, bootstrapTruncated: true, validationEvery: 10000, ...input.dqn };
  const ga = { populationSize: 32, eliteCount: 2, tournamentSize: 3, episodesPerIndividual: 5, mutationRate: 0.05, mutationStd: 0.1, crossoverRate: 0.8, ...input.ga };
  const budget = { maxEnvSteps: 100000, maxWallMs: 300000, maxGenerations: 50, ...input.budget };
  const validationSeeds = validateSeeds(input.validationSeeds ?? [1800000001, 1800000002, 1800000003, 1800000004, 1800000005], 'validationSeeds');
  const testSeeds = validateSeeds(input.testSeeds ?? Array.from({ length: 100 }, (_, i) => 1900000001 + i), 'testSeeds');
  if (validationSeeds.some(s => testSeeds.includes(s))) throw new Error('Validation and test seeds must be disjoint');
  finiteNumber(input.seed ?? 42, 'seed', 0, 0xffffffff, true);
  finiteNumber(budget.maxEnvSteps, 'maxEnvSteps', 1, 100000000, true);
  finiteNumber(budget.maxWallMs, 'maxWallMs', 1, 86400000, true);
  finiteNumber(budget.maxGenerations, 'maxGenerations', 1, 10000, true);
  for (const [key, value] of Object.entries(dqn)) {
    if (key === 'doubleDQN' || key === 'bootstrapTruncated') continue;
    if (['gamma', 'epsilonStart', 'epsilonEnd'].includes(key)) finiteNumber(value, key, 0, 1);
    else if (key === 'learningRate') finiteNumber(value, key, 0.000001, 0.1);
    else finiteNumber(value, key, 1, key === 'replayCapacity' ? 100000 : 10000000, true);
  }
  if (typeof dqn.doubleDQN !== 'boolean' || typeof dqn.bootstrapTruncated !== 'boolean') throw new Error('DQN flags must be boolean');
  if (dqn.epsilonStart < dqn.epsilonEnd || dqn.batchSize > dqn.replayCapacity || dqn.warmup < dqn.batchSize || dqn.warmup > dqn.replayCapacity) throw new Error('Invalid replay/warmup/epsilon configuration');
  finiteNumber(ga.populationSize, 'populationSize', 2, 128, true);
  finiteNumber(ga.eliteCount, 'eliteCount', 1, ga.populationSize - 1, true);
  finiteNumber(ga.tournamentSize, 'tournamentSize', 2, ga.populationSize, true);
  finiteNumber(ga.episodesPerIndividual, 'episodesPerIndividual', 1, 100, true);
  finiteNumber(ga.mutationRate, 'mutationRate', 0, 1);
  finiteNumber(ga.mutationStd, 'mutationStd', 0, 10);
  finiteNumber(ga.crossoverRate, 'crossoverRate', 0, 1);
  const size = observationSize(game.width, game.height, input.profile);
  const parameters = size * 64 + 4419;
  finiteNumber(dqn.batchSize, 'batchSize', 1, 256, true);
  if (algorithm === 'dqn' && parameters * dqn.batchSize > 8000000) throw new Error('Optimizer batch exceeds the responsive CPU operation budget; reduce batch size or board size');
  if (parameters > 250000) throw new Error('This board exceeds the small-network training limit');
  if (algorithm === 'dqn' && replayBytes(dqn.replayCapacity, size) > REPLAY_MEMORY_LIMIT) throw new Error('Replay exceeds the 96 MiB allocation limit; reduce replay capacity or board size');
  const replayEstimate = replayBytes(dqn.replayCapacity, size);
  const populationBytes = parameters * 4 * ga.populationSize;
  if (algorithm === 'ga' && populationBytes > 32 * 1024 * 1024) throw new Error('GA population exceeds the 32 MiB memory limit');
  // Reserve enough space for JSON weights (including Adam/best/validation models) and bounded logs.
  const encodedEstimate = algorithm === 'dqn' ? Math.ceil(replayEstimate * 4 / 3) + parameters * 6 * 32 : Math.ceil(populationBytes * 4 / 3) + parameters * 3 * 32;
  if (encodedEstimate + 8 * 1024 * 1024 > CHECKPOINT_FILE_LIMIT) throw new Error('Estimated full checkpoint exceeds the 128 MiB export/import limit; reduce replay or population');
  return { ...(input.profile ? { profile: input.profile } : {}), version: TRAINING_VERSION, algorithm, seed: input.seed ?? 42, game, budget, dqn, ga, validationSeeds, testSeeds, rewardVersion: input.profile ? 'food10-collision-10-distance-.5-v2' : 'food1-collision-1-step-.001-filled1-v1' };
}
