import {Game} from '../src/core';
import {createShortcutAgent} from '../src/agents/shortcut';
import console from 'node:console';
import {mkdirSync,writeFileSync} from 'node:fs';
const results=[];
for(const size of [8,12,20])for(const occupancy of [0,.25,.5,.75,1]){
  const rows=[];
  for(let seed=101;seed<=105;seed++){
    const game=new Game({width:size,height:size,initialization:'cycle',maxSteps:size**4,maxNoFood:size*size},seed),agent=createShortcutAgent({maxNodes:10000,maxMs:Infinity},occupancy);
    while(!game.observe().terminated&&!game.observe().truncated)game.step(agent.decide(game.observe()).action);
    rows.push({seed,steps:game.observe().steps,reason:game.observe().reason});
  }
  const result={size,occupancy,meanSteps:rows.reduce((n,r)=>n+r.steps,0)/rows.length,rows};results.push(result);console.log(JSON.stringify(result));
}
mkdirSync('docs/qa/shortcut',{recursive:true});writeFileSync('docs/qa/shortcut/occupancy-pilot.json',JSON.stringify({notes:'Development-only seeds 101–105; occupancy cutoff selection. Not an independent test.',results},null,2)+'\n');
