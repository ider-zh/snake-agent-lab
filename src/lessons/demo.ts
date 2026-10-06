import { createAgent } from '../agents';
import { Game, type AgentId } from '../core';
export function lessonGame(agent?: AgentId, scene='obstacles'): Game {
  const game=new Game({width:8,height:8,initialLength:3,initialization:agent==='hamiltonian'?'cycle':'standard',obstacles:agent==='hamiltonian'||scene==='open'?[]:[27],maxSteps:1000,maxNoFood:200},7);
  if(agent!=='hamiltonian') game.restore({...game.snapshot(),food:18});
  return game;
}
export function lessonDecision(agent: AgentId, scene: string, moves: number) {
  const game=lessonGame(agent,scene),options={trace:false};
  const policy=createAgent(agent,7,{maxNodes:10000,maxMs:Infinity},options);
  for(let i=0;i<moves&&!game.observe().terminated&&!game.observe().truncated;i++) game.step(policy.decide(game.observe()).action);
  options.trace=true;
  return {observation:game.observe(),decision:policy.decide(game.observe()),hash:game.hash()};
}
