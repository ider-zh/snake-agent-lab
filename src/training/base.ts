import type { Snapshot } from '../core/types';
import { finiteNumber, makeTrainingConfig } from './config';
import { assertModelCompatible, validateFrozenModel } from './inference';
import { TRAINING_VERSION, type CommonCheckpoint, type CurvePoint, type FitnessDistribution, type FrozenModel, type TrainingCheckpoint, type TrainingConfig, type TrainingMetrics } from './types';
export interface Trainer {
  readonly config: TrainingConfig; readonly stopReason: string | null;
  advance(): Promise<boolean>; metrics(): TrainingMetrics; checkpoint(): Promise<TrainingCheckpoint>;
  exportModel(): FrozenModel; pause(): void; resume(): void; dispose(): void;
}
export abstract class BaseTrainer implements Trainer {
  readonly config: TrainingConfig;
  counters = { envSteps: 0, samples: 0, validationSteps: 0, episodes: 0, updates: 0, generation: 0 };
  scoreHistory: number[] = []; bestScore = 0; curve: CurvePoint[] = [];
  validationMean: number | null = null; bestValidationMean: number | null = null; bestModel: FrozenModel | null = null;
  stopReason: string | null = null;
  protected savedElapsed = 0; private started = performance.now(); private paused = false;
  constructor(config: TrainingConfig) { this.config = config; }
  get elapsedMs(): number { return this.savedElapsed + (this.paused ? 0 : performance.now() - this.started); }
  pause(): void { if (!this.paused) { this.savedElapsed = this.elapsedMs; this.paused = true; } }
  resume(): void { if (this.paused) { this.started = performance.now(); this.paused = false; } }
  protected budgetReached(): boolean {
    if (this.counters.envSteps >= this.config.budget.maxEnvSteps) this.stopReason = 'environment-step budget';
    else if (this.elapsedMs >= this.config.budget.maxWallMs) this.stopReason = 'wall-clock budget';
    else if (this.config.algorithm === 'ga' && this.counters.generation >= this.config.budget.maxGenerations) this.stopReason = 'generation budget';
    return this.stopReason !== null;
  }
  protected recordEpisode(score: number): void { this.counters.episodes++; this.scoreHistory.push(score); if (this.scoreHistory.length > 100) this.scoreHistory.shift(); this.bestScore = Math.max(this.bestScore, score); }
  protected recordCurve(loss: number | null): void {
    this.curve.push({ samples: this.counters.samples, generation: this.counters.generation, meanScore: this.meanScore, bestScore: this.bestScore, loss, validationMean: this.validationMean });
    if (this.curve.length > 500) this.curve.splice(0, this.curve.length - 500);
  }
  get meanScore(): number { return this.scoreHistory.reduce((sum, score) => sum + score, 0) / (this.scoreHistory.length || 1); }
  protected commonCheckpoint(rng: Record<string, number>): CommonCheckpoint {
    return { version: TRAINING_VERSION, config: this.config, elapsedMs: this.elapsedMs, counters: { ...this.counters }, scoreHistory: [...this.scoreHistory], bestScore: this.bestScore, curve: [...this.curve], validationMean: this.validationMean, bestModel: this.bestModel, bestValidationMean: this.bestValidationMean, rng };
  }
  protected restoreCommon(c: CommonCheckpoint): void {
    if (c.version !== TRAINING_VERSION || c.config.version !== TRAINING_VERSION || c.config.rewardVersion !== this.config.rewardVersion) throw new Error('Incompatible training/reward version');
    const normalized = makeTrainingConfig(c.config.algorithm, c.config);
    if (JSON.stringify(normalized) !== JSON.stringify(this.config)) throw new Error('Checkpoint configuration mismatch');
    finiteNumber(c.elapsedMs, 'elapsedMs', 0, 86400000 * 2);
    for (const key of Object.keys(this.counters) as (keyof typeof this.counters)[]) finiteNumber(c.counters[key], key, 0, 100000000, true);
    if (c.counters.envSteps !== c.counters.samples + c.counters.validationSteps) throw new Error('Checkpoint step counters disagree');
    if (!Array.isArray(c.scoreHistory) || c.scoreHistory.length > 100 || !Array.isArray(c.curve) || c.curve.length > 500) throw new Error('Invalid checkpoint history');
    c.scoreHistory.forEach(v => finiteNumber(v, 'episode score', 0, this.config.game.width * this.config.game.height, true));
    finiteNumber(c.bestScore, 'best score', 0, this.config.game.width * this.config.game.height);
    for (const v of [c.validationMean, c.bestValidationMean]) if (v !== null) finiteNumber(v, 'validation mean', 0, this.config.game.width * this.config.game.height);
    this.counters = { ...c.counters }; this.savedElapsed = c.elapsedMs; this.started = performance.now();
    this.scoreHistory = [...c.scoreHistory]; this.bestScore = c.bestScore; this.curve = [...c.curve]; this.validationMean = c.validationMean; this.bestValidationMean = c.bestValidationMean;
    this.bestModel = c.bestModel ? validateFrozenModel(c.bestModel) : null;
    if (this.bestModel) { assertModelCompatible(this.bestModel, this.config); if (this.bestModel.provenance.validationMean !== this.bestValidationMean) throw new Error('Best model validation score mismatch'); }
  }
  protected baseMetrics(snapshot: Snapshot | null, extras: { loss: number | null; epsilon: number; backend: 'cpu' | 'javascript'; tensors: number; tensorBytes: number; estimatedReplayBytes: number; distribution: FitnessDistribution | null }): TrainingMetrics {
    return { algorithm: this.config.algorithm, ...this.counters, meanScore: this.meanScore, bestScore: this.bestScore, elapsedMs: this.elapsedMs, curve: [...this.curve], validationMean: this.validationMean, snapshot, stopReason: this.stopReason, ...extras };
  }
  abstract advance(): Promise<boolean>;
  abstract metrics(): TrainingMetrics;
  abstract checkpoint(): Promise<TrainingCheckpoint>;
  abstract exportModel(): FrozenModel;
  abstract dispose(): void;
}
