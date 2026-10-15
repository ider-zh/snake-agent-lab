import {chapters,objectives,lessonHref,lessonIdFromHash,lessonNeighbors} from '../lessons/curriculum';
import {highlight,type CodeLanguage} from '../lessons/highlight';
import {articles} from '../lessons/articles';
import {LessonConcepts,LessonCodeReading,LessonPractice} from './LessonReading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lessons, type Lesson } from '../lessons/content';
import { exampleCode, expectedOutputs, trainingPseudocode } from '../lessons/examples';
import { lessonDecision, lessonGame } from '../lessons/demo';
import { encodeObservation } from '../training/encoding';
import { Board } from '../render/Board';
import { Panel } from './shared';
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
  const stages:Record<string,string[]>={ppo:['固定输入：优势=1，新旧概率比=1.5，clip=0.2。','未裁剪项=1.5；裁剪项=1.2，取最小值1.2。','若优势=−1、比值=.5，则未裁剪项=−.5、裁剪项=−.8，取−.8。','实际训练还计算 GAE、熵正则与 critic 回归；固定旧概率，不能每次更新后重写旧概率。'],imitation:['固定教学数据：教师标签=1，初始学生概率=[1/3,1/3,1/3]。','初始交叉熵=−ln(1/3)≈1.0986。','假定更新后概率=[.1,.8,.1]，新交叉熵=−ln(.8)≈.2231。','这是损失构件，不是实际学习成绩。还需独立教师一致率和学生独立游玩评估。'],'q-learning':['固定输入：Q=2，r=1，γ=0.9，α=0.2，下一合法 Q=[2,5,1]。','Q-learning 取下一合法最大值 5，不要求下一实际动作也选它。','TD 目标 = 1 + 0.9×5 = 5.5；误差 = 5.5−2 = 3.5。','新 Q = 2 + 0.2×3.5 = 2.7；终止或截断时只用即时奖励。'],sarsa:['固定输入：Q=2，r=1，γ=0.9，α=0.2，下一 Q=[2,5,1]。','实际 ε-greedy 采样动作2，因此读取下一 Q[2]=1。','TD 目标 = 1 + 0.9×1 = 1.9；误差 = −0.1。','新 Q = 2 + 0.2×(−0.1) = 1.98；检查点还要保存待执行动作2。'],dqn:['经验输入：reward=1，gamma=0.9，未终止、未截断。三个动作均合法。','online=[2,5,1]：最大值在动作索引 1（直行）。','Double 读取 target=[4,3,6] 的索引 1，下一状态值是 3；普通 DQN 取最大值 6。','Double 目标 = 1 + 0.9×3 = 3.7；普通 DQN = 6.4。若已终止，两者目标均为 1。'],ga:['固定输入：fills=[0.25,0.5]，failures=[1,0]，efficiencies=[0.1,0.2]。','均值分别为 0.375、0.5、0.15；个体必须使用共同训练种子比较。','fitness = 0.375×1000 − 0.5×0.1 + 0.15×0.01 = 374.9515。','这个数字用于训练种群排名；保存模型还需要独立验证，最终报告使用测试集。'],evaluation:['教学分数 [0,2,4,10] 来自四个假定独立回合；不是本项目成绩。','均值 = (0+2+4+10)/4 = 4；中位数 = (2+4)/2 = 3。','最大值 10 掩盖了零分失败；应保留完整分布及每局终止/截断原因。','冻结模型、相同协议和共同种子后再比较；不能用测试分数挑模型。']};
  return <Panel title={id==='encoding'?'真实观察 · 编码对照':'逐步计算 · 固定教学数据'} eyebrow="02 / WORK IT OUT"><p className="notice">{id==='encoding'?'下表调用项目 encodeObservation，场景与示例相同：8×8，蛇 [36,35,34]，食物 18，障碍 [27]，朝右。':'这是教学算例，不是实时训练曲线，不启动训练 Worker。'}</p>{id==='encoding'?<div className="lesson-feature-grid">{encoded.map((value,i)=><div key={i}><span>{i} · {featureNames[i]}</span><strong>{value.toFixed(4)}</strong></div>)}</div>:<><p className="lesson-calculation" role="status">{step+1} / 4 — {stages[id][step]}</p><div className="lesson-controls"><button disabled={!step} onClick={()=>setStep(n=>n-1)}>上一步计算</button><button disabled={step===3} onClick={()=>setStep(n=>n+1)}>下一步计算</button><button onClick={()=>setStep(0)}>重置计算</button></div></>}</Panel>;
}
function CodeExample({lesson}:{lesson:Lesson}){
 const [language,setLanguage]=useState<CodeLanguage>('js'),[message,setMessage]=useState('');
 const pane=useRef<HTMLPreElement>(null),jsTab=useRef<HTMLButtonElement>(null),pyTab=useRef<HTMLButtonElement>(null);
 const code=exampleCode(lesson.id,language),tokens=useMemo(()=>highlight(code,language),[code,language]);
 const switchLanguage=(next:CodeLanguage)=>{setLanguage(next);setMessage('');};
 const tabsKey=(event:React.KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'js':event.key==='End'?'py':language==='js'?'py':'js';switchLanguage(next);(next==='js'?jsTab:pyTab).current?.focus();}};
 return <section id="lesson-code-section" tabIndex={-1} className="lesson-section" aria-labelledby="code-heading"><h2 id="code-heading">读代码，再动手</h2><p>{lesson.scope}</p>
 <div className="code-toolbar"><div role="tablist" aria-label="示例语言" onKeyDown={tabsKey}><button ref={jsTab} id="js-tab" role="tab" aria-selected={language==='js'} aria-controls="code-panel" tabIndex={language==='js'?0:-1} onClick={()=>switchLanguage('js')}>JavaScript</button><button ref={pyTab} id="py-tab" role="tab" aria-selected={language==='py'} aria-controls="code-panel" tabIndex={language==='py'?0:-1} onClick={()=>switchLanguage('py')}>Python</button></div><button onClick={()=>{if(!navigator.clipboard){setMessage('复制不可用，请在代码框中选择并复制。');pane.current?.focus();return;}void navigator.clipboard.writeText(code).then(()=>setMessage('已复制完整示例')).catch(()=>{setMessage('复制不可用，请在代码框中选择并复制。');pane.current?.focus();});}}>复制代码</button></div>
 <div id="code-panel" role="tabpanel" aria-labelledby={language==='js'?'js-tab':'py-tab'}><p className="code-run-hint">{language==='js'?'Node.js · 保存为 example.js 后运行 node example.js':'Python 3 · 保存为 example.py 后运行 python example.py'}。输入位于示例顶部，末行输出 JSON。</p><pre ref={pane} tabIndex={0} aria-label={`${language==='js'?'JavaScript':'Python'} 可运行示例`} className="lesson-code"><code>{tokens.map((token,i)=><span key={i} className={`syntax-${token.kind}`}>{token.text}</span>)}</code></pre></div><p role="status" className="lesson-copy-status">{message}</p>
 <details className="expected-output"><summary>核对预期输出</summary><pre className="lesson-code" tabIndex={0} aria-label="示例预期输出">{JSON.stringify(expectedOutputs[lesson.id],null,2)}</pre><p className="muted">两种语言使用相同输入；浮点数末位显示可能略有不同。</p></details>{trainingPseudocode[lesson.id]&&<details><summary>完整训练流程 · 伪代码</summary><pre tabIndex={0} className="lesson-code" aria-label="训练流程伪代码">{trainingPseudocode[lesson.id]}</pre></details>}</section>;
}
export function LessonsLab(){
 const [id,setId]=useState<string|null>(()=>lessonIdFromHash(location.hash));
 const title=useRef<HTMLHeadingElement>(null),index=useRef<HTMLElement>(null);
 useEffect(()=>{const update=()=>setId(lessonIdFromHash(location.hash));window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const lesson=lessons.find(l=>l.id===id),neighbors=lessonNeighbors(id??''),article=lesson?articles[lesson.id]:null;
 useEffect(()=>{document.title=lesson?`${lesson.title} · 策略课堂 · SnakeLab`:'策略课堂 · SnakeLab';title.current?.focus({preventScroll:true});if(lesson)title.current?.scrollIntoView({block:'start'});return()=>{document.title='SnakeLab · 贪吃蛇智能实验室';};},[lesson]);
 return <div className="lessons-lab lesson-docs" data-testid="lessons-lab"><nav ref={index} className="lesson-index" aria-label="课程目录" tabIndex={-1}><a className="course-home" href={lessonHref()} aria-current={!lesson?'page':undefined}>策略课堂 <span>课程总览</span></a>{chapters.map(chapter=><div className="index-chapter" key={chapter.group}><h2>{chapter.group}</h2><ol>{lessons.filter(l=>l.group===chapter.group).map(l=><li key={l.id}><a href={lessonHref(l.id)} data-lesson-id={l.id} aria-current={id===l.id?'page':undefined}><span>{String(lessons.indexOf(l)+1).padStart(2,'0')}</span>{l.title}</a></li>)}</ol></div>)}</nav>
 <article className="lesson-article" key={id??'overview'}><div className="lesson-breadcrumb"><a href={lessonHref()}>策略课堂</a><span>/ {lesson?lesson.group.split(' / ')[1]:'课程总览'}</span><button onClick={()=>{index.current?.scrollIntoView({block:'start'});index.current?.focus();}}>课程目录 ↑</button></div>
 {lesson?<><header className="lesson-heading"><p className="eyebrow">第 {String(lessons.indexOf(lesson)+1).padStart(2,'0')} 课 / {lessons.length}</p><h1 ref={title} tabIndex={-1}>{lesson.title}</h1><p className="lesson-intuition">{lesson.intuition}</p><div className="lesson-objectives"><h2>这一课，你会学到</h2><ul>{objectives[lesson.id].map(item=><li key={item}>{item}</li>)}</ul></div></header>
 <nav className="lesson-on-this-page" aria-label="本课内容">{[['lesson-concepts','原理与术语'],['lesson-worked-example','手算例子'],['lesson-demo-section','互动演示'],['lesson-code-section','代码对照'],['lesson-practice-section','练习与来源']].map(([target,label])=><button key={target} onClick={()=>{const section=document.getElementById(target);section?.scrollIntoView({block:'start'});section?.focus({preventScroll:true});}}>{label}</button>)}</nav>
 {article&&<LessonConcepts article={article}/>}
 <section className="lesson-section"><h2>本项目的决策步骤</h2><ol className="lesson-steps">{lesson.steps.map(s=><li key={s}>{s}</li>)}</ol></section>
 <section id="lesson-demo-section" tabIndex={-1} className="lesson-demo-section">{lesson.agent?<StrategyDemo key={id} lesson={lesson}/>:<LearningDemo key={id} id={lesson.id}/>}</section>
 <CodeExample key={id} lesson={lesson}/>
 {article&&<LessonCodeReading article={article}/>}
 <section className="lesson-section"><h2>适用边界</h2><p>{lesson.limitation}</p>{['bfs','astar','dijkstra','best-first','tail-safe'].includes(lesson.id)&&<p className="muted">项目中的规划器还会在拥挤或停滞时搜索动态身体状态，并验证后续路径。这里的静态搜索示例帮助你理解搜索顺序；实际长局结果还取决于身体运动和决策预算。</p>}</section>
 <section className="lesson-section lesson-exercise"><h2>练习：检验你的理解</h2><p>{lesson.question}</p><details><summary>显示练习解答</summary><p>{lesson.answer}</p></details></section>
 {article&&<LessonPractice article={article}/>}
 <nav className="lesson-pagination" aria-label="课间导航">{neighbors.previous?<a href={lessonHref(neighbors.previous.id)} rel="prev"><small>← 上一课</small><strong>{neighbors.previous.title}</strong></a>:<a href={lessonHref()}><small>← 回到起点</small><strong>课程总览</strong></a>}{neighbors.next?<a href={lessonHref(neighbors.next.id)} rel="next"><small>下一课 →</small><strong>{neighbors.next.title}</strong></a>:<a href={lessonHref()}><small>已到最后一课</small><strong>回顾课程目录 →</strong></a>}</nav></>:<><header className="lesson-heading"><p className="eyebrow">LEARNING BY DOING · 21 LESSONS</p><h1 ref={title} tabIndex={-1}>从下一步，读懂一套策略</h1><p className="lesson-intuition">一份可以边读、边试、边改的贪吃蛇策略指南。从最简单的随机移动开始，经过地图搜索，走到从经验中学习。</p></header>
 <section className="lesson-section"><h2>选择你的阅读路线</h2><p>按目录顺序建立完整概念，或直接打开感兴趣的一课。每课都有一个明确问题、可操作的演示和可复制运行的双语代码。</p>{chapters.map(chapter=><div className="course-chapter" key={chapter.group}><span>{chapter.group.slice(0,2)}</span><div><h3>{chapter.title}</h3><p>{chapter.description}</p><a href={lessonHref(lessons.find(l=>l.group===chapter.group)!.id)}>从{lessons.find(l=>l.group===chapter.group)!.title}开始 →</a></div></div>)}</section>
 <section className="lesson-section"><h2>先理解两种不同的工作方式</h2><p><strong>规划与规则策略</strong>读取当前棋盘，搜索路径或直接选择动作。你可以在冻结棋盘上逐步查看搜索，再明确地执行一次移动。</p><p><strong>学习与进化策略</strong>通过经验或选择过程更新参数。课堂拆解一次更新的计算，训练实验室则运行真实训练和独立评估。</p></section>
 <section className="lesson-section"><h2>怎样用好每一课</h2><ol className="lesson-steps"><li>先读学习目标，预测策略会选择哪个动作或产生怎样的更新。</li><li>推进演示，检查搜索顺序、状态或计算结果。</li><li>切换 JavaScript / Python，复制代码运行，再改变一项输入。</li><li>完成练习，结合适用边界解释观察到的结果。</li></ol><p>网页演示使用项目的规则与策略；代码示例拆出适合独立理解的构件。学习基础包括数组、条件判断和循环；阅读示例后可在 Node.js 或 Python 3 中运行。</p><a className="course-start" href={lessonHref(lessons[0].id)}>开始第一课：{lessons[0].title} →</a></section></>}
 </article></div>;
}
