import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { Game } from '../core';
import { makeTrainingConfig, observationSize } from './config';
import { parseCheckpoint } from './checkpoint';
import { TrainingController } from './controller';
import { computeTDTarget, DQNTrainer, ensureTrainingBackend } from './dqn';
import { encodeObservation } from './encoding';
import { FrozenEvaluator } from './evaluation';
import { breedPopulation, GATrainer } from './ga';
import { flattenWeights, initializeWeights, makeFrozenModel, parseFrozenModel, predictModel, validateFrozenModel } from './inference';
import { TrainingRandom } from './random';
import { ReplayBuffer } from './replay';
import type { TrainingConfigInput, TrainingEvent } from './types';
const small: TrainingConfigInput = {
  seed: 77, game: { width: 4, height: 4, maxSteps: 20, maxNoFood: 10 },
  dqn: { batchSize: 4, warmup: 4, replayCapacity: 64, trainEvery: 1, targetEvery: 3, validationEvery: 10000 },
  ga: { populationSize: 4, eliteCount: 1, tournamentSize: 2, episodesPerIndividual: 2 },
  budget: { maxEnvSteps: 400, maxWallMs: 600000, maxGenerations: 2 }, validationSeeds: [2001], testSeeds: [3001, 3002],
};
const trainers: { dispose(): void }[] = [];
async function createDqn(input: TrainingConfigInput = small): Promise<DQNTrainer> { const trainer = await DQNTrainer.create(input); trainers.push(trainer); return trainer; }
beforeAll(ensureTrainingBackend);
afterEach(() => { trainers.splice(0).forEach(t => t.dispose()); });
async function advance(trainer: DQNTrainer | GATrainer, n: number): Promise<void> { for (let i = 0; i < n; i++) if (!await trainer.advance()) break; }
function expectWeightsClose(a: number[], b: number[]): void { expect(a.length).toBe(b.length); for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 5); }

describe('versioned observation, imports and replay', () => {
  it('encodes head, body, food, order, obstacles and direction without random-state leakage', () => {
    const game = new Game({ width: 4, height: 4, obstacles: [0] }, 7), o = game.observe(), encoded = encodeObservation(o);
    expect(encoded).toHaveLength(84); expect(encoded[o.snake[0] * 5]).toBe(1); expect(encoded[o.snake[1] * 5 + 1]).toBe(1);
    expect(encoded[o.food! * 5 + 2]).toBe(1); expect(encoded[4]).toBe(1); expect(encoded[80 + o.direction]).toBe(1);
    expect(encoded[o.snake[0] * 5 + 3]).toBeGreaterThan(encoded[o.snake[1] * 5 + 3]);
  });
  it('rejects overlapping seed splits, memory over-allocation and invalid hyperparameters', () => {
    expect(() => makeTrainingConfig('dqn', { validationSeeds: [1], testSeeds: [1] })).toThrow(/disjoint/);
    expect(() => makeTrainingConfig('dqn', { game: { width: 20, height: 20 } })).toThrow(/Replay/);
    expect(() => makeTrainingConfig('ga', { ga: { mutationRate: -1 } })).toThrow();
    expect(() => makeTrainingConfig('ga', { game: { width: 28, height: 27 }, ga: { populationSize: 128 } })).toThrow(/population|checkpoint/);
    expect(() => makeTrainingConfig('dqn', { game: { width: 28, height: 27 }, dqn: { replayCapacity: 3000, batchSize: 256 } })).toThrow(/operation budget/);
    expect(() => makeTrainingConfig('dqn', { game: { width: 16, height: 16 }, dqn: { replayCapacity: 9700, batchSize: 32 } })).toThrow(/checkpoint/);
  });
  it('validates fixed architecture/data-only exports and output roundtrip', () => {
    const config = makeTrainingConfig('dqn', small), weights = initializeWeights(observationSize(4, 4), new TrainingRandom(1));
    const model = makeFrozenModel(config.game, 'dqn', weights, { seed: 1, samples: 0, updates: 0, generation: 0, validationMean: null });
    const loaded = parseFrozenModel(JSON.stringify(model)), o = new Game(config.game, 8).observe();
    expect(predictModel(loaded, o)).toEqual(predictModel(model, o));
    expect(() => validateFrozenModel({ ...model, script: 'alert(1)' })).toThrow(/Unexpected/);
    const invalid = structuredClone(model); invalid.weights[0].values[0] = Infinity; expect(() => validateFrozenModel(invalid)).toThrow();
    const badShape = structuredClone(model); badShape.weights[0].shape[0]++; expect(() => validateFrozenModel(badShape)).toThrow(/shape/);
    expect(() => predictModel(model, new Game({ width: 5, height: 5 }).observe())).toThrow(/differ/);
  });
  it('stores final observations and reconstructs circular replay in identical sampling order', () => {
    const replay = new ReplayBuffer(4, 2);
    for (let i = 0; i < 7; i++) replay.push({ observation: new Float32Array([0, i / 10]), nextObservation: new Float32Array([1, i / 10]), action: i % 3, reward: 1, terminated: false, truncated: true });
    const restored = ReplayBuffer.restore(replay.checkpoint(), 4, 2);
    expect(restored.sample(4, new TrainingRandom(6))).toEqual(replay.sample(4, new TrainingRandom(6)));
    const invalid = replay.checkpoint(); invalid.observations = invalid.observations.slice(1); expect(() => ReplayBuffer.restore(invalid, 4, 2)).toThrow();
    replay.dispose(); restored.dispose();
  });
});

