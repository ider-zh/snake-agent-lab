import {Game} from '../src/core';
import {createAgent} from '../src/agents';
import {forwardDistance,makeCycleIndex} from '../src/agents/shortcut';
import {mkdirSync,writeFileSync} from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const seeds=Array.from({length:Number(process.env.SHORTCUT_SEEDS??30)},(_,i)=>30001+i);
const rows=[];
for(const size of [8,12,20])for(const budget of ['sufficient','original-5000'] as const)for(const id of ['hamiltonian','hamiltonian-shortcut'] as const){
  for(const seed of seeds){
    const cells=size*size,game=new Game({width:size,height:size,initialLength:3,initialization:'cycle',maxSteps:budget==='sufficient'?cells*cells:5000,maxNoFood:budget==='sufficient'?cells:500},seed);
    const agent=createAgent(id,seed,{maxNodes:10000,maxMs:Infinity}),latencies:number[]=[],index=makeCycleIndex(size,size);let shortcutCount=0;
    const began=performance.now();let wallClock=false;
    while(!game.observe().terminated&&!game.observe().truncated){
      if(performance.now()-began>120000){wallClock=true;break;}
      const start=performance.now(),d=agent.decide(game.observe());latencies.push(performance.now()-start);
      const before=game.observe();
      game.step(d.action);
      if(forwardDistance(index.position[before.snake[0]],index.position[game.observe().snake[0]],cells)>1)shortcutCount++;
    }
    latencies.sort((a,b)=>a-b);const o=game.observe();
    rows.push({size,budget,id,seed,reason:wallClock?'wall-clock':o.reason,filled:o.reason==='filled',score:o.score,fillRate:o.snake.length/cells,steps:o.steps,stepsPerFood:o.score?o.steps/o.score:null,shortcutCount,elapsedMs:performance.now()-began,decisionP50Ms:latencies[Math.floor(latencies.length*.5)],decisionP95Ms:latencies[Math.floor(latencies.length*.95)],hash:game.hash()});
  }
  console.log(`${size} ${budget} ${id} complete`);
}
const summaries=[];
for(const size of [8,12,20])for(const budget of ['sufficient','original-5000'])for(const id of ['hamiltonian','hamiltonian-shortcut']){
  const selected=rows.filter(r=>r.size===size&&r.budget===budget&&r.id===id),mean=(key:'steps'|'stepsPerFood'|'decisionP95Ms')=>selected.reduce((sum,r)=>sum+(r[key]??0),0)/selected.length;
  const successes=selected.filter(r=>r.filled).map(r=>r.steps).sort((a,b)=>a-b),percentile=(q:number)=>successes.length?successes[Math.min(successes.length-1,Math.floor((successes.length-1)*q))]:null;
  summaries.push({size,budget,id,episodes:selected.length,filled:successes.length,collision:selected.filter(r=>['wall','body','obstacle'].includes(r.reason??'')).length,stepLimit:selected.filter(r=>r.reason==='step-limit').length,noProgress:selected.filter(r=>r.reason==='no-progress').length,wallClock:selected.filter(r=>r.reason==='wall-clock').length,successMeanSteps:successes.length?successes.reduce((a,b)=>a+b,0)/successes.length:null,successMedianSteps:percentile(.5),successP95Steps:percentile(.95),meanStepsIncludingFailures:mean('steps'),meanStepsPerFood:mean('stepsPerFood'),meanDecisionP95Ms:mean('decisionP95Ms'),shortcutCount:selected.reduce((a,r)=>a+r.shortcutCount,0),failedFillRates:selected.filter(r=>!r.filled).map(r=>r.fillRate)});
}
const paired=[];for(const size of [8,12,20])for(const budget of ['sufficient','original-5000']){
  const differences=seeds.flatMap(seed=>{const a=rows.find(r=>r.size===size&&r.budget===budget&&r.seed===seed&&r.id==='hamiltonian'),b=rows.find(r=>r.size===size&&r.budget===budget&&r.seed===seed&&r.id==='hamiltonian-shortcut');return a?.filled&&b?.filled?[{seed,ring:a.steps,shortcut:b.steps,difference:b.steps-a.steps}]:[];});
  paired.push({size,budget,bothFilled:differences.length,meanStepDifference:differences.length?differences.reduce((n,r)=>n+r.difference,0)/differences.length:null,differences});
}
mkdirSync('docs/qa/shortcut',{recursive:true});writeFileSync('docs/qa/shortcut/benchmark.json',JSON.stringify({protocol:{seeds,initialLength:3,initialization:'cycle',obstacles:[],foodCount:1,walls:true,nodeBudget:10000,timeBudget:'Infinity (deterministic comparison)',runtime:process.version,episodeWallLimitMs:120000,notes:'Same seed and initialization, different actions change subsequent food positions. Sufficient step limit=N² and no-food=N; original budget 5000/500. Decision p95 includes cold calls; no rendering. Infinity is research-harness-only, never sent to batch schema.'},summaries,paired,rows},null,2)+'\n');console.table(summaries);
