import { createLookaheadAgent } from './lookahead';
import { tailDecision } from './tail';
import { createShortcutAgent } from './shortcut';
import { cycle, directionBetween, legalActions, moveCell, SeededRandom, simulateMove } from '../core';
import type { Agent, AgentId, DebugInfo, Decision, Direction, Observation, SearchFrame } from '../core';
export type { Agent, AgentId, DebugInfo, Decision } from '../core';

export interface SearchBudget { maxNodes: number; maxMs: number; }
const DEFAULT_BUDGET: SearchBudget = { maxNodes: 10_000, maxMs: 20 };
const DIRECTIONS: Direction[] = [0, 1, 2, 3];
const now = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const distance = (a: number, b: number, width: number): number => Math.abs(a % width - b % width) + Math.abs(Math.floor(a / width) - Math.floor(b / width));

class Budget {
  readonly start = now();
  expanded = 0;
  reason: string | undefined;
  constructor(readonly limits: SearchBudget) {}
  visit(): boolean {
    if (this.expanded >= this.limits.maxNodes) { this.reason ??= 'node-budget'; return false; }
    if (now() - this.start >= this.limits.maxMs) { this.reason ??= 'time-budget'; return false; }
    this.expanded++; return true;
  }
  elapsed(): number { return now() - this.start; }
}
interface HeapNode { cell: number; g: number; f: number; sequence: number; }
class MinHeap {
  nodes: HeapNode[] = [];
  private before(a: HeapNode, b: HeapNode): boolean { return a.f < b.f || (a.f === b.f && a.sequence < b.sequence); }
  push(node: HeapNode): void {
    this.nodes.push(node); let i = this.nodes.length - 1;
    while (i) { const p = (i - 1) >>> 1; if (!this.before(node, this.nodes[p])) break; this.nodes[i] = this.nodes[p]; i = p; }
    this.nodes[i] = node;
  }
  pop(): HeapNode | undefined {
    if (!this.nodes.length) return undefined;
    const first = this.nodes[0], last = this.nodes.pop()!;
    if (this.nodes.length) {
      let i = 0;
      while (i * 2 + 1 < this.nodes.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.nodes.length && this.before(this.nodes[child + 1], this.nodes[child])) child++;
        if (!this.before(this.nodes[child], last)) break;
        this.nodes[i] = this.nodes[child]; i = child;
      }
      this.nodes[i] = last;
    }
    return first;
  }
}

function pathToFood(obs: Observation, algorithm: 'bfs' | 'astar' | 'dijkstra' | 'best-first', budget: Budget, visited: number[], trace?: SearchFrame[]): number[] | null {
  if (obs.food === null) return null;
  const { width, height } = obs.config, start = obs.snake[0], goal = obs.food;
  const blocked = new Set([...obs.config.obstacles, ...obs.snake.slice(1, -1)]);
  const count = width * height, previous = new Int32Array(count).fill(-1), gScore = new Float64Array(count).fill(Infinity);
  gScore[start] = 0;
  const queue = [start], heap = new MinHeap(); let index = 0, sequence = 0;
  const priority = (g: number, h: number) => algorithm === 'dijkstra' ? g : algorithm === 'best-first' ? h : g + h;
  if (algorithm !== 'bfs') heap.push({ cell: start, g: 0, f: priority(0, distance(start, goal, width)), sequence: sequence++ });
  const capture = (current: number) => {
    if (!trace || trace.length >= 256) return;
    const node = (cell: number) => { const g = gScore[cell], h = distance(cell, goal, width); return { cell, g, h, f: priority(g,h) }; };
    const pending = algorithm === 'bfs' ? queue.slice(index) : heap.nodes.filter(n => n.g === gScore[n.cell]).slice().sort((a,b) => a.f-b.f || a.sequence-b.sequence).map(n => n.cell);
    trace.push({ current: node(current), frontier: [...new Set(pending)].map(node), visited: [...visited] });
  };
  while (algorithm === 'bfs' ? index < queue.length : heap.nodes.length > 0) {
    let current: number;
    if (algorithm === 'bfs') current = queue[index++];
    else { const node = heap.pop()!; if (node.g !== gScore[node.cell]) continue; current = node.cell; }
    if (!budget.visit()) return null;
    visited.push(current);
    if (current === goal) {
      capture(current);
      const path = [goal];
      while (path[path.length - 1] !== start) path.push(previous[path[path.length - 1]]);
      return path.reverse();
    }
    for (const direction of DIRECTIONS) {
      if (current === start && direction === (obs.direction + 2) % 4) continue;
      const next = moveCell(current, direction, width, height);
      if (next < 0 || blocked.has(next)) continue;
      const tentative = gScore[current] + 1;
      if (tentative >= gScore[next]) continue;
      previous[next] = current; gScore[next] = tentative;
      if (algorithm === 'bfs') queue.push(next);
      else heap.push({ cell: next, g: tentative, f: priority(tentative, distance(next, goal, width)), sequence: sequence++ });
    }
    capture(current);
  }
  return null;
}

