import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {Game} from '../src/core';
import type {AgentId} from '../src/core';
import {createAgent} from '../src/agents';
const phase=process.argv[2]??'before';
const firstSeed=Number(process.argv[3]??61001);
const standard=process.argv[4]==='standard',count=standard?3:5;
const ids:AgentId[]=['random','legal-random','greedy','safe-greedy','bfs','astar','dijkstra','best-first','beam','mcts','tail-safe','hamiltonian','hamiltonian-shortcut'];
const rows:{scenario:string;id:string;seed:number;[key:string]:unknown}[]=process.argv.includes('--resume')?JSON.parse(readFileSync(`docs/qa/repair/late-${phase}.json`,'utf8')).rows:[];
const scenarios=standard?[{name:'8-standard',size:8,length:3},{name:'12-standard',size:12,length:3},{name:'8-obstacles',size:8,length:3}]:[{name:'8-open',size:8,length:3},{name:'12-open',size:12,length:3},{name:'8-dense',size:8,length:40}];
for(const scenario of scenarios)for(const id of ids.filter(id=>!standard||!id.startsWith('hamiltonian')))for(let seed=firstSeed;seed<firstSeed+count;seed++){
 if(rows.some(row=>row.scenario===scenario.name&&row.id===id&&row.seed===seed))continue;
 const n=scenario.size**2,game=new Game({width:scenario.size,height:scenario.size,initialization:standard?'standard':'cycle',initialLength:scenario.length,obstacles:scenario.name==='8-obstacles'?[18,19,44,45]:[],maxSteps:standard?5000:n*n,maxNoFood:standard?500:n*4},seed);
 const agent=createAgent(id,seed^0xabc124,{maxNodes:2000,maxMs:Infinity});
 const seen=new Set<string>();let repeats=0,maxNoFood=0,fall=0;const start=performance.now();
 while(!game.observe().terminated&&!game.observe().truncated){const o=game.observe(),key=`${o.food}/${o.direction}/${o.snake.join(',')}`;if(seen.has(key))repeats++;seen.add(key);const d=agent.decide(o);if(d.debug.fallback)fall++;game.step(d.action);maxNoFood=Math.max(maxNoFood,game.observe().noFood);}
 const o=game.observe();rows.push({scenario:scenario.name,id,seed,score:o.score,length:o.snake.length,steps:o.steps,reason:o.reason,repeats,maxNoFood,fallbacks:fall,elapsedMs:performance.now()-start});
 console.log(scenario.name,id,seed,o.reason,o.score,o.steps);
 mkdirSync('docs/qa/repair',{recursive:true});writeFileSync(`docs/qa/repair/late-${phase}.json`,JSON.stringify({protocol:{seeds:Array.from({length:count},(_,i)=>firstSeed+i),initialization:standard?'standard; 8-obstacles uses [18,19,44,45]':'cycle for all policies; dense length 40',maxSteps:standard?5000:'N*N',maxNoFood:standard?500:'4*N',decisionNodes:2000,decisionMs:'Infinity (deterministic offline comparison)'},rows},null,2));
}
