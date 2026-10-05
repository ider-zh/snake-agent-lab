import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core';
import { createAgent } from '../agents';
import { createReplay, exportReplay, importReplay, MAX_IMPORT_BYTES, parseBoundedJSON, ReplayRecorder, saveRecord, seekReplay, stringifyBoundedJSON, validateJSONData } from '../storage';
import type { Direction } from '../core';

const config = {width: 6, height: 6, maxSteps: 50, maxNoFood: 40};
afterEach(() => { vi.unstubAllGlobals(); });
describe('versioned verified replay', () => {
  it('round-trips every action hash and seeks to the exact state without running a policy', () => {
    const game = new Game(config, 456), agent = createAgent('legal-random', 99), actions: Direction[] = [], hashes = [game.hash()];
    for (let i = 0; i < 20 && !game.observe().terminated && !game.observe().truncated; i++) {
      const action = agent.decide(game.observe()).action; actions.push(action); game.step(action); hashes.push(game.hash());
    }
    const replay = createReplay({config, seed: 456, actions, label: 'Unit test'});
    expect(replay.hashes).toEqual(hashes);
    const imported = importReplay(exportReplay(replay));
    expect(imported).toEqual(replay);
    expect(seekReplay(imported, actions.length)).toEqual(game.snapshot());
    expect(seekReplay(imported, 0).steps).toBe(0);
  });
  it('rejects tampered hashes, actions, versions and oversized imports', () => {
    const replay = createReplay({config, seed: 3, actions: [0]});
    expect(() => importReplay(JSON.stringify({...replay, hashes: ['deadbeef', replay.hashes[1]]}))).toThrow(/hash mismatch/);
    expect(() => importReplay(JSON.stringify({...replay, actions: [4]}))).toThrow(/Action/);
    expect(() => importReplay(JSON.stringify({...replay, version: 'unknown'}))).toThrow(/version/);
    expect(() => importReplay(JSON.stringify({...replay, config: {...replay.config, width: 65}}))).toThrow(/Width/);
    expect(() => importReplay(JSON.stringify({...replay, execute: 'javascript:evil'}))).toThrow(/unsupported/);
    expect(() => importReplay(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow(/10 MB/);
    expect(() => seekReplay(replay, 2)).toThrow(/Replay step/);
  });
  it('rolls back failed recorder verification and refuses terminal overrun', () => {
    const recorder = new ReplayRecorder({...config, maxSteps: 1}, 3);
    expect(() => recorder.append(0, 'deadbeef')).toThrow(/mismatch/);
    expect(recorder.finish().actions).toHaveLength(0);
    recorder.append(0);
    expect(() => recorder.append(1)).toThrow(/terminal/);
    expect(importReplay(exportReplay(recorder.finish())).actions).toEqual([0]);
  });
  it('supports the core single-cell board with an already filled reset state', () => {
    const replay = createReplay({config: {width: 1, height: 1, initialLength: 1}, seed: 1, actions: []});
    expect(importReplay(exportReplay(replay))).toEqual(replay);
    expect(seekReplay(replay, 0).reason).toBe('filled');
  });
});
describe('bounded honest storage', () => {
  it('rejects unsafe or non-JSON payloads', () => {
    expect(() => parseBoundedJSON('{"__proto__":{"polluted":true}}')).toThrow(/Unsafe/);
    expect(() => parseBoundedJSON('{"n":1e999}')).toThrow(/finite/);
    expect(() => stringifyBoundedJSON({n: NaN})).toThrow(/finite/);
    expect(() => validateJSONData({run: () => 1})).toThrow(/JSON/);
    expect(() => validateJSONData({weights: new Float32Array(2)})).toThrow(/plain object/);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => validateJSONData(circular)).toThrow(/cycle/);
  });
  it('does not claim an in-memory fallback is persistent storage', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(saveRecord('checkpoint', 'sample', {version: 'checkpoint-v1', weights: [1, 2]})).rejects.toMatchObject({reason: 'unavailable'});
  });
  it('gives actionable quota errors without reporting save success', async () => {
    vi.stubGlobal('indexedDB', {open: () => {
      const request: {error: DOMException; onerror?: () => void} = {error: new DOMException('No space', 'QuotaExceededError')};
      queueMicrotask(() => request.onerror?.()); return request;
    }});
    await expect(saveRecord('checkpoint', 'sample', {version: 'checkpoint-v1', weights: [1, 2]})).rejects.toMatchObject({reason: 'quota', message: expect.stringContaining('Nothing was saved')});
  });
});
