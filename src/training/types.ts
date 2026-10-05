import type { GameConfig, Snapshot } from '../core/types';

export const TRAINING_VERSION = 'snake-training-v1' as const;
export const OBSERVATION_VERSION = 'board-five-channels-v1' as const;
export const MODEL_VERSION = 'snake-mlp-v1' as const;
export type TrainingAlgorithm = 'dqn' | 'ga';
export interface TrainingBudget { maxEnvSteps: number; maxWallMs: number; maxGenerations: number }
export interface DQNConfig {
  learningRate: number; gamma: number; batchSize: number; replayCapacity: number; warmup: number;
  trainEvery: number; targetEvery: number; epsilonStart: number; epsilonEnd: number;
  epsilonDecaySteps: number; doubleDQN: boolean; bootstrapTruncated: boolean; validationEvery: number;
}
export interface GAConfig {
  populationSize: number; eliteCount: number; tournamentSize: number; episodesPerIndividual: number;
  mutationRate: number; mutationStd: number; crossoverRate: number;
}
export interface TrainingConfig {
  version: typeof TRAINING_VERSION; algorithm: TrainingAlgorithm; seed: number; game: GameConfig;
  budget: TrainingBudget; dqn: DQNConfig; ga: GAConfig;
  validationSeeds: number[]; testSeeds: number[]; rewardVersion: 'food1-collision-1-step-.001-filled1-v1';
}
export interface TrainingConfigInput {
  seed?: number; game?: Partial<GameConfig>; budget?: Partial<TrainingBudget>;
  dqn?: Partial<DQNConfig>; ga?: Partial<GAConfig>; validationSeeds?: number[]; testSeeds?: number[];
}
export interface CurvePoint {
  samples: number; generation: number; meanScore: number; bestScore: number;
  loss: number | null; validationMean: number | null;
  distribution?: FitnessDistribution;
}
export interface FitnessDistribution { min: number; mean: number; median: number; max: number; values: number[] }
export interface TrainingMetrics {
  algorithm: TrainingAlgorithm; envSteps: number; samples: number; validationSteps: number;
  episodes: number; updates: number; generation: number; epsilon: number; loss: number | null;
  meanScore: number; bestScore: number; elapsedMs: number; backend: 'cpu' | 'javascript';
  tensors: number; tensorBytes: number; estimatedReplayBytes: number;
  curve: CurvePoint[]; distribution: FitnessDistribution | null; snapshot: Snapshot | null;
  stopReason: string | null; validationMean: number | null;
}
/** Only fixed, known MLP tensors are accepted. No layers, executable code, or remote references. */
export interface SerializedTensor { shape: number[]; values: number[] }
export interface FrozenModel {
  version: typeof MODEL_VERSION; observationVersion: typeof OBSERVATION_VERSION;
  architecture: [number, 64, 64, 3]; actionConvention: 'relative-left-straight-right';
  channels: ['head', 'body', 'food', 'body-order', 'obstacle'];
  game: GameConfig; algorithm: TrainingAlgorithm; weights: SerializedTensor[];
  seedSplit: { trainingPolicy: 'generated-excluding-held-out'; validationSeeds: number[]; testSeeds: number[] };
  trainingVariant: 'dqn' | 'double-dqn' | 'ga';
  provenance: { seed: number; samples: number; updates: number; generation: number; validationMean: number | null };
}
export interface EvaluationEpisode {
  seed: number; score: number; fill: number; steps: number; terminated: boolean; truncated: boolean; reason: string | null;
}
export interface EvaluationResult {
  modelVersion: typeof MODEL_VERSION; split: 'validation' | 'test' | 'external'; seeds: number[];
  episodes: EvaluationEpisode[]; meanScore: number; meanFill: number; successRate: number;
  collisionRate: number; truncationRate: number; envSteps: number; cancelled: boolean;
}
export interface CommonCheckpoint {
  version: typeof TRAINING_VERSION; config: TrainingConfig; elapsedMs: number;
  counters: { envSteps: number; samples: number; validationSteps: number; episodes: number; updates: number; generation: number };
  scoreHistory: number[]; bestScore: number; curve: CurvePoint[]; validationMean: number | null;
  bestModel: FrozenModel | null; bestValidationMean: number | null; rng: Record<string, number>;
}
export interface ReplayCheckpoint {
  capacity: number; inputSize: number; size: number; cursor: number;
  observations: string; nextObservations: string; actions: string; rewards: string; flags: string;
}
export interface ValidationState {
  model: FrozenModel; seeds: number[]; index: number; episodes: EvaluationEpisode[]; snapshot: Snapshot | null;
}
export interface DQNCheckpoint extends CommonCheckpoint {
  algorithm: 'dqn'; online: SerializedTensor[]; target: SerializedTensor[];
  optimizer: { name: string; tensor: SerializedTensor }[]; replay: ReplayCheckpoint;
  environment: Snapshot; episodeSeed: number; loss: number | null; validation: ValidationState | null;
  lastValidationAt: number;
}
export interface GAEvaluationState {
  member: number; seedIndex: number; scores: number[]; fills: number[]; failures: number[]; efficiencies: number[];
  snapshot: Snapshot | null;
}
export interface GACheckpoint extends CommonCheckpoint {
  algorithm: 'ga'; population: string[]; fitness: (number | null)[]; trainingSeeds: number[];
  current: GAEvaluationState; validation: ValidationState | null; distribution: FitnessDistribution | null;
  phase: 'population' | 'validation' | 'breed'; champion: FrozenModel | null;
}
export type TrainingCheckpoint = DQNCheckpoint | GACheckpoint;
export type TrainingCommand =
  | { type: 'start'; jobId: string; algorithm: TrainingAlgorithm; config?: TrainingConfigInput }
  | { type: 'pause' | 'resume' | 'cancel' | 'checkpoint' | 'export-model'; jobId: string }
  | { type: 'import'; jobId: string; checkpoint: TrainingCheckpoint }
  | { type: 'evaluate'; jobId: string; model: FrozenModel; seeds?: number[] };
export type TrainingStatus = 'initializing' | 'running' | 'paused' | 'cancelled' | 'completed';
export type TrainingEvent = { jobId: string; schemaVersion: 1; sequence: number } & (
  | { type: 'status'; status: TrainingStatus; reason?: string }
  | { type: 'progress'; metrics: TrainingMetrics }
  | { type: 'checkpoint'; checkpoint: TrainingCheckpoint }
  | { type: 'model'; model: FrozenModel }
  | { type: 'evaluation'; result: EvaluationResult }
  | { type: 'error'; message: string }
);
