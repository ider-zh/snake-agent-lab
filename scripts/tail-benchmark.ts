import {Game} from '../src/core';
import {createAgent} from '../src/agents';
import {mkdirSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const rows=[];
mkdirSync('docs/qa/tail',{recursive:true});
for(const size of [8,12])for(const obstacles of [false,true])for(const policy of ['astar','tail-safe'] as const){
  const group=[];
  for(let seed=31001;seed<=31030;seed++){
    const config={width:size,height:size,maxSteps:5000,maxNoFood:500,obstacles:obstacles?[size*2+2,size*2+3,size*(size-3)+size-3,size*(size-3)+size-4]:[]};
    const game=new Game(config,seed),agent=createAgent(policy,seed,{maxNodes:10000,maxMs:Infinity}),start=performance.now();let detours=0,wall=false;const times=[];
    while(!game.observe().terminated&&!game.observe().truncated){
      if(performance.now()-start>120000){wall=true;break;}
      const began=performance.now(),d=agent.decide(game.observe());times.push(performance.now()-began);
      if(d.debug.fallback==='validated-tail-detour')detours++;game.step(d.action);
    }
    times.sort((a,b)=>a-b);const o=game.observe(),row={size,obstacles,policy,seed,score:o.score,fillRate:o.snake.length/(size*size-config.obstacles.length),steps:o.steps,stepsPerFood:o.score?o.steps/o.score:null,reason:wall?'wall-clock':o.reason,filled:o.reason==='filled',detours,decisionP95Ms:times[Math.floor((times.length-1)*.95)],elapsedMs:performance.now()-start};rows.push(row);group.push(row);
    writeFileSync('docs/qa/tail/benchmark.json',JSON.stringify({protocol:{seeds:'31001–31030',initialization:'standard',initialLength:3,walls:true,foodCount:1,maxSteps:5000,maxNoFood:500,maxNodes:10000,maxMs:'Infinity; research harness only',episodeWallMs:120000,maxDetours:16},rows},null,2)+'\n');
  }
  console.log(JSON.stringify({size,obstacles,policy,meanScore:group.reduce((s,r)=>s+r.score,0)/group.length,filled:group.filter(r=>r.filled).length,noProgress:group.filter(r=>r.reason==='no-progress').length,stepLimit:group.filter(r=>r.reason==='step-limit').length,collisions:group.filter(r=>['body','wall','obstacle'].includes(r.reason??'')).length,meanDecisionP95Ms:group.reduce((s,r)=>s+r.decisionP95Ms,0)/group.length}));
}
