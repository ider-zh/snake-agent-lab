import {describe,it,expect} from 'vitest';
import {Game,directionBetween,legalActions,moveCell,type Direction} from '../core';
import {createAgent} from './index';
import {cycleOrdered,makeCycleIndex} from './shortcut';
import {createProtocols,runBatch} from '../experiments/batch';
import {validateResults} from '../experiments/import';
describe('ordered Hamiltonian shortcuts',()=>{
  it('preserves order, legality and makes bounded food progress across seeded games',()=>{
    for(const [width,height] of [[4,4],[6,4],[5,4],[8,8]])for(let seed=1;seed<=12;seed++){
      const n=width*height,game=new Game({width,height,initialization:'cycle',initialLength:3,maxSteps:n*n,maxNoFood:n},seed),index=makeCycleIndex(width,height),agent=createAgent('hamiltonian-shortcut',seed,{maxNodes:10,maxMs:Infinity});
      while(!game.observe().terminated&&!game.observe().truncated){
        const before=game.snapshot(),decision=agent.decide(game.observe());
        expect(game.snapshot()).toEqual(before);expect(legalActions(before)).toContain(decision.action);
        game.step(decision.action);expect(cycleOrdered(game.observe(),index)).toBe(true);
      }
      expect(game.observe().reason).toBe('filled');
    }
  });
  it('exhausts physically adjacent ordered states on 3×2 including growth and released tail',()=>{
    const width=3,height=2,n=6,index=makeCycleIndex(width,height);let checked=0;
    function walk(body:number[]){
      if(body.length>=3&&body.length<n){
        for(let food=0;food<n;food++)if(!body.includes(food)){
          const game=new Game({width,height,initialLength:body.length,initialization:'cycle',maxSteps:100,maxNoFood:100},7);
          const direction=directionBetween(body[1],body[0],width);
          game.restore({...game.snapshot(),snake:body,food,direction});
          if(cycleOrdered(game.observe(),index)){
            const next=index.route[(index.position[body[0]]+1)%n],d=directionBetween(body[0],next,width);
            if(legalActions(game.observe()).includes(d)){
              const decision=createAgent('hamiltonian-shortcut',7,{maxNodes:10,maxMs:Infinity}).decide(game.observe());
              expect(legalActions(game.observe())).toContain(decision.action);game.step(decision.action);expect(cycleOrdered(game.observe(),index)).toBe(true);checked++;
            }
          }
        }
      }
      if(body.length===n-1)return;
      for(const d of [0,1,2,3] as Direction[]){const next=moveCell(body.at(-1)!,d,width,height);if(next>=0&&!body.includes(next))walk([...body,next]);}
    }
    for(let head=0;head<n;head++)walk([head]);expect(checked).toBeGreaterThan(30);
  });
  it('rejects unsupported inputs, preserves explicit finite budget truncations',()=>{
    expect(()=>createAgent('hamiltonian-shortcut').decide(new Game().observe())).toThrow();
    const game=new Game({width:8,height:8,initialization:'cycle',maxSteps:2},7),agent=createAgent('hamiltonian-shortcut',7,{maxNodes:0,maxMs:0});
    const d=agent.decide(game.observe());expect(d.debug.expanded).toBe(0);expect(d.debug.fallback).toBe('node-budget');
    game.step(d.action);game.step(agent.decide(game.observe()).action);expect(game.observe().reason).toBe('step-limit');
  });
  it('keeps both ring strategies in the same batch protocol and validates exported results',async()=>{
    const spec={agents:['hamiltonian','hamiltonian-shortcut'] as const,config:{width:4,height:4,maxSteps:256,maxNoFood:16},seeds:[7,42]};
    const mutable={...spec,agents:[...spec.agents]};expect(createProtocols(mutable)).toHaveLength(1);
    const result=await runBatch(mutable,{yieldControl:async()=>{}});expect(result.rows.every(r=>r.initializationGroup==='cycle'&&r.success)).toBe(true);
    expect(validateResults(JSON.parse(JSON.stringify(result))).rows).toHaveLength(4);
  });
});
