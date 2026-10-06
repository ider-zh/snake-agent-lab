import {describe,it,expect} from 'vitest';
import {TabularTrainer,validateTabularModel,discreteState,tdUpdate,greedyTabular,tabularValues,maskedChoices,TABLE_STATES} from './tabular';
import {LearningController,TabularEvaluator,type LearningEvent} from './controller';
import {Game,relativeAction} from '../core';
import {trainingReward} from '../training/encoding';
describe('real tabular learning',()=>{
  it('updates Q entries and restores exact SARSA pending action and random streams',()=>{
    for(const algorithm of ['q-learning','sarsa'] as const){
      const a=new TabularTrainer({algorithm,maxSteps:1500,maxWallMs:300000});
      for(let i=0;i<513;i++)a.advance();a.pause();const c=a.checkpoint(),b=TabularTrainer.restore(c);a.resume();
      for(let i=0;i<487;i++){a.advance();b.advance();}
      expect(a.exportModel()).toEqual(b.exportModel());
      const x=a.checkpoint(),y=b.checkpoint();expect(x.environment).toEqual(y.environment);expect(x.action).toBe(y.action);expect(x.rng).toEqual(y.rng);expect(x.curve).toEqual(y.curve);
      expect(a.metrics().changedEntries).toBeGreaterThan(20);expect(a.updates).toBe(1000);
    }
  });
  it('uses greedy off-policy Q targets and sampled on-policy SARSA targets',()=>{
    expect(tdUpdate(2,1,5,false,.2,.9)).toBeCloseTo(2.7);expect(tdUpdate(2,1,5,true,.2,.9)).toBeCloseTo(1.8);
    for(const algorithm of ['q-learning','sarsa'] as const){
      const c=new TabularTrainer({algorithm,epsilonStart:1,epsilonEnd:1,alpha:.2,gamma:.9}).checkpoint();c.model.table=c.model.table.map((_,i)=>i%3+1);
      const trainer=TabularTrainer.restore(c),game=new Game(c.config.game,c.environment.seed);game.restore(c.environment);
      const before=game.observe(),result=game.step(relativeAction(before.direction,c.action)),after=result.observation,values=tabularValues(c.model,after);
      trainer.advance();const next=trainer.checkpoint(),index=discreteState(before)*3+c.action;
      const future=algorithm==='sarsa'?values[next.action]:values[greedyTabular(c.model,after)];
      expect(next.model.table[index]).toBeCloseTo(tdUpdate(c.model.table[index],trainingReward(before,after,result.reward,'compact-v2'),future,after.terminated||after.truncated,.2,.9));
    }
  });
  it('freezes evaluation and validates schema, dimensions, finite values and split provenance',()=>{
    const trainer=new TabularTrainer({maxSteps:500});while(trainer.advance()){/* bounded */}
    const model=trainer.exportModel(),before=JSON.stringify(model),evaler=new TabularEvaluator(model,'validation');while(!evaler.done)evaler.tick();
    expect(JSON.stringify(model)).toBe(before);expect(evaler.result().episodes).toHaveLength(5);expect(model.table).toHaveLength(TABLE_STATES*3);
    expect(()=>validateTabularModel({...model,table:[0]})).toThrow();const bad=structuredClone(model);bad.table[0]=NaN;expect(()=>validateTabularModel(bad)).toThrow();
    expect(()=>validateTabularModel({...model,remote:'https://example.invalid/model'})).toThrow();
    const c=trainer.checkpoint();c.rng.policy=-1;expect(()=>TabularTrainer.restore(c)).toThrow();
    const c2=trainer.checkpoint();c2.model.algorithm=c2.model.algorithm==='sarsa'?'q-learning':'sarsa';expect(()=>TabularTrainer.restore(c2)).toThrow();
    expect(()=>TabularTrainer.restore({...trainer.checkpoint(),config:undefined})).toThrow();expect(()=>validateTabularModel({...model,game:undefined})).toThrow();
    for(const seed of model.seedSplit.testSeeds){const o=new Game(model.game,seed).observe();expect(discreteState(o)).toBeLessThan(TABLE_STATES);expect(maskedChoices(o)).toContain(greedyTabular(model,o));}
  });
  it('Worker controller serializes pause/checkpoint/resume and ignores stale commands',async()=>{
    const events:LearningEvent[]=[];let controller:LearningController;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('controller timeout')),5000);
      controller=new LearningController(event=>{
        events.push(event);
        if(event.type==='metrics'&&event.metrics.samples===0)controller.handle({type:'pause',jobId:'a'});
        if(event.type==='status'&&event.status==='paused'){controller.handle({type:'cancel',jobId:'stale'});controller.handle({type:'checkpoint',jobId:'a'});controller.handle({type:'resume',jobId:'a'});}
        if(event.type==='status'&&event.status==='completed'){clearTimeout(timer);resolve();}
      });
      controller.handle({type:'start',jobId:'a',config:{algorithm:'sarsa',maxSteps:600,maxWallMs:10000}});
    });
    controller!.dispose();expect(events.some(e=>e.type==='checkpoint'&&e.checkpoint.samples===0)).toBe(true);expect(events.some(e=>e.type==='metrics'&&e.metrics.samples===600)).toBe(true);expect(events.some(e=>e.type==='status'&&e.status==='cancelled')).toBe(false);
    expect(events.every((e,i)=>e.sequence===i+1)).toBe(true);
  });
});
