/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { GameLab } from './GameLab';
import { TrainingLab } from './TrainingLab';
import type { Observation } from '../core';
import { createReplay, importReplay, listRecords, loadRecord, seekReplay } from '../storage';
import type { ReplayRecord } from '../storage';
import { GATrainer } from '../training/ga';
import { makeFrozenModel, networkShapes, parseFrozenModel } from '../training/inference';
import { makeTrainingConfig, observationSize } from '../training/config';
import { parseCheckpoint } from '../training/checkpoint';
import type { EvaluationResult, TrainingCommand, TrainingEvent, TrainingMetrics } from '../training/types';
import { downloadFile } from './shared';

// These are React/jsdom integration tests, not live-browser or Pixi rendering tests.
// Only the graphics, worker transport, and native download boundaries are mocked.
// Game rules, agent decisions, replay validation, model validation, and IndexedDB
// application code remain real; fake-indexeddb implements the storage platform.
vi.mock('../render/Board', () => ({
  Board: ({ views }: { views: { observation: Observation; label: string }[] }) => (
    <div data-testid="board">
      {views.map((view, index) => <pre key={index} data-testid="board-observation" data-label={view.label}>{JSON.stringify(view.observation)}</pre>)}
    </div>
  ),
}));
vi.mock('./shared', async () => ({
  ...await vi.importActual<typeof import('./shared')>('./shared'),
  downloadFile: vi.fn(),
}));

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<TrainingEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn<(message: TrainingCommand) => void>();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  emit(event: TrainingEvent) { act(() => this.onmessage?.({ data: event } as MessageEvent<TrainingEvent>)); }
  get jobId() { return this.postMessage.mock.calls[0][0].jobId; }
}

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('Worker', TestWorker);
  TestWorker.instances = [];
  vi.mocked(downloadFile).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function observations(): Observation[] {
  return screen.getAllByTestId('board-observation').map(node => JSON.parse(node.textContent!) as Observation);
}
function current() { return observations()[0]; }
function button(name: string | RegExp): HTMLButtonElement { return screen.getByRole('button', { name }); }
function gameBoard() { return screen.getByLabelText('游戏棋盘，方向键或 WASD 转向，空格暂停'); }
function renderGame(arena = false) {
  return render(<GameLab arena={arena} model={null} onReplay={vi.fn()} notify={vi.fn()} />);
}
function uploadJSON(label: string, value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const file = new File([text], 'snake-data.json', { type: 'application/json' });
  // jsdom's File omits text(); keep actual file/input behavior and supply that API.
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}
function frozenModel() {
  const config = makeTrainingConfig('dqn', { game: { width: 4, height: 4 }, dqn: { replayCapacity: 64, batchSize: 4, warmup: 4 } });
  const weights = networkShapes(observationSize(4, 4)).map(shape => ({ shape, values: Array(shape.reduce((a, b) => a * b, 1)).fill(0) as number[] }));
  return makeFrozenModel(config.game, 'dqn', weights, { seed: 7, samples: 12, updates: 3, generation: 0, validationMean: null }, {
    trainingPolicy: 'generated-excluding-held-out', validationSeeds: [20001], testSeeds: Array.from({ length: 100 }, (_, i) => 30001 + i),
  });
}
function metrics(samples = 12): TrainingMetrics {
  return {
    algorithm: 'dqn', envSteps: samples, samples, validationSteps: 0, episodes: 1, updates: 3, generation: 0,
    epsilon: 0.75, loss: 0.12, meanScore: 1, bestScore: 2, elapsedMs: 100, backend: 'cpu', tensors: 25,
    tensorBytes: 1000, estimatedReplayBytes: 4000, curve: [], distribution: null, snapshot: null, stopReason: null, validationMean: null,
  };
}
function emitStatus(worker: TestWorker, status: 'running' | 'paused' | 'cancelled' | 'completed', sequence: number, jobId = worker.jobId) {
  worker.emit({ type: 'status', jobId, schemaVersion: 1, sequence, status });
}

