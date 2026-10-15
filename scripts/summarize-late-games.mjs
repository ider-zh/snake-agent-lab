import {readFileSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const root='docs/qa/repair/';
const load=name=>JSON.parse(readFileSync(root+name+'.json','utf8'));
function stats(rows){return {episodes:rows.length,filled:rows.filter(r=>r.reason==='filled').length,collision:rows.filter(r=>['wall','body','obstacle'].includes(r.reason)).length,stagnation:rows.filter(r=>r.reason==='no-progress').length,stepLimit:rows.filter(r=>r.reason==='step-limit').length,meanFood:rows.reduce((s,r)=>s+r.score,0)/rows.length,meanSteps:rows.reduce((s,r)=>s+r.steps,0)/rows.length,meanRepeatedStates:rows.reduce((s,r)=>s+r.repeats,0)/rows.length};}
const comparisons=[];
for(const [name,total] of [['final',195],['standard',99]]){
 const before=load('late-'+name+'-before'),after=load('late-'+name+'-after');
 if(before.rows.length!==total||after.rows.length!==total)throw new Error(`Incomplete ${name}: ${before.rows.length}/${after.rows.length}, expected ${total}`);
 if(JSON.stringify(before.protocol)!==JSON.stringify(after.protocol))throw new Error('Protocol mismatch');
 const keys=rows=>rows.map(r=>`${r.scenario}/${r.id}/${r.seed}`).sort();if(JSON.stringify(keys(before.rows))!==JSON.stringify(keys(after.rows)))throw new Error('Unpaired episodes');
 const groups=[];for(const scenario of new Set(before.rows.map(r=>r.scenario)))for(const id of new Set(before.rows.map(r=>r.id)))groups.push({scenario,id,before:stats(before.rows.filter(r=>r.scenario===scenario&&r.id===id)),after:stats(after.rows.filter(r=>r.scenario===scenario&&r.id===id))});
 comparisons.push({name,protocol:before.protocol,groups});
}
writeFileSync(root+'late-summary.json',JSON.stringify({baselineCommit:'b8a65927f4e6efae5472e641c74952f7ead3f781',note:'Wall-clock durations are not compared; some final rows were resumed after a behavior-preserving search allocation optimization.',comparisons},null,2));
let markdown='\n## Final paired results\n\nEach cell reports **before → after** on exactly the same seeds and budgets. Collision and stagnation are separate; a filled board is the only completion. Mean steps includes every episode, so a higher value may mean surviving longer or stalling.\n';
for(const comparison of comparisons){markdown+=`\n### ${comparison.name==='final'?'Common cycle initialization, seeds 63001–63005':'Standard initialization and obstacles, seeds 64001–64003'}\n\n| Scenario | Strategy | Filled | Collision | Stagnation | Mean food | Mean steps |\n|---|---|---:|---:|---:|---:|---:|\n`;for(const g of comparison.groups){const a=g.before,b=g.after;markdown+=`| ${g.scenario} | ${g.id} | ${a.filled} → ${b.filled} / ${a.episodes} | ${a.collision} → ${b.collision} | ${a.stagnation} → ${b.stagnation} | ${a.meanFood.toFixed(1)} → ${b.meanFood.toFixed(1)} | ${a.meanSteps.toFixed(0)} → ${b.meanSteps.toFixed(0)} |\n`;}}
markdown+='\nPer-episode step-limit outcomes, repeated-state counts and all raw outcomes are retained in [the summary](qa/repair/late-summary.json), [cycle before](qa/repair/late-final-before.json), [cycle after](qa/repair/late-final-after.json), [standard before](qa/repair/late-standard-before.json) and [standard after](qa/repair/late-standard-after.json).\n';
writeFileSync(root+'late-results.md',markdown.replaceAll('(qa/repair/','('));
console.log('Validated 294 paired episodes / 588 total runs.');
