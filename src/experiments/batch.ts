import { Game, normalizeConfig } from '../core';
import { createAgent } from '../agents';
import type { AgentId } from '../core/types';
import { allPairedComparisons, percentile, summarizeRows } from './statistics';
import { EXPERIMENT_VERSION } from './types';
import type { BatchOptions, BatchResult, BatchSpec, DecisionBudget, EpisodeRow, ExperimentProtocol } from './types';

export const DEFAULT_SEEDS: readonly number[] = Object.freeze(Array.from({length: 100}, (_, i) => 10001 + i));
export const MAX_BATCH_EPISODES = 700;
export const MAX_DECISION_SAMPLES = 512;
export const WARMUP_DECISIONS = 5;
const AGENTS: AgentId[] = ['random', 'legal-random', 'greedy', 'safe-greedy', 'bfs', 'astar', 'hamiltonian', 'hamiltonian-shortcut', 'tail-safe', 'dijkstra', 'best-first', 'beam', 'mcts'];
const delay = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const clock = () => globalThis.performance?.now() ?? Date.now();
function integer(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function createProtocols(spec: BatchSpec): ExperimentProtocol[] {
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.agents) || !spec.agents.length || spec.agents.some(id => !AGENTS.includes(id))) throw new Error('Choose at least one supported agent');
  if (new Set(spec.agents).size !== spec.agents.length) throw new Error('Agent IDs must be unique');
  const seeds = spec.seeds ? [...spec.seeds] : [...DEFAULT_SEEDS];
  if (!seeds.length || seeds.length > 1000 || seeds.length * spec.agents.length > MAX_BATCH_EPISODES) throw new Error(`Batch is limited to ${MAX_BATCH_EPISODES} episodes`);
  seeds.forEach(seed => integer(seed, 'Seed', 0, 0xffffffff));
  if (new Set(seeds).size !== seeds.length) throw new Error('Seeds must be unique for paired evaluation');
  const budget: DecisionBudget = {maxNodes: spec.budget?.maxNodes ?? 10000, maxMs: spec.budget?.maxMs ?? 20};
  integer(budget.maxNodes, 'Node budget', 1, 100000);
  if (!Number.isFinite(budget.maxMs) || budget.maxMs < .1 || budget.maxMs > 100) throw new Error('Decision time budget must be between 0.1 and 100 ms');
  const base = normalizeConfig({...spec.config, maxSteps: spec.config?.maxSteps ?? 5000, maxNoFood: spec.config?.maxNoFood ?? 500});
  integer(base.maxSteps, 'Episode step budget', 1, 250000);
  integer(base.maxNoFood, 'No-food step budget', 1, 50000);
  const groups = new Set(spec.agents.map(id => id.startsWith('hamiltonian') ? 'cycle' as const : base.initialization));
  return [...groups].map(initializationGroup => {
    const config = normalizeConfig({...base, initialization: initializationGroup});
    if (initializationGroup === 'cycle' && (config.obstacles.length || config.width < 2 || config.height < 2 || (config.width % 2 && config.height % 2))) throw new Error('Cycle initialization requires an obstacle-free rectangle with at least one even side');
    const definition = {version: EXPERIMENT_VERSION, coreVersion: 'snake-core-v1' as const, config, seeds, budget, initializationGroup, warmupDecisions: WARMUP_DECISIONS, latencySampleLimit: MAX_DECISION_SAMPLES, fallback: 'agent-safe-fallback' as const};
    return {id: `eval-${hashText(JSON.stringify(definition))}`, ...definition};
  });
}
function boundedSamples(values: number[], max: number): number[] {
  if (values.length <= max) return values;
  // Equally spaced samples retain the entire episode rather than only its beginning.
  return Array.from({length: max}, (_, index) => values[Math.floor(index * (values.length - 1) / (max - 1))]);
}

