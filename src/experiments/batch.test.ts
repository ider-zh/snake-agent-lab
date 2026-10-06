import { describe, expect, it } from 'vitest';
import { DEFAULT_SEEDS, createProtocols, escapeCSV, exportResultsCSV, exportResultsJSON, importResults, pairedComparison, percentile, runBatch, summarizeRows } from '../experiments';
import type { EpisodeRow } from '../experiments';

const deterministic = (rows: EpisodeRow[]) => rows.map(({agentId, seed, policySeed, score, length, steps, reason, finalHash, protocolId}) => ({agentId, seed, policySeed, score, length, steps, reason, finalHash, protocolId}));
const config = {width: 6, height: 6, maxSteps: 80, maxNoFood: 40};
const instantYield = async () => {};

describe('reproducible experiments', () => {
  it('repeats the common 100-seed protocol and exports independently recomputable rows', async () => {
    expect(DEFAULT_SEEDS).toHaveLength(100);
    const spec = {agents: ['random', 'legal-random'] as const, config, budget: {maxNodes: 10000, maxMs: 100}};
    const first = await runBatch({...spec, agents: [...spec.agents]}, {yieldControl: instantYield});
    const second = await runBatch({...spec, agents: [...spec.agents]}, {yieldControl: instantYield});
    expect(first.completedEpisodes).toBe(200);
    expect(deterministic(first.rows)).toEqual(deterministic(second.rows));
    expect(first.summaries).toEqual(summarizeRows(first.rows));
    expect(first.paired[0].pairs).toBe(100);
    const restored = importResults(exportResultsJSON(first));
    expect(restored.rows).toEqual(first.rows);
    expect(exportResultsCSV(first).split('\r\n')).toHaveLength(201);
    expect(first.metadata.rendering).toBe(false);
  });
  it('does not pair standard and Hamiltonian cycle initializations', async () => {
    const result = await runBatch({agents: ['greedy', 'hamiltonian'], seeds: [1, 2], config}, {yieldControl: instantYield});
    expect(result.protocols.map(p => p.initializationGroup)).toEqual(['standard', 'cycle']);
    expect(result.paired).toEqual([]);
    expect(pairedComparison(result.rows, 'greedy', 'hamiltonian', result.protocols[0].id)).toBeNull();
  });
  it('permits direct pairing only when every agent uses the same cycle initialization', async () => {
    const result = await runBatch({agents: ['greedy', 'hamiltonian'], seeds: [1, 2], config: {...config, initialization: 'cycle'}}, {yieldControl: instantYield});
    expect(result.protocols).toHaveLength(1);
    expect(result.paired[0].pairs).toBe(2);
  });
  it('cancels a running episode at a chunk boundary', async () => {
    const controller = new AbortController(); let yields = 0;
    const result = await runBatch({agents: ['hamiltonian'], seeds: [1, 2], config, chunkSteps: 2}, {
      signal: controller.signal,
      yieldControl: async () => { if (++yields === 2) controller.abort(); },
    });
    expect(result.status).toBe('cancelled');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].reason).toBe('cancelled');
    expect(result.rows[0].steps).toBeLessThanOrEqual(4);
    expect(result.completedEpisodes).toBe(0);
    expect(importResults(exportResultsJSON(result)).status).toBe('cancelled');
  });
  it('pauses without advancing the episode and resumes at the boundary', async () => {
    let paused = true, acknowledgements = 0, yields = 0;
    const result = await runBatch({agents: ['random'], seeds: [1], config}, {
      isPaused: () => paused,
      onPause: () => acknowledgements++,
      yieldControl: async () => { if (++yields === 3) paused = false; },
    });
    expect(acknowledgements).toBe(1);
    expect(result.status).toBe('completed');
    expect(result.completedEpisodes).toBe(1);
  });
  it('stops on a wall-clock budget without counting truncation as collision', async () => {
    let time = 0;
    const result = await runBatch({agents: ['hamiltonian'], seeds: [1, 2], config, maxWallMs: 20}, {now: () => ++time, yieldControl: instantYield});
    expect(result.status).toBe('wall-clock');
    expect(result.rows[0].truncated).toBe(true);
    expect(result.rows[0].terminated).toBe(false);
    expect(result.summaries[0].failureRate).toBe(0);
    expect(result.summaries[0].wallClockRate).toBe(1);
  });
  it('rejects invalid, unbounded and unfair protocols', () => {
    expect(() => createProtocols({agents: ['random'], seeds: [1, 1]})).toThrow(/unique/);
    expect(() => createProtocols({agents: ['random'], config: {width: 65}})).toThrow();
    expect(() => createProtocols({agents: ['random'], config: {maxSteps: 0}})).toThrow();
    expect(() => createProtocols({agents: ['random'], budget: {maxMs: Infinity}})).toThrow();
    expect(() => createProtocols({agents: ['hamiltonian'], config: {width: 7, height: 7}})).toThrow();
    expect(() => createProtocols({agents: Array(8).fill('random')})).toThrow();
  });
  it('validates raw result imports rather than trusting precomputed summaries', async () => {
    const result = await runBatch({agents: ['random'], seeds: [2], config}, {yieldControl: instantYield});
    const manipulated = structuredClone(result); manipulated.summaries[0].score.mean = 999;
    expect(importResults(JSON.stringify(manipulated)).summaries[0].score.mean).toBe(result.rows[0].score);
    manipulated.rows[0].seed = 500;
    expect(() => importResults(JSON.stringify(manipulated))).toThrow(/seed/);
    const duplicate = {...result, rows: [result.rows[0], result.rows[0]]};
    expect(() => importResults(JSON.stringify(duplicate))).toThrow(/Duplicate/);
    expect(() => importResults('{"version":"snake-experiments-v1","elapsedMs":1e999}')).toThrow(/finite/);
  });
});
describe('statistics and safe CSV', () => {
  it('interpolates quantiles and protects formula-looking strings', () => {
    expect(percentile([3, 1, 2, 4], .5)).toBe(2.5);
    expect(percentile([], .95)).toBe(0);
    expect(escapeCSV('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCSV('\t@malicious')).toBe("'\t@malicious");
    expect(escapeCSV('a,"b"')).toBe('"a,""b"""');
    expect(escapeCSV(-2)).toBe('-2');
  });
  it('reports zero-food efficiency as null instead of dividing by zero', async () => {
    const result = await runBatch({agents: ['random'], seeds: [1], config: {...config, maxSteps: 1}}, {yieldControl: instantYield});
    if (result.rows[0].score === 0) {
      expect(result.rows[0].stepsPerFood).toBeNull();
      expect(result.summaries[0].meanStepsPerFood).toBeNull();
      expect(result.summaries[0].zeroFoodEpisodes).toBe(1);
    }
  });
});
