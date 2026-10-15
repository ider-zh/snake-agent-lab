import {afterEach,describe,it,expect,vi} from 'vitest';
import {createManagedWorker,workerErrorDetail} from './managed-worker';
afterEach(()=>vi.restoreAllMocks());
function fake(){return {onerror:null,onmessage:null,onmessageerror:null,postMessage:vi.fn(),terminate:vi.fn()} as unknown as Worker;}
describe('worker lifetime and errors',()=>{
 it('replays the initial request only after a bootstrap failure and isolates the dead worker',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const first=fake(),second=fake(),factory=vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),error=vi.fn(),received=vi.fn();
  const port=createManagedWorker(factory,error);port.onmessage=received;const request={type:'start',jobId:'one'};port.postMessage(request);
  first.onerror!({type:'error',preventDefault(){}} as ErrorEvent);await Promise.resolve();
  expect(first.terminate).toHaveBeenCalledOnce();expect(second.postMessage).toHaveBeenCalledExactlyOnceWith(request);
  first.onmessage!({data:'stale'} as MessageEvent);expect(received).not.toHaveBeenCalled();
  second.onmessage!({data:'ready'} as MessageEvent);expect(received).toHaveBeenCalledOnce();
  second.onerror!({type:'error',message:'runtime failure',filename:'trainer.js',lineno:42,preventDefault(){}} as ErrorEvent);
  expect(factory).toHaveBeenCalledTimes(2);expect(error).toHaveBeenCalledWith('runtime failure (trainer.js:42)');
 });
 it('cancelling during retry prevents a resurrected trainer',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});const first=fake(),factory=vi.fn(()=>first),port=createManagedWorker(factory,vi.fn());
  first.onerror!({type:'error',preventDefault(){}} as ErrorEvent);port.terminate();await Promise.resolve();expect(factory).toHaveBeenCalledOnce();
 });
 it('reports constructor/security errors after one bounded attempt',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});const factory=vi.fn(()=>{throw new Error('Worker blocked by policy');}),error=vi.fn();createManagedWorker(factory,error);await Promise.resolve();
  expect(factory).toHaveBeenCalledTimes(2);expect(error).toHaveBeenCalledExactlyOnceWith('Worker blocked by policy');
  expect(workerErrorDetail(new Event('error'))).toContain('脚本加载或初始化失败');expect(workerErrorDetail(new Event('messageerror'))).toContain('解码');
 });
});
