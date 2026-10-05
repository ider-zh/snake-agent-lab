import { finiteNumber, REPLAY_MEMORY_LIMIT, replayBytes } from './config';
import type { ReplayCheckpoint } from './types';
import type { TrainingRandom } from './random';
export function encodeBytes(array: ArrayBufferView): string {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(chunks.join(''));
}
export function decodeBytes(value: string, byteLength: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length !== Math.ceil(byteLength / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid checkpoint binary array');
  const binary = atob(value);
  if (binary.length !== byteLength) throw new Error('Checkpoint byte length mismatch');
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export interface Transition { observation: Float32Array; nextObservation: Float32Array; action: number; reward: number; terminated: boolean; truncated: boolean }
export interface ReplayBatch { observations: Float32Array; nextObservations: Float32Array; actions: Int32Array; rewards: Float32Array; flags: Uint8Array }
export class ReplayBuffer {
  readonly capacity: number; readonly inputSize: number;
  size = 0; cursor = 0;
  private observations: Float32Array; private nextObservations: Float32Array;
  private actions: Uint8Array; private rewards: Float32Array; private flags: Uint8Array;
  constructor(capacity: number, inputSize: number) {
    finiteNumber(capacity, 'replay capacity', 1, 100000, true); finiteNumber(inputSize, 'replay input', 1, 100000, true);
    if (replayBytes(capacity, inputSize) > REPLAY_MEMORY_LIMIT) throw new Error('Replay memory cap exceeded');
    this.capacity = capacity; this.inputSize = inputSize;
    this.observations = new Float32Array(capacity * inputSize); this.nextObservations = new Float32Array(capacity * inputSize);
    this.actions = new Uint8Array(capacity); this.rewards = new Float32Array(capacity); this.flags = new Uint8Array(capacity);
  }
  push(t: Transition): void {
    if (t.observation.length !== this.inputSize || t.nextObservation.length !== this.inputSize) throw new Error('Replay observation shape mismatch');
    this.observations.set(t.observation, this.cursor * this.inputSize); this.nextObservations.set(t.nextObservation, this.cursor * this.inputSize);
    this.actions[this.cursor] = t.action; this.rewards[this.cursor] = t.reward; this.flags[this.cursor] = (t.terminated ? 1 : 0) | (t.truncated ? 2 : 0);
    this.cursor = (this.cursor + 1) % this.capacity; this.size = Math.min(this.size + 1, this.capacity);
  }
  sample(count: number, rng: TrainingRandom): ReplayBatch {
    if (this.size < count) throw new Error('Not enough replay samples');
    const batch = { observations: new Float32Array(count * this.inputSize), nextObservations: new Float32Array(count * this.inputSize), actions: new Int32Array(count), rewards: new Float32Array(count), flags: new Uint8Array(count) };
    for (let i = 0; i < count; i++) {
      const j = rng.int(this.size), offset = j * this.inputSize;
      batch.observations.set(this.observations.subarray(offset, offset + this.inputSize), i * this.inputSize);
      batch.nextObservations.set(this.nextObservations.subarray(offset, offset + this.inputSize), i * this.inputSize);
      batch.actions[i] = this.actions[j]; batch.rewards[i] = this.rewards[j]; batch.flags[i] = this.flags[j];
    }
    return batch;
  }
  checkpoint(): ReplayCheckpoint {
    const n = this.size;
    return { capacity: this.capacity, inputSize: this.inputSize, size: n, cursor: this.cursor, observations: encodeBytes(this.observations.subarray(0, n * this.inputSize)), nextObservations: encodeBytes(this.nextObservations.subarray(0, n * this.inputSize)), actions: encodeBytes(this.actions.subarray(0, n)), rewards: encodeBytes(this.rewards.subarray(0, n)), flags: encodeBytes(this.flags.subarray(0, n)) };
  }
  static restore(c: ReplayCheckpoint, capacity: number, inputSize: number, profile?: 'compact-v2'): ReplayBuffer {
    if (!c || c.capacity !== capacity || c.inputSize !== inputSize) throw new Error('Replay configuration mismatch');
    finiteNumber(c.size, 'replay size', 0, capacity, true); finiteNumber(c.cursor, 'replay cursor', 0, capacity - 1, true);
    if (c.size < capacity && c.cursor !== c.size) throw new Error('Invalid partial replay cursor');
    const observations = new Float32Array(decodeBytes(c.observations, c.size * inputSize * 4).buffer);
    const next = new Float32Array(decodeBytes(c.nextObservations, c.size * inputSize * 4).buffer);
    const actions = decodeBytes(c.actions, c.size); const flags = decodeBytes(c.flags, c.size);
    const rewards = new Float32Array(decodeBytes(c.rewards, c.size * 4).buffer);
    for (const array of [observations, next]) for (let i = 0; i < array.length; i++) finiteNumber(array[i], 'replay observation', profile && [3,4].includes(i % inputSize) ? -1 : 0, 1);
    for (const n of rewards) finiteNumber(n, 'replay reward', profile ? -10 : -1, profile ? 20 : 2);
    for (const n of actions) finiteNumber(n, 'replay action', 0, 2, true);
    for (const n of flags) finiteNumber(n, 'replay flags', 0, 2, true);
    const replay = new ReplayBuffer(capacity, inputSize);
    replay.observations.set(observations); replay.nextObservations.set(next); replay.actions.set(actions); replay.rewards.set(rewards); replay.flags.set(flags);
    replay.size = c.size; replay.cursor = c.cursor; return replay;
  }
  dispose(): void {
    this.observations = new Float32Array(0); this.nextObservations = new Float32Array(0);
    this.actions = new Uint8Array(0); this.rewards = new Float32Array(0); this.flags = new Uint8Array(0); this.size = 0;
  }
}