interface Safety { tailReachable: boolean; space: number; sufficient: boolean; complete: boolean; }
function spaceCheck(obs: Observation, budget: Budget): Safety {
  const { width, height } = obs.config, available = width * height - obs.config.obstacles.length;
  if (obs.snake.length === available) return { tailReachable: true, space: available, sufficient: true, complete: true };
  const head = obs.snake[0], tail = obs.snake[obs.snake.length - 1];
  const blocked = new Set([...obs.config.obstacles, ...obs.snake.slice(1, -1)]);
  const seen = new Set([head]), queue = [head]; let index = 0, complete = true;
  while (index < queue.length) {
    if (!budget.visit()) { complete = false; break; }
    const cell = queue[index++];
    for (const direction of DIRECTIONS) {
      const next = moveCell(cell, direction, width, height);
      if (next < 0 || blocked.has(next) || seen.has(next)) continue;
      seen.add(next); queue.push(next);
    }
  }
  // The tail is allowed as an exit because it will release on the next non-food
  // move. This is a heuristic, not a proof of long-term survival.
  const threshold = Math.min(obs.snake.length, available - obs.snake.length + (obs.snake.length > 1 ? 2 : 1));
  return { tailReachable: seen.has(tail), space: seen.size, sufficient: seen.has(tail) && seen.size >= threshold, complete };
}

function afterMove(obs: Observation, action: Direction): Observation | null {
  const move = simulateMove(obs, action);
  if (move.illegal || move.collision) return null;
  return { ...obs, snake: move.snake, direction: move.direction, food: move.ate ? null : obs.food,
    score: obs.score + (move.ate ? 1 : 0), steps: obs.steps + 1, noFood: move.ate ? 0 : obs.noFood + 1 };
}

/** Simulates every step with the same body/tail/growth implementation as Game. */
function simulatePath(obs: Observation, path: readonly number[], budget?: Budget): Observation | null {
  if (!path.length || path[0] !== obs.snake[0]) return null;
  let state = obs;
  for (let i = 1; i < path.length; i++) {
    if (budget && !budget.visit()) return null;
    let direction: Direction;
    try { direction = directionBetween(state.snake[0], path[i], obs.config.width); } catch { return null; }
    const next = afterMove(state, direction);
    if (!next) return null;
    state = next;
    // There is no oracle for the next food. Candidate paths must stop at eating.
    if (state.food === null && i !== path.length - 1) return null;
  }
  return state;
}

export function validatePath(obs: Observation, path: readonly number[]): Observation | null {
  return simulatePath(obs, path);
}

/** With one empty cell the next food location is forced by occupancy, not RNG.
 * Prove a complete legal finish before rejecting a grown body for static space. */
