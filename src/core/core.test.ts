import { describe, expect, it } from 'vitest';
import { cycle, DEFAULT_CONFIG, Game, legalActions, moveCell, normalizeConfig, relativeAction, SeededRandom } from './index';
import type { Direction, GameConfig, Snapshot } from './types';

function arranged(snake: number[], food: number, direction: Direction, extra: Partial<GameConfig> = {}): Game {
  const config = { width: 4, height: 4, initialLength: snake.length, maxSteps: 0, maxNoFood: 0, ...extra };
  const game = new Game(config, 42);
  game.restore({ ...game.snapshot(), snake, food, direction });
  return game;
}

describe('seeded random stream', () => {
  it('is reproducible, supports zero state, and resumes exactly', () => {
    const a = new SeededRandom(0), b = new SeededRandom(0);
    expect(Array.from({ length: 100 }, () => a.next())).toEqual(Array.from({ length: 100 }, () => b.next()));
    const state = a.state, expected = a.next(); a.state = state; expect(a.next()).toBe(expected);
    a.state = 0; expect(a.next()).toBe(new SeededRandom(0).next());
  });
  it('has bounded samples and covers small integer ranges', () => {
    const rng = new SeededRandom(73), buckets = Array<number>(5).fill(0);
    for (let i = 0; i < 10_000; i++) buckets[rng.int(5)]++;
    for (const count of buckets) expect(count).toBeGreaterThan(1700);
    expect(() => rng.int(0)).toThrow(); expect(() => new SeededRandom(NaN)).toThrow(); expect(() => { rng.state = -1; }).toThrow();
  });
});

describe('configuration and geometry', () => {
  it('copies, sorts, and deduplicates obstacles without mutating defaults', () => {
    const obstacles = [4, 0, 4]; const c = normalizeConfig({ obstacles }); obstacles.push(6);
    expect(c.obstacles).toEqual([0, 4]); expect(DEFAULT_CONFIG.obstacles).toEqual([]);
    expect(() => normalizeConfig({ width: 65 })).toThrow(); expect(() => normalizeConfig({ width: 1.5 })).toThrow();
    expect(() => normalizeConfig({ obstacles: [144] })).toThrow(); expect(() => normalizeConfig({ maxSteps: -1 })).toThrow();
    expect(() => normalizeConfig({ width: 3, height: 3, initialization: 'cycle' })).toThrow();
    expect(() => normalizeConfig({ initialization: 'cycle', obstacles: [0] })).toThrow();
  });
  it('has relative left/straight/right and no row wrapping', () => {
    for (const d of [0, 1, 2, 3] as Direction[]) expect([0, 1, 2].map(i => relativeAction(d, i))).toEqual([(d + 3) % 4, d, (d + 1) % 4]);
    expect(moveCell(3, 1, 4, 4)).toBe(-1); expect(moveCell(4, 3, 4, 4)).toBe(-1); expect(moveCell(4, 0, 4, 4)).toBe(0);
  });
  it('constructs complete adjacent Hamiltonian cycles for both orientations', () => {
    for (let width = 2; width <= 12; width++) for (let height = 2; height <= 12; height++) {
      if (width % 2 && height % 2) { expect(() => cycle(width, height)).toThrow(); continue; }
      const route = cycle(width, height); expect(route).toHaveLength(width * height); expect(new Set(route).size).toBe(width * height);
      route.forEach((cell, i) => {
        const next = route[(i + 1) % route.length];
        expect(Math.abs(cell % width - next % width) + Math.abs(Math.floor(cell / width) - Math.floor(next / width))).toBe(1);
      });
    }
  });
});

