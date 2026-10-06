import type { TrainingAlgorithm, TrainingConfigInput } from './types';

/** Browser CPU defaults; environment steps include validation work. */
export function compactTrainingPreset(algorithm: TrainingAlgorithm, seed = 7, steps = algorithm === 'ga' ? 500000 : 100000): TrainingConfigInput {
  return {
    profile: 'compact-v2', seed,
    game: { width: 8, height: 8, maxSteps: 1000, maxNoFood: 200 },
    budget: { maxEnvSteps: steps, maxWallMs: 60000, maxGenerations: algorithm === 'ga' ? 50 : 1 },
    dqn: { doubleDQN: true, gamma: 0.9, warmup: 128, batchSize: 32, replayCapacity: Math.min(20000, steps), trainEvery: 4, targetEvery: 100, epsilonDecaySteps: Math.min(5000, Math.max(500, Math.floor(steps * 0.3))), validationEvery: 5000, bootstrapTruncated: false },
    ga: { populationSize: 16, eliteCount: 2, episodesPerIndividual: 3, crossoverRate: 0, mutationRate: 0.1, mutationStd: 0.1 },
    validationSeeds: [20001,20002,20003,20004,20005],
    testSeeds: Array.from({length:100}, (_,i)=>30001+i),
  };
}
