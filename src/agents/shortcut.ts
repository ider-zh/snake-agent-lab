import { cycle, directionBetween, legalActions, moveCell, simulateMove } from '../core';
import type { Agent, DebugInfo, Direction, Observation } from '../core';
import type { SearchBudget } from './index';
export interface CycleIndex { route:number[]; position:Int32Array; }
export function makeCycleIndex(width:number,height:number):CycleIndex {
  const route=cycle(width,height),position=new Int32Array(route.length);
  route.forEach((cell,i)=>{position[cell]=i;});return {route,position};
}
export function forwardDistance(from:number,to:number,size:number):number {return (to-from+size)%size;}
/** Physical adjacency belongs to core; this checks the stronger circular-order invariant.
 * Length >=3 avoids a two-segment successor that is also a forbidden reversal. */
export function cycleOrdered(o:Observation,index:CycleIndex):boolean {
  const c=o.config,n=index.route.length;
  if(c.initialization!=='cycle'||c.obstacles.length||o.snake.length<3||n!==c.width*c.height)return false;
  const tail=index.position[o.snake.at(-1)!];let previous=0;
  for(let i=o.snake.length-2;i>=0;i--){const offset=forwardDistance(tail,index.position[o.snake[i]],n);if(offset<=previous)return false;previous=offset;}
  return true;
}
function successor(o:Observation,index:CycleIndex):Direction {
  return directionBetween(o.snake[0],index.route[(index.position[o.snake[0]]+1)%index.route.length],o.config.width);
}
function after(o:Observation,d:Direction):Observation|null {
  const move=simulateMove(o,d);if(move.illegal||move.collision)return null;
  const full=move.snake.length===o.config.width*o.config.height;
  return {...o,snake:move.snake,direction:d,food:move.ate?null:o.food,score:o.score+(move.ate?1:0),steps:o.steps+1,noFood:move.ate?0:o.noFood+1,terminated:full,reason:full?'filled':null};
}
export function shortcutCandidates(o:Observation,index:CycleIndex,visit=()=>true):{action:Direction;advance:number}[] {
  if(!cycleOrdered(o,index))return [];
  const head=index.position[o.snake[0]],n=index.route.length;
  const foodDistance=o.food===null?0:forwardDistance(head,index.position[o.food],n);
  const candidates:{action:Direction;advance:number}[]=[];
  for(const action of legalActions(o)){
    if(!visit())break;
    const cell=moveCell(o.snake[0],action,o.config.width,o.config.height),advance=forwardDistance(head,index.position[cell],n);
    if(!advance||advance>foodDistance)continue;
    const next=after(o,action);
    if(!next||!cycleOrdered(next,index))continue;
    // Exact core semantics: release the tail only when not growing, and reject
    // states whose ordinary ring successor would collide or reverse.
    if(!next.terminated){const move=simulateMove(next,successor(next,index));if(move.illegal||move.collision)continue;}
    candidates.push({action,advance});
  }
  return candidates;
}
export function createShortcutAgent(limits:SearchBudget,shortcutOccupancy=0.5):Agent {
  if(!Number.isFinite(shortcutOccupancy)||shortcutOccupancy<0||shortcutOccupancy>1)throw new Error('Invalid shortcut occupancy cutoff');
  let index:CycleIndex|undefined,width=0,height=0;
  return {id:'hamiltonian-shortcut',decide(o){
    const start=performance.now();
    if(!index||width!==o.config.width||height!==o.config.height){index=makeCycleIndex(o.config.width,o.config.height);width=o.config.width;height=o.config.height;}
    if(!cycleOrdered(o,index))throw new Error('Hamiltonian shortcut requires cycle initialization, length >= 3, no obstacles, and circular body order');
    const debug:DebugInfo={path:[],visited:[],expanded:0,elapsedMs:0};
    let action=successor(o,index),advance=1;
    if(!o.terminated&&!o.truncated){
      const base=simulateMove(o,action);if(base.illegal||base.collision)throw new Error('Cycle successor invariant failed');
      // At most three physical candidates; no environment RNG is read or consumed.
      if(limits.maxNodes===0||limits.maxMs===0)debug.fallback=limits.maxNodes===0?'node-budget':'time-budget';
      else if(o.snake.length<index.route.length*shortcutOccupancy)for(const candidate of shortcutCandidates(o,index,()=>{
        if(debug.expanded>=limits.maxNodes||performance.now()-start>=limits.maxMs){debug.fallback=debug.expanded>=limits.maxNodes?'node-budget':'time-budget';return false;}
        debug.expanded++;return true;
      })){
        if(candidate.advance>advance){action=candidate.action;advance=candidate.advance;}
      }
      debug.path=[o.snake[0],moveCell(o.snake[0],action,width,height)];
    }
    debug.elapsedMs=performance.now()-start;return {action,debug};
  }};
}
