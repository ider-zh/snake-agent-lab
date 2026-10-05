import type { AgentId } from '../core/types';
import type { Distribution, EpisodeRow, ExperimentSummary, PairedComparison } from './types';

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, quantile)) * (sorted.length - 1);
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}
export function distribution(values: readonly number[]): Distribution {
  if (!values.length) return {mean: 0, median: 0, p50: 0, p95: 0, min: 0, max: 0};
  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, .5);
  return {mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, median, p50: median, p95: percentile(sorted, .95), min: sorted[0], max: sorted[sorted.length - 1]};
}
export function summarizeRows(rows: readonly EpisodeRow[]): ExperimentSummary[] {
  const groups = new Map<string, EpisodeRow[]>();
  for (const row of rows) {
    const key = `${row.protocolId}:${row.agentId}`;
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const first = group[0];
    const rate = (predicate: (row: EpisodeRow) => boolean) => group.filter(predicate).length / group.length;
    const sum = (key: 'decisionCount' | 'measuredDecisionCount' | 'timeoutCount' | 'fallbackCount' | 'fallbackDecisionMs' | 'timeoutDecisionMs' | 'expandedNodes') => group.reduce((n, row) => n + row[key], 0);
    const samples = group.flatMap(row => row.decisionLatenciesMs);
    const efficiencies = group.flatMap(row => row.stepsPerFood === null ? [] : [row.stepsPerFood]);
    return {
      agentId: first.agentId, protocolId: first.protocolId, initializationGroup: first.initializationGroup,
      episodes: group.length, score: distribution(group.map(r => r.score)), fillRate: distribution(group.map(r => r.fillRate)), steps: distribution(group.map(r => r.steps)),
      successRate: rate(r => r.success), failureRate: rate(r => r.terminated && !r.success), truncationRate: rate(r => r.truncated),
      wallCollisionRate: rate(r => r.reason === 'wall'), bodyCollisionRate: rate(r => r.reason === 'body' || r.reason === 'obstacle'),
      noProgressRate: rate(r => r.reason === 'no-progress'), stepLimitRate: rate(r => r.reason === 'step-limit'), wallClockRate: rate(r => r.reason === 'wall-clock'),
      zeroFoodEpisodes: group.filter(r => r.score === 0).length,
      meanStepsPerFood: efficiencies.length ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length : null,
      decisions: sum('decisionCount'), decisionLatencyMeanMs: sum('measuredDecisionCount') ? group.reduce((total, row) => total + row.decisionLatencyMeanMs * row.measuredDecisionCount, 0) / sum('measuredDecisionCount') : 0,
      decisionLatencyP50Ms: percentile(samples, .5), decisionLatencyP95Ms: percentile(samples, .95),
      latencyPercentilesSampled: group.some(r => r.latencySamplesDropped > 0), timeoutCount: sum('timeoutCount'), fallbackCount: sum('fallbackCount'), fallbackDecisionMs: sum('fallbackDecisionMs'), timeoutDecisionMs: sum('timeoutDecisionMs'), expandedNodes: sum('expandedNodes'),
    };
  });
}
// Two-sided Student t critical values: finite sample correction is important for short cancelled runs.
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
export function pairedComparison(rows: readonly EpisodeRow[], agentA: AgentId, agentB: AgentId, protocolId: string): PairedComparison | null {
  if (agentA === agentB) return null;
  const select = (agent: AgentId) => rows.filter(r => r.protocolId === protocolId && r.agentId === agent && r.reason !== 'cancelled' && r.reason !== 'wall-clock');
  const a = select(agentA), b = new Map(select(agentB).map(row => [row.seed, row]));
  const differences = a.flatMap(row => b.has(row.seed) ? [row.score - b.get(row.seed)!.score] : []);
  if (!differences.length) return null;
  const meanDifference = differences.reduce((x, y) => x + y, 0) / differences.length;
  let ci95: [number, number] | null = null;
  if (differences.length > 1) {
    const df = differences.length - 1;
    const variance = differences.reduce((sum, diff) => sum + (diff - meanDifference) ** 2, 0) / df;
    const t = df <= 30 ? T95[df] : df <= 60 ? 2.042 : df <= 120 ? 2 : 1.98;
    const width = t * Math.sqrt(variance / differences.length);
    ci95 = [meanDifference - width, meanDifference + width];
  }
  return {protocolId, agentA, agentB, metric: 'score', pairs: differences.length, meanDifference, ci95, method: 'paired-student-t'};
}
export function allPairedComparisons(rows: readonly EpisodeRow[]): PairedComparison[] {
  const comparisons: PairedComparison[] = [];
  for (const protocolId of new Set(rows.map(row => row.protocolId))) {
    const agents = [...new Set(rows.filter(row => row.protocolId === protocolId).map(row => row.agentId))];
    for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
      const comparison = pairedComparison(rows, agents[i], agents[j], protocolId);
      if (comparison) comparisons.push(comparison);
    }
  }
  return comparisons;
}
