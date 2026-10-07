import {PolicyTrainer} from '../src/learning/policy-trainer';
import {argmaxPolicy,distribution,policyFeatures,type PolicyModel} from '../src/learning/policy';
import {TabularEvaluator} from '../src/learning/controller';
import {Game} from '../src/core';
import {createAgent} from '../src/agents';
import {mkdirSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const runs=[];mkdirSync('docs/qa/policy',{recursive:true});
function agreement(model:PolicyModel){
  let count=0,correct=0,crossEntropy=0;const teacher=createAgent('astar',1,{maxNodes:1000,maxMs:Infinity});
  for(const seed of model.seedSplit.validationSeeds){const game=new Game(model.game,seed);for(let i=0;i<200&&!game.observe().terminated&&!game.observe().truncated;i++){const o=game.observe(),action=teacher.decide(o).action,label=(action-o.direction+5)%4,p=distribution(model.actor,policyFeatures(o));correct+=Number(argmaxPolicy(p)===label);crossEntropy-=Math.log(Math.max(p[label],1e-12));count++;game.step(action);}}
  return {split:'validation',teacher:'astar-nodes1000-v1',count,accuracy:correct/count,crossEntropy:crossEntropy/count};
}
for(const algorithm of ['ppo','imitation'] as const)for(const seed of [1,7,42]){
  const maxSteps=algorithm==='ppo'?50000:10000,trainer=new PolicyTrainer({algorithm,seed,maxSteps,maxWallMs:60000});trainer.pause();const before=trainer.exportModel(),base=new TabularEvaluator(before);while(!base.done)base.tick();const agreementBefore=agreement(before);
  trainer.resume();while(trainer.advance()){/* Fixed transition and wall budgets; no test-based tuning. */}trainer.pause();
  const model=trainer.exportModel(),after=new TabularEvaluator(model),validation=new TabularEvaluator(model,'validation');while(!after.done)after.tick();while(!validation.done)validation.tick();
  const metrics=trainer.metrics(),row={algorithm,seed,maxSteps,samples:metrics.samples,updates:metrics.updates,changedParameters:metrics.changedEntries,elapsedMs:metrics.elapsedMs,loss:metrics.loss,policy:metrics.policy,curve:metrics.curve,before:base.result(),after:after.result(),validation:validation.result(),agreementBefore,agreementAfter:agreement(model)};runs.push(row);
  writeFileSync(`docs/qa/policy/${algorithm}-seed-${seed}-model.json`,JSON.stringify(model)+'\n');
  writeFileSync('docs/qa/policy/evaluation.json',JSON.stringify({protocol:{trainingSeeds:[1,7,42],modelSelection:'final parameters, no validation/test checkpoint selection',game:model.game,architecture:model.architecture,ppoSteps:50000,imitationSteps:10000,wallMs:60000,rollout:128,epochs:4,batch:32,actorRate:.003,criticRate:.01,gamma:.99,lambda:.95,clip:.2,entropy:.01,gradientNormClip:.5,validationSeeds:model.seedSplit.validationSeeds,testSeeds:model.seedSplit.testSeeds},runs},null,2)+'\n');
  console.log(JSON.stringify({algorithm,seed,samples:metrics.samples,updates:metrics.updates,before:row.before.meanScore,after:row.after.meanScore,agreement:row.agreementAfter.accuracy,crossEntropy:row.agreementAfter.crossEntropy}));
}
