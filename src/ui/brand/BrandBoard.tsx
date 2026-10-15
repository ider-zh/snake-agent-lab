import { useEffect, useId, useRef, useState } from 'react';
import { Game } from '../../core';
import { createAgent } from '../../agents';
import type { AgentId, Observation } from '../../core';
import { useVisibility } from './visibility';

function session(strategy: AgentId) {
  return { game: new Game({ width: 8, height: 8, initialization: 'cycle', maxSteps: 5000, maxNoFood: 500 }, 42), agent: createAgent(strategy, 42 ^ 0xabc124, { maxNodes: 10000, maxMs: 20 }) };
}
export function SnakeGraphic({ state }: { state: Observation }) {
  const patternId = useId();
  return <svg viewBox="0 0 400 400" role="img" aria-label={`真实策略棋盘，得分 ${state.score}，步数 ${state.steps}`} className="brand-grid">
    <defs><pattern id={patternId} width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#13241b"/><path d="M0 0H50V50H0ZM50 50H100V100H50Z" fill="#192e22"/></pattern></defs>
    <rect width="400" height="400" rx="8" fill={`url(#${patternId})`}/>
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 50} 0V400M0 ${i * 50}H400`} stroke="#35503a" strokeWidth=".6" opacity=".5"/>)}
    {[...state.snake].reverse().map((cell, i) => <rect key={cell} x={cell % 8 * 50 + 4} y={Math.floor(cell / 8) * 50 + 4} width="42" height="42" rx="10" fill={i === state.snake.length - 1 ? '#d9ff8c' : '#91d763'} opacity={0.3 + (i + 1) / state.snake.length * 0.7}/>)}
    {state.food !== null && <g className="brand-food"><circle cx={state.food % 8 * 50 + 25} cy={Math.floor(state.food / 8) * 50 + 25} r="17" fill="#ffc596" opacity=".12"/><circle cx={state.food % 8 * 50 + 25} cy={Math.floor(state.food / 8) * 50 + 25} r="8" fill="#ffc596"/></g>}
    <circle cx={state.snake[0] % 8 * 50 + 19} cy={Math.floor(state.snake[0] / 8) * 50 + 21} r="3" fill="#18271b"/><circle cx={state.snake[0] % 8 * 50 + 31} cy={Math.floor(state.snake[0] / 8) * 50 + 21} r="3" fill="#18271b"/>
  </svg>;
}
export function BrandBoard({ strategy = 'hamiltonian-shortcut', auto = true }: { strategy?: AgentId; auto?: boolean }) {
  const { ref, active } = useVisibility();
  const [initial] = useState(() => session(strategy));
  const current = useRef(initial);
  const [state, setState] = useState(() => current.current.game.observe());
  const [playing, setPlaying] = useState(auto);
  // Motion preferences affect decoration in CSS, never the game clock.
  const terminal = state.terminated || state.truncated;
  const step = () => {
    const { game, agent } = current.current;
    if (game.observe().terminated || game.observe().truncated) return;
    game.step(agent.decide(game.observe()).action); setState(game.observe());
  };
  useEffect(() => {
    if (!active || !playing || terminal) return;
    const timer = setInterval(step, 50);
    return () => clearInterval(timer);
  }, [active, playing, terminal]);
  const running = active && playing && !terminal;
  return <div ref={ref} className="brand-live" data-running={running} data-steps={state.steps}>
    <div className="brand-live-top"><span><i className={running ? 'signal' : ''}/>{terminal ? state.reason === 'filled' ? '棋盘已填满' : '本局已结束' : running ? 'LIVE · 真实引擎运行中' : '演示已暂停'}</span><span>SEED 0042</span></div>
    <SnakeGraphic state={state}/>
    <div className="brand-live-bottom"><span><b>{String(state.steps).padStart(3, '0')}</b> STEPS</span><span><b>{state.snake.length}<em>/64</em></b> CELLS</span><div><button aria-label={playing ? '暂停实时演示' : '继续实时演示'} disabled={terminal} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▷'}</button><button aria-label="演示前进一步" disabled={running || terminal} onClick={step}>↦</button><button aria-label="重新开始实时演示" onClick={() => { current.current = session(strategy); setState(current.current.game.observe()); setPlaying(false); }}>↺</button></div></div>
    {terminal && <p className="brand-terminal" role="status">{state.reason === 'filled' ? '64 格，全部抵达。' : '边界也是实验的一部分。'} <span>{state.steps} 步 · {state.score} 食物</span></p>}
  </div>;
}
