import { Game, relativeAction } from '../core';
import { BaseTrainer } from './base';
import { validateCheckpoint } from './checkpoint';
import { finiteNumber, makeTrainingConfig, observationSize, validateSeeds } from './config';
import { encodeObservation } from './encoding';
import { FrozenEvaluator } from './evaluation';
import { policyArgmax, flattenWeights, forwardWeights, initializeWeights, makeFrozenModel, parameterCount, unflattenWeights, validateFrozenModel } from './inference';
import { nextTrainingSeed, TrainingRandom } from './random';
import { decodeBytes, encodeBytes } from './replay';
import type { FitnessDistribution, FrozenModel, GACheckpoint, GAEvaluationState, GAConfig, SerializedTensor, TrainingConfigInput, TrainingMetrics } from './types';
function mean(values: number[]): number { return values.reduce((a, b) => a + b, 0) / (values.length || 1); }
export function fitnessDistribution(fitness: number[]): FitnessDistribution {
  const sorted = [...fitness].sort((a, b) => a - b), n = sorted.length;
  return { min: sorted[0], mean: mean(sorted), median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, max: sorted[n - 1], values: [...fitness] };
}
/** Filling dominates; bounded failure/efficiency tie-breaks provide no reward for idle survival. */
export function individualFitness(fills: number[], failures: number[], efficiencies: number[]): number { return mean(fills) * 1000 - mean(failures) * 0.1 + mean(efficiencies) * 0.01; }
export function breedPopulation(population: Float32Array[], fitness: number[], config: GAConfig, rng: TrainingRandom, mutableIndices?: ReadonlySet<number>): Float32Array[] {
  const ranking = population.map((_, i) => i).sort((a, b) => fitness[b] - fitness[a] || a - b);
  const next = ranking.slice(0, config.eliteCount).map(i => new Float32Array(population[i]));
  const tournament = (): number => {
    let best = rng.int(population.length);
    for (let i = 1; i < config.tournamentSize; i++) { const candidate = rng.int(population.length); if (fitness[candidate] > fitness[best] || (fitness[candidate] === fitness[best] && candidate < best)) best = candidate; }
    return best;
  };
  while (next.length < population.length) {
    const a = population[tournament()], b = population[tournament()], crossover = rng.next() < config.crossoverRate;
    const child = new Float32Array(a.length);
    for (let i = 0; i < child.length; i++) {
      if (mutableIndices && !mutableIndices.has(i)) { child[i] = a[i]; continue; }
      let value = crossover && rng.next() < 0.5 ? b[i] : a[i];
      if (rng.next() < config.mutationRate) value += rng.normal() * config.mutationStd;
      child[i] = Math.max(-1000000, Math.min(1000000, value));
    }
    next.push(child);
  }
  return next;
}
/** Fixed positive/negative feature basis; evolve 75 output coefficients instead of
 * searching thousands of hidden weights with a tiny browser population. */