describe('real TF.js DQN', () => {
  it('uses verified CPU backend and updates finite weights with Huber/Adam', async () => {
    const trainer = await createDqn(), before = flattenWeights(trainer.online.weights());
    await advance(trainer, 8);
    expect(tf.getBackend()).toBe('cpu'); expect(trainer.counters.updates).toBe(5);
    expect(Number.isFinite(trainer.loss)).toBe(true); expect(flattenWeights(trainer.online.weights())).not.toEqual(before);
    expect(trainer.online.weights().every(w => w.values.every(Number.isFinite))).toBe(true);
  });
  it('keeps target fixed until exactly the configured optimizer update boundary', async () => {
    const trainer = await createDqn(); const target = trainer.target.weights();
    await advance(trainer, 5); expect(trainer.counters.updates).toBe(2); expect(trainer.target.weights()).toEqual(target);
    expect(trainer.online.weights()).not.toEqual(target); await trainer.advance(); expect(trainer.target.weights()).toEqual(trainer.online.weights());
  });
  it('treats terminal and time-truncation targets separately', () => {
    expect(computeTDTarget(1, true, false, 10, 0.9, true)).toBe(1);
    expect(computeTDTarget(1, false, true, 10, 0.9, true)).toBe(10);
    expect(computeTDTarget(1, false, true, 10, 0.9, false)).toBe(1);
    expect(computeTDTarget(1, false, false, 10, 0.9, false)).toBe(10);
  });
  it('decays epsilon by training samples, independent of validation and frames', async () => {
    const trainer = await createDqn({ ...small, dqn: { ...small.dqn, epsilonDecaySteps: 10, validationEvery: 4 } });
    await advance(trainer, 4); const epsilon = trainer.epsilon; expect(epsilon).toBeCloseTo(0.62);
    expect(trainer.validation).not.toBeNull(); await trainer.advance(); expect(trainer.epsilon).toBe(epsilon);
  });
  it('Double DQN uses online argmax with frozen target values', async () => {
    const trainer = await createDqn({ ...small, dqn: { ...small.dqn, doubleDQN: true, gamma: 1 } });
    trainer.online.variables.forEach(v => tf.tidy(() => v.assign(tf.zeros(v.shape))));
    trainer.target.variables.forEach(v => tf.tidy(() => v.assign(tf.zeros(v.shape))));
    tf.tidy(() => trainer.online.variables[5].assign(tf.tensor1d([0, 5, 1])));
    tf.tidy(() => trainer.target.variables[5].assign(tf.tensor1d([10, 2, 1])));
    const batch = { observations: new Float32Array(84), nextObservations: new Float32Array(84), actions: new Int32Array([0]), rewards: new Float32Array([0]), flags: new Uint8Array([0]) };
    expect(trainer.update(batch)).toBeCloseTo(1.5); // Huber(0, target[action online=1]=2)
  });
  it('roundtrips online/target/Adam/replay/RNG/environment and resumes matching updates', async () => {
    const original = await createDqn(); await advance(original, 11);
    const saved = parseCheckpoint(JSON.stringify(await original.checkpoint())); expect(saved.algorithm).toBe('dqn');
    if (saved.algorithm !== 'dqn') throw new Error('Bad test checkpoint');
    const restored = await DQNTrainer.restore(saved); trainers.push(restored);
    expect(restored.online.weights()).toEqual(original.online.weights()); expect(restored.target.weights()).toEqual(original.target.weights());
    expect(restored.game.hash()).toBe(original.game.hash()); expect(restored.counters).toEqual(original.counters);
    await advance(original, 4); await advance(restored, 4);
    expect(restored.game.hash()).toBe(original.game.hash()); expect(restored.counters).toEqual(original.counters);
    expectWeightsClose(Array.from(flattenWeights(restored.online.weights())), Array.from(flattenWeights(original.online.weights())));
    expect((await restored.checkpoint()).replay).toEqual((await original.checkpoint()).replay);
  });
  it('keeps frozen evaluation exploration-free and does not mutate any network weights', async () => {
    const trainer = await createDqn(); await advance(trainer, 6); const model = trainer.exportModel();
    const serialized = JSON.stringify(model), before = trainer.online.weights(), o = trainer.game.observe();
    expectWeightsClose(predictModel(model, o).qValues, trainer.online.predict(encodeObservation(o)));
    const evaluator = new FrozenEvaluator(model, [3001, 3002]); while (!evaluator.done) evaluator.tick();
    const again = new FrozenEvaluator(model, [3001, 3002]); while (!again.done) again.tick();
    expect(again.result()).toEqual(evaluator.result()); expect(JSON.stringify(model)).toBe(serialized); expect(trainer.online.weights()).toEqual(before);
  });
  it('has flat tensor usage after Adam warmup, including repeated checkpoint serialization, and disposes all owned tensors', async () => {
    const baseline = tf.memory().numTensors; const trainer = await createDqn(); await advance(trainer, 12); const stable = tf.memory().numTensors;
    await advance(trainer, 25); expect(tf.memory().numTensors).toBe(stable);
    await trainer.checkpoint(); await trainer.checkpoint(); expect(tf.memory().numTensors).toBe(stable);
    trainer.dispose(); expect(tf.memory().numTensors).toBe(baseline);
  });
});

