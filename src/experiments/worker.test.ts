import { afterEach, expect, it, vi } from 'vitest';
import { EXPERIMENT_VERSION } from '../experiments/types';
import type { BatchWorkerEvent, BatchWorkerRequest } from '../experiments/types';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('worker acknowledges chunked cancellation and ignores stale job controls', async () => {
  const messages: BatchWorkerEvent[] = [];
  let receive: (event: MessageEvent<BatchWorkerRequest>) => void = () => {};
  let finish: (value: BatchWorkerEvent) => void = () => {};
  const finished = new Promise<BatchWorkerEvent>(resolve => { finish = resolve; });
  vi.stubGlobal('self', {
    addEventListener: (_name: string, callback: typeof receive) => { receive = callback; },
    postMessage: (event: BatchWorkerEvent) => { messages.push(event); if (event.type === 'cancelled' || event.type === 'error') finish(event); },
  });
  await import('../workers/batch.worker');
  const send = (data: BatchWorkerRequest) => receive({data} as MessageEvent<BatchWorkerRequest>);
  send({type: 'start', jobId: 'job-1', configVersion: EXPERIMENT_VERSION, spec: {agents: ['hamiltonian'], seeds: [1, 2], config: {width: 8, height: 8}, chunkSteps: 1}});
  send({type: 'cancel', jobId: 'stale-job', configVersion: EXPERIMENT_VERSION});
  send({type: 'cancel', jobId: 'job-1', configVersion: EXPERIMENT_VERSION});
  const event = await finished;
  expect(event.type).toBe('cancelled');
  if (event.type === 'cancelled') expect(event.result.status).toBe('cancelled');
  expect(messages.every(message => message.jobId === 'job-1' && message.configVersion === EXPERIMENT_VERSION)).toBe(true);
  expect(messages.map(m => m.seq)).toEqual(messages.map((_m, i) => i + 1));
});
