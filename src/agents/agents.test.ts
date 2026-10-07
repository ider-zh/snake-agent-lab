import { describe, expect, it } from 'vitest';
import { Game, legalActions, normalizeConfig, SeededRandom } from '../core';
import type { AgentId, Direction, Observation } from '../core';
import { createAgent, hamiltonianApplicable, validatePath } from './index';

const deterministicBudget = { maxNodes: 10_000, maxMs: Infinity };
function observation(snake: number[], food: number, direction: Direction, obstacles: number[] = []): Observation {
  return { config: normalizeConfig({ width: 6, height: 6, initialLength: snake.length, obstacles }), snake, food, direction,
    score: 0, steps: 0, noFood: 0, terminated: false, truncated: false, reason: null };
}

describe('agent behavior', () => {
  it('keeps raw random distinct from legal random with isolated seeded randomness', () => {
    const obs = observation([14, 13, 12], 35, 1), raw = createAgent('random', 0), legal = createAgent('legal-random', 0);
    const before = JSON.stringify(obs), rawActions = new Set<Direction>();
    for (let i = 0; i < 100; i++) { rawActions.add(raw.decide(obs).action); expect(legalActions(obs)).toContain(legal.decide(obs).action); }
    expect(rawActions.size).toBe(4); expect(JSON.stringify(obs)).toBe(before);
  });
  it('keeps greedy unsafe and safe greedy independently labeled', () => {
    const obs = observation([14, 15, 21, 20, 19, 13, 7], 26, 3);
    const greedy = createAgent('greedy', 1, deterministicBudget).decide(obs);
    expect(greedy.action).toBe(2); expect(legalActions(obs)).not.toContain(greedy.action);
    expect(legalActions(obs)).toContain(createAgent('safe-greedy', 1, deterministicBudget).decide(obs).action);
  });
  it('BFS and A* return equal shortest path lengths with valid complete simulation', () => {
    const obs = observation([14, 13, 12], 35, 1, [22]);
    const bfs = createAgent('bfs', 1, deterministicBudget).decide(obs), astar = createAgent('astar', 1, deterministicBudget).decide(obs);
    expect(bfs.debug.fallback).toBeUndefined(); expect(astar.debug.fallback).toBeUndefined();
    expect(bfs.debug.path.at(-1)).toBe(35); expect(astar.debug.path.length).toBe(bfs.debug.path.length);
    expect(validatePath(obs, bfs.debug.path)?.snake.length).toBe(4); expect(validatePath(obs, astar.debug.path)).not.toBeNull();
    expect(bfs.debug.visited.length).toBeGreaterThan(0); expect(astar.debug.expanded).toBeGreaterThan(0);
  });
  it('dynamically validates the entire body trajectory, tail release, reversals, and growth', () => {
    const obs = observation([7, 8, 14, 13], 0, 3);
    expect(validatePath(obs, [7, 13, 19])?.snake).toEqual([19, 13, 7, 8]);
    expect(validatePath(obs, [7, 8])).toBeNull(); expect(validatePath(obs, [7, 13, 14])?.snake).toEqual([14, 13, 7, 8]);
    expect(validatePath(observation([14, 15, 21, 20, 19, 13, 7], 35, 3), [14, 8, 9, 15])).toBeNull();
    expect(validatePath(obs, [7, 1, 0])?.snake.length).toBe(5);
    expect(validatePath(obs, [7, 1, 0, 6])).toBeNull(); expect(validatePath(obs, [7, 30])).toBeNull();
  });
  it('uses a bounded legal fallback for node and time exhaustion', () => {
    const obs = observation([14, 13, 12], 35, 1);
    for (const id of ['bfs', 'astar', 'safe-greedy'] as AgentId[]) {
      for (const budget of [{ maxNodes: 0, maxMs: Infinity }, { maxNodes: 10_000, maxMs: 0 }, { maxNodes: 1, maxMs: Infinity }]) {
        const decision = createAgent(id, 1, budget).decide(obs);
        expect(legalActions(obs)).toContain(decision.action); expect(decision.debug.fallback).toMatch(/budget/);
        expect(decision.debug.expanded).toBeLessThanOrEqual(budget.maxNodes);
      }
    }
  });
  it('falls back when food is isolated and returns forward with no legal exit', () => {
    const blocked = observation([14, 13, 12], 35, 1, [29, 34]);
    const result = createAgent('bfs', 1, deterministicBudget).decide(blocked);
    expect(result.debug.fallback).toBe('no-food-path'); expect(legalActions(blocked)).toContain(result.action);
    const trapped = observation([0, 1, 7], 35, 3, [6]);
    for (const id of ['legal-random', 'safe-greedy', 'bfs', 'astar'] as AgentId[]) expect(createAgent(id, 1, deterministicBudget).decide(trapped).action).toBe(3);
  });
  it('enforces Hamiltonian applicability instead of silently changing initialization', () => {
    const agent = createAgent('hamiltonian'); expect(() => agent.decide(new Game().observe())).toThrow(/cycle/);
    const game = new Game({ initialization: 'cycle', width: 6, height: 5 }); expect(hamiltonianApplicable(game.observe())).toBe(true);
    const obs = { ...game.observe(), direction: 1 as Direction }; expect(hamiltonianApplicable(obs)).toBe(false);
    expect(() => agent.decide(obs)).toThrow();
  });
  it('leaves completed observations alone and validates unknown agents/budgets', () => {
    const game = new Game({ width: 2, height: 2, initialLength: 4, initialization: 'cycle' });
    const result = createAgent('bfs').decide(game.observe()); expect(result.debug.expanded).toBe(0); expect(result.debug.path).toEqual([]);
    expect(() => createAgent('bad' as AgentId)).toThrow(); expect(() => createAgent('bfs', 1, { maxNodes: -1, maxMs: 1 })).toThrow();
  });
});

