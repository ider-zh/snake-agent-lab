import { useState } from 'react';
import type { AgentId } from '../../core';
import { BrandBoard } from './BrandBoard';
import { Film } from './Film';
import './brand.css';

const strategies: { id: AgentId; name: string; english: string; title: string; description: string; principle: string }[] = [
  { id: 'hamiltonian-shortcut', name: '安全捷径', english: 'HAMILTONIAN', title: '先为终点，留好位置。', description: '保持身体沿环有序，在安全时走捷径。这个 8 × 8 无障碍场景已验证可以填满棋盘；换一个规则，结论也需要重新验证。', principle: '有序环 → 安全捷径 → 保留退路' },
  { id: 'astar', name: 'A* 搜索', english: 'HEURISTIC SEARCH', title: '不只寻找近路，也检查退路。', description: '结合已走距离与目标估计，搜索食物路径；再模拟身体移动，检查尾部与剩余空间。局部安全判断不等于全局通关保证。', principle: '候选路径 → 模拟移动 → 空间检查' },
  { id: 'greedy', name: '纯贪心', english: 'THE BASELINE', title: '眼前的最优，会走向哪里？', description: '只朝离食物更近的方向前进，不做额外的安全验证。一个简单的对照，帮助你看清规划究竟改变了什么。', principle: '观察距离 → 选择更近 → 承担风险' },
];
function Arrow() { return <span aria-hidden="true">↗</span>; }
function Jump({ target, children }: { target: string; children: React.ReactNode }) {
  return <button onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>{children}</button>;
}
export function BrandPage() {
  const [strategy, setStrategy] = useState(0);
  const selected = strategies[strategy];
  return <div className="landing" data-testid="brand-page">
    <a className="brand-skip" href="#brand-main">跳到主要内容</a>
    <header className="brand-nav"><a href="#" className="brand-wordmark" aria-label="SnakeLab 品牌首页"><img src="/favicon.svg" alt=""/>SNAKE<span>LAB</span><i>EXPERIMENTAL</i></a><nav aria-label="品牌页导航"><Jump target="brand-strategies">策略</Jump><Jump target="brand-cinema">现场</Jump><Jump target="brand-learning">课堂</Jump></nav><a className="brand-nav-cta" href="#/lab">进入实验室 <Arrow/></a></header>
    <main id="brand-main" tabIndex={-1}>
      <section className="brand-hero" aria-labelledby="brand-title">
        <div className="brand-orbit" aria-hidden="true"/><div className="brand-hero-copy"><p className="brand-kicker"><span/> ONE SMALL GAME. MANY WAYS TO THINK.</p><h1 id="brand-title">下一步，<br/>让智能<em>发生。</em></h1><p className="brand-intro">一条蛇，一片有限的空间。<br/>把搜索、规划与学习，变成看得见的选择。</p><div className="brand-actions"><a className="brand-cta" href="#/lab">进入 Snake Lab <Arrow/></a><Jump target="brand-cinema">先看它如何思考 <span>↓</span></Jump></div><div className="brand-hero-note"><span>无需安装 · 浏览器内运行</span><span>开源 · 可验证 · 可重放</span></div></div>
        <div className="brand-hero-visual"><div className="brand-visual-label"><span>EXPERIMENT / 001</span><span>实时运行，不是视频</span></div><BrandBoard/><div className="brand-visual-foot"><span>HAMILTONIAN / 安全捷径</span><a href="#/lab">亲自接管 <Arrow/></a></div><div className="brand-coordinate" aria-hidden="true">08 × 08<br/>THE SPACE OF POSSIBILITY</div></div>
        <div className="brand-hero-bottom"><span>一场关于决策的可视化实验</span><Jump target="brand-strategies">向下探索 <span>↓</span></Jump><span>01 — 05</span></div>
      </section>
      <div className="brand-marquee" aria-hidden="true"><span>OBSERVE</span><i>↗</i><span>QUESTION</span><i>↗</i><span>EXPERIMENT</span><i>↗</i><span>REPLAY</span><i>↗</i><span>UNDERSTAND</span></div>
      <section id="brand-strategies" className="brand-section brand-strategies">
        <div className="brand-section-top"><span className="brand-index">01 / WAYS OF THINKING</span><span>同一游戏，不同决策逻辑</span></div>
        <div className="brand-section-heading"><h2>没有唯一的聪明。<br/><span>只有可以检验的选择。</span></h2><p>从规则到搜索，再到学习。<br/>先观察，再提问，最后用实验回答。</p></div>
        <div className="brand-strategy-layout"><div className="brand-strategy-editor"><div className="brand-tabs" role="tablist" aria-label="比较决策策略">{strategies.map((item, index) => <button role="tab" aria-selected={index === strategy} tabIndex={index===strategy?0:-1} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;if(next!==null){event.preventDefault();setStrategy(next);document.getElementById(`strategy-tab-${next}`)?.focus();}}} aria-controls="strategy-panel" id={`strategy-tab-${index}`} key={item.id} onClick={() => setStrategy(index)}><span>0{index + 1}</span>{item.name}<Arrow/></button>)}</div><div id="strategy-panel" role="tabpanel" aria-labelledby={`strategy-tab-${strategy}`}><p className="brand-kicker">{selected.english}</p><h3>{selected.title}</h3><p>{selected.description}</p><div className="brand-principle">{selected.principle}</div><a className="brand-text-link" href={`#/lessons/${selected.id}`}>阅读这项策略 <Arrow/></a></div></div><div className="brand-strategy-board"><BrandBoard key={selected.id} strategy={selected.id} auto={false}/><p>相同 8 × 8 沿环初态与种子 #42。点击 ↦ 单步推进，或 ▷ 运行；切换策略重新开始。这里不做训练，也不代表算法排名。</p></div></div>
      </section>
      <section id="brand-cinema" className="brand-section brand-cinema">
        <div className="brand-section-top"><span className="brand-index">02 / INSIDE THE LAB</span><span>从项目中直接录制</span></div><div className="brand-section-heading"><h2>让过程，<br/><span>自己说话。</span></h2><p>不只有最终分数。<br/>路径、犹豫与转向，都值得被看见。</p></div>
        <div className="brand-cinema-grid"><div className="brand-cinema-main"><Film name="arena" title="策略竞技" href="#/arena"/><div className="brand-film-description"><h3>同场景，四种思考。</h3><p>在独立棋盘上对照策略。保持规则与初态一致，观察路径如何分岔。</p><a className="brand-text-link" href="#/arena">打开策略竞技 <Arrow/></a></div></div><div className="brand-cinema-side"><div className="brand-cinema-quote"><span>“</span><p>看见一次选择，<br/>比只看到一个分数，<br/>更接近理解。</p></div><Film name="shortcut" title="安全捷径" href="#/lab"/><div className="brand-film-description"><h3>为完整走完，留下退路。</h3><p>安全捷径的真实运行片段。首屏同配置已经过引擎及逐步回放验证。</p></div></div></div>
      </section>
      <section id="brand-learning" className="brand-section brand-learning"><div className="brand-section-top"><span className="brand-index">03 / LEARN BY DOING</span><span>从直觉走向可执行的理解</span></div><div className="brand-learning-layout"><div><p className="brand-kicker">不止是观看</p><h2>把「为什么」，<br/>变成下一次实验。</h2><p>读一段代码，推进一个节点，检查一次选择。<br/>策略课堂把算法拆成可以动手的步骤。</p><a className="brand-cta" href="#/lessons/astar">进入策略课堂 <Arrow/></a></div><a href="#/lessons/astar" className="brand-code-preview" aria-label="打开 A* 课堂预览"><div><span>LESSON / A* SEARCH</span><Arrow/></div><pre><code><span className="code-comment">// 好的问题，从一个局面开始。</span>{'\n'}<span className="code-keyword">const</span> priority = cost + estimate;{'\n\n'}<span className="code-keyword">while</span> (frontier.length) {'{\n'}  <span className="code-keyword">const</span> next = popBest(frontier);{'\n'}  explore(next);{'\n'}{'}'}</code></pre><div className="brand-code-trace"><span>01 观察局面</span><span>02 阅读代码</span><span>03 推进搜索</span></div><small>概念代码 · 完整实现与可操作场景见课堂</small></a></div>
      </section>
      <section className="brand-section brand-workspaces"><div className="brand-section-top"><span className="brand-index">04 / YOUR EXPERIMENTS</span><span>从观察者，成为实验者</span></div><h2>把好奇心，<span>带进实验室。</span></h2><div className="brand-workspace-list">{[{n:'01',title:'亲自接管棋盘',text:'手动、单步与策略切换，让每一个动作都有来处。',href:'#/lab',tag:'PLAY & OBSERVE'},{n:'02',title:'让策略从经验中学习',text:'DQN、GA、Q-learning、SARSA、PPO 与模仿学习；训练在本地 Worker 中运行。',href:'#/training',tag:'TRAIN & EVOLVE'},{n:'03',title:'用共同种子验证猜想',text:'统一规则和预算，记录失败与截断，导出你的评测结果。',href:'#/batch',tag:'BENCHMARK'},{n:'04',title:'回到每个关键决定',text:'记录动作，逐步校验状态哈希；同一个实验，能够被重现。',href:'#/replay',tag:'REPLAY & VERIFY'}].map(item=><a key={item.n} href={item.href}><span>{item.n}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><small>{item.tag}</small><Arrow/></a>)}</div></section>
      <section className="brand-section brand-open"><div className="brand-section-top"><span className="brand-index">05 / OPEN BY DESIGN</span><span>不是黑盒，是开放的实验台</span></div><div className="brand-open-grid"><h2>所有选择，<br/><span>都有迹可循。</span></h2><div><p>纯 TypeScript 规则核心、确定性种子与动作回放。React 构建工作区，PixiJS 呈现实验棋盘，训练任务在 Worker 中执行。</p><p>模型与回放保存在你的浏览器。代码在 GitHub 开放查看，结果留给真实实验。</p><a className="brand-text-link" href="https://github.com/ider-zh/snake-game-lab" target="_blank" rel="noreferrer">查看 GitHub 源码 <Arrow/></a></div></div><div className="brand-tech"><span>TYPESCRIPT</span><span>REACT</span><span>PIXIJS</span><span>WEB WORKERS</span><span>DETERMINISTIC CORE</span></div></section>
      <section className="brand-final"><p className="brand-kicker">THE NEXT MOVE IS YOURS.</p><h2>下一步，<em>由你决定。</em></h2><a className="brand-cta" href="#/lab">进入 Snake Lab <Arrow/></a><div className="brand-final-path" aria-hidden="true"/></section>
    </main><footer className="brand-footer"><a href="#" className="brand-wordmark">SNAKE<span>LAB</span></a><p>一个关于智能、边界与选择的开放实验。</p><span>BUILT FOR CURIOSITY · 2026</span></footer>
  </div>;
}
