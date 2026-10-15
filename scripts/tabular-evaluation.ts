import {TabularTrainer} from '../src/learning/tabular';
import {TabularEvaluator} from '../src/learning/controller';
import {mkdirSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const runs=[];mkdirSync('docs/qa/tabular',{recursive:true});
for(const algorithm of ['q-learning','sarsa'] as const)for(const seed of [1,7,42]){
  const trainer=new TabularTrainer({algorithm,seed,maxSteps:50000,maxWallMs:60000}),before=trainer.exportModel();
  trainer.pause();const base=new TabularEvaluator(before);while(!base.done)base.tick();trainer.resume();
  while(trainer.advance()){/* Bounded by environment steps and wall time. */}trainer.pause();
  const model=trainer.exportModel(),validation=new TabularEvaluator(model,'validation'),after=new TabularEvaluator(model);
  while(!validation.done)validation.tick();while(!after.done)after.tick();
  const metrics=trainer.metrics(),row={algorithm,seed,samples:metrics.samples,updates:metrics.updates,changedEntries:metrics.changedEntries,elapsedMs:metrics.elapsedMs,stopReason:metrics.samples===50000?'step-budget':'time-budget',curve:metrics.curve,before:base.result(),validation:validation.result(),after:after.result()};runs.push(row);
  writeFileSync(`docs/qa/tabular/${algorithm}-seed-${seed}-model.json`,JSON.stringify(model)+'\n');
  writeFileSync('docs/qa/tabular/evaluation.json',JSON.stringify({protocol:{trainingSeeds:[1,7,42],trainingSteps:50000,trainingWallMs:60000,modelSelection:'final parameters; no checkpoint selection',before:'zero-initialized Q table with the same greedy legal-action mask',validationSeeds:model.seedSplit.validationSeeds,testSeeds:model.seedSplit.testSeeds,game:model.game,alpha:.2,gamma:.95,epsilonStart:1,epsilonEnd:.05,epsilonDecay:20000,terminalAndTruncationBootstrap:false},runs},null,2)+'\n');
  console.log(JSON.stringify({algorithm,seed,samples:metrics.samples,changedEntries:metrics.changedEntries,before:row.before.meanScore,after:row.after.meanScore,filled:row.after.episodes.filter(r=>r.reason==='filled').length}));
}
