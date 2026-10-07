import {Game} from '../src/core';
import {createAgent} from '../src/agents';
import {readFileSync,writeFileSync} from 'node:fs';
import console from 'node:console';
const evidence=JSON.parse(readFileSync('docs/qa/tabular/evaluation.json','utf8'));
const episodes=evidence.protocol.testSeeds.map((seed:number)=>{
  const game=new Game(evidence.protocol.game,seed),agent=createAgent('legal-random',seed);
  while(!game.observe().terminated&&!game.observe().truncated)game.step(agent.decide(game.observe()).action);
  const o=game.observe();return {seed,score:o.score,steps:o.steps,reason:o.reason,fill:o.snake.length/(o.config.width*o.config.height-o.config.obstacles.length),hash:game.hash()};
});
const result={policy:'legal-random',strategySeed:'same integer as environment seed, separate RNG instance',game:evidence.protocol.game,episodes,meanScore:episodes.reduce((s:number,r:{score:number})=>s+r.score,0)/episodes.length};
writeFileSync('docs/qa/tabular/legal-random-baseline.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