describe('shared step semantics', () => {
  it('continues forward for reverse and invalid inputs and records the event', () => {
    const game = arranged([5, 4, 0], 15, 1);
    const result = game.step(3); expect(result.events).toContain('illegal-action'); expect(result.observation.snake).toEqual([6, 5, 4]);
    const invalid = game.step(17 as Direction); expect(invalid.events).toContain('illegal-action'); expect(invalid.observation.snake[0]).toBe(7);
  });
  it('allows a released tail cell but disallows other occupied cells', () => {
    const game = arranged([5, 6, 10, 9], 0, 3);
    expect(legalActions(game.observe())).toContain(2);
    expect(game.step(2).observation.snake).toEqual([9, 5, 6, 10]);
    const collision = arranged([5, 6, 10, 9, 8, 4], 0, 3).step(2);
    expect(collision.observation.reason).toBe('body'); expect(collision.reward).toBe(-1);
  });
  it('grows, scores and spawns only on free cells', () => {
    const game = arranged([5, 4, 0], 6, 1); const result = game.step(1);
    expect(result.observation.snake).toEqual([6, 5, 4, 0]); expect(result.observation.score).toBe(1);
    expect(result.events).toEqual(['eat']); expect(result.reward).toBe(1); expect(result.observation.snake).not.toContain(result.observation.food);
  });
  it('distinguishes walls and obstacle collisions', () => {
    expect(arranged([3, 2, 1], 8, 1).step(1).observation.reason).toBe('wall');
    expect(arranged([5, 4, 0], 15, 1, { obstacles: [6] }).step(1).observation.reason).toBe('obstacle');
  });
  it('wins without spawning food and keeps terminal state stable', () => {
    const game = arranged([0, 2, 3], 1, 0, { width: 2, height: 2 });
    const result = game.step(1), hash = game.hash(), snapshot = game.snapshot();
    expect(result.observation.reason).toBe('filled'); expect(result.observation.food).toBeNull(); expect(result.reward).toBe(2);
    for (let i = 0; i < 20; i++) { expect(game.step(2).reward).toBe(0); expect(game.hash()).toBe(hash); }
    expect(game.snapshot()).toEqual(snapshot);
    expect(new Game({ width: 2, height: 2, initialization: 'cycle', initialLength: 4 }).observe().reason).toBe('filled');
  });
  it('reports independent truncation without collision rewards', () => {
    const game = arranged([5, 4, 0], 15, 1, { maxSteps: 1 });
    const result = game.step(1); expect(result.truncated).toBe(true); expect(result.terminated).toBe(false); expect(result.reward).toBe(-0.001);
    expect(result.observation.reason).toBe('step-limit'); const hash = game.hash(); game.step(0); expect(game.hash()).toBe(hash);
    const stalled = arranged([5, 4, 0], 15, 1, { maxNoFood: 2 }); stalled.step(1);
    expect(stalled.step(0).observation.reason).toBe('no-progress');
    const eating = arranged([5, 4, 0], 6, 1, { maxNoFood: 1 }); expect(eating.step(1).truncated).toBe(false);
  });
  it('gives callers immutable observations and detached snapshots', () => {
    const game = new Game(), before = game.hash(), obs = game.observe();
    expect(() => (obs.snake as number[]).push(0)).toThrow(); expect(() => obs.config.obstacles.push(0)).toThrow();
    expect(() => { obs.config.width = 2; }).toThrow(); const snapshot = game.snapshot(); (snapshot.snake as number[])[0] = 0;
    expect(game.hash()).toBe(before);
  });
  it('resets all state and deterministically handles obstacle initialization', () => {
    const config = { width: 6, height: 6, obstacles: [21, 20, 19] };
    const game = new Game(config, 17), initial = game.snapshot(); game.step(0); game.reset(17, config);
    expect(game.snapshot()).toEqual(initial); expect(game.observe().snake.some(cell => config.obstacles.includes(cell))).toBe(false);
  });
});

describe('snapshot validation and 100-seed determinism', () => {
  it('rejects bad snapshot versions, occupied food, disconnected bodies and inconsistent flags atomically', () => {
    const game = new Game(), snapshot = game.snapshot(), hash = game.hash();
    for (const bad of [
      { version: 'unknown' }, { food: snapshot.snake[0] }, { snake: [0, 30, 31] },
      { rngState: -1 }, { score: 8 }, { terminated: true, reason: null }, { food: null },
    ]) { expect(() => game.restore({ ...snapshot, ...bad } as Snapshot)).toThrow(); expect(game.hash()).toBe(hash); }
  });
  it('matches exact hashes after restore and identical actions across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const a = new Game({ width: 8, height: 8, maxSteps: 60 }, seed), b = new Game({ width: 8, height: 8, maxSteps: 60 }, seed);
      const actions = new SeededRandom(seed + 1000);
      for (let step = 0; step < 60; step++) {
        const legal = legalActions(a.observe()); const action = legal.length ? legal[actions.int(legal.length)] : a.observe().direction;
        expect(a.step(action)).toEqual(b.step(action)); expect(a.hash()).toBe(b.hash());
        if (step === 20) b.restore(JSON.parse(JSON.stringify(a.snapshot())) as Snapshot);
        const obs = a.observe(); expect(new Set(obs.snake).size).toBe(obs.snake.length);
        if (obs.food !== null) expect(obs.snake).not.toContain(obs.food);
      }
    }
  });
});
