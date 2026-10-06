// Each displayed/downloaded program is self-contained. No server executes user code.
const jsBase = `// 坐标使用 row-major 格编号；方向 0上 1右 2下 3左。
const width=8, height=8, snake=[36,35,34], food=18, direction=1, obstacles=[27];
function move(cell,d) {
  const x=cell%width,y=Math.floor(cell/width);
  const nx=x+[0,1,0,-1][d],ny=y+[-1,0,1,0][d];
  return nx<0||nx>=width||ny<0||ny>=height ? -1 : ny*width+nx;
}
function distance(a,b) { return Math.abs(a%width-b%width)+Math.abs(Math.floor(a/width)-Math.floor(b/width)); }
// 增长时尾格不释放；非增长时可进入尾格。
function legal(d) {
  const next=move(snake[0],d),body=next===food?snake:snake.slice(0,-1);
  return d!==(direction+2)%4 && next>=0 && !obstacles.includes(next) && !body.includes(next);
}
`;
const pyBase = `# Python 3；row-major 格编号；方向 0上 1右 2下 3左。
import json
width, height = 8, 8
snake, food, direction, obstacles = [36,35,34], 18, 1, [27]
def move(cell, d):
    x, y = cell % width, cell // width
    nx, ny = x + [0,1,0,-1][d], y + [-1,0,1,0][d]
    return -1 if nx < 0 or nx >= width or ny < 0 or ny >= height else ny * width + nx
def distance(a, b):
    return abs(a % width - b % width) + abs(a // width - b // width)
# 增长时尾格不释放；非增长时可进入尾格。
def legal(d):
    nxt = move(snake[0], d)
    body = snake if nxt == food else snake[:-1]
    return d != (direction+2)%4 and nxt >= 0 and nxt not in obstacles and nxt not in body
`;
const snippets: Record<string, [string,string]> = {
random:[`// 输入外部随机数 u∈[0,1)，输出方向；0.6 对应下。
function choose(u) { return Math.floor(u*4); }
console.log(JSON.stringify(choose(0.6)));`, `# 输入随机数 u∈[0,1)，输出方向；与 JS 共享输入。
def choose(u):
    return int(u*4)
print(json.dumps(choose(0.6)))`],
'legal-random':[`// 输入固定棋盘及 u，输出立即合法方向；空集合延续原方向。
const actions=[0,1,2,3].filter(legal),u=0.6;
console.log(JSON.stringify(actions.length?actions[Math.floor(u*actions.length)]:direction));`, `# 输入固定棋盘及 u；按上右下左过滤，保持同样的平局顺序。
actions = [d for d in range(4) if legal(d)]
u = 0.6
print(json.dumps(actions[int(u*len(actions))] if actions else direction))`],
greedy:[`// 虚拟下一坐标可以越界：当前 Greedy 故意不做碰撞过滤。
function choose() {
  let best=Infinity,action=direction;
  for(let d=0;d<4;d++) {
    if(d===(direction+2)%4) continue;
    const x=snake[0]%width+[0,1,0,-1][d],y=Math.floor(snake[0]/width)+[-1,0,1,0][d];
    const score=Math.abs(x-food%width)+Math.abs(y-Math.floor(food/width));
    if(score<best) { best=score;action=d; }
  }
  return action;
}
console.log(JSON.stringify(choose()));`, `# 虚拟下一坐标可以越界；这个策略没有碰撞过滤。
def choose():
    best, action = float('inf'), direction
    for d in range(4):
        if d == (direction+2)%4:
            continue
        x, y = snake[0]%width+[0,1,0,-1][d], snake[0]//width+[-1,0,1,0][d]
        score = abs(x-food%width)+abs(y-food//width)
        if score < best:
            best, action = score, d
    return action
print(json.dumps(choose()))`],
'safe-greedy':[`// 空间检查构件：输入静态身体，输出可达格数和尾部可达性。
// 忽略未来运动，不能据此证明安全。
function flood(body) {
  const blocked=new Set([...obstacles,...body.slice(1,-1)]),seen=new Set([body[0]]),queue=[body[0]];
  for(let i=0;i<queue.length;i++) for(let d=0;d<4;d++) {
    const n=move(queue[i],d);
    if(n>=0&&!blocked.has(n)&&!seen.has(n)) { seen.add(n);queue.push(n); }
  }
  return {space:seen.size,tailReachable:seen.has(body.at(-1))};
}
console.log(JSON.stringify(flood(snake)));`, `# 空间检查构件：输入静态身体，输出可达空间和尾部连通性。
# 忽略未来运动，不能据此证明安全。
def flood(body):
    blocked, seen, queue = set(obstacles+body[1:-1]), {body[0]}, [body[0]]
    for cell in queue:
        for d in range(4):
            n = move(cell,d)
            if n >= 0 and n not in blocked and n not in seen:
                seen.add(n)
                queue.append(n)
    return dict(space=len(seen),tailReachable=body[-1] in seen)
print(json.dumps(flood(snake)))`],
hamiltonian:[`// 输入有效 4×4 环及头格；输出后继格，不包含通用构环。
const route=[0,4,8,12,13,9,5,6,10,14,15,11,7,3,2,1];
function successor(head) { return route[(route.indexOf(head)+1)%route.length]; }
console.log(JSON.stringify(successor(8)));`, `# 输入有效 4×4 环及头格；输出后继格，不包含通用构环。
route = [0,4,8,12,13,9,5,6,10,14,15,11,7,3,2,1]
def successor(head):
    return route[(route.index(head)+1)%len(route)]
print(json.dumps(successor(8)))`],
encoding:[`// 完整 compact-v2 构件；输出 12 个按课程顺序排列的数。
function encode() {
  const out=Array(12).fill(0),scale=Math.max(width,height),occupied=new Set([...snake.slice(0,-1),...obstacles]);
  for(let i=0;i<3;i++) {
    const d=(direction+i+3)%4; out[i]=legal(d)?0:1;
    let cell=snake[0],wall=0,clear=0,blocked=false;
    while((cell=move(cell,d))>=0) { wall++;if(occupied.has(cell))blocked=true;if(!blocked)clear++; }
    out[5+i]=wall/scale;out[8+i]=clear/scale;
  }
  const dx=(food%width-snake[0]%width)/scale,dy=(Math.floor(food/width)-Math.floor(snake[0]/width))/scale;
  out[3]=[-dy,dx,dy,-dx][direction];out[4]=[dx,dy,-dx,-dy][direction];
  out[11]=snake.length/(width*height-obstacles.length);return out;
}
console.log(JSON.stringify(encode()));`, `# 完整 compact-v2 构件；输出课程顺序的 12 项特征。
def encode():
    out, scale = [0]*12, max(width,height)
    occupied = set(snake[:-1]+obstacles)
    for i in range(3):
        d = (direction+i+3)%4
        out[i] = 0 if legal(d) else 1
        cell, wall, clear, blocked = snake[0], 0, 0, False
        while True:
            cell = move(cell,d)
            if cell < 0:
                break
            wall += 1
            if cell in occupied:
                blocked = True
            if not blocked:
                clear += 1
        out[5+i], out[8+i] = wall/scale, clear/scale
    dx, dy = (food%width-snake[0]%width)/scale, (food//width-snake[0]//width)/scale
    out[3], out[4] = [-dy,dx,dy,-dx][direction], [dx,dy,-dx,-dy][direction]
    out[11] = len(snake)/(width*height-len(obstacles))
    return out
print(json.dumps(encode()))`],
dqn:[`// 教学数字，非实时训练。此例三动作均合法；真实目标先做碰撞掩码。
function targetValue(reward,terminal,truncated,next,gamma,bootstrapTruncated=false) {
  return reward+(terminal||(truncated&&!bootstrapTruncated)?0:gamma*next);
}
const online=[2,5,1],target=[4,3,6];
const selected=online.indexOf(Math.max(...online));
console.log(JSON.stringify({double:targetValue(1,false,false,target[selected],0.9),dqn:targetValue(1,false,false,Math.max(...target),0.9),terminal:targetValue(1,true,false,6,0.9)}));`, `# 教学数字，非实时训练。三动作均合法；真实目标先做碰撞掩码。
def target_value(reward, terminal, truncated, nxt, gamma, bootstrap_truncated=False):
    return reward+(0 if terminal or (truncated and not bootstrap_truncated) else gamma*nxt)
online, target = [2,5,1], [4,3,6]
selected = online.index(max(online))
print(json.dumps(dict(double=target_value(1,False,False,target[selected],0.9),dqn=target_value(1,False,False,max(target),0.9),terminal=target_value(1,True,False,6,0.9))))`],
ga:[`// 输入每局填充率、碰撞标志、食物/步数；输出标量 fitness。
// 固定教学数据，不是实际训练成绩。
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
function fitness(fills,failures,efficiencies) { return mean(fills)*1000-mean(failures)*0.1+mean(efficiencies)*0.01; }
console.log(JSON.stringify(fitness([0.25,0.5],[1,0],[0.1,0.2])));`, `# 输入每局填充率、碰撞标志、食物/步数，输出标量 fitness。
# 固定教学数据，不是实际训练成绩。
def mean(xs):
    return sum(xs)/len(xs)
def fitness(fills, failures, efficiencies):
    return mean(fills)*1000-mean(failures)*0.1+mean(efficiencies)*0.01
print(json.dumps(fitness([0.25,0.5],[1,0],[0.1,0.2])))`],
evaluation:[`// 输入冻结模型的逐局分数；固定教学数字，不是实际测量。
function summarize(scores) {
  const sorted=[...scores].sort((a,b)=>a-b),n=sorted.length;
  return {mean:scores.reduce((a,b)=>a+b,0)/n,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,min:sorted[0],max:sorted[n-1]};
}
console.log(JSON.stringify(summarize([0,2,4,10])));`, `# 输入冻结模型的逐局分数；固定教学数字，不是实际测量。
def summarize(scores):
    ordered, n = sorted(scores), len(scores)
    median = ordered[n//2] if n%2 else (ordered[n//2-1]+ordered[n//2])/2
    return dict(mean=sum(scores)/n,median=median,min=ordered[0],max=ordered[-1])
print(json.dumps(summarize([0,2,4,10])))`],
};
function search(algorithm: 'bfs'|'astar'): [string,string] { return [
`// 静态 ${algorithm.toUpperCase()}：输入上面的冻结地图，输出头到食物的格编号路径。
// 不模拟未来身体，不构成完整 Snake 安全策略。
function search() {
  const blocked=new Set([...obstacles,...snake.slice(1,-1)]),start=snake[0];
  const queue=[{cell:start,g:0,order:0}],cost=new Map([[start,0]]),parent=new Map();let order=1;
  while(queue.length) {
    ${algorithm==='astar'?'queue.sort((a,b)=>(a.g+distance(a.cell,food))-(b.g+distance(b.cell,food))||a.order-b.order);':'// FIFO：不重新排序队列。'}
    const current=queue.shift();if(current.g!==cost.get(current.cell))continue;
    if(current.cell===food) { const path=[food];while(path.at(-1)!==start)path.push(parent.get(path.at(-1)));return path.reverse(); }
    for(let d=0;d<4;d++) {
      if(current.cell===start&&d===(direction+2)%4)continue;
      const n=move(current.cell,d),g=current.g+1;
      if(n<0||blocked.has(n)||g>=(cost.get(n)??Infinity))continue;
      cost.set(n,g);parent.set(n,current.cell);queue.push({cell:n,g,order:order++});
    }
  }
  return null;
}
console.log(JSON.stringify(search()));`,
`# 静态 ${algorithm.toUpperCase()}：冻结地图输入，头到食物的格编号路径输出。
# 不模拟未来身体，不构成完整 Snake 安全策略。
def search():
    blocked, start = set(obstacles+snake[1:-1]), snake[0]
    queue, cost, parent, order = [(start,0,0)], {start:0}, {}, 1
    while queue:
        ${algorithm==='astar'?'queue.sort(key=lambda n: (n[1]+distance(n[0],food),n[2]))':'# FIFO：不重新排序队列。'}
        cell, g, _ = queue.pop(0)
        if g != cost[cell]:
            continue
        if cell == food:
            path = [food]
            while path[-1] != start:
                path.append(parent[path[-1]])
            return path[::-1]
        for d in range(4):
            if cell == start and d == (direction+2)%4:
                continue
            n, nxt_g = move(cell,d), g+1
            if n < 0 or n in blocked or nxt_g >= cost.get(n,float('inf')):
                continue
            cost[n], parent[n] = nxt_g, cell
            queue.append((n,nxt_g,order))
            order += 1
    return None
print(json.dumps(search()))`]; }
snippets.bfs=search('bfs');snippets.astar=search('astar');
export const exampleIds = Object.keys(snippets);
export const expectedOutputs: Record<string,unknown> = {random:2,'legal-random':1,greedy:0,'safe-greedy':{space:62,tailReachable:true},hamiltonian:12,encoding:[0,0,0,-0.25,-0.25,0.5,0.375,0.375,0.5,0.375,0.375,3/63],dqn:{double:3.7,dqn:6.4,terminal:1},ga:374.9515,evaluation:{mean:4,median:3,min:0,max:10},bfs:[36,28,20,19,18],astar:[36,28,20,19,18]};
export function exampleCode(id: string, language: 'js'|'py'): string {
  const index=language==='js'?0:1;
  return (index===0?jsBase:pyBase)+ '\n'+snippets[id][index]+'\n';
}
export const trainingPseudocode: Record<string,string> = {
  dqn:`伪代码 · 流程说明，不可直接运行
初始化 online、target、独立随机流和 replay
在总步数 / 时间预算内：
  编码 12 特征；在合法动作中 epsilon 探索或选最大 Q
  用共用 Game.step 执行动作，计算 compact 奖励，存 replay
  warmup 后每 4 个训练样本随机抽 32 条经验
  Double: online 选下一合法动作，target 估值
  普通 DQN: target 取下一合法最大值
  终止或默认截断时只用即时奖励；全碰撞时下一值为 0
  用 TF.js Adam 更新 online 的全部参数
  每 100 次优化把 online 复制到 target
  每 5000 样本在验证集冻结评估，保存最佳验证模型
最终测试集不更新参数，也不选择检查点`,
  ga:`伪代码 · 流程说明，不可直接运行
固定正负特征投影，初始化 16 组输出系数
在步数 / 时间 / 代数预算内：
  每代生成 3 个训练种子（排除验证与测试种子）
  所有个体使用相同种子评估，计算各自 fitness
  验证训练冠军，只根据验证表现保存最佳模型
  原样复制 2 个精英
  锦标赛选择父代
  默认 crossover=0；可配置时逐系数交叉
  对 75 个可变输出系数做概率 0.1 的高斯变异（std=0.1）
  固定投影参数不变；重复直到下一代有 16 个体
最终用冻结模型在独立测试种子上报告分布`,
};
