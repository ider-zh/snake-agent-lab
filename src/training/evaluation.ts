import { Game } from '../core';
import type { Observation } from '../core/types';
import { finiteNumber, validateSeeds } from './config';
import { predictModel, validateFrozenModel } from './inference';
import type { EvaluationEpisode, EvaluationResult, FrozenModel, ValidationState } from './types';
export function episodeResult(observation: Observation, seed: number): EvaluationEpisode {
  return { seed, score: observation.score, fill: observation.snake.length / (observation.config.width * observation.config.height - observation.config.obstacles.length), steps: observation.steps, terminated: observation.terminated, truncated: observation.truncated, reason: observation.reason };
}
export function summarizeEvaluation(episodes: EvaluationEpisode[], seeds: number[], split: 'validation' | 'test' | 'external', cancelled = false): EvaluationResult {
  const n = episodes.length || 1;
  return { modelVersion: 'snake-mlp-v1', split, seeds: [...seeds], episodes: [...episodes], meanScore: episodes.reduce((s, e) => s + e.score, 0) / n, meanFill: episodes.reduce((s, e) => s + e.fill, 0) / n, successRate: episodes.filter(e => e.reason === 'filled').length / n, collisionRate: episodes.filter(e => ['wall', 'body', 'obstacle'].includes(e.reason ?? '')).length / n, truncationRate: episodes.filter(e => e.truncated).length / n, envSteps: episodes.reduce((s, e) => s + e.steps, 0), cancelled };
}
/** One environment step per tick, so pause/checkpoint also works inside validation. */
export class FrozenEvaluator {
  readonly model: FrozenModel; readonly seeds: number[]; readonly episodes: EvaluationEpisode[] = [];
  index = 0; game: Game | null = null;
  constructor(model: FrozenModel, seeds: number[], checkpoint?: ValidationState) {
    this.model = validateFrozenModel(model); this.seeds = validateSeeds(seeds);
    if (!this.model.game.maxSteps || !this.model.game.maxNoFood) throw new Error('Frozen evaluation requires finite episode limits');
    if (checkpoint) {
      if (JSON.stringify(checkpoint.seeds) !== JSON.stringify(this.seeds)) throw new Error('Validation checkpoint seed list mismatch');
      if (!Array.isArray(checkpoint.episodes)) throw new Error('Missing validation episode records');
      if (checkpoint.index < 0 || checkpoint.index > seeds.length || !Number.isInteger(checkpoint.index) || checkpoint.episodes.length !== checkpoint.index) throw new Error('Invalid validation index');
      const cells = this.model.game.width * this.model.game.height - this.model.game.obstacles.length;
      for (const [index, episode] of checkpoint.episodes.entries()) {
        if (episode.seed !== this.seeds[index]) throw new Error('Validation episode seed mismatch');
        finiteNumber(episode.score, 'validation episode score', 0, cells - this.model.game.initialLength, true);
        finiteNumber(episode.fill, 'validation episode fill', 0, 1);
        finiteNumber(episode.steps, 'validation episode steps', 0, this.model.game.maxSteps, true);
        if (Math.abs(episode.fill - (this.model.game.initialLength + episode.score) / cells) > 1e-12 || episode.score > episode.steps || (episode.steps === 0 && episode.fill !== 1)) throw new Error('Validation episode statistics disagree');
        if (typeof episode.terminated !== 'boolean' || typeof episode.truncated !== 'boolean' || episode.terminated === episode.truncated) throw new Error('Validation episode end flags invalid');
        if (episode.terminated ? !['wall', 'body', 'obstacle', 'filled'].includes(episode.reason ?? '') : !['step-limit', 'no-progress'].includes(episode.reason ?? '')) throw new Error('Validation episode end reason invalid');
        if ((episode.reason === 'filled') !== (episode.fill === 1) || (episode.reason === 'step-limit' && episode.steps !== this.model.game.maxSteps) || (episode.reason === 'no-progress' && episode.steps < this.model.game.maxNoFood)) throw new Error('Validation episode termination mismatch');
      }
      this.index = checkpoint.index; this.episodes.push(...checkpoint.episodes.map(e => ({ ...e }))); 
      if (checkpoint.snapshot) {
        if (this.index >= this.seeds.length || checkpoint.snapshot.seed !== this.seeds[this.index] || checkpoint.snapshot.terminated || checkpoint.snapshot.truncated) throw new Error('Validation snapshot seed or active state mismatch');
        this.game = new Game(this.model.game, seeds[this.index]); this.game.restore(checkpoint.snapshot); if (JSON.stringify(this.game.observe().config) !== JSON.stringify(this.model.game)) throw new Error('Validation game mismatch'); }
    }
  }
  get done(): boolean { return this.index >= this.seeds.length; }
  tick(): boolean {
    if (this.done) return false;
    this.game ??= new Game(this.model.game, this.seeds[this.index]);
    const observation = this.game.observe();
    if (observation.terminated || observation.truncated) { this.finish(observation); return false; }
    const step = this.game.step(predictModel(this.model, observation).action);
    if (step.terminated || step.truncated) this.finish(step.observation);
    return true;
  }
  private finish(observation: Observation): void { this.episodes.push(episodeResult(observation, this.seeds[this.index])); this.index++; this.game = null; }
  checkpoint(): ValidationState { return { model: this.model, seeds: [...this.seeds], index: this.index, episodes: [...this.episodes], snapshot: this.game?.snapshot() ?? null }; }
  result(split: 'validation' | 'test' = 'test', cancelled = false): EvaluationResult { const declared = split === 'test' && !this.seeds.every(s => this.model.seedSplit.testSeeds.includes(s)) ? 'external' : split; return summarizeEvaluation(this.episodes, this.seeds, declared, cancelled); }
}
export async function evaluateFrozenModel(model: FrozenModel, seeds: number[], shouldCancel: () => boolean = () => false): Promise<EvaluationResult> {
  const evaluator = new FrozenEvaluator(model, seeds);
  while (!evaluator.done && !shouldCancel()) {
    const start = performance.now();
    for (let i = 0; i < 32 && !evaluator.done && performance.now() - start < 16; i++) evaluator.tick();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return evaluator.result('test', !evaluator.done);
}
