import type { AgentId } from '../core/types';
import { assertKeys, assertRecord, finiteInteger, parseBoundedJSON, validateJSONData } from '../storage/validation';
import { createProtocols, MAX_BATCH_EPISODES, MAX_DECISION_SAMPLES } from './batch';
import { allPairedComparisons, summarizeRows } from './statistics';
import { EXPERIMENT_VERSION } from './types';
import type { BatchResult, EpisodeRow, ExperimentProtocol } from './types';

const AGENTS = ['random', 'legal-random', 'greedy', 'safe-greedy', 'bfs', 'astar', 'hamiltonian', 'hamiltonian-shortcut', 'tail-safe', 'dijkstra', 'best-first', 'beam', 'mcts'];
function finite(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} is out of range`);
  return value;
}
function bool(value: unknown, name: string): void { if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`); }
export function validateResults(value: unknown): BatchResult {
  validateJSONData(value);
  assertRecord(value, 'Results');
  assertKeys(value, ['version', 'status', 'protocols', 'rows', 'summaries', 'paired', 'plannedEpisodes', 'completedEpisodes', 'elapsedMs', 'metadata'], 'Results');
  if (value.version !== EXPERIMENT_VERSION || !['completed', 'cancelled', 'wall-clock'].includes(String(value.status))) throw new Error('Unsupported result version or status');
  if (!Array.isArray(value.protocols) || !value.protocols.length || value.protocols.length > 2) throw new Error('Results need one or two protocol groups');
  const protocols = value.protocols.map((input: unknown) => {
    assertRecord(input, 'Protocol');
    assertKeys(input, ['id', 'version', 'coreVersion', 'config', 'seeds', 'budget', 'initializationGroup', 'warmupDecisions', 'latencySampleLimit', 'fallback'], 'Protocol');
    if (input.version !== EXPERIMENT_VERSION || input.coreVersion !== 'snake-core-v1') throw new Error('Unsupported protocol version');
    assertRecord(input.config, 'Protocol config');
    assertKeys(input.config, ['width', 'height', 'initialLength', 'initialization', 'obstacles', 'maxSteps', 'maxNoFood'], 'Protocol config');
    assertRecord(input.budget, 'Protocol budget');
    assertKeys(input.budget, ['maxNodes', 'maxMs'], 'Protocol budget');
    if (!Array.isArray(input.seeds)) throw new Error('Protocol seeds must be an array');
    const protocol = input as unknown as ExperimentProtocol;
    const expected = createProtocols({agents: ['random'], config: protocol.config, seeds: protocol.seeds, budget: protocol.budget})[0];
    for (const key of ['width', 'height', 'initialLength', 'initialization', 'maxSteps', 'maxNoFood'] as const) if (protocol.config[key] !== expected.config[key]) throw new Error(`Protocol config is not canonical: ${key}`);
    if (JSON.stringify(protocol) !== JSON.stringify(expected)) {
      // Property ordering is not part of JSON data equality.
      for (const key of ['id', 'version', 'coreVersion', 'initializationGroup', 'warmupDecisions', 'latencySampleLimit', 'fallback'] as const) if (protocol[key] !== expected[key]) throw new Error(`Protocol ${key} is inconsistent`);
      if (JSON.stringify(protocol.config.obstacles) !== JSON.stringify(expected.config.obstacles)) throw new Error('Protocol obstacles are not canonical');
    }
    return expected;
  });
  if (new Set(protocols.map(p => p.id)).size !== protocols.length) throw new Error('Duplicate protocols');
  if (!Array.isArray(value.rows) || value.rows.length > MAX_BATCH_EPISODES) throw new Error('Invalid result rows');
  if (!Array.isArray(value.summaries) || !Array.isArray(value.paired)) throw new Error('Result summaries and paired comparisons must be arrays');
  const seen = new Set<string>();
  const rows = value.rows.map((input: unknown) => {
    assertRecord(input, 'Episode row');
    assertKeys(input, ['protocolId','initializationGroup','agentId','seed','policySeed','score','length','availableCells','fillRate','steps','terminated','truncated','reason','success','finalHash','elapsedMs','decisionCount','measuredDecisionCount','decisionLatencyMeanMs','decisionLatencyP50Ms','decisionLatencyP95Ms','decisionLatenciesMs','latencySamplesDropped','timeoutCount','fallbackCount','fallbackDecisionMs','timeoutDecisionMs','expandedNodes','stepsPerFood'], 'Episode row');
    const row = input as unknown as EpisodeRow;
    const protocol = protocols.find(p => p.id === row.protocolId);
    if (!protocol || protocol.initializationGroup !== row.initializationGroup || !AGENTS.includes(row.agentId)) throw new Error('Row does not match its protocol');
    finiteInteger(row.seed, 'Row seed', 0, 0xffffffff);
    if (!protocol.seeds.includes(row.seed)) throw new Error('Row seed is not part of the protocol');
    if (row.policySeed !== ((row.seed ^ 0x9e3779b9) >>> 0)) throw new Error('Row policy seed is inconsistent');
    const key = `${row.protocolId}:${row.agentId}:${row.seed}`;
    if (seen.has(key)) throw new Error('Duplicate agent/seed result'); seen.add(key);
    const area = protocol.config.width * protocol.config.height - protocol.config.obstacles.length;
    finiteInteger(row.score, 'Score', 0, area - protocol.config.initialLength);
    finiteInteger(row.length, 'Length', 1, area);
    if (row.length !== row.score + protocol.config.initialLength || row.availableCells !== area || row.fillRate !== row.length / area) throw new Error('Row occupancy metrics are inconsistent');
    finiteInteger(row.steps, 'Steps', 0, protocol.config.maxSteps);
    finiteInteger(row.decisionCount, 'Decision count', 0, protocol.config.maxSteps);
    if (row.decisionCount !== row.steps) throw new Error('Step and decision counts differ');
    finiteInteger(row.measuredDecisionCount, 'Measured decisions', 0, row.decisionCount);
    if (row.measuredDecisionCount !== Math.max(0, row.decisionCount - protocol.warmupDecisions)) throw new Error('Warmup count is inconsistent');
    for (const key of ['terminated', 'truncated', 'success'] as const) bool(row[key], key);
    if (row.terminated && row.truncated) throw new Error('Episode cannot be both terminated and truncated');
    const terminal = ['wall', 'body', 'obstacle', 'filled'].includes(row.reason ?? '');
    const truncated = ['step-limit', 'no-progress', 'wall-clock', 'cancelled'].includes(row.reason ?? '');
    if (row.terminated !== terminal || row.truncated !== truncated || (!terminal && !truncated) || row.success !== (row.reason === 'filled')) throw new Error('Episode end flags are inconsistent');
    if (row.success !== (row.length === area)) throw new Error('Filled status is inconsistent');
    if (typeof row.finalHash !== 'string' || !/^[a-f0-9]{8}$/i.test(row.finalHash)) throw new Error('Invalid final state hash');
    for (const key of ['elapsedMs', 'decisionLatencyMeanMs', 'decisionLatencyP50Ms', 'decisionLatencyP95Ms', 'fallbackDecisionMs', 'timeoutDecisionMs'] as const) finite(row[key], key);
    for (const key of ['timeoutCount', 'fallbackCount'] as const) finiteInteger(row[key], key, 0, row.decisionCount);
    finiteInteger(row.expandedNodes, 'Expanded nodes', 0, row.decisionCount * protocol.budget.maxNodes);
    if (!Array.isArray(row.decisionLatenciesMs) || row.decisionLatenciesMs.length !== Math.min(row.measuredDecisionCount, MAX_DECISION_SAMPLES)) throw new Error('Too many latency samples');
    row.decisionLatenciesMs.forEach(latency => finite(latency, 'Decision latency'));
    if (row.latencySamplesDropped !== row.measuredDecisionCount - row.decisionLatenciesMs.length || row.latencySamplesDropped < 0) throw new Error('Latency sample count is inconsistent');
    if (row.stepsPerFood !== (row.score ? row.steps / row.score : null)) throw new Error('Food efficiency is inconsistent');
    if (row.agentId.startsWith('hamiltonian') && row.initializationGroup !== 'cycle') throw new Error('Hamiltonian must use cycle initialization');
    return row;
  });
  finiteInteger(value.plannedEpisodes, 'Planned episodes', rows.length, MAX_BATCH_EPISODES);
  const completed = rows.filter(row => row.reason !== 'cancelled' && row.reason !== 'wall-clock').length;
  if (value.completedEpisodes !== completed || (value.status === 'completed' && value.plannedEpisodes !== completed)) throw new Error('Completed episode count is inconsistent');
  finite(value.elapsedMs, 'Elapsed time');
  assertRecord(value.metadata, 'Result metadata');
  assertKeys(value.metadata, ['userAgent', 'rendering', 'worker', 'timing'], 'Result metadata');
  if (typeof value.metadata.userAgent !== 'string' || value.metadata.userAgent.length > 4096 || typeof value.metadata.timing !== 'string' || value.metadata.timing.length > 4096 || value.metadata.rendering !== false || typeof value.metadata.worker !== 'boolean') throw new Error('Invalid result metadata');
  // Aggregate values are derived from validated raw rows, never trusted from the file.
  const result = value as unknown as BatchResult;
  return structuredClone({...result, protocols, rows, summaries: summarizeRows(rows), paired: allPairedComparisons(rows)});
}
export function importResults(json: string): BatchResult { return validateResults(parseBoundedJSON(json)); }
export function resultAgentIds(result: BatchResult): AgentId[] { return [...new Set(result.rows.map(row => row.agentId))]; }
