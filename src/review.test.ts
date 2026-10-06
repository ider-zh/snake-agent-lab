import { beforeAll, describe, expect, it } from 'vitest';
import { Game } from './core';
import { parseCheckpoint } from './training/checkpoint';
import { makeTrainingConfig } from './training/config';
import { DQNTrainer, ensureTrainingBackend } from './training/dqn';
import { FrozenEvaluator } from './training/evaluation';
import { GATrainer } from './training/ga';
import type { TrainingConfigInput } from './training/types';

const small: TrainingConfigInput = {
  seed: 77,
  game: { width: 4, height: 4, maxSteps: 20, maxNoFood: 10 },
  dqn: { batchSize: 4, warmup: 4, replayCapacity: 64, trainEvery: 1, targetEvery: 3, validationEvery: 10000 },
  ga: { populationSize: 4, eliteCount: 1, tournamentSize: 2, episodesPerIndividual: 2 },
  budget: { maxEnvSteps: 400, maxWallMs: 600000, maxGenerations: 2 },
  validationSeeds: [2001], testSeeds: [3001, 3002],
};
beforeAll(ensureTrainingBackend);

describe('adversarial review regressions', () => {
  it('rejects a held-out test seed as a restored DQN training environment', async () => {
    const source = await DQNTrainer.create(small);
    let accepted: DQNTrainer | undefined;
    try {
      const checkpoint = await source.checkpoint();
      checkpoint.environment = new Game(source.config.game, 3001).snapshot();
      checkpoint.episodeSeed = 3001;
      const parsed = parseCheckpoint(JSON.stringify(checkpoint));
      if (parsed.algorithm !== 'dqn') throw new Error('Unexpected algorithm');
      await expect(DQNTrainer.restore(parsed).then(t => { accepted = t; })).rejects.toThrow();
    } finally { source.dispose(); accepted?.dispose(); }
  });
  it('rejects validation snapshots with the wrong seed', async () => {
    const source = await DQNTrainer.create(small);
    try {
      const model = source.currentModel();
      const checkpoint = { model, seeds: [2001], index: 0, episodes: [], snapshot: new Game(model.game, 3001).snapshot() };
      expect(() => new FrozenEvaluator(model, [2001], checkpoint)).toThrow();
    } finally { source.dispose(); }
  });
  it('rejects out-of-range validation results before champion selection', async () => {
    const source = await DQNTrainer.create(small);
    try {
      const model = source.currentModel();
      const checkpoint = { model, seeds: [2001], index: 1, episodes: [{ seed: 2001, score: 1e300, fill: 1e300, steps: -1, terminated: true, truncated: false, reason: 'filled' }], snapshot: null };
      expect(() => new FrozenEvaluator(model, [2001], checkpoint)).toThrow();
    } finally { source.dispose(); }
  });
  it('rejects GA partial fitness outside physical board limits', async () => {
    const source = new GATrainer(small);
    let accepted: GATrainer | undefined;
    try {
      while (source.current.seedIndex === 0) await source.advance();
      const checkpoint = await source.checkpoint();
      checkpoint.current.fills[0] = 1e300;
      const parsed = parseCheckpoint(JSON.stringify(checkpoint));
      if (parsed.algorithm !== 'ga') throw new Error('Unexpected algorithm');
      expect(() => { accepted = GATrainer.restore(parsed); }).toThrow();
    } finally { source.dispose(); accepted?.dispose(); }
  });
  it('rejects an uninterruptibly large DQN optimizer batch', () => {
    expect(() => makeTrainingConfig('dqn', {
      ...small,
      dqn: { ...small.dqn, batchSize: 100000, warmup: 100000, replayCapacity: 100000 },
    })).toThrow();
  });
  it('rejects boolean values for numeric DQN hyperparameters', () => {
    const input = JSON.parse('{"dqn":{"learningRate":false}}') as TrainingConfigInput;
    expect(() => makeTrainingConfig('dqn', input)).toThrow();
  });
});
