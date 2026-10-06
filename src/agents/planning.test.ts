import {describe,it,expect} from 'vitest';
import {Game,legalActions} from '../core';
import {createAgent,validatePath} from './index';
import {planningMove,uct} from './lookahead';
const limits={maxNodes:10000,maxMs:Infinity};
describe('independent graph and lookahead planners',()=>{
  it('Dijkstra has unit-cost BFS behavior but g-only heap priorities, best-first uses h',()=>{
    for(let seed=1;seed<=15;seed++){
      const o=new Game({width:8,height:8,obstacles:[18,19,44,45]},seed).observe();
      const bfs=createAgent('bfs',seed,limits).decide(o),d=createAgent('dijkstra',seed,limits,{trace:true}).decide(o),g=createAgent('best-first',seed,limits,{trace:true}).decide(o);
      expect(d.action).toBe(bfs.action);expect(d.debug.path).toEqual(bfs.debug.path);expect(d.debug.visited).toEqual(bfs.debug.visited);
      for(const frame of d.debug.trace!)for(const n of [frame.current,...frame.frontier])expect(n.f).toBe(n.g);
      for(const frame of g.debug.trace!)for(const n of [frame.current,...frame.frontier])expect(n.f).toBe(n.h);
      expect(createAgent('best-first',seed,limits).decide(o).action).toBe(g.action);
    }
  });
  it('preserves exact growth/tail semantics without accessing a new food location',()=>{
    const game=new Game({width:8,height:8},7);const state=game.snapshot();game.restore({...state,food:state.snake[0]+1});
    const before=game.snapshot(),simulated=planningMove(before,1)!;game.step(1);
    expect(simulated.snake).toEqual(game.observe().snake);expect(simulated.score).toBe(game.observe().score);expect(simulated.food).toBeNull();expect(simulated.steps).toBe(game.observe().steps);
  });
  it('performs actual beam pruning and UCT tree updates with bounded replayable actions',()=>{
    for(const id of ['beam','mcts'] as const){
      const a=new Game({width:8,height:8,obstacles:[18,19,44,45],maxSteps:60},42),b=new Game(a.observe().config,42);
      const p=createAgent(id,42,{maxNodes:600,maxMs:Infinity}),q=createAgent(id,42,{maxNodes:600,maxMs:Infinity});
      while(!a.observe().terminated&&!a.observe().truncated){
        const before=a.snapshot(),d=p.decide(before),e=q.decide(b.observe());expect(a.snapshot()).toEqual(before);
        expect(d.action).toBe(e.action);expect(d.debug.planning).toEqual(e.debug.planning);expect(d.debug.expanded).toBeLessThanOrEqual(600);
        if(legalActions(before).length)expect(legalActions(before)).toContain(d.action);
        expect(d.debug.planning!.iterations).toBeGreaterThan(0);expect(d.debug.planning!.maxDepth).toBeLessThanOrEqual(id==='beam'?16:24);
        if(id==='beam')expect(validatePath(before,d.debug.path)).not.toBeNull();
        else {expect(d.debug.planning!.roots.reduce((s,r)=>s+r.visits,0)).toBeLessThanOrEqual(d.debug.planning!.iterations);expect(d.debug.planning!.roots.every(r=>Number.isFinite(r.mean))).toBe(true);}
        a.step(d.action);b.step(e.action);expect(a.hash()).toBe(b.hash());
      }
    }
    expect(uct(0,0,10)).toBe(Infinity);expect(uct(4,5,10)).toBeCloseTo(.8+Math.sqrt(2*Math.log(10)/5));
  });
  it('handles zero budgets and terminal states without illegal fallback when a safe action exists',()=>{
    for(const id of ['dijkstra','best-first','beam','mcts'] as const){
      const game=new Game({width:8,height:8,maxSteps:1},7),o=game.observe();
      for(const maxNodes of [0,1,5]){const d=createAgent(id,7,{maxNodes,maxMs:Infinity}).decide(o);expect(d.debug.expanded).toBeLessThanOrEqual(maxNodes);expect(legalActions(o)).toContain(d.action);}
      const zero=createAgent(id,7,{maxNodes:10000,maxMs:0}).decide(o);expect(zero.debug.expanded).toBe(0);
      game.step(1);expect(createAgent(id,7,limits).decide(game.observe()).debug.expanded).toBe(0);
    }
  });
});
