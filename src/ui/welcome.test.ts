import { expect, it } from 'vitest';
import { Game } from '../core';
import { createAgent } from '../agents';
import { createReplay, seekReplay, validateReplay } from '../storage';
import type { Direction } from '../core';
import { DEMO } from './welcome';
import { rendererError } from '../render/errors';

it('fills the welcome board with the real agent and verifies every replay hash', () => {
  const game = new Game({ width: DEMO.size, height: DEMO.size, initialization: 'cycle', maxSteps: 5000, maxNoFood: 500 }, DEMO.seed);
  const agent = createAgent(DEMO.strategy, DEMO.seed ^ 0xabc124, { maxNodes: 10000, maxMs: 20 });
  const actions: Direction[] = [];
  while (!game.observe().terminated && !game.observe().truncated) {
    const action = agent.decide(game.observe()).action;
    game.step(action); actions.push(action);
  }
  expect(game.observe()).toMatchObject({ reason: 'filled', score: 61, truncated: false });
  expect(game.observe().snake).toHaveLength(64);
  const replay = validateReplay(createReplay({ config: game.observe().config, seed: DEMO.seed, actions }));
  expect(seekReplay(replay, actions.length)).toEqual(game.snapshot());
  expect(replay.hashes.at(-1)).toBe(game.hash());
  expect({ steps: actions.length, hash: game.hash() }).toMatchInlineSnapshot(`
    {
      "hash": "19e52bf6",
      "steps": 675,
    }
  `);
});

it('distinguishes CSP, graphics context and unrelated initialization failures', () => {
  expect(rendererError(new Error('unsafe-eval blocked'))).toContain('安全策略兼容模块');
  expect(rendererError(new Error('unsafe-eval blocked'))).not.toContain('WebGL');
  expect(rendererError(new Error('WebGL context creation failed'))).toContain('图形上下文');
  expect(rendererError(new Error('asset missing'))).not.toContain('WebGL');
});