describe('real genetic evolution', () => {
  it('preserves elites exactly and produces seed-deterministic crossover/mutation', () => {
    const pop = [new Float32Array([1, 1, 1, 1]), new Float32Array([2, 2, 2, 2]), new Float32Array([3, 3, 3, 3]), new Float32Array([4, 4, 4, 4])];
    const config = makeTrainingConfig('ga', small).ga;
    const a = breedPopulation(pop, [0, 10, 5, 2], { ...config, mutationRate: 1 }, new TrainingRandom(9));
    const b = breedPopulation(pop, [0, 10, 5, 2], { ...config, mutationRate: 1 }, new TrainingRandom(9));
    expect(a).toEqual(b); expect(a[0]).toEqual(pop[1]); expect(a[0]).not.toBe(pop[1]); expect(a.slice(1)).not.toEqual(pop.slice(1));
  });
  it('evaluates a genuine population with common seeds and independently validated champion', async () => {
    const a = new GATrainer(small), b = new GATrainer(small); trainers.push(a, b);
    expect(a.trainingSeeds).toEqual(b.trainingSeeds); expect(a.trainingSeeds.some(s => [2001, 3001, 3002].includes(s))).toBe(false);
    while (a.counters.generation < 1) await a.advance(); while (b.counters.generation < 1) await b.advance();
    expect(a.distribution).toEqual(b.distribution); expect(a.counters).toEqual(b.counters); expect(a.exportModel()).toEqual(b.exportModel());
    expect(a.distribution?.values).toHaveLength(4); expect(a.validationMean).not.toBeNull(); expect(a.counters.validationSteps).toBeGreaterThan(0);
    const prior = a.population.map(p => new Float32Array(p)); await a.advance(); expect(a.population).not.toEqual(prior);
  });
  it('resumes partial individual and validation without repeated or skipped environment steps', async () => {
    const original = new GATrainer(small); trainers.push(original); await advance(original, 7);
    const checkpoint = parseCheckpoint(JSON.stringify(await original.checkpoint())); if (checkpoint.algorithm !== 'ga') throw new Error('Bad test');
    const restored = GATrainer.restore(checkpoint); trainers.push(restored);
    await advance(original, 150); await advance(restored, 150);
    const a = await original.checkpoint(), b = await restored.checkpoint();
    expect(b.counters).toEqual(a.counters); expect(b.population).toEqual(a.population); expect(b.fitness).toEqual(a.fitness); expect(b.current).toEqual(a.current); expect(b.rng).toEqual(a.rng);
  });
  it('honors environment and generation budgets', async () => {
    const trainer = new GATrainer({ ...small, budget: { maxEnvSteps: 7, maxWallMs: 600000, maxGenerations: 1 } }); trainers.push(trainer);
    while (await trainer.advance()) { /* bounded by configured sample budget */ }
    expect(trainer.counters.envSteps).toBe(7); expect(trainer.stopReason).toMatch(/environment-step/);
  });
});