function forcedFinish(obs:Observation,budget:Budget):boolean {
 const available=obs.config.width*obs.config.height-obs.config.obstacles.length;
 if(obs.snake.length!==available-1||obs.food!==null)return false;
 const occupied=new Set([...obs.snake,...obs.config.obstacles]);let food=0;while(occupied.has(food))food++;
 const queue:Observation[]=[{...obs,food}],seen=new Set<string>();
 const ceiling=Math.min(budget.limits.maxNodes,budget.expanded+available*2);
 for(let i=0;i<queue.length&&budget.expanded<ceiling;i++){
  if(!budget.visit())return false;
  const state=queue[i];
  for(const action of legalActions(state)){
   const next=afterMove(state,action)!;if(next.snake.length===available)return true;
   const key=`${next.direction}/${next.snake.join(',')}`;if(!seen.has(key)){seen.add(key);queue.push(next);}
  }
 }
 return false;
}

/** Search body configurations when a static occupancy map misses released cells.
 * Stops at the observed food; no future food or environment RNG is consulted. */
function movingBodyPath(obs:Observation,budget:Budget):number[]|null {
  if(obs.food===null)return null;
  const ceiling=budget.expanded+Math.floor((budget.limits.maxNodes-budget.expanded)*.7);
  let initialHash=0,power=1;
  for(const cell of obs.snake){initialHash=(initialHash+Math.imul(cell+1,power))>>>0;power=Math.imul(power,31)>>>0;}
  const states=[{obs,parent:-1,hash:initialHash}],heap=new MinHeap(),seen=new Map<number,number[]>();let sequence=0;
  heap.push({cell:0,g:0,f:distance(obs.snake[0],obs.food,obs.config.width),sequence:sequence++});
  seen.set(initialHash,[0]);
  // Keep time for the fallback's escape checks as well as reserving nodes.
  while(heap.nodes.length&&budget.expanded<ceiling&&budget.elapsed()<budget.limits.maxMs*.65){
    if(!budget.visit())return null;
    const item=heap.pop()!,node=states[item.cell];
    if(node.obs.food===null){
      const safe=spaceCheck(node.obs,budget);
      if(safe.complete&&safe.tailReachable||forcedFinish(node.obs,budget)){
        const path:number[]=[];for(let i=item.cell;i>=0;i=states[i].parent)path.push(states[i].obs.snake[0]);return path.reverse();
      }
      continue;
    }
    for(const action of legalActions(node.obs)){
      const next=afterMove(node.obs,action)!;
      const hash=(Math.imul(node.hash,31)+next.snake[0]+1-(next.food===null?0:Math.imul(node.obs.snake.at(-1)!+1,power)))>>>0;
      const bucket=seen.get(hash)??[];
      // Hashes only index candidates. Exact comparison preserves correctness
      // even if two different bodies have the same 32-bit hash.
      if(bucket.some(i=>states[i].obs.direction===next.direction&&states[i].obs.snake.length===next.snake.length&&states[i].obs.snake.every((cell,j)=>cell===next.snake[j])))continue;
      const g=item.g+1,index=states.length;states.push({obs:next,parent:item.cell,hash});bucket.push(index);seen.set(hash,bucket);
      heap.push({cell:index,g,f:g+distance(next.snake[0],obs.food,obs.config.width),sequence:sequence++});
    }
  }
  return null;
}

function fallback(obs: Observation, budget: Budget, visits: Map<string,number>): Direction {
  const actions = legalActions(obs);
  if (!actions.length) return obs.direction;
  let best = actions[0], bestScore = -Infinity;
  for (const action of actions) {
    const next = afterMove(obs, action)!;
    const safety = spaceCheck(next, budget);
    const exits = legalActions(next).length;
    const closeness = obs.food === null ? 0 : distance(next.snake[0], obs.food, obs.config.width);
    // Reachable tail and flood space dominate distance; local exits remain useful
    // when no search budget is left. Never expand beyond the decision budget.
    const value = (safety.sufficient ? 1_000_000 : 0) + (safety.tailReachable ? 100_000 : 0) + safety.space * 100 + exits * 10 - closeness / 100 - (visits.get(`${next.food}/${next.direction}/${next.snake.join(',')}`)??0)*10_000;
    if (value > bestScore) { bestScore = value; best = action; }
  }
  return best;
}

