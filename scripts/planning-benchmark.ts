import {Game,type AgentId} from '../src/core';
import {createAgent} from '../src/agents';
import {mkdirSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const rows=[];
mkdirSync('docs/qa/planning',{recursive:true});
for(const obstacles of [false,true])for(const policy of ['astar','tail-safe','dijkstra','best-first','beam','mcts'] as AgentId[]){
  const group=[];
  for(let seed=32001;seed<=32010;seed++){
    const config={width:8,height:8,maxSteps:1000,maxNoFood:200,obstacles:obstacles?[18,19,44,45]:[]};
    const game=new Game(config,seed),agent=createAgent(policy,seed,{maxNodes:1000,maxMs:Infinity}),start=performance.now();let wall=false,budgetLimits=0;const times=[];
    while(!game.observe().terminated&&!game.observe().truncated){
      if(performance.now()-start>30000){wall=true;break;}
      const began=performance.now(),d=agent.decide(game.observe());times.push(performance.now()-began);
      if(d.debug.fallback?.includes('budget'))budgetLimits++;game.step(d.action);
    }
    times.sort((a,b)=>a-b);const o=game.observe(),row={obstacles,policy,seed,score:o.score,fillRate:o.snake.length/(64-config.obstacles.length),steps:o.steps,reason:wall?'wall-clock':o.reason,filled:o.reason==='filled',budgetLimits,decisionP95Ms:times[Math.floor((times.length-1)*.95)],elapsedMs:performance.now()-start};rows.push(row);group.push(row);
    writeFileSync('docs/qa/planning/benchmark.json',JSON.stringify({protocol:{seeds:'32001–32010',purpose:'bounded-budget integration comparison; not a full-completion benchmark',size:8,initialization:'standard',initialLength:3,walls:true,foodCount:1,maxSteps:1000,maxNoFood:200,maxNodes:1000,maxMs:'Infinity; research harness only',episodeWallMs:30000,beamWidth:24,beamDepth:16,mctsDepth:24,mctsIterations:512},rows},null,2)+'\n');
  }
  const reasons:Record<string,number>={};for(const row of group)reasons[row.reason??'unknown']=(reasons[row.reason??'unknown']??0)+1;
  console.log(JSON.stringify({obstacles,policy,meanScore:group.reduce((s,r)=>s+r.score,0)/group.length,filled:group.filter(r=>r.filled).length,reasons}));
}
