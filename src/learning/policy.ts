import {relativeAction,type GameConfig,type Observation} from '../core';
import {encodeObservation} from '../training/encoding';
import {assertRecord,assertKeys,finiteInteger,parseBoundedJSON} from '../storage/validation';
import {tabularConfig} from './tabular';
export type PolicyAlgorithm='ppo'|'imitation';
export interface PolicyConfig {algorithm:PolicyAlgorithm;seed:number;game:GameConfig;maxSteps:number;maxWallMs:number;validationSeeds:number[];testSeeds:number[];actorRate:number;criticRate:number;gamma:number;lambda:number;clip:number;entropy:number;rolloutSize:number;epochs:number;batchSize:number;}
export interface PolicyModel {version:'snake-policy-v1';observationVersion:'relative-features-v2';architecture:'linear-softmax-13x3-v1';algorithm:PolicyAlgorithm;game:GameConfig;actor:number[];critic:number[];teacher:'astar-nodes1000-v1'|null;seedSplit:{trainingPolicy:'generated-excluding-held-out';validationSeeds:number[];testSeeds:number[]};provenance:{seed:number;samples:number;updates:number};}
export interface AdamState {m:number[];v:number[];t:number;}
export interface PolicySample {x:number[];action:number;oldLogP:number;oldValue:number;reward:number;done:boolean;advantage:number;target:number;}
export function finite(v:unknown,name:string,min:number,max:number):number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid ${name}`);return v;}
export function policyConfig(input:Partial<PolicyConfig>={}):PolicyConfig {
  assertRecord(input);assertKeys(input,['algorithm','seed','game','maxSteps','maxWallMs','validationSeeds','testSeeds','actorRate','criticRate','gamma','lambda','clip','entropy','rolloutSize','epochs','batchSize'],'Policy configuration');
  const common=tabularConfig({...(input.seed===undefined?{}:{seed:input.seed}),...(input.game===undefined?{}:{game:input.game}),...(input.maxSteps===undefined?{}:{maxSteps:input.maxSteps}),...(input.maxWallMs===undefined?{}:{maxWallMs:input.maxWallMs}),validationSeeds:input.validationSeeds??[51001,51002,51003,51004,51005],testSeeds:input.testSeeds??Array.from({length:20},(_,i)=>52001+i)});
  const c:PolicyConfig={algorithm:'ppo',seed:common.seed,game:common.game,maxSteps:common.maxSteps,maxWallMs:common.maxWallMs,validationSeeds:common.validationSeeds,testSeeds:common.testSeeds,actorRate:.003,criticRate:.01,gamma:.99,lambda:.95,clip:.2,entropy:.01,rolloutSize:128,epochs:4,batchSize:32,...input};
  c.game=common.game;c.validationSeeds=common.validationSeeds;c.testSeeds=common.testSeeds;
  if(!['ppo','imitation'].includes(c.algorithm))throw new Error('Unsupported policy algorithm');
  finite(c.actorRate,'actor rate',1e-6,.1);finite(c.criticRate,'critic rate',1e-6,.1);for(const k of ['gamma','lambda','clip','entropy'] as const)finite(c[k],k,0,1);
  finiteInteger(c.rolloutSize,'rollout size',8,512);finiteInteger(c.epochs,'epochs',1,8);finiteInteger(c.batchSize,'batch size',1,c.rolloutSize);return c;
}
export function policyFeatures(o:Observation):number[]{return [...encodeObservation(o,'compact-v2'),1];}
export function distribution(actor:readonly number[],x:readonly number[]):number[]{
  let allowed=[0,1,2].filter(i=>x[i]===0);if(!allowed.length)allowed=[0,1,2];
  const logits=[0,1,2].map(a=>x.reduce((s,v,i)=>s+v*actor[i*3+a],0)),top=Math.max(...allowed.map(a=>logits[a]));
  const values=logits.map((z,a)=>allowed.includes(a)?Math.exp(z-top):0),sum=values.reduce((a,b)=>a+b,0);return values.map(v=>v/sum);
}
export function criticValue(critic:readonly number[],x:readonly number[]):number{return x.reduce((s,v,i)=>s+v*critic[i],0);}
export function argmaxPolicy(p:readonly number[]):number{return p.reduce((best,v,i)=>v>p[best]?i:best,0);}
export function predictPolicy(model:PolicyModel,o:Observation){if(model.game.width!==o.config.width||model.game.height!==o.config.height||JSON.stringify(model.game.obstacles)!==JSON.stringify(o.config.obstacles))throw new Error('Model and game differ');const probabilities=distribution(model.actor,policyFeatures(o));return {action:relativeAction(o.direction,argmaxPolicy(probabilities)),qValues:probabilities};}
/** Analytic gradient of the exact PPO-Clip actor objective or supervised cross entropy. */
export function actorGradient(actor:readonly number[],samples:readonly PolicySample[],algorithm:PolicyAlgorithm,clip=.2,entropyCoefficient=.01){
  const gradient=Array(39).fill(0) as number[];let loss=0,entropy=0,clipped=0;
  for(const sample of samples){
    const p=distribution(actor,sample.x),log=Math.log(Math.max(p[sample.action],1e-12)),h=-p.reduce((s,v)=>s+(v? v*Math.log(v):0),0);
    const ratio=Math.exp(log-sample.oldLogP),bounded=Math.max(1-clip,Math.min(1+clip,ratio));
    const blocked=sample.advantage>=0?ratio>1+clip:ratio<1-clip;
    const coefficient=algorithm==='imitation'?-1:blocked?0:-sample.advantage*ratio;
    loss+=algorithm==='imitation'?-log:-Math.min(ratio*sample.advantage,bounded*sample.advantage)-entropyCoefficient*h;
    entropy+=h;clipped+=Number(ratio<1-clip||ratio>1+clip);
    for(let a=0;a<3;a++){
      const dz=coefficient*(Number(a===sample.action)-p[a])+(algorithm==='ppo'&&p[a]?entropyCoefficient*p[a]*(Math.log(p[a])+h):0);
      for(let i=0;i<13;i++)gradient[i*3+a]+=dz*sample.x[i]/samples.length;
    }
  }
  return {gradient,loss:loss/samples.length,entropy:entropy/samples.length,clipFraction:clipped/samples.length};
}
export function prepareAdvantages(samples:PolicySample[],bootstrap:number,gamma:number,lambda:number){
  let next=bootstrap,advantage=0;
  for(let i=samples.length-1;i>=0;i--){const s=samples[i],continuation=s.done?0:1;const delta=s.reward+gamma*next*continuation-s.oldValue;advantage=delta+gamma*lambda*continuation*advantage;s.advantage=advantage;s.target=advantage+s.oldValue;next=s.oldValue;}
  const mean=samples.reduce((s,r)=>s+r.advantage,0)/samples.length,std=Math.sqrt(samples.reduce((s,r)=>s+(r.advantage-mean)**2,0)/samples.length+1e-8);
  for(const s of samples)s.advantage=(s.advantage-mean)/std;
}
export function criticGradient(critic:readonly number[],samples:readonly PolicySample[]){
  const gradient=Array(13).fill(0) as number[];let loss=0;
  for(const s of samples){const error=criticValue(critic,s.x)-s.target;loss+=.5*error*error/samples.length;s.x.forEach((x,i)=>gradient[i]+=error*x/samples.length);}
  return {gradient,loss};
}
export function adam(weights:number[],gradient:number[],state:AdamState,rate:number){
  const norm=Math.sqrt(gradient.reduce((s,v)=>s+v*v,0)),scale=norm>.5?.5/norm:1;state.t++;
  gradient.forEach((g,i)=>{finite(g,'gradient',-1e15,1e15);g*=scale;state.m[i]=.9*state.m[i]+.1*g;state.v[i]=.999*state.v[i]+.001*g*g;weights[i]-=rate*(state.m[i]/(1-.9**state.t))/(Math.sqrt(state.v[i]/(1-.999**state.t))+1e-8);finite(weights[i],'parameter',-1e6,1e6);});
}
export function validateVector(value:unknown,size:number,label:string,min=-1e6,max=1e6):number[]{if(!Array.isArray(value)||value.length!==size)throw new Error(`Invalid ${label} dimensions`);return value.map(v=>finite(v,label,min,max));}
export function validatePolicyModel(value:unknown):PolicyModel {
  assertRecord(value);assertKeys(value,['version','observationVersion','architecture','algorithm','game','actor','critic','teacher','seedSplit','provenance'],'Policy model');const m=value as unknown as PolicyModel;
  if(m.version!=='snake-policy-v1'||m.observationVersion!=='relative-features-v2'||m.architecture!=='linear-softmax-13x3-v1')throw new Error('Unsupported policy schema');
  assertRecord(m.game);if(['width','height','initialLength','initialization','obstacles','maxSteps','maxNoFood'].some(k=>!(k in m.game)))throw new Error('Missing game metadata');
  assertRecord(m.seedSplit);assertKeys(m.seedSplit,['trainingPolicy','validationSeeds','testSeeds'],'Seed split');if(m.seedSplit.trainingPolicy!=='generated-excluding-held-out'||!Array.isArray(m.seedSplit.validationSeeds)||!Array.isArray(m.seedSplit.testSeeds))throw new Error('Missing split metadata');
  const c=policyConfig({algorithm:m.algorithm,game:m.game,validationSeeds:m.seedSplit.validationSeeds,testSeeds:m.seedSplit.testSeeds});
  if(m.teacher!==(m.algorithm==='imitation'?'astar-nodes1000-v1':null))throw new Error('Invalid teacher provenance');
  assertRecord(m.provenance);assertKeys(m.provenance,['seed','samples','updates'],'Provenance');finiteInteger(m.provenance.seed,'seed',0,0xffffffff);finiteInteger(m.provenance.samples,'samples',0,1000000);finiteInteger(m.provenance.updates,'updates',0,10000000);
  return {...m,game:c.game,actor:validateVector(m.actor,39,'actor'),critic:validateVector(m.critic,13,'critic'),provenance:{...m.provenance},seedSplit:{trainingPolicy:'generated-excluding-held-out',validationSeeds:c.validationSeeds,testSeeds:c.testSeeds}};
}
export function parsePolicyModel(text:string):PolicyModel{return validatePolicyModel(parseBoundedJSON(text));}
