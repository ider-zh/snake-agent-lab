import { TrainingController } from '../training/controller';
import type { TrainingCommand, TrainingEvent } from '../training/types';
const scope = globalThis as unknown as { postMessage: (event: TrainingEvent) => void; onmessage: ((event: MessageEvent<TrainingCommand>) => void) | null };
const controller = new TrainingController(event => scope.postMessage(event));
scope.onmessage = event => controller.handle(event.data);
