import {readFileSync,writeFileSync} from 'node:fs';
const {protocol,rows}=JSON.parse(readFileSync('docs/qa/tail/benchmark.json','utf8'));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const groups=[];
for(const size of [8,12])for(const obstacles of [false,true])for(const policy of ['astar','tail-safe']){
  const group=rows.filter(r=>r.size===size&&r.obstacles===obstacles&&r.policy===policy),filled=group.filter(r=>r.filled);
  const reasons={};for(const row of group)reasons[row.reason]=(reasons[row.reason]??0)+1;
  const successes=filled.map(r=>r.steps).sort((a,b)=>a-b),n=successes.length;
  groups.push({size,obstacles,policy,episodes:group.length,meanFood:mean(group.map(r=>r.score)),meanFill:mean(group.map(r=>r.fillRate)),filled:n,reasons,successfulSteps:{mean:mean(successes),median:n?(successes[Math.floor((n-1)/2)]+successes[Math.floor(n/2)])/2:null,p95:n?successes[Math.ceil(n*.95)-1]:null},meanDecisionP95Ms:mean(group.map(r=>r.decisionP95Ms))});
}
writeFileSync('docs/qa/tail/summary.json',JSON.stringify({protocol,groups},null,2)+'\n');
