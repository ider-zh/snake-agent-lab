import {LearningController} from '../learning/controller';
import type {LearningCommand,LearningEvent} from '../learning/controller';
const scope=globalThis as unknown as {postMessage:(event:LearningEvent)=>void;onmessage:((event:MessageEvent<LearningCommand>)=>void)|null};
const controller=new LearningController(event=>scope.postMessage(event));
scope.onmessage=event=>controller.handle(event.data);