it('serializes responsive worker controls, exports on completion and keeps checkpoints available', async () => {
  const events: TrainingEvent[] = [], controller = new TrainingController(event => events.push(event)); trainers.push(controller);
  controller.handle({ type: 'start', jobId: 'a', algorithm: 'ga', config: { ...small, budget: { maxEnvSteps: 20, maxWallMs: 60000 } } });
  controller.handle({ type: 'pause', jobId: 'a' });
  await new Promise(r => setTimeout(r, 30)); expect(events.some(e => e.type === 'status' && e.status === 'paused')).toBe(true);
  const pausedSamples = events.filter(e => e.type === 'progress').at(-1); await new Promise(r => setTimeout(r, 20)); expect(events.filter(e => e.type === 'progress').at(-1)).toBe(pausedSamples);
  controller.handle({ type: 'resume', jobId: 'a' });
  for (let i = 0; i < 100 && !events.some(e => e.type === 'status' && e.status === 'completed'); i++) await new Promise(r => setTimeout(r, 10));
  expect(events.some(e => e.type === 'model')).toBe(true); expect(events.some(e => e.type === 'status' && e.status === 'completed')).toBe(true);
  controller.handle({ type: 'checkpoint', jobId: 'a' }); await new Promise(r => setTimeout(r, 10)); expect(events.some(e => e.type === 'checkpoint')).toBe(true);
  expect(events.map(e => e.sequence)).toEqual(events.map((_, i) => i + 1)); expect(events.some(e => e.type === 'error')).toBe(false);
});

it('resumes a checkpoint taken inside DQN and GA validation with identical remaining work', async () => {
  const dqn = await createDqn({ ...small, dqn: { ...small.dqn, validationEvery: 4 } });
  await advance(dqn, 4); await dqn.advance(); expect(dqn.validation).not.toBeNull();
  const dqnCopy = await DQNTrainer.restore(await dqn.checkpoint()); trainers.push(dqnCopy);
  await advance(dqn, 6); await advance(dqnCopy, 6);
  expect(dqnCopy.counters).toEqual(dqn.counters); expect(dqnCopy.validationMean).toBe(dqn.validationMean); expect(dqnCopy.bestModel).toEqual(dqn.bestModel);
  const ga = new GATrainer(small); trainers.push(ga);
  while (ga.phase !== 'validation') await ga.advance();
  await ga.advance();
  const gaCopy = GATrainer.restore(await ga.checkpoint()); trainers.push(gaCopy);
  await advance(ga, 12); await advance(gaCopy, 12);
  expect((await gaCopy.checkpoint()).current).toEqual((await ga.checkpoint()).current); expect(gaCopy.counters).toEqual(ga.counters); expect(gaCopy.bestModel).toEqual(ga.bestModel);
});

it('labels undeclared evaluation seeds as external and retains completed checkpoint across evaluation', async () => {
  const events: TrainingEvent[] = [], controller = new TrainingController(event => events.push(event)); trainers.push(controller);
  controller.handle({ type: 'start', jobId: 'train', algorithm: 'ga', config: { ...small, budget: { maxEnvSteps: 10, maxWallMs: 60000 } } });
  for (let i = 0; i < 100 && !events.some(e => e.type === 'status' && e.status === 'completed'); i++) await new Promise(r => setTimeout(r, 5));
  const modelEvent = events.find(e => e.type === 'model'); if (modelEvent?.type !== 'model') throw new Error('Missing model');
  const evaluator = new FrozenEvaluator(modelEvent.model, [2001]); while (!evaluator.done) evaluator.tick(); expect(evaluator.result().split).toBe('external');
  controller.handle({ type: 'evaluate', jobId: 'eval', model: modelEvent.model });
  for (let i = 0; i < 100 && !events.some(e => e.type === 'evaluation'); i++) await new Promise(r => setTimeout(r, 5));
  controller.handle({ type: 'checkpoint', jobId: 'eval' }); await new Promise(r => setTimeout(r, 10));
  expect(events.some(e => e.type === 'checkpoint')).toBe(true); expect(events.some(e => e.type === 'error')).toBe(false);
});

it('cancels a running CPU trainer at a yield boundary and releases its tensors', async () => {
  const baseline = tf.memory().numTensors, events: TrainingEvent[] = [];
  const controller = new TrainingController(event => events.push(event)); trainers.push(controller);
  controller.handle({ type: 'start', jobId: 'cancel-me', algorithm: 'dqn', config: { ...small, budget: { maxEnvSteps: 100000, maxWallMs: 60000 } } });
  await new Promise(r => setTimeout(r, 10)); const start = performance.now(); controller.handle({ type: 'cancel', jobId: 'cancel-me' });
  for (let i = 0; i < 100 && !events.some(e => e.type === 'status' && e.status === 'cancelled'); i++) await new Promise(r => setTimeout(r, 5));
  expect(events.some(e => e.type === 'status' && e.status === 'cancelled')).toBe(true); expect(performance.now() - start).toBeLessThan(1000);
  expect(tf.memory().numTensors).toBe(baseline);
});
