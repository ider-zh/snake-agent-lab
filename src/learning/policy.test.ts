import {describe,it,expect} from 'vitest';
import {actorGradient,criticGradient,distribution,prepareAdvantages,validatePolicyModel,type PolicySample} from './policy';
import {PolicyTrainer} from './policy-trainer';
import {TabularEvaluator} from './controller';
describe('PPO and imitation learning mathematics and state',()=>{
  it('matches finite-difference gradients for PPO clipping, entropy and supervised cross entropy',()=>{
    const actor=Array.from({length:39},(_,i)=>(i%7-3)*.02),x=[0,0,0,.25,-.4,.2,.5,.8,.1,.2,.3,.1,1];
    for(const mask of [0,1])for(const algorithm of ['ppo','imitation'] as const)for(const [advantage,ratio] of [[1,1],[-1,1],[1,1.5],[-1,.5]]){
      x[0]=mask;
      const s:PolicySample={x,action:1,oldLogP:Math.log(distribution(actor,x)[1])-Math.log(ratio),oldValue:0,reward:1,done:false,advantage,target:1};
      const result=actorGradient(actor,[s],algorithm,.2,.01);
      for(let i=0;i<actor.length;i++){const a=[...actor],b=[...actor],epsilon=1e-6;a[i]+=epsilon;b[i]-=epsilon;const numerical=(actorGradient(a,[s],algorithm,.2,.01).loss-actorGradient(b,[s],algorithm,.2,.01).loss)/(2*epsilon);expect(result.gradient[i]).toBeCloseTo(numerical,6);}
    }
    const critic=Array(13).fill(.1),sample:PolicySample={x,action:1,oldLogP:0,oldValue:0,reward:0,done:false,advantage:0,target:2};
    const actual=criticGradient(critic,[sample]);for(let i=0;i<13;i++){const a=[...critic],b=[...critic];a[i]+=1e-6;b[i]-=1e-6;expect(actual.gradient[i]).toBeCloseTo((criticGradient(a,[sample]).loss-criticGradient(b,[sample]).loss)/2e-6,6);}
  });
  it('computes GAE with terminal masks and normalizes only advantages, not critic targets',()=>{
    const base={x:Array(13).fill(0),action:1,oldLogP:0,advantage:0,target:0};
    const samples=[{...base,oldValue:.5,reward:1,done:false},{...base,oldValue:.25,reward:2,done:true}];
    prepareAdvantages(samples,99,.9,.8);expect(samples[0].target).toBeCloseTo(2.485);expect(samples[1].target).toBeCloseTo(2);expect(samples[0].advantage+samples[1].advantage).toBeCloseTo(0);expect(samples[0].advantage).toBeGreaterThan(0);
  });
  it('restores exact collection and mid-optimizer state for both algorithms',()=>{
    for(const algorithm of ['ppo','imitation'] as const)for(const boundary of [53,131]){
      const a=new PolicyTrainer({algorithm,maxSteps:1024,maxWallMs:300000});for(let i=0;i<boundary;i++)a.advance();a.pause();const c=a.checkpoint(),b=PolicyTrainer.restore(c);a.resume();
      for(let i=0;i<300;i++){a.advance();b.advance();}
      expect(a.exportModel()).toEqual(b.exportModel());const x=a.checkpoint(),y=b.checkpoint();for(const key of ['environment','rng','actorOptimizer','criticOptimizer','buffer','phase','cursor','order','epoch'] as const)expect(x[key]).toEqual(y[key]);
      expect(a.updates).toBeGreaterThan(0);expect(a.metrics().changedEntries).toBeGreaterThan(0);
    }
  });
  it('rejects malformed state and performs frozen teacher-free evaluation',()=>{
    const t=new PolicyTrainer({algorithm:'imitation',maxSteps:256});while(t.advance()){/* bounded */}t.pause();const model=t.exportModel(),before=JSON.stringify(model);
    const e=new TabularEvaluator(model,'validation');while(!e.done)e.tick();expect(JSON.stringify(model)).toBe(before);expect(e.result().episodes).toHaveLength(5);
    expect(()=>validatePolicyModel({...model,actor:[0]})).toThrow();expect(()=>validatePolicyModel({...model,teacher:null})).toThrow();
    const bad=t.checkpoint();bad.actorOptimizer.t++;expect(()=>PolicyTrainer.restore(bad)).toThrow();
    const invalid=structuredClone(model);invalid.actor[0]=NaN;expect(()=>validatePolicyModel(invalid)).toThrow();
  });
});
