import {legalActions,SeededRandom,simulateMove} from '../core';
import type {Agent,Direction,Observation,DebugInfo} from '../core';
import type {SearchBudget} from './index';
const BEAM_WIDTH=24,BEAM_DEPTH=16,MCTS_DEPTH=24,MCTS_ITERATIONS=512;
const distance=(o:Observation)=>o.food===null?0:Math.abs(o.snake[0]%o.config.width-o.food%o.config.width)+Math.abs(Math.floor(o.snake[0]/o.config.width)-Math.floor(o.food/o.config.width));
/** No food oracle: reaching food is a leaf, with exact growth but no respawn. */
export function planningMove(o:Observation,action:Direction):Observation|null {
  const m=simulateMove(o,action);if(m.illegal||m.collision)return null;
  const steps=o.steps+1,noFood=m.ate?0:o.noFood+1,filled=m.snake.length===o.config.width*o.config.height-o.config.obstacles.length;
  const reason=filled?'filled':o.config.maxSteps>0&&steps>=o.config.maxSteps?'step-limit':o.config.maxNoFood>0&&noFood>=o.config.maxNoFood?'no-progress':null;
  return {...o,snake:m.snake,direction:m.direction,food:m.ate?null:o.food,score:o.score+Number(m.ate),steps,noFood,terminated:filled,truncated:reason==='step-limit'||reason==='no-progress',reason};
}
function terminal(o:Observation,depth:number,maxDepth:number):boolean{return o.food===null||o.terminated||o.truncated||depth>=maxDepth;}
function value(o:Observation,depth:number):number {
  if(o.reason==='filled')return 1;
  if(o.truncated)return 0;
  const exits=legalActions(o).length;if(!exits)return 0;
  if(o.food===null)return .85+exits*.04-depth*.001;
  return .1+exits*.04+.35/(1+distance(o))+Math.min(depth,24)*.005;
}
export function uct(total:number,visits:number,parentVisits:number):number{return visits===0?Infinity:total/visits+Math.SQRT2*Math.sqrt(Math.log(Math.max(1,parentVisits))/visits);}
class WorkBudget {
  start=performance.now();expanded=0;reason:string|undefined;
  constructor(readonly limits:SearchBudget){}
  visit():boolean {
    if(this.expanded>=this.limits.maxNodes){this.reason='node-budget';return false;}
    if(performance.now()-this.start>=this.limits.maxMs){this.reason='time-budget';return false;}
    this.expanded++;return true;
  }
}
interface Candidate {state:Observation;path:number[];action:Direction;depth:number;value:number;}
interface Tree {state:Observation;depth:number;action?:Direction;parent?:Tree;children:Tree[];untried:Direction[];visits:number;total:number;}
function tree(state:Observation,depth:number,parent?:Tree,action?:Direction):Tree{return {state,depth,parent,action,children:[],untried:terminal(state,depth,MCTS_DEPTH)?[]:legalActions(state),visits:0,total:0};}
export function createLookaheadAgent(id:'beam'|'mcts',seed:number,limits:SearchBudget):Agent {
  const random=new SeededRandom(seed);
  return {id,decide(o){
    const budget=new WorkBudget(limits),actions=legalActions(o),debug:DebugInfo={path:[],visited:[],expanded:0,elapsedMs:0};
    let chosen=actions[0]??o.direction,iterations=0,maxDepth=0;
    const roots:{action:Direction;visits:number;mean:number}[]=[];
    if(!o.terminated&&!o.truncated&&actions.length){
      if(id==='beam'){
        let beam:Candidate[]=[{state:o,path:[o.snake[0]],action:chosen,depth:0,value:0}],best:Candidate|undefined;
        levels: for(let depth=1;depth<=BEAM_DEPTH;depth++){
          const candidates:Candidate[]=[],seen=new Set<string>();
          for(const node of beam){
            if(terminal(node.state,node.depth,BEAM_DEPTH)){candidates.push(node);continue;}
            for(const action of legalActions(node.state)){
              if(!budget.visit())break levels;
              const state=planningMove(node.state,action)!;
              const key=`${state.snake.join(',')}/${state.direction}/${state.food}`;
              if(seen.has(key))continue;seen.add(key);
              const candidate={state,path:[...node.path,state.snake[0]],action:node.depth?node.action:action,depth,value:value(state,depth)};
              candidates.push(candidate);maxDepth=Math.max(maxDepth,depth);
              if(debug.visited.length<256)debug.visited.push(state.snake[0]);
              if(!best||candidate.value>best.value)best=candidate;
            }
          }
          iterations++;
          if(!candidates.length)break;
          candidates.sort((a,b)=>b.value-a.value||a.action-b.action);
          beam=candidates.slice(0,BEAM_WIDTH);best=beam[0];
          if(beam.every(n=>terminal(n.state,n.depth,BEAM_DEPTH)))break;
        }
        if(best){chosen=best.action;debug.path=best.path;}
        for(const action of actions){const selected=beam.filter(n=>n.action===action&&n.depth);if(selected.length)roots.push({action,visits:selected.length,mean:Math.max(...selected.map(n=>n.value))});}
      }else{
        const root=tree(o,0);
        for(;iterations<MCTS_ITERATIONS;iterations++){
          if(!budget.visit())break;
          let node=root;
          while(!node.untried.length&&node.children.length){
            if(!budget.visit())break;
            node=node.children.reduce((best,c)=>uct(c.total,c.visits,node.visits)>uct(best.total,best.visits,node.visits)?c:best);
          }
          if(!budget.reason&&node.untried.length&&budget.visit()){
            const index=random.int(node.untried.length),action=node.untried.splice(index,1)[0];
            const child=tree(planningMove(node.state,action)!,node.depth+1,node,action);node.children.push(child);node=child;
          }
          let state=node.state,depth=node.depth;
          while(!terminal(state,depth,MCTS_DEPTH)){
            const legal=legalActions(state);if(!legal.length||!budget.visit())break;
            state=planningMove(state,legal[random.int(legal.length)])!;depth++;
          }
          maxDepth=Math.max(maxDepth,depth);const reward=value(state,depth);
          if(debug.visited.length<256)debug.visited.push(state.snake[0]);
          for(let current:Tree|undefined=node;current;current=current.parent){current.visits++;current.total+=reward;}
          if(budget.reason){iterations++;break;}
        }
        for(const c of root.children)roots.push({action:c.action!,visits:c.visits,mean:c.total/c.visits});
        roots.sort((a,b)=>b.visits-a.visits||b.mean-a.mean||a.action-b.action);if(roots.length)chosen=roots[0].action;
      }
    }
    if(!debug.path.length){const move=simulateMove(o,chosen);debug.path=move.collision?[o.snake[0]]:[o.snake[0],move.snake[0]];}
    debug.expanded=budget.expanded;debug.elapsedMs=performance.now()-budget.start;
    debug.fallback=budget.reason??(!actions.length?'no-legal-action':undefined);
    debug.planning={kind:id,iterations,maxDepth,roots};
    return {action:chosen,debug};
  }};
}
