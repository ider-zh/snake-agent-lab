/** Retry a failed bootstrap once, before any worker state has been observed.
 * Never restart a running trainer: that would silently discard learned state. */
export interface ManagedWorker {
 postMessage(value: unknown): void;
 onmessage: ((event: MessageEvent) => void) | null;
 terminate(): void;
}
export function workerErrorDetail(event: unknown): string {
 if(event instanceof Error)return event.message || event.name;
 if(event && typeof event==='object'){
  const e=event as {message?:unknown;filename?:unknown;lineno?:unknown;type?:unknown};
  if(typeof e.message==='string'&&e.message.trim())return `${e.message}${typeof e.filename==='string'&&e.filename?` (${e.filename}:${e.lineno??0})`:''}`;
  if(e.type==='messageerror')return '计算线程消息解码失败，请重新启动任务';
 }
 return '计算线程脚本加载或初始化失败。请刷新页面加载当前版本，再重试；若仍失败，请检查浏览器控制台中的资源请求';
}
export function createManagedWorker(factory:()=>Worker,onError:(message:string)=>void):ManagedWorker {
 let instance:Worker|null=null,ended=false,received=false,retried=false;
 const initial:unknown[]=[];
 const fail=(event:unknown)=>{
  if(ended)return;
  console.error('SnakeLab worker failure',event);
  instance?.terminate();instance=null;
  if(!received&&!retried){retried=true;queueMicrotask(spawn);return;}
  ended=true;onError(workerErrorDetail(event));
 };
 const port:ManagedWorker={onmessage:null,postMessage(value){if(ended)return;if(!received)initial.push(value);try{instance?.postMessage(value);}catch(e){fail(e);}},terminate(){ended=true;instance?.terminate();instance=null;initial.length=0;}};
 function spawn(){
  if(ended)return;
  try{
   const worker=factory();instance=worker;
   worker.onerror=e=>{e.preventDefault();if(instance===worker)fail(e);};
   worker.onmessageerror=e=>{if(instance===worker)fail(e);};
   worker.onmessage=e=>{if(ended||instance!==worker)return;received=true;initial.length=0;port.onmessage?.(e);};
   for(const value of initial)worker.postMessage(value);
  }catch(e){fail(e);}
 }
 spawn();return port;
}
