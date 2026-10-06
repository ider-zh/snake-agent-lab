import { describe, expect, it } from 'vitest';
import { createAgent } from '../agents';
import { lessonDecision, lessonGame } from './demo';
import { lessons } from './content';
import { exampleCode, expectedOutputs } from './examples';
import { encodeObservation } from '../training/encoding';
describe('real search lessons',()=>{
  for(const id of ['bfs','astar'] as const) it(`${id} trace matches actual search and does not change decisions`,()=>{
    for(const maxNodes of [0,2,10000]) {
      const game=lessonGame(id),before=game.hash(),limits={maxNodes,maxMs:Infinity};
      const plain=createAgent(id,7,limits),traced=createAgent(id,7,limits,{trace:true});
      for(let i=0;i<10;i++) {
        const observation=game.observe(),a=plain.decide(observation),b=traced.decide(observation);
        expect(b.action).toBe(a.action);expect(b.debug.path).toEqual(a.debug.path);expect(b.debug.fallback).toBe(a.debug.fallback);expect(b.debug.expanded).toBe(a.debug.expanded);
        expect(b.debug.trace?.map(f=>f.current.cell)).toEqual(a.debug.visited);
        expect(a.debug.trace).toBeUndefined();
        for(const frame of b.debug.trace??[]) {
          expect(frame.visited.at(-1)).toBe(frame.current.cell);
          for(const n of [frame.current,...frame.frontier]) expect(n.f).toBe(n.g+n.h);
          if(id==='astar')expect(frame.frontier.map(n=>n.f)).toEqual(frame.frontier.map(n=>n.f).sort((a,b)=>a-b));
        }
        if(i===0)expect(game.hash()).toBe(before);
        game.step(a.action);
      }
    }
  });
  it('trace caps snapshots and does not exhaust production memory',()=>{
    const game=lessonGame('bfs');
    game.reset(7,{width:32,height:32});game.restore({...game.snapshot(),food:0});
    const d=createAgent('bfs',7,{maxNodes:10000,maxMs:Infinity},{trace:true}).decide(game.observe());
    expect(d.debug.trace).toHaveLength(256);expect(d.debug.traceTruncated).toBe(true);
  });
  it('rebuilding a frozen frame preserves RNG and explicit execution',()=>{
    for(const agent of ['random','legal-random','bfs','astar','hamiltonian'] as const) {
      const a=lessonDecision(agent,'obstacles',2),b=lessonDecision(agent,'obstacles',2);
      expect(a.hash).toBe(b.hash);expect(a.decision.action).toBe(b.decision.action);
      expect(lessonDecision(agent,'obstacles',0).observation.steps).toBe(0);
      expect(lessonDecision(agent,'obstacles',1).observation.steps).toBe(1);
    }
  });
  it('all lessons have executable bilingual programs and honest scope',()=>{
    expect(lessons).toHaveLength(19);
    for(const lesson of lessons)for(const language of ['js','py'] as const)expect(exampleCode(lesson.id,language)).toContain(language==='js'?'JSON.stringify':'json.dumps');
    const encoded=encodeObservation(lessonGame().observe(),'compact-v2');
    expect(encoded).toHaveLength(12);
    encoded.forEach((value,i)=>expect(value).toBeCloseTo((expectedOutputs.encoding as number[])[i],6));
    for(const id of ['bfs','astar'] as const)expect(lessonDecision(id,'obstacles',0).decision.debug.path).toEqual(expectedOutputs[id]);
  });
});