export async function runBatch(spec: BatchSpec, options: BatchOptions = {}): Promise<BatchResult> {
  const protocols = createProtocols(spec);
  const seeds = protocols[0].seeds;
  const rows: EpisodeRow[] = [];
  const now = options.now ?? clock;
  const yieldControl = options.yieldControl ?? delay;
  const chunkSteps = integer(spec.chunkSteps ?? 32, 'Chunk steps', 1, 128);
  const wallLimit = spec.maxWallMs ?? 300000;
  if (!Number.isFinite(wallLimit) || wallLimit < 1 || wallLimit > 3600000) throw new Error('Wall-clock budget must be between 1 ms and one hour');
  const started = now();
  let pausedMs = 0;
  let status: BatchResult['status'] = 'completed';
  const total = seeds.length * spec.agents.length;
  const baseInitialization = spec.config?.initialization ?? 'standard';
  const wallTime = () => now() - started - pausedMs;
  const checkpoint = async () => {
    if (options.signal?.aborted) return;
    if (options.isPaused?.()) {
      const startPause = now();
      options.onPause?.();
      while (options.isPaused?.() && !options.signal?.aborted) await yieldControl();
      pausedMs += now() - startPause;
    }
  };
  outer: for (const seed of seeds) for (const agentId of spec.agents) {
    await checkpoint();
    if (options.signal?.aborted) { status = 'cancelled'; break outer; }
    if (wallTime() >= wallLimit) { status = 'wall-clock'; break outer; }
    const group = agentId.startsWith('hamiltonian') ? 'cycle' : baseInitialization;
    const protocol = protocols.find(item => item.initializationGroup === group)!;
    const game = new Game(protocol.config, seed);
    const policySeed = (seed ^ 0x9e3779b9) >>> 0;
    const agent = createAgent(agentId, policySeed, protocol.budget);
    const episodeStarted = now();
    const latencies: number[] = [];
    let decisions = 0, timeouts = 0, fallbacks = 0, expanded = 0, fallbackDecisionMs = 0, timeoutDecisionMs = 0;
    let forcedReason: 'cancelled' | 'wall-clock' | undefined;
    let chunkStart = now();
    let chunkCount = 0;
    while (!game.observe().terminated && !game.observe().truncated) {
      if (options.signal?.aborted) { forcedReason = 'cancelled'; status = 'cancelled'; break; }
      if (wallTime() >= wallLimit) { forcedReason = 'wall-clock'; status = 'wall-clock'; break; }
      const startDecision = now();
      const decision = agent.decide(game.observe());
      const latency = Math.max(0, now() - startDecision);
      decisions++;
      if (decisions > WARMUP_DECISIONS) latencies.push(latency);
      if (decision.debug.fallback) { fallbacks++; fallbackDecisionMs += latency; }
      if (latency > protocol.budget.maxMs || /time/i.test(decision.debug.fallback ?? '')) { timeouts++; timeoutDecisionMs += latency; }
      expanded += decision.debug.expanded;
      game.step(decision.action);
      chunkCount++;
      if (chunkCount >= chunkSteps || now() - chunkStart >= 12) {
        await yieldControl();
        await checkpoint();
        chunkCount = 0; chunkStart = now();
      }
    }
    const observation = game.observe();
    const samples = boundedSamples(latencies, MAX_DECISION_SAMPLES);
    const row: EpisodeRow = {
      protocolId: protocol.id, initializationGroup: protocol.initializationGroup, agentId, seed, policySeed,
      score: observation.score, length: observation.snake.length, availableCells: protocol.config.width * protocol.config.height - protocol.config.obstacles.length,
      fillRate: observation.snake.length / (protocol.config.width * protocol.config.height - protocol.config.obstacles.length),
      steps: observation.steps, terminated: observation.terminated, truncated: observation.truncated || !!forcedReason, reason: forcedReason ?? observation.reason,
      success: observation.reason === 'filled', finalHash: game.hash(), elapsedMs: Math.max(0, now() - episodeStarted),
      decisionCount: decisions, measuredDecisionCount: latencies.length,
      decisionLatencyMeanMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      decisionLatencyP50Ms: percentile(latencies, .5), decisionLatencyP95Ms: percentile(latencies, .95),
      decisionLatenciesMs: samples, latencySamplesDropped: latencies.length - samples.length,
      timeoutCount: timeouts, fallbackCount: fallbacks, fallbackDecisionMs, timeoutDecisionMs, expandedNodes: expanded,
      stepsPerFood: observation.score ? observation.steps / observation.score : null,
    };
    rows.push(row);
    options.onProgress?.({completed: rows.length, total, row});
    if (rows.length === 1 || rows.length % 10 === 0 || rows.length === total || forcedReason) options.onSnapshot?.({agentId, seed, snapshot: game.snapshot()});
    await yieldControl();
    if (forcedReason) break outer;
  }
  // A cancellation arriving after the final chunk still takes precedence over a completion report.
  if (options.signal?.aborted) status = 'cancelled';
  return {
    version: EXPERIMENT_VERSION, status, protocols, rows, summaries: summarizeRows(rows), paired: allPairedComparisons(rows),
    plannedEpisodes: total, completedEpisodes: rows.filter(row => row.reason !== 'cancelled' && row.reason !== 'wall-clock').length,
    elapsedMs: Math.max(0, now() - started),
    metadata: {userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless', rendering: false, worker: typeof document === 'undefined' && typeof self !== 'undefined', timing: 'Decision wall latency excludes first 5 decisions; row p50/p95 use all measured decisions. Raw logs hold at most 512 evenly spaced samples per episode; summary percentiles use these samples. Pauses excluded from overall wall budget.'},
  };
}
