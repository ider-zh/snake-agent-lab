import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '../core';
import type { Agent, AgentId, DebugInfo, Direction, GameConfig, Observation } from '../core/types';
import { createAgent } from '../agents';
import type { PlayableModel } from '../learning/playable';
import { predictPlayable } from '../learning/playable';
import { Board } from '../render/Board';
import { createReplay, exportReplay, saveRecord } from '../storage';
import type { ReplayRecord } from '../storage';
import { Icon, Metric, Panel, Sparkline, downloadFile, fmt } from './shared';
export const AGENTS: {id: AgentId; label: string; description: string; tag: string}[] = [
 {id:'dijkstra',label:'Dijkstra 一致代价',description:'优先队列按累计代价 g 扩展，再做动态路径与空间验证。本项目边代价均为1，因此最短距离与 BFS 相同；不保证长期安全。',tag:'UNIFORM COST'},
 {id:'best-first',label:'贪心最佳优先',description:'优先队列只按到食物的曼哈顿距离 h 扩展，仍保留父路径与动态验证。不同于只看下一步的纯贪心；不保证最短路径。',tag:'BEST FIRST'},
 {id:'beam',label:'Beam 束搜索',description:'用真实身体移动扩展候选，每层最多保留24条，最多16层。按食物、局部出口和距离评分；吃到当前食物即停止模拟，不预知新食物。剪枝可能错过解。',tag:'BOUNDED LOOKAHEAD'},
 {id:'mcts',label:'MCTS 蒙特卡洛树',description:'UCT 选择、扩展、随机 rollout、回传；最多512轮、深度24，并受共享节点/时间上限约束。当前食物处停止模拟；有限模拟与叶评分不保证通关。',tag:'SEEDED UCT'},
 {id:'tail-safe',label:'A* + 尾部绕行',description:'先尝试原 A* 安全食物路径；回退时尝试通向尾部的路径与最多16次双格绕行，并精确模拟整条路径。共享节点和时间预算；适用障碍图，但可能停滞或截断，不保证填满。',tag:'BOUNDED HEURISTIC'},
 {id:'hamiltonian-shortcut',label:'Hamiltonian 安全捷径',description:'保持身体沿环有序，只选择不越过食物、精确移动后仍可沿环前进的物理邻格。需要无障碍、偶数边、cycle 初态和至少3格身体；有限预算仍可能截断。',tag:'ORDERED CYCLE'},
 {id:'astar',label:'A* 安全搜索',description:'启发式搜索寻找食物，模拟整条蛇验证路径，再检查尾部可达性与剩余空间。安全检查是启发式，不保证必胜。',tag:'SEARCH'},
 {id:'bfs',label:'BFS 广度搜索',description:'逐层寻找最短候选路径，经过真实规则模拟和空间检查后执行。每一步重新规划。',tag:'SEARCH'},
 {id:'safe-greedy',label:'安全贪心',description:'先过滤立即碰撞，再结合可用空间和食物距离选择。局部判断仍可能陷入死局。',tag:'HEURISTIC'},
 {id:'greedy',label:'纯贪心',description:'朝食物曼哈顿距离最短的方向移动，不作额外安全保证，作为对照策略。',tag:'BASELINE'},
 {id:'legal-random',label:'合法随机',description:'从不会立即撞墙或撞身的动作中随机选择。策略与环境使用独立种子。',tag:'BASELINE'},
 {id:'random',label:'原始随机',description:'随机尝试四个绝对方向，非法反向按统一规则继续前进。作为失败对照。',tag:'BASELINE'},
 {id:'hamiltonian',label:'Hamiltonian 环',description:'严格沿覆盖全盘的环移动。仅适用无障碍且至少一边为偶数的矩形，并使用沿环初始化。',tag:'CYCLE'},
];
const REASONS: Record<string,string> = {'wall':'撞到边界','body':'撞到身体','obstacle':'撞到障碍','filled':'填满棋盘，胜利！','step-limit':'达到步数预算','no-progress':'达到无进展预算'};
interface Session { game: Game; agent: Agent; actions: Direction[]; scores: number[]; debug?: DebugInfo; }
interface Props { arena: boolean; model: PlayableModel|null; onReplay: (replay: ReplayRecord) => void; notify: (message: string) => void; }
export function GameLab({arena,model,onReplay,notify}:Props) {
 const [completionBudget,setCompletionBudget]=useState(true); const [manual,setManual]=useState(false); const [strategy,setStrategy]=useState<AgentId|'model'>('astar'); const [size,setSize]=useState(12); const [seed,setSeed]=useState(42); const [obstacles,setObstacles]=useState(false); const [speed,setSpeed]=useState(8); const [running,setRunning]=useState(false); const [overlay,setOverlay]=useState(true); const [states,setStates]=useState<Observation[]>([]); const [revision,setRevision]=useState(0); const [error,setError]=useState(''); const [compareModel,setCompareModel]=useState(false);
 const sessions=useRef<Session[]>([]); const input=useRef<Direction|null>(null); const boardFocus=useRef<HTMLDivElement>(null);
 const [settingsOpen,setSettingsOpen]=useState(()=>window.innerWidth>720);
 useEffect(()=>{const query=window.matchMedia?.('(max-width: 720px)');if(!query)return;const change=()=>setSettingsOpen(!query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 const activeModel=model&&((arena&&compareModel)||(!arena&&strategy==='model'&&!manual))?model:null;
 const restart=useCallback(()=>{
  setRunning(false); setError(''); input.current=null;
  try {
   const ids:AgentId[]=arena?['astar','bfs','safe-greedy','legal-random']:[strategy==='model'?'legal-random':strategy];
   const walls=obstacles?[size*2+2,size*2+3,size*(size-3)+size-3,size*(size-3)+size-4]:[];
   const config:Partial<GameConfig>=activeModel?activeModel.game:{width:size,height:size,initialization:(!arena&&strategy.startsWith('hamiltonian')&&!manual)?'cycle':'standard',obstacles:walls,maxSteps:completionBudget&&strategy.startsWith('hamiltonian')?Math.max(5000,size**4):5000,maxNoFood:completionBudget&&strategy.startsWith('hamiltonian')?Math.max(500,size*size):500};
   sessions.current=ids.map(id=>{const game=new Game(config,seed);return {game,agent:createAgent(id,seed^0xabc124,{maxNodes:10000,maxMs:20}),actions:[],scores:[game.observe().score]};});
   setStates(sessions.current.map(s=>s.game.observe())); setRevision(value=>value+1);
  }catch(err){setError(String(err));sessions.current=[];setStates([]);}
 },[arena,manual,strategy,size,seed,obstacles,activeModel,completionBudget]);
 useEffect(()=>restart(),[restart]);
 const tick=useCallback(()=>{
  let active=false;
  sessions.current.forEach((session,index)=>{
   const state=session.game.observe(); if(state.terminated||state.truncated)return;
   let action:Direction;
   if(manual&&!arena){action=input.current??state.direction;}else if(model&&((!arena&&strategy==='model')||(arena&&compareModel&&index===3))){action=predictPlayable(model,state).action;session.debug={path:[],visited:[],expanded:0,elapsedMs:0};}else{const decision=session.agent.decide(state);action=decision.action;session.debug=decision.debug;}
   if(index===0)input.current=null;
   session.game.step(action);session.actions.push(action);session.scores.push(session.game.observe().score);
   if(!session.game.observe().terminated&&!session.game.observe().truncated)active=true;
  });
  setStates(sessions.current.map(s=>s.game.observe()));setRevision(value=>value+1); if(!active)setRunning(false);
 },[manual,arena,model,strategy,compareModel]);
 useEffect(()=>{if(!running)return;const timer=setInterval(tick,1000/speed);return()=>clearInterval(timer);},[running,speed,tick]);
 const turn=useCallback((action:Direction)=>{const state=sessions.current[0]?.game.observe();if(!manual||arena||input.current!==null||!state)return;if((state.direction+2)%4!==action)input.current=action;},[manual,arena]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if(target.closest('input,select,textarea,button,[contenteditable=true]'))return;
   const map:Record<string,Direction>={ArrowUp:0,w:0,W:0,ArrowRight:1,d:1,D:1,ArrowDown:2,s:2,S:2,ArrowLeft:3,a:3,A:3};
   if(manual&&!arena&&map[event.key]!==undefined){event.preventDefault();turn(map[event.key]);}
   if(event.code==='Space'&&boardFocus.current?.contains(document.activeElement)){event.preventDefault();setRunning(value=>!value);}
  };const visibility=()=>{if(document.hidden)setRunning(false);};
  window.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);};
 },[turn,manual,arena]);
 const makeReplay=()=>{const session=sessions.current[0];if(!session)throw new Error('没有对局');return createReplay({config:session.game.observe().config,seed,actions:session.actions,label:manual?'手动对局':strategy==='model'?`${model?.algorithm} 冻结模型`:session.agent.id});};
 const save=async()=>{try{const replay=makeReplay();await saveRecord('replay',`replay-${Date.now()}`,replay);notify('回放已保存在本浏览器');}catch(err){notify(String(err));}};
 const current=states[0]; const agent=strategy==='model'?{id:'model',label:`${model?.algorithm.toUpperCase()??''} 冻结模型`,tag:'TRAINED MODEL',description:'使用已训练或导入的真实网络权重决策。关闭探索，不更新参数；棋盘与规则严格匹配模型。'}:AGENTS.find(a=>a.id===strategy)!; const terminal=current&&(arena?states.every(state=>state.terminated||state.truncated):(current.terminated||current.truncated)); const history=sessions.current[0]?.scores??[];
 return <div className="lab-content" data-testid={arena?'arena-lab':'game-lab'}>
  <div className="game-toolbar">
   {!arena&&<div className="segmented" aria-label="控制方式"><button className={!manual?'selected':''} onClick={()=>setManual(false)}>智能体</button><button className={manual?'selected':''} onClick={()=>setManual(true)}>手动游玩</button></div>}