export function initializeFeaturePolicy(rng: TrainingRandom): SerializedTensor[] {
  const weights = initializeWeights(12,rng);
  for (const tensor of weights.slice(0,4)) tensor.values.fill(0);
  for (let i=0;i<12;i++) { weights[0].values[i*64+i]=1; weights[0].values[i*64+i+12]=-1; }
  for (let i=0;i<24;i++) weights[2].values[i*64+i]=1;
  for (let i=24*3;i<64*3;i++) weights[4].values[i]=0;
  return weights;
}
export function featurePolicyGenes(): ReadonlySet<number> {
  const offset=12*64+64+64*64+64;
  return new Set([...Array.from({length:72},(_,i)=>offset+i), ...Array.from({length:3},(_,i)=>offset+192+i)]);
}
function emptyCurrent(): GAEvaluationState { return { member: 0, seedIndex: 0, scores: [], fills: [], failures: [], efficiencies: [], snapshot: null }; }
export class GATrainer extends BaseTrainer {
  population: Float32Array[]; fitness: (number | null)[]; trainingSeeds: number[];
  current: GAEvaluationState = emptyCurrent(); phase: 'population' | 'validation' | 'breed' = 'population';
  champion: FrozenModel | null = null; validation: FrozenEvaluator | null = null; distribution: FitnessDistribution | null = null;
  private readonly evolutionRng: TrainingRandom; private readonly environmentRng: TrainingRandom; private game: Game | null = null;
  private cachedWeights: SerializedTensor[] | null = null; private disposed = false;
  constructor(input: TrainingConfigInput = {}) {
    const config = makeTrainingConfig('ga', input); super(config);
    this.evolutionRng = new TrainingRandom(config.seed ^ 0xe6274cbf); this.environmentRng = new TrainingRandom(config.seed ^ 0x04a7799c);
    const initializationRng = new TrainingRandom(config.seed ^ 0x6a734321);
    const size = observationSize(config.game.width, config.game.height, config.profile);
    this.population = Array.from({ length: config.ga.populationSize }, () => flattenWeights(config.profile ? initializeFeaturePolicy(initializationRng) : initializeWeights(size, initializationRng)));
    this.fitness = Array.from({ length: config.ga.populationSize }, () => null); this.trainingSeeds = this.nextSeeds();
  }
  private nextSeeds(): number[] {
    const seeds: number[] = [];
    for (let i = 0; i < this.config.ga.episodesPerIndividual; i++) seeds.push(nextTrainingSeed(this.environmentRng, [...this.config.validationSeeds, ...this.config.testSeeds, ...seeds]));
    return seeds;
  }
  private memberModel(member: number): FrozenModel {
    return makeFrozenModel(this.config.game, 'ga', unflattenWeights(this.population[member], observationSize(this.config.game.width, this.config.game.height, this.config.profile)), { seed: this.config.seed, samples: this.counters.samples, updates: 0, generation: this.counters.generation, validationMean: null }, { trainingPolicy: 'generated-excluding-held-out', validationSeeds: this.config.validationSeeds, testSeeds: this.config.testSeeds }, 'ga', this.config.profile);
  }
  async advance(): Promise<boolean> {
    if (this.disposed || this.budgetReached()) return false;
    if (this.phase === 'validation') {
      if (!this.validation) throw new Error('Missing generation validation state');
      if (this.validation.tick()) { this.counters.envSteps++; this.counters.validationSteps++; }
      if (this.validation.done) {
        this.validationMean = this.validation.result('validation').meanScore;
        if (this.bestValidationMean === null || this.validationMean > this.bestValidationMean) {
          this.bestValidationMean = this.validationMean; this.bestModel = { ...this.validation.model, provenance: { ...this.validation.model.provenance, generation: this.counters.generation + 1, validationMean: this.validationMean } };
        }
        this.validation = null; this.counters.generation++; this.recordCurve(null);
        if (this.distribution) this.curve[this.curve.length - 1].distribution = { ...this.distribution, values: [...this.distribution.values] };
        this.phase = 'breed';
      }
      return true;
    }
    if (this.phase === 'breed') {
      this.population = breedPopulation(this.population, this.fitness as number[], this.config.ga, this.evolutionRng, this.config.profile ? featurePolicyGenes() : undefined);
      this.fitness = this.population.map(() => null); this.current = emptyCurrent(); this.game = null; this.cachedWeights = null;
      this.trainingSeeds = this.nextSeeds(); this.phase = 'population'; return true;
    }
    this.game ??= new Game(this.config.game, this.trainingSeeds[this.current.seedIndex]);
    this.cachedWeights ??= unflattenWeights(this.population[this.current.member], observationSize(this.config.game.width, this.config.game.height, this.config.profile));
    const observation = this.game.observe();
    const encoded = encodeObservation(observation, this.config.profile);
    const qValues = forwardWeights(this.cachedWeights, encoded);
    const step = this.game.step(relativeAction(observation.direction, policyArgmax(qValues, encoded, this.config.profile)));
    this.counters.envSteps++; this.counters.samples++;
    if (step.terminated || step.truncated) {
      const end = step.observation;
      this.recordEpisode(end.score); this.current.scores.push(end.score);
      this.current.fills.push(end.snake.length / (this.config.game.width * this.config.game.height - this.config.game.obstacles.length));
      this.current.failures.push(end.terminated && end.reason !== 'filled' ? 1 : 0);
      this.current.efficiencies.push(end.score / Math.max(1, end.steps));
      this.current.seedIndex++; this.game = null;
      if (this.current.seedIndex === this.trainingSeeds.length) {
        this.fitness[this.current.member] = individualFitness(this.current.fills, this.current.failures, this.current.efficiencies);
        const member = this.current.member + 1; this.current = { ...emptyCurrent(), member }; this.cachedWeights = null;
        if (member === this.population.length) {
          const fitness = this.fitness as number[];
          this.distribution = fitnessDistribution(fitness);
          let best = 0; for (let i = 1; i < fitness.length; i++) if (fitness[i] > fitness[best]) best = i;
          this.champion = this.memberModel(best); this.validation = new FrozenEvaluator(this.champion, this.config.validationSeeds); this.phase = 'validation';
        }
      }
    }
    return true;
  }
  exportModel(): FrozenModel { return this.bestModel ?? this.champion ?? this.memberModel(0); }
  metrics(): TrainingMetrics {
    return this.baseMetrics(this.validation?.game?.snapshot() ?? this.game?.snapshot() ?? null, { loss: null, epsilon: 0, backend: 'javascript', tensors: 0, tensorBytes: this.population.reduce((n, p) => n + p.byteLength, 0), estimatedReplayBytes: 0, distribution: this.distribution });
  }
  async checkpoint(): Promise<GACheckpoint> {
    return { ...this.commonCheckpoint({ environment: this.environmentRng.state, evolution: this.evolutionRng.state }), algorithm: 'ga', population: this.population.map(encodeBytes), fitness: [...this.fitness], trainingSeeds: [...this.trainingSeeds], current: { ...this.current, scores: [...this.current.scores], fills: [...this.current.fills], failures: [...this.current.failures], efficiencies: [...this.current.efficiencies], snapshot: this.game?.snapshot() ?? null }, validation: this.validation?.checkpoint() ?? null, distribution: this.distribution, phase: this.phase, champion: this.champion };
  }
  static restore(checkpoint: GACheckpoint): GATrainer {
    validateCheckpoint(checkpoint);
    if (checkpoint.algorithm !== 'ga') throw new Error('Not a GA checkpoint');
    const trainer = new GATrainer(checkpoint.config);
    try {
      trainer.restoreCommon(checkpoint);
      if (!Array.isArray(checkpoint.population) || checkpoint.population.length !== trainer.config.ga.populationSize) throw new Error('GA population mismatch');
      const count = parameterCount(observationSize(trainer.config.game.width, trainer.config.game.height, trainer.config.profile));
      trainer.population = checkpoint.population.map(encoded => {
        const chromosome = new Float32Array(decodeBytes(encoded, count * 4).buffer);
        for (const value of chromosome) finiteNumber(value, 'chromosome weight', -1000000, 1000000);
        return chromosome;
      });
      if (!Array.isArray(checkpoint.fitness) || checkpoint.fitness.length !== trainer.population.length) throw new Error('GA fitness mismatch');
      for (const value of checkpoint.fitness) if (value !== null) finiteNumber(value, 'fitness', -1, 1001);
      trainer.fitness = [...checkpoint.fitness]; trainer.trainingSeeds = validateSeeds(checkpoint.trainingSeeds);
      if (trainer.trainingSeeds.length !== trainer.config.ga.episodesPerIndividual || trainer.trainingSeeds.some(s => trainer.config.validationSeeds.includes(s) || trainer.config.testSeeds.includes(s))) throw new Error('GA seed split mismatch');
      finiteNumber(checkpoint.rng.environment, 'environment rng', 0, 0xffffffff, true); finiteNumber(checkpoint.rng.evolution, 'evolution rng', 0, 0xffffffff, true);
      trainer.environmentRng.state = checkpoint.rng.environment; trainer.evolutionRng.state = checkpoint.rng.evolution;
      if (!['population', 'validation', 'breed'].includes(checkpoint.phase)) throw new Error('Invalid GA phase');
      trainer.phase = checkpoint.phase;
      const c = checkpoint.current;
      finiteNumber(c.member, 'member index', 0, trainer.population.length, true);
      finiteNumber(c.seedIndex, 'seed index', 0, trainer.trainingSeeds.length - 1, true);
      for (const values of [c.scores, c.fills, c.failures, c.efficiencies]) if (!Array.isArray(values) || values.length !== c.seedIndex || values.some(v => !Number.isFinite(v))) throw new Error('Invalid partial GA fitness');
      const cells = trainer.config.game.width * trainer.config.game.height - trainer.config.game.obstacles.length;
      for (let i = 0; i < c.seedIndex; i++) {
        finiteNumber(c.scores[i], 'partial score', 0, cells - trainer.config.game.initialLength, true);
        finiteNumber(c.fills[i], 'partial fill', 0, 1); finiteNumber(c.failures[i], 'partial failure', 0, 1, true); finiteNumber(c.efficiencies[i], 'partial efficiency', 0, 1);
        if (Math.abs(c.fills[i] - (trainer.config.game.initialLength + c.scores[i]) / cells) > 1e-12 || (c.scores[i] === 0 && c.efficiencies[i] !== 0)) throw new Error('Partial GA statistics disagree');
      }
      if ((trainer.phase === 'population') !== (c.member < trainer.population.length)) throw new Error('GA phase/index mismatch');
      if (trainer.fitness.some((f, i) => (i < c.member) !== (f !== null))) throw new Error('GA completed member mismatch');
      trainer.current = { ...c, scores: [...c.scores], fills: [...c.fills], failures: [...c.failures], efficiencies: [...c.efficiencies] };
      if (c.snapshot) { trainer.game = new Game(trainer.config.game, trainer.trainingSeeds[c.seedIndex]); trainer.game.restore(c.snapshot); if (JSON.stringify(trainer.game.observe().config) !== JSON.stringify(trainer.config.game) || c.snapshot.seed !== trainer.trainingSeeds[c.seedIndex]) throw new Error('GA partial environment mismatch'); }
      if (checkpoint.validation) trainer.validation = new FrozenEvaluator(checkpoint.validation.model, trainer.config.validationSeeds, checkpoint.validation);
      if ((trainer.phase === 'validation') !== !!trainer.validation) throw new Error('GA validation phase mismatch');
      trainer.champion = checkpoint.champion ? validateFrozenModel(checkpoint.champion) : null;
      trainer.distribution = checkpoint.distribution;
      return trainer;
    } catch (error) { trainer.dispose(); throw error; }
  }
  dispose(): void { this.disposed = true; this.population = []; this.fitness = []; this.cachedWeights = null; this.game = null; this.validation = null; }
}
