import { Game, normalizeConfig } from '../core';
import type { Direction, GameConfig, Snapshot } from '../core/types';
import { assertKeys, assertRecord, finiteInteger, parseBoundedJSON, stringifyBoundedJSON, validateJSONData } from './validation';

export const REPLAY_VERSION = 'snake-replay-v1' as const;
export const MAX_REPLAY_STEPS = 50000;
export interface ReplayRecord {
  version: typeof REPLAY_VERSION;
  coreVersion: 'snake-core-v1';
  config: GameConfig;
  seed: number;
  actions: Direction[];
  /** hashes[0] is the reset state; hashes[n] is the state after n actions. */
  hashes: string[];
  label?: string;
}
export interface CreateReplayInput { config: Partial<GameConfig>; seed: number; actions: readonly Direction[]; label?: string; }
export function validateReplay(value: unknown, verifyHashes = true): ReplayRecord {
  validateJSONData(value);
  assertRecord(value, 'Replay');
  assertKeys(value, ['version', 'coreVersion', 'config', 'seed', 'actions', 'hashes', 'label'], 'Replay');
  if (value.version !== REPLAY_VERSION || value.coreVersion !== 'snake-core-v1') throw new Error('Unsupported replay/core version');
  finiteInteger(value.seed, 'Replay seed', 0, 0xffffffff);
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 200)) throw new Error('Replay label must be at most 200 characters');
  assertRecord(value.config, 'Replay config');
  assertKeys(value.config, ['width', 'height', 'initialLength', 'initialization', 'obstacles', 'maxSteps', 'maxNoFood'], 'Replay config');
  const width = finiteInteger(value.config.width, 'Width', 1, 64);
  const height = finiteInteger(value.config.height, 'Height', 1, 64);
  finiteInteger(value.config.initialLength, 'Initial length', 1, width * height);
  finiteInteger(value.config.maxSteps, 'Step budget', 0, 100000000);
  finiteInteger(value.config.maxNoFood, 'No-food budget', 0, 100000000);
  if (value.config.initialization !== 'standard' && value.config.initialization !== 'cycle') throw new Error('Unsupported initialization');
  if (!Array.isArray(value.config.obstacles) || value.config.obstacles.length > width * height) throw new Error('Invalid obstacle list');
  value.config.obstacles.forEach((cell: unknown) => finiteInteger(cell, 'Obstacle cell', 0, width * height - 1));
  if (new Set(value.config.obstacles).size !== value.config.obstacles.length) throw new Error('Duplicate obstacle cells');
  if (!Array.isArray(value.actions) || value.actions.length > MAX_REPLAY_STEPS) throw new Error(`Replay must have at most ${MAX_REPLAY_STEPS} actions`);
  value.actions.forEach((action: unknown) => finiteInteger(action, 'Action', 0, 3));
  if (!Array.isArray(value.hashes) || value.hashes.length !== value.actions.length + 1 || value.hashes.some((hash: unknown) => typeof hash !== 'string' || !/^[a-f0-9]{8,64}$/i.test(hash))) throw new Error('Replay must contain a valid hash for the reset state and each action');
  const replay = value as unknown as ReplayRecord;
  const normalized = normalizeConfig(replay.config);
  for (const key of ['width', 'height', 'initialLength', 'initialization', 'maxSteps', 'maxNoFood'] as const) if (normalized[key] !== replay.config[key]) throw new Error(`Replay config is not canonical: ${key}`);
  if (verifyHashes) replayGame(replay, replay.actions.length);
  return structuredClone(replay);
}
function replayGame(replay: ReplayRecord, step: number): Game {
  const game = new Game(replay.config, replay.seed);
  if (game.hash() !== replay.hashes[0]) throw new Error('Replay hash mismatch at initial state');
  for (let i = 0; i < step; i++) {
    if (game.observe().terminated || game.observe().truncated) throw new Error(`Replay has actions after terminal state at step ${i}`);
    game.step(replay.actions[i]);
    if (game.hash() !== replay.hashes[i + 1]) throw new Error(`Replay hash mismatch at step ${i + 1}`);
  }
  return game;
}
export function seekReplay(replay: ReplayRecord, step: number): Snapshot {
  finiteInteger(step, 'Replay step', 0, replay.actions.length);
  return replayGame(replay, step).snapshot();
}
export function importReplay(json: string): ReplayRecord { return validateReplay(parseBoundedJSON(json)); }
export function exportReplay(replay: ReplayRecord): string { return stringifyBoundedJSON(validateReplay(replay), true); }
export class ReplayRecorder {
  private game: Game;
  private readonly actions: Direction[] = [];
  private readonly hashes: string[];
  constructor(config: Partial<GameConfig>, private readonly seed: number) {
    finiteInteger(seed, 'Replay seed', 0, 0xffffffff);
    this.game = new Game(config, seed);
    this.hashes = [this.game.hash()];
  }
  append(action: Direction, expectedHash?: string): void {
    finiteInteger(action, 'Action', 0, 3);
    if (this.actions.length >= MAX_REPLAY_STEPS) throw new Error(`Replay recording limit reached (${MAX_REPLAY_STEPS} steps)`);
    if (this.game.observe().terminated || this.game.observe().truncated) throw new Error('Cannot record an action after the terminal state');
    const before = expectedHash ? this.game.snapshot() : undefined;
    this.game.step(action);
    if (expectedHash && this.game.hash() !== expectedHash) {
      this.game.restore(before!);
      throw new Error(`Recorded state hash mismatch at step ${this.actions.length + 1}`);
    }
    this.actions.push(action); this.hashes.push(this.game.hash());
  }
  finish(label?: string): ReplayRecord {
    if (label !== undefined && (typeof label !== 'string' || label.length > 200)) throw new Error('Replay label must be at most 200 characters');
    return {version: REPLAY_VERSION, coreVersion: 'snake-core-v1', config: structuredClone(this.game.observe().config), seed: this.seed, actions: [...this.actions], hashes: [...this.hashes], ...(label === undefined ? {} : {label})};
  }
}
export function createReplay(input: CreateReplayInput): ReplayRecord {
  if (!Array.isArray(input.actions) || input.actions.length > MAX_REPLAY_STEPS) throw new Error(`Replay must have at most ${MAX_REPLAY_STEPS} actions`);
  const recorder = new ReplayRecorder(input.config, input.seed);
  for (const action of input.actions) recorder.append(action);
  return recorder.finish(input.label);
}
