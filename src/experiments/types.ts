import type { AgentId, EndReason, GameConfig, Snapshot } from '../core/types';

export const EXPERIMENT_VERSION = 'snake-experiments-v1' as const;
export interface DecisionBudget { maxNodes: number; maxMs: number; }
export interface BatchSpec {
  agents: AgentId[];
  seeds?: number[];
  config?: Partial<GameConfig>;
  budget?: Partial<DecisionBudget>;
  maxWallMs?: number;
  chunkSteps?: number;
}
export interface ExperimentProtocol {
  id: string;
  version: typeof EXPERIMENT_VERSION;
  coreVersion: 'snake-core-v1';
  config: GameConfig;
  seeds: number[];
  budget: DecisionBudget;
  initializationGroup: 'standard' | 'cycle';
  warmupDecisions: number;
  latencySampleLimit: number;
  fallback: 'agent-safe-fallback';
}
export interface EpisodeRow {
  protocolId: string;
  initializationGroup: 'standard' | 'cycle';
  agentId: AgentId;
  seed: number;
  policySeed: number;
  score: number;
  length: number;
  availableCells: number;
  fillRate: number;
  steps: number;
  terminated: boolean;
  truncated: boolean;
  reason: EndReason | 'wall-clock' | 'cancelled';
  success: boolean;
  finalHash: string;
  elapsedMs: number;
  decisionCount: number;
  measuredDecisionCount: number;
  decisionLatencyMeanMs: number;
  decisionLatencyP50Ms: number;
  decisionLatencyP95Ms: number;
  decisionLatenciesMs: number[];
  latencySamplesDropped: number;
  timeoutCount: number;
  fallbackCount: number;
  fallbackDecisionMs: number;
  timeoutDecisionMs: number;
  expandedNodes: number;
  stepsPerFood: number | null;
}
export interface Distribution { mean: number; median: number; p50: number; p95: number; min: number; max: number; }
export interface ExperimentSummary {
  agentId: AgentId;
  protocolId: string;
  initializationGroup: 'standard' | 'cycle';
  episodes: number;
  score: Distribution;
  fillRate: Distribution;
  steps: Distribution;
  successRate: number;
  failureRate: number;
  truncationRate: number;
  wallCollisionRate: number;
  bodyCollisionRate: number;
  noProgressRate: number;
  stepLimitRate: number;
  wallClockRate: number;
  zeroFoodEpisodes: number;
  meanStepsPerFood: number | null;
  decisions: number;
  decisionLatencyMeanMs: number;
  decisionLatencyP50Ms: number;
  decisionLatencyP95Ms: number;
  latencyPercentilesSampled: boolean;
  timeoutCount: number;
  fallbackCount: number;
  fallbackDecisionMs: number;
  timeoutDecisionMs: number;
  expandedNodes: number;
}
export interface PairedComparison {
  protocolId: string;
  agentA: AgentId;
  agentB: AgentId;
  metric: 'score';
  pairs: number;
  meanDifference: number;
  ci95: [number, number] | null;
  method: 'paired-student-t';
}
export interface BatchResult {
  version: typeof EXPERIMENT_VERSION;
  status: 'completed' | 'cancelled' | 'wall-clock';
  protocols: ExperimentProtocol[];
  rows: EpisodeRow[];
  summaries: ExperimentSummary[];
  paired: PairedComparison[];
  plannedEpisodes: number;
  completedEpisodes: number;
  elapsedMs: number;
  metadata: { userAgent: string; rendering: false; worker: boolean; timing: string; };
}
export interface BatchProgress { completed: number; total: number; row: EpisodeRow; }
export interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  onSnapshot?: (snapshot: {agentId: AgentId; seed: number; snapshot: Snapshot}) => void;
  isPaused?: () => boolean;
  onPause?: () => void;
  now?: () => number;
  yieldControl?: () => Promise<void>;
}
export type BatchWorkerRequest =
  | { type: 'start'; jobId: string; configVersion: typeof EXPERIMENT_VERSION; spec: BatchSpec }
  | { type: 'pause' | 'resume' | 'cancel'; jobId: string; configVersion: typeof EXPERIMENT_VERSION };
interface EventBase { jobId: string; configVersion: typeof EXPERIMENT_VERSION; seq: number; }
export type BatchWorkerEvent = EventBase & (
  | ({type: 'progress'} & BatchProgress)
  | {type: 'snapshot'; agentId: AgentId; seed: number; snapshot: Snapshot}
  | {type: 'paused' | 'resumed'}
  | {type: 'completed' | 'cancelled'; result: BatchResult}
  | {type: 'error'; message: string}
);