<details className="rule-controls" open={settingsOpen} onToggle={event=>setSettingsOpen(event.currentTarget.open)}><summary>规则设置 · {current?.config.width??size} × {current?.config.height??size} · #{seed}</summary>
  <div className="configuration-bar">
   <label>棋盘<select aria-label="棋盘尺寸" disabled={!!model&&((arena&&compareModel)||(!arena&&strategy==='model'&&!manual))} value={size} onChange={e=>setSize(Number(e.target.value))}><option value={8}>8 × 8</option><option value={12}>12 × 12</option><option value={16}>16 × 16</option><option value={20}>20 × 20</option><option value={9}>9 × 9</option></select></label>
   <label>种子<input aria-label="游戏种子" type="number" min="0" max="4294967295" value={seed} onChange={e=>setSeed(Math.max(0,Math.min(4294967295,Number(e.target.value))))}/></label>
   <label className="check-label"><input type="checkbox" disabled={!!model&&((arena&&compareModel)||(!arena&&strategy==='model'&&!manual))} checked={obstacles} onChange={e=>setObstacles(e.target.checked)}/>障碍地图 <span className="badge">P5</span></label>
   {!arena&&strategy.startsWith('hamiltonian')&&<label className="check-label"><input type="checkbox" checked={completionBudget} onChange={e=>setCompletionBudget(e.target.checked)}/>充足通关预算（N²）</label>}{arena&&model&&<label className="check-label"><input type="checkbox" checked={compareModel} onChange={e=>setCompareModel(e.target.checked)}/>加入冻结模型（同规则）</label>}<span className="local-tag"><span/>确定性核心 v1</span>
  </div>