describe('workspace navigation and real game controls', () => {
  it('opens a paused experiment, navigates all workspaces, and opens/closes help', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('从一条蛇，探索智能');
    expect(current().steps).toBe(0);
    expect(button('开始运行').disabled).toBe(false);
    const nav = screen.getByRole('navigation', { name: '工作区导航' });
    for (const [name, title] of [
      ['策略竞技', '同一起点，不同的思考'], ['批量评测', '让证据说话'],
      ['训练实验室', '从经验中学习，让策略成长'], ['回放档案', '回到每一个关键决定'],
    ]) {
      const link = within(nav).getByRole('button', { name: new RegExp(name) });
      await user.click(link);
      expect(link.getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title);
    }
    await user.click(button('打开实验说明'));
    expect(screen.getByRole('dialog', { name: '欢迎来到 SnakeLab' })).toBeTruthy();
    await user.click(button('开始探索'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores reversal and accepts only one valid manual turn per game step', () => {
    renderGame();
    fireEvent.click(button('手动游玩'));
    const initial = current();
    expect(initial.direction).toBe(1);
    gameBoard().focus();
    fireEvent.keyDown(gameBoard(), { key: 'ArrowLeft' }); // Invalid reversal does not consume the turn.
    fireEvent.keyDown(gameBoard(), { key: 'ArrowUp' });
    fireEvent.keyDown(gameBoard(), { key: 'ArrowLeft' }); // A second turn in the same step is ignored.
    fireEvent.click(button('单步'));
    expect(current()).toMatchObject({ direction: 0, steps: 1 });
    expect(current().snake[0]).toBe(initial.snake[0] - initial.config.width);
    fireEvent.keyDown(gameBoard(), { key: 'D' });
    fireEvent.click(button('单步'));
    expect(current()).toMatchObject({ direction: 1, steps: 2 });
  });

  it('leaves input/select/button keyboard events alone while manual controls are enabled', () => {
    renderGame();
    fireEvent.click(button('手动游玩'));
    for (const target of [screen.getByLabelText('游戏种子'), screen.getByLabelText('棋盘尺寸'), button('向上')]) {
      target.focus();
      const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
      act(() => { target.dispatchEvent(arrow); target.dispatchEvent(space); });
      expect(arrow.defaultPrevented).toBe(false);
      expect(space.defaultPrevented).toBe(false);
    }
    fireEvent.click(button('单步'));
    expect(current()).toMatchObject({ direction: 1, steps: 1 });
    expect(button('开始运行').disabled).toBe(false);
  });

  it('supports touch turns, timed play, pause, single-step, and same-seed restart', () => {
    vi.useFakeTimers();
    renderGame();
    fireEvent.click(button('手动游玩'));
    const initial = current();
    fireEvent.click(button('向上'));
    fireEvent.click(button('开始运行'));
    expect(button('单步').disabled).toBe(true);
    act(() => vi.advanceTimersByTime(250));
    expect(current()).toMatchObject({ direction: 0, steps: 2 });
    fireEvent.click(button('暂停'));
    act(() => vi.advanceTimersByTime(500));
    expect(current().steps).toBe(2);
    fireEvent.click(button('单步'));
    expect(current().steps).toBe(3);
    fireEvent.click(button('重开'));
    expect(current()).toEqual(initial);
    expect(button('开始运行').disabled).toBe(false);
  });

  it('uses Space only while the board is focused and pauses when the tab is hidden', () => {
    vi.useFakeTimers();
    renderGame();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(screen.queryByRole('button', { name: '暂停' })).toBeNull();
    gameBoard().focus();
    fireEvent.keyDown(gameBoard(), { key: ' ', code: 'Space' });
    act(() => vi.advanceTimersByTime(125));
    expect(current().steps).toBe(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(button('开始运行').disabled).toBe(false);
    act(() => vi.advanceTimersByTime(500));
    expect(current().steps).toBe(1);
  });

  it('initializes four arena strategies with identical states and advances all independently', () => {
    renderGame(true);
    expect(observations()).toHaveLength(4);
    const initial = current();
    expect(observations().every(state => JSON.stringify(state) === JSON.stringify(initial))).toBe(true);
    expect(new Set(screen.getAllByTestId('board-observation').map(node => node.dataset.label)).size).toBe(4);
    fireEvent.click(button('单步'));
    expect(observations().map(state => state.steps)).toEqual([1, 1, 1, 1]);
    fireEvent.change(screen.getByLabelText('游戏种子'), { target: { value: '314' } });
    expect(observations().every(state => state.steps === 0)).toBe(true);
    expect(observations().every(state => JSON.stringify(state) === JSON.stringify(current()))).toBe(true);
    expect(current().food).not.toBe(initial.food);
  });
});

describe('verified replay UI and persistence', () => {
  it('opens the current game replay and seeks the exact recorded states without re-running an agent', async () => {
    render(<App />);
    fireEvent.click(button('手动游玩'));
    const initial = current();
    fireEvent.click(button('向上'));
    fireEvent.click(button('单步'));
    const middle = current();
    fireEvent.click(button('向右'));
    fireEvent.click(button('单步'));
    const final = current();
    fireEvent.click(button('查看本局回放'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('回到每一个关键决定');
    expect(current()).toMatchObject(initial);
    fireEvent.change(screen.getByLabelText('回放进度'), { target: { value: '2' } });
    expect(current()).toMatchObject(final);
    expect(button('下一步').disabled).toBe(true);
    fireEvent.click(button('上一步'));
    expect(current()).toMatchObject(middle);
    fireEvent.click(button('导出'));
    const [name, text] = vi.mocked(downloadFile).mock.calls.at(-1)!;
    expect(name).toBe('snake-replay.json');
    const replay = importReplay(text);
    expect(replay.actions).toEqual([0, 1]);
    expect(seekReplay(replay, 2)).toMatchObject(final);
    await waitFor(() => expect(screen.getByText('还没有本地回放。在实验台点击“保存回放”即可添加。')).toBeTruthy());
  });

  it('saves a game in IndexedDB and loads it from the replay library after restarting the game', async () => {
    render(<App />);
    fireEvent.click(button('单步'));
    const savedState = current();
    fireEvent.click(button('保存回放'));
    await screen.findByText('回放已保存在本浏览器');
    const records = await listRecords('replay');
    expect(records).toHaveLength(1);
    const record = await loadRecord<ReplayRecord>('replay', records[0].id);
    expect(seekReplay(record!, 1)).toMatchObject(savedState);
    fireEvent.click(button('重开'));
    fireEvent.click(button(/^回放档案/));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(records[0].id) }));
    fireEvent.click(await screen.findByRole('button', { name: '下一步' }));
    expect(current()).toMatchObject(savedState);
  });

  it('imports a validated replay, rejects tampering without replacing it, and reaches the last playback frame', async () => {
    const replay = createReplay({ config: { width: 8, height: 8 }, seed: 2, actions: [0, 1, 2], label: 'Imported replay' });
    render(<App />);
    fireEvent.click(button(/^回放档案/));
    uploadJSON('导入回放文件', replay);
    await screen.findByText('回放已验证：3 步哈希全部一致');
    expect(current()).toEqual(seekReplay(replay, 0));
    uploadJSON('导入回放文件', { ...replay, hashes: replay.hashes.map(() => 'deadbeef') });
    await screen.findByText(/回放导入失败/);
    expect(current()).toEqual(seekReplay(replay, 0));
    vi.useFakeTimers();
    fireEvent.click(button('播放'));
    expect(button('下一步').disabled).toBe(true);
    act(() => vi.advanceTimersByTime(750));
    expect(current()).toEqual(seekReplay(replay, 3));
    expect(button('播放').disabled).toBe(true);
    expect(button('上一步').disabled).toBe(false);
  });

  it('shows a storage failure rather than reporting a successful save', async () => {
    vi.stubGlobal('indexedDB', undefined);
    render(<App />);
    fireEvent.click(button('保存回放'));
    await screen.findByText(/Persistent browser storage is unavailable/);
    expect(screen.queryByText('回放已保存在本浏览器')).toBeNull();
  });
});

describe('training UI worker lifecycle', () => {
  it('sends explicit configuration and filters wrong-job, duplicate, and out-of-order worker events', () => {
    const notify = vi.fn();
    render(<TrainingLab notify={notify} onModel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('训练种子'), { target: { value: '19' } });
    fireEvent.change(screen.getByLabelText('训练预算'), { target: { value: '2000' } });
    fireEvent.click(screen.getByLabelText(/Double DQN/));
    fireEvent.click(button('开始训练'));
    const worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'start', jobId: expect.any(String), algorithm: 'dqn',
      config: expect.objectContaining({ seed: 19, budget: expect.objectContaining({ maxEnvSteps: 2000 }), dqn: expect.objectContaining({ doubleDQN: false }) }),
    }));
    const command = worker.postMessage.mock.calls[0][0];
    if (command.type !== 'start') throw new Error('Expected start command');
    expect(command.config!.testSeeds).toHaveLength(100);
    expect(command.config!.validationSeeds!.some(seed => command.config!.testSeeds!.includes(seed))).toBe(false);
    expect(button('开始训练').disabled).toBe(true);
    emitStatus(worker, 'completed', 100, 'stale-job');
    expect(screen.getByRole('status').textContent).toBe('初始化引擎…');
    emitStatus(worker, 'running', 2);
    emitStatus(worker, 'completed', 2);
    emitStatus(worker, 'completed', 1);
    expect(screen.getByRole('status').textContent).toBe('训练中');
    expect(button('完整检查点').disabled).toBe(true);
    worker.emit({ type: 'progress', jobId: worker.jobId, schemaVersion: 1, sequence: 3, metrics: metrics() });
    expect(button('完整检查点').disabled).toBe(false);
    fireEvent.click(button('暂停'));
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'pause', jobId: worker.jobId });
    emitStatus(worker, 'paused', 4);
    fireEvent.click(button('继续'));
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'resume', jobId: worker.jobId });
    emitStatus(worker, 'running', 5);
    fireEvent.click(button('停止'));
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', jobId: worker.jobId });
    emitStatus(worker, 'cancelled', 6);
    expect(button('开始训练').disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('已停止');
    expect(notify).not.toHaveBeenCalled();
  });

  it('requests a pause on a hidden tab, replaces workers for new runs, and terminates on unmount', () => {
    const { unmount } = render(<TrainingLab notify={vi.fn()} onModel={vi.fn()} />);
    fireEvent.click(button('开始训练'));
    const old = TestWorker.instances[0];
    emitStatus(old, 'running', 0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(old.postMessage).toHaveBeenLastCalledWith({ type: 'pause', jobId: old.jobId });
    emitStatus(old, 'cancelled', 1);
    fireEvent.click(button('开始训练'));
    const next = TestWorker.instances[1];
    expect(next.jobId).not.toBe(old.jobId);
    expect(old.terminate).toHaveBeenCalledOnce();
    emitStatus(old, 'completed', 99);
    expect(screen.getByRole('status').textContent).toBe('初始化引擎…');
    emitStatus(next, 'running', 0);
    expect(screen.getByRole('status').textContent).toBe('训练中');
    unmount();
    expect(next.terminate).toHaveBeenCalledOnce();
  });

  it('imports and exports a real validated model, runs frozen evaluation, and displays returned results', async () => {
    const notify = vi.fn(), onModel = vi.fn(), model = frozenModel();
    render(<TrainingLab notify={notify} onModel={onModel} />);
    expect(button('导出推理模型').disabled).toBe(true);
    uploadJSON('导入模型或检查点', { ...model, script: 'untrusted' });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/导入失败/)));
    expect(onModel).not.toHaveBeenCalled();
    uploadJSON('导入模型或检查点', model);
    await waitFor(() => expect(onModel).toHaveBeenCalledWith(model));
    fireEvent.click(button('导出推理模型'));
    const [name, text] = vi.mocked(downloadFile).mock.calls.at(-1)!;
    expect(name).toBe('snake-frozen-model.json');
    expect(parseFrozenModel(text)).toEqual(model);
    fireEvent.click(button('评估冻结模型 · 100 局'));
    const worker = TestWorker.instances[0];
    const command = worker.postMessage.mock.calls[0][0];
    if (command.type !== 'evaluate') throw new Error('Expected evaluation command');
    expect(command.model).toEqual(model);
    expect(command.seeds).toEqual(model.seedSplit.testSeeds);
    expect(button('评估冻结模型 · 100 局').disabled).toBe(true);
    const result: EvaluationResult = {
      modelVersion: model.version, split: 'test', seeds: command.seeds!, episodes: [], meanScore: 2,
      meanFill: 0.25, successRate: 0, collisionRate: 0.75, truncationRate: 0.25, envSteps: 1200, cancelled: false,
    };
    worker.emit({ type: 'evaluation', jobId: command.jobId, schemaVersion: 1, sequence: 0, result });
    expect(screen.getByRole('status').textContent).toBe('任务完成');
    expect(screen.getByText('75.0%')).toBeTruthy();
    fireEvent.click(button('导出评估结果'));
    expect(JSON.parse(vi.mocked(downloadFile).mock.calls.at(-1)![1])).toEqual(result);
  });

  it('imports a real GA checkpoint, sends optional budget extension, and exports/saves the returned checkpoint', async () => {
    const trainer = new GATrainer({ game: { width: 4, height: 4 }, ga: { populationSize: 4, eliteCount: 1, tournamentSize: 2 } });
    const checkpoint = await trainer.checkpoint();
    trainer.dispose();
    const notify = vi.fn();
    render(<TrainingLab notify={notify} onModel={vi.fn()} />);
    uploadJSON('导入模型或检查点', checkpoint);
    await waitFor(() => expect(button('恢复 GA 检查点').disabled).toBe(false));
    fireEvent.click(screen.getByLabelText(/恢复时追加/));
    fireEvent.click(button('恢复 GA 检查点'));
    const worker = TestWorker.instances[0];
    const command = worker.postMessage.mock.calls[0][0];
    if (command.type !== 'import') throw new Error('Expected checkpoint import');
    expect(command.checkpoint.config.budget).toEqual({
      maxEnvSteps: checkpoint.config.budget.maxEnvSteps + 100000,
      maxWallMs: checkpoint.config.budget.maxWallMs + 60000,
      maxGenerations: checkpoint.config.budget.maxGenerations + 50,
    });
    expect(command.checkpoint.counters).toEqual(checkpoint.counters);
    emitStatus(worker, 'paused', 0);
    worker.emit({ type: 'progress', jobId: worker.jobId, schemaVersion: 1, sequence: 1, metrics: { ...metrics(), algorithm: 'ga' } });
    fireEvent.click(button('完整检查点'));
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'checkpoint', jobId: worker.jobId });
    worker.emit({ type: 'checkpoint', jobId: worker.jobId, schemaVersion: 1, sequence: 2, checkpoint });
    expect(parseCheckpoint(vi.mocked(downloadFile).mock.calls.at(-1)![1])).toEqual(checkpoint);
    fireEvent.click(button('本地保存'));
    worker.emit({ type: 'checkpoint', jobId: worker.jobId, schemaVersion: 1, sequence: 3, checkpoint });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('检查点已保存在本浏览器'));
    const saved = await listRecords('checkpoint');
    expect(saved).toHaveLength(1);
    expect(await loadRecord('checkpoint', saved[0].id)).toEqual(checkpoint);
    await screen.findByLabelText('本地检查点');
  });

  it('keeps a running training worker mounted while the user visits another workspace', async () => {
    render(<App />);
    fireEvent.click(button(/^训练实验室/));
    fireEvent.click(button('开始训练'));
    const worker = TestWorker.instances[0];
    emitStatus(worker, 'running', 0);
    fireEvent.click(button(/^实验台/));
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(screen.getByTestId('game-lab')).toBeTruthy();
    fireEvent.click(button('手动游玩'));
    fireEvent.click(button('单步'));
    const manualState = current();
    worker.emit({ type: 'progress', jobId: worker.jobId, schemaVersion: 1, sequence: 1, metrics: metrics(37) });
    worker.emit({ type: 'model', jobId: worker.jobId, schemaVersion: 1, sequence: 2, model: frozenModel() });
    expect(current()).toEqual(manualState);
    fireEvent.click(button(/^训练实验室/));
    expect(screen.getByRole('status').textContent).toBe('训练中');
    expect(screen.getByText('37 SAMPLES')).toBeTruthy();
    expect(TestWorker.instances).toHaveLength(1);
    // Let real IndexedDB mount reads settle before teardown.
    await listRecords('checkpoint');
  });
});
