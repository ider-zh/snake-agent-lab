import { Application, Container, Graphics, Text } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import type { DebugInfo, Observation, SearchFrame } from '../core/types';
export interface BoardView { observation: Observation; label: string; color?: number; debug?: DebugInfo; search?: SearchFrame; }
export function Board({ views, overlay = true }: { views: BoardView[]; overlay?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 720px)').matches ?? false);
  const [selected, setSelected] = useState(0);
  const displayed = compact && views.length > 1 ? [views[Math.min(selected, views.length - 1)]] : views;
  const latest = useRef({ views: displayed, overlay });
  const [error, setError] = useState('');
  useEffect(() => { latest.current = { views: displayed, overlay }; });
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const change = () => setCompact(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let ready = false;
    let observer: ResizeObserver | undefined;
    const app = new Application();
    let previous = '';
    const redraw = () => {
      const current = latest.current;
      const key = JSON.stringify([current, app.screen.width, app.screen.height]);
      if (previous === key) return;
      previous = key;
      app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
      const count = current.views.length;
      const cols = count > 1 ? 2 : 1;
      const rows = Math.ceil(count / cols);
      const gap = count > 1 ? 20 : 0;
      const boxW = (app.screen.width - gap * (cols - 1)) / cols;
      const boxH = (app.screen.height - gap * (rows - 1)) / rows;
      const rectangles: { x: number; y: number; width: number; height: number; label: string }[] = [];
      current.views.forEach((view, index) => {
        const state = view.observation;
        const titleH = count > 1 ? 26 : 0;
        const cell = Math.min(boxW / state.config.width, (boxH - titleH) / state.config.height);
        const w = cell * state.config.width;
        const h = cell * state.config.height;
        const container = new Container();
        container.x = (index % cols) * (boxW + gap) + (boxW - w) / 2;
        container.y = Math.floor(index / cols) * (boxH + gap) + titleH;
        rectangles.push({ x: container.x, y: container.y, width: w, height: h, label: view.label });
        app.stage.addChild(container);
        if (count > 1) {
          const title = new Text({ text: `${view.label} · ${state.score} 食物${state.terminated || state.truncated ? ' · 已结束' : ''}`, style: { fontFamily: 'system-ui', fontSize: 12, fill: '#d2dfc4' } });
          title.y = -22;
          container.addChild(title);
        }
        const g = new Graphics();
        container.addChild(g);
        g.roundRect(0, 0, w, h, 3).fill(0x27372d);
        for (let y = 0; y < state.config.height; y++) for (let x = 0; x < state.config.width; x++) {
          if ((x + y) % 2 === 0) g.rect(x * cell + .5, y * cell + .5, cell - 1, cell - 1).fill({ color: 0x3b5040, alpha: .5 });
        }
        const square = (id: number, color: number, alpha: number, inset: number, radius = 3) => {
          g.roundRect((id % state.config.width) * cell + inset, Math.floor(id / state.config.width) * cell + inset, cell - 2 * inset, cell - 2 * inset, radius).fill({ color, alpha });
        };
        state.config.obstacles.forEach(id => {
          square(id, 0x596258, 1, 2);
          const x = (id % state.config.width) * cell + cell / 2;
          const y = Math.floor(id / state.config.width) * cell + cell / 2;
          g.moveTo(x - cell / 6, y - cell / 6).lineTo(x + cell / 6, y + cell / 6).stroke({ color: 0x90988a, width: 1 });
        });
        if (current.overlay) {
          view.debug?.visited.forEach(id => square(id, 0x6bc7c4, .11, 2));
          view.debug?.path.forEach(id => square(id, 0x93cfa7, .22, cell * .3));
          view.search?.frontier.forEach(({cell:id}) => g.roundRect((id % state.config.width)*cell+3,Math.floor(id/state.config.width)*cell+3,cell-6,cell-6,3).stroke({color:0xd9ad7c,width:2}));
          if(view.search) square(view.search.current.cell,0x8ed0cd,.5,3);
        }
        if (state.food !== null) {
          const x = (state.food % state.config.width) * cell + cell / 2;
          const y = Math.floor(state.food / state.config.width) * cell + cell / 2;
          g.circle(x, y, cell * .32).fill({ color: 0xf3a475, alpha: .12 });
          g.circle(x, y, cell * .2).fill(0xf3a475);
          g.circle(x - cell * .045, y - cell * .065, cell * .045).fill(0xffdfbd);
        }
        const color = view.color ?? 0xa6bd92;
        [...state.snake].reverse().forEach((id, reverseIndex) => {
          const i = state.snake.length - reverseIndex - 1;
          square(id, color, i === 0 ? 1 : Math.max(.3, .8 - i / (state.snake.length + 2) * .45), Math.max(1.4, cell * .1), Math.max(2, cell * .18));
        });
        const head = state.snake[0];
        if (head !== undefined) {
          const x = (head % state.config.width) * cell + cell / 2;
          const y = Math.floor(head / state.config.width) * cell + cell / 2;
          const vectors = [[0,-1],[1,0],[0,1],[-1,0]];
          const [dx,dy] = vectors[state.direction];
          for (const side of [-1,1]) g.circle(x + dx * cell * .18 + dy * cell * .13 * side, y + dy * cell * .18 - dx * cell * .13 * side, Math.max(1.1, cell * .043)).fill(0x182416);
        }
        g.roundRect(0, 0, w, h, 3).stroke({ color: 0x687f5e, width: 1 });
        if(view.search) for(let id=0;id<state.config.width*state.config.height;id++) {
          const label=new Text({text:String(id),style:{fontFamily:'Consolas,monospace',fontSize:Math.max(9,cell*.2),fill:'#e2eadb'}});
          label.x=(id%state.config.width)*cell+3;label.y=Math.floor(id/state.config.width)*cell+2;container.addChild(label);
        }
      });
      if (host.current) host.current.dataset.boardRects = JSON.stringify(rectangles);
    };
    const resize = () => {
      const element = host.current;
      if (!ready || !element || !element.clientWidth || !element.clientHeight) return;
      app.renderer.resize(element.clientWidth, element.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
      redraw();
    };
    void app.init({ backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl', powerPreference: 'low-power' }).then(() => {
      if (cancelled) { app.destroy(true, { children: true }); return; }
      ready = true;
      host.current?.appendChild(app.canvas);
      observer = new ResizeObserver(resize);
      observer.observe(host.current!);
      window.addEventListener('resize', resize);
      app.ticker.add(redraw);
      resize();
    }).catch(err => { if (!cancelled) setError(`绘图初始化失败：${String(err)}`); });
    return () => { cancelled = true; observer?.disconnect(); window.removeEventListener('resize', resize); if (ready) app.destroy(true, { children: true }); };
  }, []);
  return <div className="board-stage">{compact && views.length > 1 && <div className="board-switcher" role="group" aria-label="选择观察策略">{views.map((view, index) => <button key={view.label} aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{view.label}</strong><small>{view.observation.score} 食物 · {view.observation.steps} 步{view.observation.terminated || view.observation.truncated ? ' · 结束' : ''}</small></button>)}</div>}<div ref={host} className={`board-canvas ${displayed.length > 1 ? 'multi-board' : ''}`} role="img" aria-label={displayed.map(view => `${view.label}，得分 ${view.observation.score}，步数 ${view.observation.steps}`).join('；')}>{error && <p className="error">{error}。请使用支持 WebGL 的浏览器</p>}</div></div>;
}