</details></div>
  <div className="metrics-row"><Metric label={arena?'首局得分':'获得食物'} value={current?.score??0} detail="+1 / FOOD"/><Metric label="棋盘填充" value={`${current?((current.snake.length/(current.config.width*current.config.height-current.config.obstacles.length))*100).toFixed(1):0}%`} detail={`${current?.snake.length??3} 格蛇身`}/><Metric label="环境步数" value={fmt(current?.steps??0)} detail={`上限 ${fmt(current?.config.maxSteps??5000)} 步`}/><Metric label={arena?'并行棋盘':'决策耗时'} value={arena?'04':`${(sessions.current[0]?.debug?.elapsedMs??0).toFixed(2)}`} detail={arena?'独立环境 · 相同初态':'毫秒 / 最近一步'}/></div>
  <div className="game-layout">
   <Panel className="game-panel" title={arena?'策略竞技场':manual?'由你掌舵':agent.label} eyebrow={arena?'SIDE BY SIDE':'LIVE ENVIRONMENT'} aside={<span className={`status-dot ${running?'live':''}`}>{running?'运行中':terminal?'本局结束':'已暂停'}</span>}>
    <div className="board-focus" tabIndex={0} ref={boardFocus} aria-label="游戏棋盘，方向键或 WASD 转向，空格暂停">
     {error?<div className="empty-state error"><Icon name="shield" size={36}/><h3>当前策略不适用于此棋盘</h3><p>{error}</p><button onClick={()=>{setObstacles(false);setSize(12);}}>恢复 12 × 12 无障碍地图</button></div>:states.length>0&&<Board views={states.map((observation,index)=>({observation,label:arena?(compareModel&&model&&index===3?`${model.algorithm.toUpperCase()} 模型`:AGENTS.find(a=>a.id===sessions.current[index]?.agent.id)!.label):manual?'手动':agent.label,debug:sessions.current[index]?.debug,color:[0xa6bd92,0x83b4ae,0xb2a0c7,0xcba985][index]}))} overlay={overlay}/>}
    </div>
    {terminal&&<div className="end-banner" role="status"><strong>{REASONS[current.reason??'']??'对局结束'}</strong><span>{current.truncated?'实验截断':'规则终局'} · {current.score} 份食物 · {current.steps} 步</span></div>}
    <div className="playback-controls"><button className="primary" disabled={!!error||!!terminal} onClick={()=>{setRunning(!running);boardFocus.current?.focus({preventScroll:true});}}><Icon name={running?'pause':'play'} size={17}/>{running?'暂停':'开始运行'}</button><button disabled={running||!!error||!!terminal} onClick={tick} title="推进一步"><Icon name="step" size={17}/><span>单步</span></button><button onClick={restart} title="相同种子重新开始"><Icon name="reset" size={17}/><span>重开</span></button><label className="speed-label">{speed} 步/秒<input aria-label="运行速度" type="range" min="1" max="30" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label></div>
    <div className="board-legend"><span><i className="head"/>蛇头</span><span><i className="food"/>食物</span><span><i className="path"/>候选路径</span><label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>显示搜索过程</label></div>
   </Panel>
   <aside className="inspector">
    <Panel title={manual&&!arena?'操作指南':'策略配置'} eyebrow="CONTROL ROOM">
     {!arena&&!manual&&<label className="field-label">决策策略<select aria-label="决策策略" value={strategy} onChange={e=>setStrategy(e.target.value as AgentId|'model')}>{AGENTS.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}{model&&<option value="model">{model.algorithm.toUpperCase()} 冻结模型</option>}</select></label>}
     <div className="agent-description"><span className="badge">{manual&&!arena?'HUMAN':arena?'FAIR COMPARISON':agent.tag}</span><p>{manual&&!arena?'方向键或 WASD 转向。每步只接受一次有效变向，反向输入忽略。点击棋盘后按空格暂停。':arena?'四个独立棋盘共享地图、初态与环境种子。轨迹不同会改变食物可放置的位置；不代表完全相同的食物序列。':agent.description}</p></div>
     {manual&&!arena&&<div className="dpad" aria-label="触控方向键"><button aria-label="向上" onClick={()=>turn(0)}>↑</button><div><button aria-label="向左" onClick={()=>turn(3)}>←</button><button aria-label="向下" onClick={()=>turn(2)}>↓</button><button aria-label="向右" onClick={()=>turn(1)}>→</button></div></div>}
     <dl className="detail-list"><div><dt>初始化</dt><dd>{current?.config.initialization==='cycle'?'沿环连续':'统一直线'}</dd></div><div><dt>实际棋盘</dt><dd>{current?.config.width} × {current?.config.height}</dd></div><div><dt>环境种子</dt><dd>#{seed}</dd></div><div><dt>搜索节点预算</dt><dd>10,000</dd></div><div><dt>无进展截断</dt><dd>{current?.config.maxNoFood??500} 步</dd></div></dl>
     {sessions.current[0]?.debug?.fallback&&<p className="notice">回退原因：{sessions.current[0].debug?.fallback}</p>}
    </Panel>
    <Panel title="得分轨迹" eyebrow="EPISODE TELEMETRY"><Sparkline values={history.filter((_,i)=>i%Math.max(1,Math.floor(history.length/200))===0)} label="每步得分"/><div className="chart-axis"><span>STEP 0</span><span>{current?.steps??0}</span></div><div className="tiny-stats"><span>已搜索<strong>{fmt(sessions.current[0]?.debug?.expanded??0)}</strong></span><span>轨迹校验<strong title={sessions.current[0]?.game.hash()}>{sessions.current[0]?.game.hash().slice(0,8)??'—'}</strong></span></div></Panel>
    <div className="replay-callout"><Icon name="replay" size={22}/><div><strong>每一步，都可重现</strong><p>保存动作与哈希，随时回看决策</p></div><button aria-label="查看本局回放" onClick={()=>{setRunning(false);try{onReplay(makeReplay());}catch(err){notify(String(err));}}}><Icon name="arrow" size={18}/></button></div>
    <div className="button-row"><button onClick={()=>void save()} disabled={!current}>保存回放</button><button onClick={()=>{try{downloadFile('snake-replay.json',exportReplay(makeReplay()));}catch(err){notify(String(err));}}} disabled={!current}><Icon name="download" size={16}/>导出</button></div>
   </aside>
  </div><span className="sr-only">更新序号 {revision}</span>
 </div>;
}
