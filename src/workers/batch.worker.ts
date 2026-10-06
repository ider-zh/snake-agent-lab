/// <reference lib="webworker" />
import { EXPERIMENT_VERSION, runBatch } from '../experiments';
import type { BatchWorkerEvent, BatchWorkerRequest } from '../experiments';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let active: {jobId: string; abort: AbortController; paused: boolean; pauseAcknowledged: boolean; sequence: number} | null = null;
function emit(job: NonNullable<typeof active>, event: Record<string, unknown>): void {
  scope.postMessage({...event, jobId: job.jobId, configVersion: EXPERIMENT_VERSION, seq: ++job.sequence} as BatchWorkerEvent);
}
scope.addEventListener('message', (event: MessageEvent<BatchWorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || typeof message.jobId !== 'string' || !message.jobId || message.jobId.length > 128) return;
  if (message.configVersion !== EXPERIMENT_VERSION) {
    scope.postMessage({type: 'error', jobId: message.jobId, configVersion: EXPERIMENT_VERSION, seq: 0, message: 'Unsupported experiment protocol version'} satisfies BatchWorkerEvent);
    return;
  }
  if (message.type === 'start') {
    if (active) {
      scope.postMessage({type: 'error', jobId: message.jobId, configVersion: EXPERIMENT_VERSION, seq: 0, message: 'A batch is already active. Cancel it before starting another.'} satisfies BatchWorkerEvent);
      return;
    }
    const job = {jobId: message.jobId, abort: new AbortController(), paused: false, pauseAcknowledged: false, sequence: 0};
    active = job;
    void runBatch(message.spec, {
      signal: job.abort.signal,
      isPaused: () => job.paused,
      onPause: () => { if (!job.pauseAcknowledged) { job.pauseAcknowledged = true; emit(job, {type: 'paused'}); } },
      onProgress: progress => emit(job, {type: 'progress', ...progress}),
      onSnapshot: snapshot => emit(job, {type: 'snapshot', ...snapshot}),
    }).then(result => emit(job, {type: result.status === 'cancelled' ? 'cancelled' : 'completed', result}))
      .catch((error: unknown) => emit(job, {type: 'error', message: error instanceof Error ? error.message : String(error)}))
      .finally(() => { if (active === job) active = null; });
    return;
  }
  if (!active || message.jobId !== active.jobId) return;
  if (message.type === 'cancel') { active.abort.abort(); active.paused = false; }
  else if (message.type === 'pause') { active.paused = true; }
  else if (message.type === 'resume') { active.paused = false; active.pauseAcknowledged = false; emit(active, {type: 'resumed'}); }
});
