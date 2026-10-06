export type Direction = 0 | 1 | 2 | 3;
export type EndReason = 'wall' | 'body' | 'obstacle' | 'filled' | 'step-limit' | 'no-progress' | null;
export interface GameConfig {
  width: number; height: number; initialLength: number;
  initialization: 'standard' | 'cycle'; obstacles: number[];
  maxSteps: number; maxNoFood: number;
}
export interface Observation {
  config: GameConfig; snake: readonly number[]; food: number | null; direction: Direction;
  score: number; steps: number; noFood: number; terminated: boolean; truncated: boolean; reason: EndReason;
}
export interface Snapshot extends Observation { version: 'snake-core-v1'; seed: number; rngState: number; }
export interface StepResult { observation: Observation; reward: number; events: string[]; terminated: boolean; truncated: boolean; }
export type AgentId = 'random' | 'legal-random' | 'greedy' | 'safe-greedy' | 'bfs' | 'astar' | 'hamiltonian' | 'hamiltonian-shortcut' | 'tail-safe' | 'dijkstra' | 'best-first' | 'beam' | 'mcts';
export interface SearchNode { cell: number; g: number; h: number; f: number; }
export interface SearchFrame { current: SearchNode; frontier: SearchNode[]; visited: number[]; }
export interface DebugInfo { path: number[]; visited: number[]; expanded: number; fallback?: string; elapsedMs: number; trace?: SearchFrame[]; traceTruncated?: boolean; planning?: {kind:'beam'|'mcts';iterations:number;maxDepth:number;roots:{action:Direction;visits:number;mean:number}[]}; }
export interface Decision { action: Direction; debug: DebugInfo; }
export interface Agent { id: AgentId; decide(observation: Observation): Decision; }
