import {directionBetween,moveCell,simulateMove} from '../core';
import type {Decision,Direction,Observation} from '../core';
import type {SearchBudget} from './index';
/** Bounded tail detour: no guarantee beyond exact validation of the candidate path. */
export function tailDecision(o:Observation,base:Decision,limits:SearchBudget,extend=true,rotation=0):Decision {
  if(!base.debug.fallback||base.debug.fallback.startsWith('dynamic-body-')||o.terminated||o.truncated)return base;
  const start=performance.now()-base.debug.elapsedMs;
  let expanded=base.debug.expanded,reason:string|undefined;
  const visit=()=>{if(expanded>=limits.maxNodes){reason='node-budget';return false;}if(performance.now()-start>=limits.maxMs){reason='time-budget';return false;}expanded++;return true;};
  const result=(path?:number[]):Decision=>({action:path?directionBetween(path[0],path[1],o.config.width):base.action,debug:{...base.debug,path:path??base.debug.path,expanded,elapsedMs:performance.now()-start,fallback:path?'validated-tail-detour':`${base.debug.fallback}${reason?`;tail-${reason}`:''}`}});
  const {width,height}=o.config,head=o.snake[0],tail=o.snake.at(-1)!;
  const blocked=new Set([...o.config.obstacles,...o.snake.slice(1,-1),...(o.food===null?[]:[o.food])]);
  const queue=[head],parents=new Map<number,number>([[head,-1]]);let found=false;
  for(let i=0;i<queue.length;i++){
    if(!visit())return result();const cell=queue[i];if(cell===tail){found=true;break;}
    for(const d of [0,1,2,3].map(d=>(d+rotation)%4) as Direction[]){if(cell===head&&d===(o.direction+2)%4)continue;const next=moveCell(cell,d,width,height);if(next<0||blocked.has(next)||parents.has(next))continue;parents.set(next,cell);queue.push(next);}
  }
  if(!found||head===tail)return result();
  const path=[tail];while(path.at(-1)!==head)path.push(parents.get(path.at(-1)!)!);path.reverse();
  const used=new Set(path);
  // Replace a path edge by a two-cell rectangular detour; never revisit a cell.
  // Reserve at least half the remaining time/nodes for exact dynamic validation.
  const reserveNodes=Math.max(0,Math.floor((limits.maxNodes-expanded)/2)),extensionStart=expanded;
  extensions: for(let pass=0;pass<(extend?16:0);pass++){
    let extended=false;
    for(let i=0;i<path.length-1&&!extended;i++){
      const d=directionBetween(path[i],path[i+1],width);
      for(const p of [(d+1)%4,(d+3)%4] as Direction[]){
        if(expanded-extensionStart>=reserveNodes||performance.now()-start>=limits.maxMs/2)break extensions;
        if(!visit())return result();const a=moveCell(path[i],p,width,height),b=moveCell(path[i+1],p,width,height);
        if(a<0||b<0||used.has(a)||used.has(b)||blocked.has(a)||blocked.has(b))continue;
        used.add(a);used.add(b);path.splice(i+1,0,a,b);extended=true;break;
      }
    }
    if(!extended)break;
  }
  let state=o;
  for(let i=1;i<path.length;i++){
    if(!visit())return result();const d=directionBetween(state.snake[0],path[i],width),move=simulateMove(state,d);
    if(move.illegal||move.collision||move.ate)return result();
    state={...state,snake:move.snake,direction:d,steps:state.steps+1,noFood:state.noFood+1};
  }
  return result(path);
}