describe('100-seed sample properties', () => {
  it('escapes the recorded late-game static-map stagnation with bounded body-state recovery', () => {
    const config={width:8,height:8,initialization:'cycle' as const,maxSteps:4096,maxNoFood:256};
    const oldGame=new Game(config,61001),old=createAgent('astar',61001^0xabc124,{maxNodes:2000,maxMs:Infinity},{recovery:false});
    while(!oldGame.observe().terminated&&!oldGame.observe().truncated)oldGame.step(old.decide(oldGame.observe()).action);
    expect(oldGame.observe().reason).toBe('no-progress');expect(oldGame.observe().score).toBe(29);
    const game=new Game(config,61001),agent=createAgent('astar',61001^0xabc124,{maxNodes:2000,maxMs:Infinity});let recoveries=0;
    while(!game.observe().terminated&&!game.observe().truncated){const d=agent.decide(game.observe());expect(d.debug.expanded).toBeLessThanOrEqual(2000);if(d.debug.fallback==='dynamic-body-food-path')recoveries++;game.step(d.action);}
    expect(recoveries).toBeGreaterThan(0);expect(game.observe().reason).toBe('filled');
  });
  it('checks grown-body exits in beam search on the recorded crowded initialization',()=>{
    const game=new Game({width:8,height:8,initialization:'cycle',initialLength:40,maxSteps:4096,maxNoFood:256},61001),agent=createAgent('beam',61001^0xabc124,{maxNodes:2000,maxMs:Infinity});
    while(!game.observe().terminated&&!game.observe().truncated){const d=agent.decide(game.observe());expect(d.debug.expanded).toBeLessThanOrEqual(2000);game.step(d.action);}
    expect(game.observe().reason).toBe('filled');
  });
  it('Hamiltonian fills every eligible 4x4 board without collision across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const game = new Game({ width: 4, height: 4, initialization: 'cycle', maxSteps: 1000, maxNoFood: 0 }, seed);
      const agent = createAgent('hamiltonian', seed);
      while (!game.observe().terminated && !game.observe().truncated) {
        const obs = game.observe(), action = agent.decide(obs).action;
        expect(hamiltonianApplicable(obs)).toBe(true); expect(legalActions(obs)).toContain(action); game.step(action);
      }
      expect(game.observe().reason).toBe('filled'); expect(game.observe().score).toBe(13);
    }
  });
  it('Hamiltonian also fills transposed, thin and varied-initial-length rectangles', () => {
    for (const [width, height] of [[2, 7], [7, 2], [3, 4], [4, 3], [6, 6]]) {
      for (const initialLength of [1, 2, 3, width * height - 1]) {
        const game = new Game({ width, height, initialLength, initialization: 'cycle', maxSteps: width * width * height * height, maxNoFood: 0 }, 31);
        const agent = createAgent('hamiltonian');
        while (!game.observe().terminated && !game.observe().truncated) game.step(agent.decide(game.observe()).action);
        expect(game.observe().reason).toBe('filled');
      }
    }
  });
  it('paired seeded policy runs reproduce decisions and hashes across 100 seeds', () => {
    for (const id of ['random', 'legal-random', 'greedy', 'safe-greedy', 'bfs', 'astar'] as AgentId[]) {
      for (let seed = 0; seed < 100; seed++) {
        const config = { width: 6, height: 6, maxSteps: 40, maxNoFood: 25, obstacles: seed % 2 ? [0, 1, 6] : [] };
        const a = new Game(config, seed), b = new Game(config, seed), aa = createAgent(id, seed + 100, deterministicBudget), ba = createAgent(id, seed + 100, deterministicBudget);
        for (let step = 0; step < 40 && !a.observe().terminated && !a.observe().truncated; step++) {
          const oa = a.observe(), da = aa.decide(oa), db = ba.decide(b.observe()); expect(da.action).toBe(db.action);
          expect(da.debug.path).toEqual(db.debug.path); expect(da.debug.expanded).toBe(db.debug.expanded);
          if (['legal-random', 'safe-greedy', 'bfs', 'astar'].includes(id) && legalActions(oa).length) expect(legalActions(oa)).toContain(da.action);
          a.step(da.action); b.step(db.action); expect(a.hash()).toBe(b.hash());
        }
      }
    }
  });
  it('BFS and A* agree on obstacle-free shortest path cost over 100 food placements', () => {
    const rng = new SeededRandom(203);
    for (let i = 0; i < 100; i++) {
      const food = [2, 3, 4, 5, 8, 9, 10, 11, 16, 17, 20, 21, 22, 23, 26, 27, 28, 29, 32, 33, 34, 35][rng.int(22)];
      const obs = observation([14, 13, 12], food, 1);
      const bfs = createAgent('bfs', i, deterministicBudget).decide(obs), astar = createAgent('astar', i, deterministicBudget).decide(obs);
      expect(bfs.debug.fallback).toBeUndefined(); expect(astar.debug.fallback).toBeUndefined();
      expect(bfs.debug.path.length).toBe(astar.debug.path.length);
    }
  });
});
