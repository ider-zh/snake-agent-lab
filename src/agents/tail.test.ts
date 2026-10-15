import {describe,it,expect} from 'vitest';
import {Game,legalActions} from '../core';
import {createAgent,validatePath} from './index';
describe('bounded tail detour policy',()=>{
  it('shares budgets, validates accepted dynamic paths, and leaves environment RNG untouched',()=>{
    const game=new Game({width:8,height:8,maxSteps:2500,maxNoFood:500},101),agent=createAgent('tail-safe',101,{maxNodes:10000,maxMs:Infinity});let detours=0;
    while(!game.observe().terminated&&!game.observe().truncated){
      const before=game.snapshot(),d=agent.decide(game.observe());expect(game.snapshot()).toEqual(before);
      expect(d.debug.expanded).toBeLessThanOrEqual(10000);
      if(legalActions(before).length)expect(legalActions(before)).toContain(d.action);
      if(d.debug.fallback==='validated-tail-detour'){expect(validatePath(before,d.debug.path)).not.toBeNull();expect(d.debug.path.at(-1)).toBe(before.snake.at(-1));expect(d.debug.path).not.toContain(before.food);detours++;}
      game.step(d.action);
    }
    expect(detours).toBeGreaterThan(0);
  });
  it('retains the original A* decision when it has a validated food route',()=>{
    const game=new Game({width:8,height:8},7),a=createAgent('astar',7,{maxNodes:10000,maxMs:Infinity}),b=createAgent('tail-safe',7,{maxNodes:10000,maxMs:Infinity});
    const expected=a.decide(game.observe());expect(expected.debug.fallback).toBeUndefined();
    const actual=b.decide(game.observe());expect(actual.action).toBe(expected.action);expect(actual.debug.path).toEqual(expected.debug.path);
  });
  it('falls back safely on exhausted node/time budgets and repeats deterministically on obstacle maps',()=>{
    for(const maxNodes of [0,1,8,10000]){
      const config={width:8,height:8,obstacles:[18,19,44,45],maxSteps:80};
      const a=new Game(config,42),b=new Game(config,42),p=createAgent('tail-safe',42,{maxNodes,maxMs:Infinity}),q=createAgent('tail-safe',42,{maxNodes,maxMs:Infinity});
      while(!a.observe().terminated&&!a.observe().truncated){const x=p.decide(a.observe()),y=q.decide(b.observe());expect(x.action).toBe(y.action);expect(x.debug.expanded).toBeLessThanOrEqual(maxNodes);a.step(x.action);b.step(y.action);expect(a.hash()).toBe(b.hash());}
    }
    const o=new Game({width:8,height:8},7).observe(),d=createAgent('tail-safe',7,{maxNodes:10000,maxMs:0}).decide(o);expect(d.debug.expanded).toBe(0);expect(legalActions(o)).toContain(d.action);
  });
});
