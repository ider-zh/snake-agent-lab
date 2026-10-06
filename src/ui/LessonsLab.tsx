import { useMemo, useRef, useState } from 'react';
import { lessons, type Lesson } from '../lessons/content';
import { exampleCode, expectedOutputs, trainingPseudocode } from '../lessons/examples';
import { lessonDecision, lessonGame } from '../lessons/demo';
import { encodeObservation } from '../training/encoding';
import { Board } from '../render/Board';
import { downloadFile, Panel } from './shared';
import './lessons.css';
const directions=['上','右','下','左'];
const searchHints:Record<string,string>={bfs:'BFS 按 FIFO，h/f 仅用于比较，不参与排序。',astar:'A* 按 f=g+h，再按发现顺序排序。',dijkstra:'Dijkstra 按 f=g，再按发现顺序排序；h 仅作距离对照。','best-first':'最佳优先按 f=h，再按发现顺序排序；不以 g 排序。'};
const featureNames=['左碰撞','直碰撞','右碰撞','食物向前','食物向右','左边界距离','直边界距离','右边界距离','左连续空格','直连续空格','右连续空格','填充率'];
function StrategyDemo({lesson}:{lesson:Lesson}) {
  const [scene,setScene]=useState('obstacles'),[moves,setMoves]=useState(0),[cursor,setCursor]=useState(0);
  const {observation,decision,hash}=useMemo(()=>lessonDecision(lesson.agent!,scene,moves),[lesson.agent,scene,moves]);
  const frames=decision.debug.trace??[],frame=cursor?frames[cursor-1]:undefined;
  const ended=observation.terminated||observation.truncated;
  const initialH=Math.abs(observation.snake[0]%8-(observation.food??0)%8)+Math.abs(Math.floor(observation.snake[0]/8)-Math.floor((observation.food??0)/8));
  const initialNode={cell:observation.snake[0],g:0,h:initialH,f:lesson.agent==='dijkstra'?0:initialH};
  const final=cursor===frames.length;
  const overlay={...decision.debug,visited:frame?.visited??[],path:final?decision.debug.path:[]};
  return <Panel title="冻结场景 · 真实引擎" eyebrow="02 / STEP THROUGH" className="lesson-demo">
    <div className="lesson-controls"><label>演示地图 <select aria-label="演示地图" value={scene} disabled={lesson.agent?.startsWith('hamiltonian')} onChange={e=>{setScene(e.target.value);setMoves(0);setCursor(0);}}><option value="obstacles">单障碍绕行</option><option value="open">开阔地图</option></select></label><button onClick={()=>{setMoves(0);setCursor(0);}}>重置场景</button></div>
    <p className="muted">8×8 · 策略种子 7 · {lesson.agent?.startsWith('hamiltonian')?'有效 cycle 初态，无障碍':'标准初态，固定首个食物格 18'}。教学搜索只受 10000 节点预算限制；普通实验台还有时间预算。</p>
    <div className="lesson-search-layout"><div className="lesson-board"><Board views={[{observation,label:lesson.title,debug:overlay,search:frame}]}/></div><div className="lesson-trace">
      <p data-testid="lesson-state">游戏步数 {observation.steps} · 得分 {observation.score}<br/>状态哈希 <code>{hash}</code></p>
      {frames.length>0&&<><div className="lesson-controls"><button disabled={!cursor} onClick={()=>setCursor(c=>c-1)}>上一步搜索</button><button disabled={final} onClick={()=>setCursor(c=>c+1)}>下一步搜索</button></div><p role="status">搜索帧 {cursor} / {frames.length} · 棋盘保持冻结</p><p>{frame?`扩展格 ${frame.current.cell}：g=${frame.current.g}，h=${frame.current.h}，f=${frame.current.f}`:'尚未扩展；frontier 初始只有蛇头。'}</p><p className="muted">蓝绿覆盖＝visited，亮青格＝当前扩展，金色框＝frontier，浅绿路径＝最终决策路径。frontier 是已发现、尚未扩展的候选；格编号 = 行 × 8 + 列。</p><details><summary>查看 frontier / visited 数值</summary><p>visited：{frame?.visited.join(', ')||'空'}</p><div className="lesson-table" tabIndex={0} aria-label="搜索 frontier 数据"><table><thead><tr><th>格</th><th>g</th><th>h</th><th>f</th></tr></thead><tbody>{(frame?.frontier??[initialNode]).map(n=><tr key={n.cell}><td>{n.cell}</td><td>{n.g}</td><td>{n.h}</td><td>{n.f}</td></tr>)}</tbody></table></div></details><p className="muted">{searchHints[lesson.agent!]}搜索帧不包括随后动态模拟和洪泛检查；总扩展计数可能更大。</p></>}
      {decision.debug.planning&&<div className="notice" data-testid="planning-stats"><strong>真实 {decision.debug.planning.kind.toUpperCase()} 决策统计</strong><p>完成轮数 {decision.debug.planning.iterations} · 最深 {decision.debug.planning.maxDepth} 层</p><p>{decision.debug.planning.kind==='mcts'?'根子访问数与平均叶价值（不是通关概率）':'最后完成层中各首动作的保留数与最佳叶价值'}</p>{decision.debug.planning.roots.map(r=><p key={r.action}>{directions[r.action]}：{r.visits} / {r.mean.toFixed(4)}</p>)}</div>}
      <div className="notice"><strong>最终建议：{directions[decision.action]}</strong><p>{decision.debug.fallback?`触发回退或预算限制：${decision.debug.fallback}`:'没有触发回退。'} 总预算计数 {decision.debug.expanded}。</p>{decision.debug.traceTruncated&&<p>仅展示前 256 帧。</p>}</div>
      <button className="primary" disabled={ended||!final||moves>=100} onClick={()=>{setMoves(n=>n+1);setCursor(0);}}>执行建议动作</button><p className="muted">浏览搜索帧不会移动蛇。只有此按钮推进共用 Game.step；最多演示 100 步。{ended?` 本局结束：${observation.reason}`:''}</p>
    </div></div>
  </Panel>;
}
function LearningDemo({id}:{id:string}) {
  const [step,setStep]=useState(0);
  const observation=useMemo(()=>lessonGame().observe(),[]);
  const encoded=useMemo(()=>Array.from(encodeObservation(observation,'compact-v2')),[observation]);
  const stages:Record<string,string[]>={dqn:['经验输入：reward=1，gamma=0.9，未终止、未截断。三个动作均合法。','online=[2,5,1]：最大值在动作索引 1（直行）。','Double 读取 target=[4,3,6] 的索引 1，下一状态值是 3；普通 DQN 取最大值 6。','Double 目标 = 1 + 0.9×3 = 3.7；普通 DQN = 6.4。若已终止，两者目标均为 1。'],ga:['固定输入：fills=[0.25,0.5]，failures=[1,0]，efficiencies=[0.1,0.2]。','均值分别为 0.375、0.5、0.15；个体必须使用共同训练种子比较。','fitness = 0.375×1000 − 0.5×0.1 + 0.15×0.01 = 374.9515。','这个数字用于训练种群排名；保存模型还需要独立验证，最终报告使用测试集。'],evaluation:['教学分数 [0,2,4,10] 来自四个假定独立回合；不是本项目成绩。','均值 = (0+2+4+10)/4 = 4；中位数 = (2+4)/2 = 3。','最大值 10 掩盖了零分失败；应保留完整分布及每局终止/截断原因。','冻结模型、相同协议和共同种子后再比较；不能用测试分数挑模型。']};
  return <Panel title={id==='encoding'?'真实观察 · 编码对照':'逐步计算 · 固定教学数据'} eyebrow="02 / WORK IT OUT"><p className="notice">{id==='encoding'?'下表调用项目 encodeObservation，场景与示例相同：8×8，蛇 [36,35,34]，食物 18，障碍 [27]，朝右。':'这是教学算例，不是实时训练曲线，不启动训练 Worker。'}</p>{id==='encoding'?<div className="lesson-feature-grid">{encoded.map((value,i)=><div key={i}><span>{i} · {featureNames[i]}</span><strong>{value.toFixed(4)}</strong></div>)}</div>:<><p className="lesson-calculation" role="status">{step+1} / 4 — {stages[id][step]}</p><div className="lesson-controls"><button disabled={!step} onClick={()=>setStep(n=>n-1)}>上一步计算</button><button disabled={step===3} onClick={()=>setStep(n=>n+1)}>下一步计算</button><button onClick={()=>setStep(0)}>重置计算</button></div></>}</Panel>;
}
export function LessonsLab() {
  const [id,setId]=useState('bfs'),[language,setLanguage]=useState<'js'|'py'>('js'),[message,setMessage]=useState('');
  const codePane=useRef<HTMLPreElement>(null);
  const lesson=lessons.find(l=>l.id===id)!;
  const code=exampleCode(id,language);
  const switchLanguage=(next:'js'|'py')=>{const top=codePane.current?.scrollTop??0,left=codePane.current?.scrollLeft??0;setLanguage(next);setMessage('');requestAnimationFrame(()=>{if(codePane.current){codePane.current.scrollTop=top;codePane.current.scrollLeft=left;}});};
  return <div className="lessons-lab" data-testid="lessons-lab"><div className="lesson-selector"><label htmlFor="lesson-select">选择课程</label><select id="lesson-select" value={id} onChange={e=>{setId(e.target.value);setMessage('');}}>{[...new Set(lessons.map(l=>l.group))].sort().map(group=><optgroup key={group} label={group}>{lessons.filter(l=>l.group===group).map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>)}</select><span>{lessons.findIndex(l=>l.id===id)+1} / {lessons.length} 课 · 按自己的节奏探索</span></div>
    <div className="lesson-bottom"><Panel title="无需训练的规划／规则策略"><p>Random、LegalRandom、Greedy、SafeGreedy、BFS、A*、Dijkstra、最佳优先、Beam、MCTS、条件 Hamiltonian、安全捷径与尾部绕行直接按规则或当前地图决策。标准 A* 在线搜索，不需要训练；调整节点或时间预算也不等于训练。</p></Panel><Panel title="需要训练的学习／进化策略"><p>DQN / Double DQN 从经验更新网络权重；GA 用选择和变异进化输出系数。训练完成后，冻结模型用于推理与独立评估。</p></Panel></div>
    <Panel title={lesson.title} eyebrow="01 / BUILD INTUITION"><p className="lesson-intuition">{lesson.intuition}</p><ol className="lesson-steps">{lesson.steps.map(s=><li key={s}>{s}</li>)}</ol></Panel>
    {lesson.agent?<StrategyDemo key={id} lesson={lesson}/>:<LearningDemo key={id} id={id}/>}
    <Panel title="读代码，再动手" eyebrow="03 / READ & RUN"><p>{lesson.scope}</p><div className="lesson-controls"><div role="group" aria-label="示例语言"><button aria-pressed={language==='js'} onClick={()=>switchLanguage('js')}>JavaScript</button><button aria-pressed={language==='py'} onClick={()=>switchLanguage('py')}>Python</button></div><button onClick={()=>{if(!navigator.clipboard){setMessage('复制不可用，请聚焦代码框手动选择，或下载文件。');return;}void navigator.clipboard.writeText(code).then(()=>setMessage('已复制完整示例')).catch(()=>setMessage('复制不可用，请聚焦代码框手动选择，或下载文件。'));}}>复制代码</button><button onClick={()=>downloadFile(`snakelab-${id}.${language}`,code,'text/plain;charset=utf-8')}>下载示例</button></div><p className="muted">{language==='js'?'保存为 .js，用 Node.js 运行：node 文件名.js。':'保存为 .py，用 Python 3 运行：python 文件名.py。'}输入在文件顶部，末行打印 JSON 输出。无需依赖；页面不执行用户代码。</p><p role="status" className="lesson-copy-status">{message}</p><pre ref={codePane} tabIndex={0} aria-label={`${language==='js'?'JavaScript':'Python'} 可运行示例`} className="lesson-code"><code>{code}</code></pre><p className="muted">预期 JSON 输出（两种语言均已运行核对；浮点末位显示可能略异）：</p><pre className="lesson-code" tabIndex={0} aria-label="示例预期输出">{JSON.stringify(expectedOutputs[id],null,2)}</pre>{trainingPseudocode[id]&&<details><summary>完整训练流程（伪代码，不可直接运行）</summary><pre tabIndex={0} className="lesson-code" aria-label="训练流程伪代码">{trainingPseudocode[id]}</pre></details>}</Panel>
    <div className="lesson-bottom"><Panel title="边界与限制" eyebrow="04 / KNOW THE LIMITS"><p>{lesson.limitation}</p><p className="muted">课程对应当前项目实现。DFS 不属于已实现的策略。算法表现请在批量评测中按相同协议验证。</p></Panel><Panel title="想一想，再看解答" eyebrow="05 / TRY IT"><p>{lesson.question}</p><details key={id}><summary>显示练习解答</summary><p>{lesson.answer}</p></details></Panel></div>
  </div>;
}
