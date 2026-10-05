import { normalizeConfig, relativeAction } from '../core';
import type { Direction, GameConfig, Observation } from '../core/types';
import { finiteNumber, MODEL_FILE_LIMIT, observationSize, validateSeeds } from './config';
import { encodeObservation } from './encoding';
import { TrainingRandom } from './random';
import { MODEL_VERSION, OBSERVATION_VERSION, type FrozenModel, type SerializedTensor, type TrainingAlgorithm, type TrainingConfig } from './types';
export function networkShapes(inputSize: number): number[][] { return [[inputSize, 64], [64], [64, 64], [64], [64, 3], [3]]; }
export function parameterCount(inputSize: number): number { return networkShapes(inputSize).reduce((n, s) => n + s.reduce((a, b) => a * b, 1), 0); }
export function initializeWeights(inputSize: number, rng: TrainingRandom): SerializedTensor[] {
  return networkShapes(inputSize).map((shape, index) => ({ shape, values: Array.from({ length: shape.reduce((a, b) => a * b, 1) }, () => index % 2 ? 0 : rng.normal() * Math.sqrt(2 / shape[0])) }));
}
export function validateTensors(value: unknown, shapes: number[][]): SerializedTensor[] {
  if (!Array.isArray(value) || value.length !== shapes.length) throw new Error('Incorrect tensor count');
  return value.map((raw: unknown, index) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid tensor');
    const tensor = raw as SerializedTensor;
    if (!Array.isArray(tensor.shape) || JSON.stringify(tensor.shape) !== JSON.stringify(shapes[index])) throw new Error(`Tensor ${index} shape mismatch`);
    const length = shapes[index].reduce((a, b) => a * b, 1);
    if (!Array.isArray(tensor.values) || tensor.values.length !== length) throw new Error(`Tensor ${index} length mismatch`);
    tensor.values.forEach(v => finiteNumber(v, 'weight', -1000000, 1000000));
    return { shape: [...tensor.shape], values: [...tensor.values] };
  });
}
export function validateFrozenModel(value: unknown): FrozenModel {
  if (!value || typeof value !== 'object') throw new Error('Model must be a data object');
  const m = value as FrozenModel;
  const allowed = new Set(['version', 'observationVersion', 'architecture', 'actionConvention', 'channels', 'game', 'algorithm', 'weights', 'provenance', 'seedSplit', 'trainingVariant']);
  if (Object.keys(m).some(k => !allowed.has(k))) throw new Error('Unexpected model fields; executable layers and remote references are not supported');
  if (m.version !== MODEL_VERSION || m.observationVersion !== OBSERVATION_VERSION || m.actionConvention !== 'relative-left-straight-right') throw new Error('Unsupported model or observation version');
  if (!['dqn', 'double-dqn', 'ga'].includes(m.trainingVariant) || (m.algorithm === 'ga') !== (m.trainingVariant === 'ga')) throw new Error('Unsupported training variant');
  if (!m.seedSplit || m.seedSplit.trainingPolicy !== 'generated-excluding-held-out') throw new Error('Missing independent seed split metadata');
  const validationSeeds = validateSeeds(m.seedSplit.validationSeeds, 'validation seeds');
  const testSeeds = validateSeeds(m.seedSplit.testSeeds, 'test seeds');
  if (validationSeeds.some(s => testSeeds.includes(s))) throw new Error('Model seed split overlaps');
  if (m.algorithm !== 'dqn' && m.algorithm !== 'ga') throw new Error('Unsupported model algorithm');
  if (JSON.stringify(m.channels) !== JSON.stringify(['head', 'body', 'food', 'body-order', 'obstacle'])) throw new Error('Observation channel mismatch');
  if (!m.game || !Array.isArray(m.game.obstacles)) throw new Error('Missing game metadata');
  const game = normalizeConfig(m.game);
  const size = observationSize(game.width, game.height);
  if (parameterCount(size) > 250000 || JSON.stringify(m.architecture) !== JSON.stringify([size, 64, 64, 3])) throw new Error('Unsupported network architecture or size');
  if (!m.provenance || typeof m.provenance !== 'object') throw new Error('Missing model provenance');
  const p = m.provenance;
  finiteNumber(p.seed, 'seed', 0, 0xffffffff, true);
  for (const v of [p.samples, p.updates, p.generation]) finiteNumber(v, 'counter', 0, 100000000, true);
  if (p.validationMean !== null) finiteNumber(p.validationMean, 'validation mean', 0, game.width * game.height);
  return { ...m, game, weights: validateTensors(m.weights, networkShapes(size)), provenance: { ...p }, seedSplit: { trainingPolicy: 'generated-excluding-held-out', validationSeeds, testSeeds } };
}
export function parseFrozenModel(text: string): FrozenModel {
  if (new TextEncoder().encode(text).byteLength > MODEL_FILE_LIMIT) throw new Error('Model exceeds the 10 MiB import limit');
  return validateFrozenModel(JSON.parse(text) as unknown);
}
export function makeFrozenModel(game: GameConfig, algorithm: TrainingAlgorithm, weights: SerializedTensor[], provenance: FrozenModel['provenance'], seedSplit: FrozenModel['seedSplit'] = { trainingPolicy: 'generated-excluding-held-out', validationSeeds: [1800000001], testSeeds: [1900000001] }, trainingVariant: FrozenModel['trainingVariant'] = algorithm): FrozenModel {
  return { seedSplit: { ...seedSplit, validationSeeds: [...seedSplit.validationSeeds], testSeeds: [...seedSplit.testSeeds] }, trainingVariant, version: MODEL_VERSION, observationVersion: OBSERVATION_VERSION, architecture: [observationSize(game.width, game.height), 64, 64, 3], actionConvention: 'relative-left-straight-right', channels: ['head', 'body', 'food', 'body-order', 'obstacle'], game: { ...game, obstacles: [...game.obstacles] }, algorithm, weights: weights.map(w => ({ shape: [...w.shape], values: [...w.values] })), provenance: { ...provenance } };
}
export function forwardWeights(weights: readonly SerializedTensor[], input: ArrayLike<number>): number[] {
  let activation = Array.from(input);
  for (let layer = 0; layer < 3; layer++) {
    const kernel = weights[layer * 2]; const bias = weights[layer * 2 + 1];
    const output = [...bias.values];
    for (let i = 0; i < activation.length; i++) {
      const value = activation[i];
      if (value === 0) continue;
      for (let j = 0; j < output.length; j++) output[j] += value * kernel.values[i * output.length + j];
    }
    activation = layer === 2 ? output : output.map(v => Math.max(0, v));
  }
  if (activation.some(v => !Number.isFinite(v))) throw new Error('Non-finite network output');
  return activation;
}
export function argmax(values: ArrayLike<number>): 0 | 1 | 2 {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best as 0 | 1 | 2;
}
export function predictModel(model: FrozenModel, observation: Observation): { action: Direction; qValues: number[] } {
  if (model.game.width !== observation.config.width || model.game.height !== observation.config.height || JSON.stringify(model.game.obstacles) !== JSON.stringify(observation.config.obstacles)) throw new Error('Model and environment board/obstacles differ');
  const qValues = forwardWeights(model.weights, encodeObservation(observation));
  return { action: relativeAction(observation.direction, argmax(qValues)), qValues };
}
export function flattenWeights(weights: SerializedTensor[]): Float32Array { return Float32Array.from(weights.flatMap(w => w.values)); }
export function unflattenWeights(chromosome: Float32Array, inputSize: number): SerializedTensor[] {
  let offset = 0;
  return networkShapes(inputSize).map(shape => { const size = shape.reduce((a, b) => a * b, 1); const values = Array.from(chromosome.subarray(offset, offset + size)); offset += size; return { shape, values }; });
}

export function assertModelCompatible(model: FrozenModel, config: TrainingConfig): void {
  if (JSON.stringify(model.game) !== JSON.stringify(config.game) || model.algorithm !== config.algorithm || model.trainingVariant !== (config.algorithm === 'ga' ? 'ga' : config.dqn.doubleDQN ? 'double-dqn' : 'dqn') || JSON.stringify(model.seedSplit.validationSeeds) !== JSON.stringify(config.validationSeeds) || JSON.stringify(model.seedSplit.testSeeds) !== JSON.stringify(config.testSeeds)) throw new Error('Model metadata does not match training configuration');
}
