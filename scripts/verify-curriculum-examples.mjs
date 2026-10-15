/* global console */
/* Independent checks of original textbook fixtures, not game-performance results. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const results=[];
function check(name,actual,expected){assert.deepEqual(actual,expected,name);results.push({name,actual,expected,passed:true});}
const directions=[[0,-1],[1,0],[0,1],[-1,0]],key=p=>p.join(','),distance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
function neighbors(p,w,h){return directions.map(([x,y])=>[p[0]+x,p[1]+y]).filter(([x,y])=>x>=0&&y>=0&&x<w&&y<h);}
function search(kind){
 const blocked=new Set(['1,1','2,1','2,2']),goal=[3,1],open=[{p:[0,1],path:[[0,1]],order:0}],seen=new Set(['0,1']);let order=1;
 while(open.length){
  if(kind==='best-first-lifo')open.sort((a,b)=>distance(a.p,goal)-distance(b.p,goal)||b.order-a.order);
  const item=open.shift();if(key(item.p)===key(goal))return item.path;
  for(const next of neighbors(item.p,4,4))if(!blocked.has(key(next))&&!seen.has(key(next))){seen.add(key(next));open.push({p:next,path:[...item.path,next],order:order++});}
 }
 throw new Error('Fixture has no route');
}
check('board A FIFO shortest route',search('bfs').length-1,5);
check('board A h priority with explicit newest-first ties',search('best-first-lifo').length-1,7);
const walls=new Set(['3,1','4,1','3,3','4,3']);
function area(body){const blocked=new Set([...walls,...body.slice(1).map(key)]),seen=new Set([key(body[0])]),queue=[body[0]];for(const p of queue)for(const n of neighbors(p,5,5))if(!blocked.has(key(n))&&!seen.has(key(n))){seen.add(key(n));queue.push(n);}return seen.size;}
check('board B areas with all non-head body cells frozen',[[[2,1],[2,2],[1,2]],[[3,2],[2,2],[1,2]],[[2,3],[2,2],[1,2]]].map(area),[17,2,17]);
const ranks=[[0,1,2,3],[15,6,5,4],[14,7,8,9],[13,12,11,10]],position=[];
ranks.forEach((row,y)=>row.forEach((rank,x)=>position[rank]=[x,y]));
check('4x4 cycle covers every cell and all edges close',new Set(position.map(key)).size===16&&position.every((p,i)=>distance(p,position[(i+1)%16])===1),true);
check('shortcut 1 to 6 is physically adjacent',distance(position[1],position[6]),1);
const forward=(a,b)=>(b-a+16)%16;
check('shortcut food and tail distances',[forward(1,6),forward(1,8),forward(1,15)],[5,7,14]);
check('corrected shortcut exercise is adjacent and skips food',[distance(position[14],position[7]),forward(14,7),forward(14,3),forward(14,10)],[1,9,5,12]);
const trapBody=[[0,1],[1,1],[1,0],[2,0],[2,1],[2,2],[3,2],[3,3]],afterFood=[[0,0],...trapBody];
check('corner food has no legal exit after growth',neighbors(afterFood[0],4,4).filter(p=>!afterFood.slice(0,-1).some(b=>key(b)===key(p))).length,0);
check('Q-learning fixed update',Number((2+.2*(1+.9*5-2)).toFixed(10)),2.7);
check('SARSA sampled-action update',Number((2+.2*(1+.9*1-2)).toFixed(10)),1.98);
check('Double vs ordinary DQN target',[1+.9*3,1+.9*6],[3.7,6.4]);
const objective=(ratio,a)=>Math.min(ratio*a,Math.max(.8,Math.min(1.2,ratio))*a);
check('PPO positive and negative advantages',[objective(1.5,1),objective(.5,-1)],[1.2,-.8]);
check('two-term GAE',Number((1+.9*.8*2).toFixed(10)),2.44);
check('UCT tutorial c=.5, rounded 3 decimals',[.70+.5*Math.sqrt(Math.log(20)/16),.55+.5*Math.sqrt(Math.log(20)/4)].map(n=>Number(n.toFixed(3))),[.916,.983]);
check('UCT backup mean',Number(((4*.55+.9)/5).toFixed(10)),.62);
check('BC independent-error thought experiment percent',Number((100*.99**200).toFixed(1)),13.4);
check('GA fixed fitness',Number((.375*1000-.5*.1+.15*.01).toFixed(4)),374.9515);
mkdirSync('docs/qa/classroom',{recursive:true});writeFileSync('docs/qa/classroom/worked-example-checks.json',JSON.stringify({scope:'Original teaching fixtures only; not application benchmark scores',results},null,2)+'\n');
console.log(`${results.length} independent worked-example checks passed.`);
