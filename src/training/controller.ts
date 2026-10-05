import type { Trainer } from './base';
import { validateCheckpoint } from './checkpoint';
import { DQNTrainer } from './dqn';
import { FrozenEvaluator } from './evaluation';
import { GATrainer } from './ga';
import { validateSeeds } from './config';
import type { FrozenModel, TrainingCheckpoint, TrainingCommand, TrainingEvent } from './types';
type EventPayload = TrainingEvent extends infer T ? T extends TrainingEvent ? Omit<T, 'jobId' | 'schemaVersion' | 'sequence'> : never : never;
const yieldEventLoop = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
/** Serialized command boundaries prevent checkpoint reads racing an optimizer update. */
export class TrainingController {
  private readonly send: (event: TrainingEvent) => void;
  private pending: TrainingCommand[] = []; private pumping = false;
  private jobId = ''; private sequence = 0; private paused = false; private lastReport = 0;
  private trainer: Trainer | null = null; private evaluator: FrozenEvaluator | null = null;
  private savedCheckpoint: TrainingCheckpoint | null = null; private savedModel: FrozenModel | null = null;
  constructor(send: (event: TrainingEvent) => void) { this.send = send; }
  handle(command: TrainingCommand): void {
    if (!command || typeof command.jobId !== 'string' || command.jobId.length > 200) return;
    this.pending.push(command); void this.pump();
  }
  private emit(payload: EventPayload): void { this.send({ ...payload, jobId: this.jobId, schemaVersion: 1, sequence: ++this.sequence } as TrainingEvent); }
  private release(): void { this.trainer?.dispose(); this.trainer = null; this.evaluator = null; }
  private async command(command: TrainingCommand): Promise<void> {
    if (command.type === 'start' || command.type === 'import') {
      if (this.trainer || this.evaluator) { this.release(); this.emit({ type: 'status', status: 'cancelled', reason: 'replaced by a new job' }); }
      this.jobId = command.jobId; this.sequence = 0; this.paused = false; this.savedCheckpoint = null; this.savedModel = null;
      this.emit({ type: 'status', status: 'initializing' });
      if (command.type === 'start') this.trainer = command.algorithm === 'dqn' ? await DQNTrainer.create(command.config) : new GATrainer(command.config);
      else {
        const checkpoint = validateCheckpoint(command.checkpoint);
        this.trainer = checkpoint.algorithm === 'dqn' ? await DQNTrainer.restore(checkpoint) : GATrainer.restore(checkpoint);
      }
      this.emit({ type: 'progress', metrics: this.trainer.metrics() }); this.emit({ type: 'status', status: 'running' }); return;
    }
    if (command.type === 'evaluate') {
      if (this.trainer || this.evaluator) throw new Error('Pause and cancel the current task before starting frozen evaluation');
      this.jobId = command.jobId; this.sequence = 0; this.paused = false;
      this.evaluator = new FrozenEvaluator(command.model, validateSeeds(command.seeds ?? command.model.seedSplit.testSeeds));
      this.savedModel = this.evaluator.model;
      this.emit({ type: 'status', status: 'running', reason: 'frozen test evaluation, epsilon = 0' }); return;
    }
    if (command.jobId !== this.jobId) return;
    switch (command.type) {
      case 'pause': this.paused = true; this.trainer?.pause(); this.emit({ type: 'status', status: 'paused' }); break;
      case 'resume':
        if (!this.trainer && !this.evaluator) throw new Error('No paused job; import a checkpoint to resume');
        this.paused = false; this.trainer?.resume(); this.emit({ type: 'status', status: 'running' }); break;
      case 'cancel':
        if (this.trainer) { this.trainer.pause(); this.emit({ type: 'progress', metrics: this.trainer.metrics() }); this.savedModel = this.trainer.exportModel(); this.emit({ type: 'model', model: this.savedModel }); }
        if (this.evaluator) this.emit({ type: 'evaluation', result: this.evaluator.result('test', true) });
        this.release(); this.emit({ type: 'status', status: 'cancelled', reason: 'cancelled by user; live tensors and replay released' }); break;
      case 'checkpoint':
        if (this.trainer) this.savedCheckpoint = await this.trainer.checkpoint();
        if (!this.savedCheckpoint) throw new Error('No full checkpoint is available; save a checkpoint before cancelling');
        this.emit({ type: 'checkpoint', checkpoint: this.savedCheckpoint }); break;
      case 'export-model':
        if (this.trainer) this.savedModel = this.trainer.exportModel();
        if (!this.savedModel) throw new Error('No trained model is available');
        this.emit({ type: 'model', model: this.savedModel }); break;
    }
  }
  private async pump(): Promise<void> {
    if (this.pumping) return; this.pumping = true;
    try {
      while (this.pending.length || (!this.paused && (this.trainer || this.evaluator))) {
        try {
          while (this.pending.length) await this.command(this.pending.shift()!);
          if (this.paused) break;
          const start = performance.now();
          for (let i = 0; i < 32 && performance.now() - start < 16 && !this.pending.length; i++) {
            if (this.trainer) {
              if (!await this.trainer.advance()) {
                this.trainer.pause(); this.emit({ type: 'progress', metrics: this.trainer.metrics() });
                this.savedModel = this.trainer.exportModel(); this.savedCheckpoint = await this.trainer.checkpoint();
                const reason = this.trainer.stopReason ?? 'completed';
                this.emit({ type: 'model', model: this.savedModel }); this.release(); this.emit({ type: 'status', status: 'completed', reason }); break;
              }
            } else if (this.evaluator) {
              this.evaluator.tick();
              if (this.evaluator.done) { this.emit({ type: 'evaluation', result: this.evaluator.result() }); this.evaluator = null; this.emit({ type: 'status', status: 'completed', reason: 'frozen test evaluation complete' }); break; }
            } else break;
          }
          if (this.trainer && performance.now() - this.lastReport >= 200) { this.lastReport = performance.now(); this.emit({ type: 'progress', metrics: this.trainer.metrics() }); }
        } catch (error) {
          this.release(); this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
        if (this.pending.length || (!this.paused && (this.trainer || this.evaluator))) await yieldEventLoop();
      }
    } finally { this.pumping = false; if (this.pending.length) void this.pump(); }
  }
  dispose(): void { this.pending = []; this.release(); }
}