export function hamiltonianApplicable(obs: Observation): boolean {
  const c = obs.config;
  if (c.initialization !== 'cycle' || c.obstacles.length || c.width < 2 || c.height < 2 || (c.width % 2 && c.height % 2)) return false;
  const route = cycle(c.width, c.height), position = new Int32Array(route.length);
  route.forEach((cell, index) => { position[cell] = index; });
  for (let i = 1; i < obs.snake.length; i++) if ((position[obs.snake[i]] + 1) % route.length !== position[obs.snake[i - 1]]) return false;
  const index = position[obs.snake[0]], next = route[(index + 1) % route.length], previous = route[(index + route.length - 1) % route.length];
  const incoming = directionBetween(previous, obs.snake[0], c.width), outgoing = directionBetween(obs.snake[0], next, c.width);
  return (obs.direction === incoming || obs.direction === outgoing) && outgoing !== (obs.direction + 2) % 4;
}

/** Agent and environment use separate PRNG instances. Wall-clock debug is not replay state. */
export function createAgent(id: AgentId, seed = 1, requestedBudget: SearchBudget = DEFAULT_BUDGET, options: { trace?: boolean; recovery?:boolean } = {}): Agent {
  if (!['random', 'legal-random', 'greedy', 'safe-greedy', 'bfs', 'astar', 'hamiltonian', 'hamiltonian-shortcut', 'tail-safe', 'dijkstra', 'best-first', 'beam', 'mcts'].includes(id)) throw new Error(`Unknown agent: ${id}`);
  if (!Number.isInteger(requestedBudget.maxNodes) || requestedBudget.maxNodes < 0 || requestedBudget.maxNodes > 10_000_000 || typeof requestedBudget.maxMs !== 'number' || Number.isNaN(requestedBudget.maxMs) || requestedBudget.maxMs < 0) throw new Error('Invalid decision budget');
  if (id === 'beam' || id === 'mcts') return createLookaheadAgent(id,seed,{...requestedBudget});
  if (id === 'tail-safe') { const limits={...requestedBudget},base=createAgent('astar',seed,limits);return {id,decide:obs=>tailDecision(obs,base.decide(obs),limits,true,Math.floor(obs.noFood/(obs.config.width*obs.config.height)))}; }
  if (id === 'hamiltonian-shortcut') return createShortcutAgent({ ...requestedBudget });
  const limits = { ...requestedBudget }, random = new SeededRandom(seed), visits=new Map<string,number>();
  let lastFood:number|null=null;
  let committed:number[]=[],expectedBody='',committedFood:number|null=null;
  return { id, decide(obs: Observation): Decision {
    const budget = new Budget(limits), debug: DebugInfo = { path: [], visited: [], expanded: 0, elapsedMs: 0 };
    if(!obs.terminated&&!obs.truncated&&committed.length>1&&committedFood===obs.food&&expectedBody===`${obs.direction}/${obs.snake.join(',')}`&&committed[0]===obs.snake[0]){
      const action=directionBetween(committed[0],committed[1],obs.config.width),next=afterMove(obs,action);
      if(next){const path=[...committed];committed.shift();expectedBody=`${next.direction}/${next.snake.join(',')}`;return {action,debug:{...debug,path,elapsedMs:budget.elapsed(),fallback:'dynamic-body-committed-path'}};}
    }
    committed=[];
    let action: Direction = obs.direction;
    if(obs.food!==lastFood){visits.clear();lastFood=obs.food;}
    const stateKey=`${obs.food}/${obs.direction}/${obs.snake.join(',')}`;
    if(options.recovery!==false&&id!=='safe-greedy')visits.set(stateKey,(visits.get(stateKey)??0)+1);
    if(visits.size>2048)visits.delete(visits.keys().next().value!);
    if (!obs.terminated && !obs.truncated) {
      if (id === 'random') action = random.int(4) as Direction;
      else if (id === 'legal-random') {
        const actions = legalActions(obs); action = actions.length ? actions[random.int(actions.length)] : obs.direction;
        if (!actions.length) debug.fallback = 'no-legal-action';
      } else if (id === 'hamiltonian') {
        if (!hamiltonianApplicable(obs)) throw new Error('Hamiltonian agent requires valid cycle initialization, no obstacles, and an even board side');
        const route = cycle(obs.config.width, obs.config.height), index = route.indexOf(obs.snake[0]);
        const next = route[(index + 1) % route.length]; action = directionBetween(obs.snake[0], next, obs.config.width);
        debug.path = [obs.snake[0], ...Array.from({ length: Math.min(route.length - 1, 24) }, (_, offset) => route[(index + offset + 1) % route.length])];
      } else if (id === 'greedy') {
        const head = obs.snake[0], x = head % obs.config.width, y = Math.floor(head / obs.config.width);
        const fx = (obs.food ?? head) % obs.config.width, fy = Math.floor((obs.food ?? head) / obs.config.width);
        let best = Infinity;
        for (const candidate of DIRECTIONS) {
          if (candidate === (obs.direction + 2) % 4) continue;
          const dist = Math.abs(x + [0, 1, 0, -1][candidate] - fx) + Math.abs(y + [-1, 0, 1, 0][candidate] - fy);
          if (dist < best) { best = dist; action = candidate; }
        }
      } else if (id === 'safe-greedy') {
        const candidates = legalActions(obs).sort((a, b) => distance(moveCell(obs.snake[0], a, obs.config.width, obs.config.height), obs.food ?? obs.snake[0], obs.config.width) - distance(moveCell(obs.snake[0], b, obs.config.width, obs.config.height), obs.food ?? obs.snake[0], obs.config.width) || a - b);
        let found = false;
        for (const candidate of candidates) {
          if (spaceCheck(afterMove(obs, candidate)!, budget).sufficient && !budget.reason) { action = candidate; found = true; break; }
        }
        if (!found) { action = fallback(obs, budget, visits); debug.fallback = budget.reason ?? 'no-safe-greedy-move'; }
      } else {
        const path = pathToFood(obs, id, budget, debug.visited);
        const simulated = path ? simulatePath(obs, path, budget) : null;
        const safe = simulated ? spaceCheck(simulated, budget) : null;
        if (path && path.length > 1 && simulated && safe?.complete && (options.recovery===false?safe.sufficient:safe.tailReachable||forcedFinish(simulated,budget)) && !budget.reason) {
          action = directionBetween(path[0], path[1], obs.config.width); debug.path = path;
        } else {
          const dynamic=options.recovery!==false&&!budget.reason&&(obs.snake.length>=obs.config.width*obs.config.height/2||obs.noFood>=obs.config.width*obs.config.height)?movingBodyPath(obs,budget):null;
          if(dynamic){action=directionBetween(dynamic[0],dynamic[1],obs.config.width);debug.path=dynamic;debug.fallback='dynamic-body-food-path';committed=dynamic.slice(1);committedFood=obs.food;const next=afterMove(obs,action)!;expectedBody=`${next.direction}/${next.snake.join(',')}`;}
          else {action = fallback(obs, budget, visits);
          debug.fallback = budget.reason ?? (path ? simulated ? 'unsafe-food-path' : 'invalid-dynamic-path' : 'no-food-path');}
        }
      }
      if (!debug.path.length) { const next = moveCell(obs.snake[0], action, obs.config.width, obs.config.height); debug.path = next >= 0 ? [obs.snake[0], next] : [obs.snake[0]]; }
    }
    debug.expanded = budget.expanded; debug.elapsedMs = budget.elapsed();
    // Replay the exact search prefix only AFTER deciding. Instrumentation cannot
    // consume the decision's wall-clock budget or either random stream.
    if (options.trace && debug.fallback!=='dynamic-body-food-path' && (id === 'bfs' || id === 'astar' || id === 'dijkstra' || id === 'best-first')) {
      debug.trace = [];
      pathToFood(obs, id, new Budget({ maxNodes: Math.min(debug.visited.length, 256), maxMs: Infinity }), [], debug.trace);
      debug.traceTruncated = debug.visited.length > 256;
    }
    const decision={action,debug};
    return decision;
  } };
}
