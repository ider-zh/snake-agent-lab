import * as tf from '@tensorflow/tfjs';
import { Game, relativeAction } from '../core';
import { BaseTrainer } from './base';
import { validateCheckpoint } from './checkpoint';
import { finiteNumber, makeTrainingConfig, observationSize, replayBytes } from './config';
import { encodeObservation } from './encoding';
import { FrozenEvaluator } from './evaluation';
import { argmax, initializeWeights, makeFrozenModel, networkShapes, validateTensors } from './inference';
import { nextTrainingSeed, TrainingRandom } from './random';
import { ReplayBuffer, type ReplayBatch } from './replay';
import type { DQNCheckpoint, FrozenModel, SerializedTensor, TrainingConfig, TrainingConfigInput, TrainingMetrics } from './types';
let backendReady: Promise<void> | null = null;
export function ensureTrainingBackend(): Promise<void> {
  backendReady ??= (async () => { if (!await tf.setBackend('cpu')) throw new Error('TF.js CPU backend unavailable'); await tf.ready(); if (tf.getBackend() !== 'cpu') throw new Error('Unverified training backend'); })();
  return backendReady;
}
/** Termination suppresses bootstrap. Truncation follows the recorded experiment setting. */
export function computeTDTarget(reward: number, terminated: boolean, truncated: boolean, nextValue: number, gamma: number, bootstrapTruncated: boolean): number {
  return reward + (terminated || (truncated && !bootstrapTruncated) ? 0 : gamma * nextValue);
}
export class DQNNetwork {
  readonly variables: tf.Variable[];
  constructor(weights: SerializedTensor[], trainable: boolean) {
    this.variables = weights.map(w => tf.tidy(() => tf.variable(tf.tensor(w.values, w.shape, 'float32'), trainable)));
  }
  forward(input: tf.Tensor2D): tf.Tensor2D {
    const [w1, b1, w2, b2, w3, b3] = this.variables;
    return input.matMul(w1 as tf.Tensor2D).add(b1).relu().matMul(w2 as tf.Tensor2D).add(b2).relu().matMul(w3 as tf.Tensor2D).add(b3) as tf.Tensor2D;
  }
  predict(input: Float32Array): number[] { return tf.tidy(() => Array.from(this.forward(tf.tensor2d(input, [1, input.length])).dataSync())); }
  weights(): SerializedTensor[] { return this.variables.map(v => ({ shape: [...v.shape], values: Array.from(v.dataSync()) })); }
  copyFrom(other: DQNNetwork): void { this.variables.forEach((v, i) => v.assign(other.variables[i])); }
  dispose(): void { this.variables.forEach(v => v.dispose()); }
}
export class DQNTrainer extends BaseTrainer {
  readonly online: DQNNetwork; readonly target: DQNNetwork; readonly optimizer: tf.AdamOptimizer;
  replay: ReplayBuffer; game: Game; episodeSeed: number;
  loss: number | null = null; lastValidationAt = 0; validation: FrozenEvaluator | null = null;
  private readonly environmentRng: TrainingRandom; private readonly explorationRng: TrainingRandom; private readonly replayRng: TrainingRandom;
  private disposed = false;
  private constructor(config: TrainingConfig) {
    super(config);
    this.environmentRng = new TrainingRandom(config.seed ^ 0x64cab29d); this.explorationRng = new TrainingRandom(config.seed ^ 0x12ab34cd); this.replayRng = new TrainingRandom(config.seed ^ 0x987fedcb);
    this.episodeSeed = this.nextSeed(); this.game = new Game(config.game, this.episodeSeed);
    const size = observationSize(config.game.width, config.game.height);
    const weights = initializeWeights(size, new TrainingRandom(config.seed ^ 0x3456abcd));
    this.online = new DQNNetwork(weights, true); this.target = new DQNNetwork(weights, false);
    this.optimizer = tf.train.adam(config.dqn.learningRate);
    this.replay = new ReplayBuffer(config.dqn.replayCapacity, size);
  }
  static async create(input: TrainingConfigInput = {}): Promise<DQNTrainer> { await ensureTrainingBackend(); return new DQNTrainer(makeTrainingConfig('dqn', input)); }
  private nextSeed(): number { return nextTrainingSeed(this.environmentRng, [...this.config.validationSeeds, ...this.config.testSeeds]); }
  get epsilon(): number { const d = this.config.dqn; return d.epsilonStart + (d.epsilonEnd - d.epsilonStart) * Math.min(1, this.counters.samples / d.epsilonDecaySteps); }
  async advance(): Promise<boolean> {
    if (this.disposed || this.budgetReached()) return false;
    if (this.validation) {
      if (this.validation.tick()) { this.counters.envSteps++; this.counters.validationSteps++; }
      if (this.validation.done) {
        const result = this.validation.result('validation'); this.validationMean = result.meanScore;
        if (this.bestValidationMean === null || result.meanScore > this.bestValidationMean) { this.bestValidationMean = result.meanScore; this.bestModel = { ...this.validation.model, provenance: { ...this.validation.model.provenance, validationMean: result.meanScore } }; }
        this.validation = null; this.recordCurve(this.loss);
      }
      return true;
    }
    const observation = this.game.observe(); const encoded = encodeObservation(observation);
    const action = this.explorationRng.next() < this.epsilon ? this.explorationRng.int(3) : argmax(this.online.predict(encoded));
    const result = this.game.step(relativeAction(observation.direction, action));
    this.replay.push({ observation: encoded, action, reward: result.reward, nextObservation: encodeObservation(result.observation), terminated: result.terminated, truncated: result.truncated });
    this.counters.samples++; this.counters.envSteps++;
    const d = this.config.dqn;
    if (this.replay.size >= d.warmup && this.counters.samples % d.trainEvery === 0) this.update(this.replay.sample(d.batchSize, this.replayRng));
    if (result.terminated || result.truncated) { this.recordEpisode(result.observation.score); this.episodeSeed = this.nextSeed(); this.game = new Game(this.config.game, this.episodeSeed); }
    if (this.counters.samples % 100 === 0) this.recordCurve(this.loss);
    if (this.counters.samples - this.lastValidationAt >= d.validationEvery) {
      this.lastValidationAt = this.counters.samples;
      this.validation = new FrozenEvaluator(this.currentModel(), this.config.validationSeeds);
    }
    return true;
  }
  update(batch: ReplayBatch): number {
    const size = this.replay.inputSize, n = batch.actions.length, d = this.config.dqn;
    const loss = tf.tidy(() => {
      const observations = tf.tensor2d(batch.observations, [n, size]);
      const next = tf.tensor2d(batch.nextObservations, [n, size]);
      const targetQ = this.target.forward(next).dataSync();
      const onlineQ = d.doubleDQN ? this.online.forward(next).dataSync() : targetQ;
      const targets = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const choice = argmax(onlineQ.subarray(i * 3, i * 3 + 3));
        targets[i] = computeTDTarget(batch.rewards[i], !!(batch.flags[i] & 1), !!(batch.flags[i] & 2), targetQ[i * 3 + choice], d.gamma, d.bootstrapTruncated);
        if (!Number.isFinite(targets[i])) throw new Error('Non-finite TD target; training stopped');
      }
      const labels = tf.tensor1d(targets), actionMask = tf.oneHot(tf.tensor1d(batch.actions, 'int32'), 3);
      const gradients = tf.variableGrads(() => {
        const selected = this.online.forward(observations).mul(actionMask).sum(1);
        return tf.losses.huberLoss(labels, selected) as tf.Scalar;
      }, this.online.variables);
      const value = gradients.value.dataSync()[0];
      if (!Number.isFinite(value)) throw new Error('Non-finite loss; training stopped');
      const named = this.online.variables.map(variable => {
        const tensor = gradients.grads[variable.name];
        if (Array.from(tensor.dataSync()).some(v => !Number.isFinite(v))) throw new Error('Non-finite gradient; training stopped');
        return { name: variable.name, tensor };
      });
      this.optimizer.applyGradients(named);
      if (this.online.variables.some(v => Array.from(v.dataSync()).some(n => !Number.isFinite(n)))) throw new Error('Non-finite weights; training stopped');
      return value;
    });
    this.counters.updates++; this.loss = loss;
    if (this.counters.updates % d.targetEvery === 0) this.target.copyFrom(this.online);
    return loss;
  }
  currentModel(): FrozenModel {
    return makeFrozenModel(this.config.game, 'dqn', this.online.weights(), { seed: this.config.seed, samples: this.counters.samples, updates: this.counters.updates, generation: 0, validationMean: null }, { trainingPolicy: 'generated-excluding-held-out', validationSeeds: this.config.validationSeeds, testSeeds: this.config.testSeeds }, this.config.dqn.doubleDQN ? 'double-dqn' : 'dqn');
  }
  exportModel(): FrozenModel { return this.bestModel ?? this.currentModel(); }
  metrics(): TrainingMetrics {
    const memory = tf.memory();
    return this.baseMetrics(this.validation?.game?.snapshot() ?? this.game.snapshot(), { loss: this.loss, epsilon: this.epsilon, backend: 'cpu', tensors: memory.numTensors, tensorBytes: memory.numBytes, estimatedReplayBytes: replayBytes(this.replay.capacity, this.replay.inputSize), distribution: null });
  }
  async checkpoint(): Promise<DQNCheckpoint> {
    const optimizer = await this.optimizer.getWeights();
    try {
      return { ...this.commonCheckpoint({ environment: this.environmentRng.state, exploration: this.explorationRng.state, replay: this.replayRng.state }), algorithm: 'dqn', online: this.online.weights(), target: this.target.weights(), optimizer: optimizer.map(w => ({ name: w.name, tensor: { shape: [...w.tensor.shape], values: Array.from(w.tensor.dataSync()) } })), replay: this.replay.checkpoint(), environment: this.game.snapshot(), episodeSeed: this.episodeSeed, loss: this.loss, validation: this.validation?.checkpoint() ?? null, lastValidationAt: this.lastValidationAt };
    } finally { optimizer[0]?.tensor.dispose(); /* getWeights creates iter, but borrows internal Adam slot variables. */ }
  }
  static async restore(checkpoint: DQNCheckpoint): Promise<DQNTrainer> {
    validateCheckpoint(checkpoint);
    if (checkpoint.algorithm !== 'dqn') throw new Error('Not a DQN checkpoint');
    const trainer = await DQNTrainer.create(checkpoint.config);
    try {
      trainer.restoreCommon(checkpoint);
      const shapes = networkShapes(trainer.replay.inputSize);
      const online = validateTensors(checkpoint.online, shapes), target = validateTensors(checkpoint.target, shapes);
      for (const [network, values] of [[trainer.online, online], [trainer.target, target]] as const) {
        values.forEach((w, i) => tf.tidy(() => network.variables[i].assign(tf.tensor(w.values, w.shape))));
      }
      trainer.replay.dispose(); trainer.replay = ReplayBuffer.restore(checkpoint.replay, trainer.config.dqn.replayCapacity, trainer.replay.inputSize);
      if (!Array.isArray(checkpoint.optimizer) || ![1, 13].includes(checkpoint.optimizer.length)) throw new Error('Invalid Adam checkpoint');
      const expectedShapes = checkpoint.optimizer.length === 1 ? [[]] : [[], ...shapes, ...shapes];
      const tensors = validateTensors(checkpoint.optimizer.map(w => w.tensor), expectedShapes);
      if (tensors[0].values[0] !== checkpoint.counters.updates || (checkpoint.counters.updates > 0 && tensors.length !== 13)) throw new Error('Optimizer update count mismatch');
      const named = tensors.map((w, i) => ({ name: i === 0 ? 'iter' : `${trainer.online.variables[(i - 1) % 6].name}/${i <= 6 ? 'm' : 'v'}`, tensor: tf.tensor(w.values, w.shape, i === 0 ? 'int32' : 'float32') }));
      try { await trainer.optimizer.setWeights(named); } finally { named.forEach(w => w.tensor.dispose()); }
      for (const key of ['environment', 'exploration', 'replay']) finiteNumber(checkpoint.rng[key], `rng ${key}`, 0, 0xffffffff, true);
      trainer.environmentRng.state = checkpoint.rng.environment; trainer.explorationRng.state = checkpoint.rng.exploration; trainer.replayRng.state = checkpoint.rng.replay;
      trainer.game.restore(checkpoint.environment);
      if (JSON.stringify(trainer.game.observe().config) !== JSON.stringify(trainer.config.game)) throw new Error('Environment configuration mismatch');
      trainer.episodeSeed = finiteNumber(checkpoint.episodeSeed, 'episode seed', 0, 0xffffffff, true);
      if (trainer.config.validationSeeds.includes(trainer.episodeSeed) || trainer.config.testSeeds.includes(trainer.episodeSeed)) throw new Error('Training environment uses a held-out seed');
      if (trainer.episodeSeed !== checkpoint.environment.seed) throw new Error('Environment seed mismatch');
      trainer.lastValidationAt = finiteNumber(checkpoint.lastValidationAt, 'last validation sample', 0, trainer.counters.samples, true);
      trainer.loss = checkpoint.loss === null ? null : finiteNumber(checkpoint.loss, 'loss', 0, 1000000000000);
      if (checkpoint.validation) trainer.validation = new FrozenEvaluator(checkpoint.validation.model, trainer.config.validationSeeds, checkpoint.validation);
      return trainer;
    } catch (error) { trainer.dispose(); throw error; }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.online.dispose(); this.target.dispose(); this.optimizer.dispose(); this.replay.dispose(); }
}
