import {Game,relativeAction,SeededRandom,type Snapshot} from '../core';
import {createAgent} from '../agents';
import {trainingReward} from '../training/encoding';
import {assertRecord,assertKeys,finiteInteger,parseBoundedJSON} from '../storage/validation';
import type {LearningMetrics} from './tabular';
import {adam,actorGradient,argmaxPolicy,criticGradient,criticValue,distribution,finite,policyConfig,policyFeatures,prepareAdvantages,validatePolicyModel,validateVector,type AdamState,type PolicyConfig,type PolicyModel,type PolicySample} from './policy';
export interface PolicyCheckpoint {version:'snake-policy-checkpoint-v1';config:PolicyConfig;model:PolicyModel;environment:Snapshot;rng:{policy:number;episodes:number;shuffle:number};actorOptimizer:AdamState;criticOptimizer:AdamState;buffer:PolicySample[];phase:'collect'|'update';order:number[];cursor:number;epoch:number;samples:number;updates:number;episodes:number;scores:number[];loss:number;valueLoss:number;entropy:number;clipFraction:number;elapsedMs:number;curve:LearningMetrics['curve'];}
export class PolicyTrainer {
  readonly config:PolicyConfig;private model:PolicyModel;private game:Game;private policy:SeededRandom;private episodeRng:SeededRandom;private shuffle:SeededRandom;
  private teacher=createAgent('astar',1,{maxNodes:1000,maxMs:Infinity});private actorOptimizer:AdamState={m:Array(39).fill(0),v:Array(39).fill(0),t:0};private criticOptimizer:AdamState={m:Array(13).fill(0),v:Array(13).fill(0),t:0};
  private buffer:PolicySample[]=[];private phase:'collect'|'update'='collect';private order:number[]=[];private cursor=0;private epoch=0;
  samples=0;updates=0;episodes=0;loss=0;valueLoss=0;entropy=0;clipFraction=0;scores:number[]=[];curve:LearningMetrics['curve']=[];
  private accumulated=0;private started=performance.now();private paused=false;
  constructor(input:Partial<PolicyConfig>={}){
    this.config=policyConfig(input);const c=this.config;this.policy=new SeededRandom(c.seed^0x9e3779b9);this.episodeRng=new SeededRandom(c.seed^0x85ebca6b);this.shuffle=new SeededRandom(c.seed^0xc2b2ae35);
    this.model={version:'snake-policy-v1',observationVersion:'relative-features-v2',architecture:'linear-softmax-13x3-v1',algorithm:c.algorithm,game:c.game,actor:Array(39).fill(0),critic:Array(13).fill(0),teacher:c.algorithm==='imitation'?'astar-nodes1000-v1':null,seedSplit:{trainingPolicy:'generated-excluding-held-out',validationSeeds:[...c.validationSeeds],testSeeds:[...c.testSeeds]},provenance:{seed:c.seed,samples:0,updates:0}};
    this.game=this.newGame();
  }
  get elapsedMs(){return this.accumulated+(this.paused?0:performance.now()-this.started);}
  get done(){return this.elapsedMs>=this.config.maxWallMs||(this.samples>=this.config.maxSteps&&this.phase==='collect'&&!this.buffer.length);}
  pause(){if(!this.paused){this.accumulated=this.elapsedMs;this.paused=true;}}
  resume(){if(this.paused){this.started=performance.now();this.paused=false;}}
  private newGame(){let seed:number;do{seed=this.episodeRng.int(0x100000000);}while(this.config.validationSeeds.includes(seed)||this.config.testSeeds.includes(seed));return new Game(this.config.game,seed);}
  private shuffledOrder(){const out=this.buffer.map((_,i)=>i);for(let i=out.length-1;i>0;i--){const j=this.shuffle.int(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
  private beginUpdate(){
    if(this.config.algorithm==='ppo')prepareAdvantages(this.buffer,criticValue(this.model.critic,policyFeatures(this.game.observe())),this.config.gamma,this.config.lambda);
    this.phase='update';this.epoch=0;this.cursor=0;this.order=this.shuffledOrder();
  }
  advance():boolean {
    if(this.done||this.paused)return false;
    if(this.phase==='update'){
      const batch=this.order.slice(this.cursor,this.cursor+this.config.batchSize).map(i=>this.buffer[i]);
      const actor=actorGradient(this.model.actor,batch,this.config.algorithm,this.config.clip,this.config.entropy);this.loss=actor.loss;this.entropy=actor.entropy;this.clipFraction=actor.clipFraction;
      adam(this.model.actor,actor.gradient,this.actorOptimizer,this.config.actorRate);
      if(this.config.algorithm==='ppo'){
        const critic=criticGradient(this.model.critic,batch);this.valueLoss=critic.loss;
        adam(this.model.critic,critic.gradient,this.criticOptimizer,this.config.criticRate);
      }
      this.updates++;this.cursor+=batch.length;
      if(this.cursor===this.order.length){this.epoch++;if(this.epoch===this.config.epochs){this.phase='collect';this.buffer=[];this.order=[];this.cursor=0;this.epoch=0;this.curve.push({samples:this.samples,meanScore:this.meanScore,loss:this.loss});if(this.curve.length>500)this.curve.shift();}else{this.order=this.shuffledOrder();this.cursor=0;}}
      return true;
    }
    const before=this.game.observe(),x=policyFeatures(before),probabilities=distribution(this.model.actor,x);
    let action:number;
    if(this.config.algorithm==='imitation')action=(this.teacher.decide(before).action-before.direction+5)%4;
    else{const u=this.policy.next();let sum=0;action=argmaxPolicy(probabilities);for(let i=0;i<3;i++){sum+=probabilities[i];if(u<sum){action=i;break;}}}
    if(action>2)throw new Error('Teacher produced a reverse action');
    const result=this.game.step(relativeAction(before.direction,action)),after=result.observation;
    this.buffer.push({x,action,oldLogP:Math.log(Math.max(probabilities[action],1e-12)),oldValue:criticValue(this.model.critic,x),reward:trainingReward(before,after,result.reward,'compact-v2'),done:after.terminated||after.truncated,advantage:0,target:0});
    this.samples++;
    if(after.terminated||after.truncated){this.episodes++;this.scores.push(after.score);if(this.scores.length>100)this.scores.shift();this.game=this.newGame();}
    if(this.buffer.length===this.config.rolloutSize||this.samples===this.config.maxSteps)this.beginUpdate();
    return true;
  }
  get meanScore(){return this.scores.reduce((a,b)=>a+b,0)/(this.scores.length||1);}
  exportModel():PolicyModel{return {...this.model,game:structuredClone(this.config.game),actor:[...this.model.actor],critic:[...this.model.critic],seedSplit:structuredClone(this.model.seedSplit),provenance:{seed:this.config.seed,samples:this.samples,updates:this.updates}};}
  metrics():LearningMetrics{return {samples:this.samples,updates:this.updates,episodes:this.episodes,meanScore:this.meanScore,loss:this.loss,epsilon:0,elapsedMs:this.elapsedMs,changedEntries:[...this.model.actor,...this.model.critic].filter(v=>v!==0).length,curve:structuredClone(this.curve),snapshot:this.game.snapshot(),policy:{valueLoss:this.valueLoss,entropy:this.entropy,clipFraction:this.clipFraction,phase:this.phase,bufferSize:this.buffer.length}};}
  checkpoint():PolicyCheckpoint{return {version:'snake-policy-checkpoint-v1',config:structuredClone(this.config),model:this.exportModel(),environment:this.game.snapshot(),rng:{policy:this.policy.state,episodes:this.episodeRng.state,shuffle:this.shuffle.state},actorOptimizer:structuredClone(this.actorOptimizer),criticOptimizer:structuredClone(this.criticOptimizer),buffer:structuredClone(this.buffer),phase:this.phase,order:[...this.order],cursor:this.cursor,epoch:this.epoch,samples:this.samples,updates:this.updates,episodes:this.episodes,scores:[...this.scores],loss:this.loss,valueLoss:this.valueLoss,entropy:this.entropy,clipFraction:this.clipFraction,elapsedMs:this.elapsedMs,curve:structuredClone(this.curve)};}
  static restore(value:unknown):PolicyTrainer {
    assertRecord(value);assertKeys(value,['version','config','model','environment','rng','actorOptimizer','criticOptimizer','buffer','phase','order','cursor','epoch','samples','updates','episodes','scores','loss','valueLoss','entropy','clipFraction','elapsedMs','curve'],'Policy checkpoint');const c=value as unknown as PolicyCheckpoint;
    if(c.version!=='snake-policy-checkpoint-v1')throw new Error('Unsupported policy checkpoint');assertRecord(c.config);if(Object.keys(policyConfig()).some(k=>!(k in c.config)))throw new Error('Incomplete policy configuration');
    const trainer=new PolicyTrainer(c.config),model=validatePolicyModel(c.model);
    if(model.algorithm!==trainer.config.algorithm||JSON.stringify(model.game)!==JSON.stringify(trainer.config.game)||JSON.stringify(model.seedSplit.validationSeeds)!==JSON.stringify(trainer.config.validationSeeds)||JSON.stringify(model.seedSplit.testSeeds)!==JSON.stringify(trainer.config.testSeeds))throw new Error('Policy checkpoint metadata mismatch');
    finiteInteger(c.samples,'samples',0,trainer.config.maxSteps);finiteInteger(c.updates,'updates',0,10000000);finiteInteger(c.episodes,'episodes',0,c.samples);
    if(model.provenance.seed!==trainer.config.seed||model.provenance.samples!==c.samples||model.provenance.updates!==c.updates)throw new Error('Policy counters disagree');
    const optimizer=(value:AdamState,size:number,steps:number)=>{assertRecord(value);assertKeys(value,['m','v','t'],'Adam');if(value.t!==steps)throw new Error('Adam step count mismatch');return {m:validateVector(value.m,size,'Adam m',-1e6,1e6),v:validateVector(value.v,size,'Adam v',0,1e12),t:steps};};
    trainer.actorOptimizer=optimizer(c.actorOptimizer,39,c.updates);trainer.criticOptimizer=optimizer(c.criticOptimizer,13,c.config.algorithm==='ppo'?c.updates:0);
    if(!Array.isArray(c.buffer)||c.buffer.length>c.config.rolloutSize||!['collect','update'].includes(c.phase)||!Array.isArray(c.order))throw new Error('Invalid rollout state');
    for(const s of c.buffer){assertRecord(s);assertKeys(s,['x','action','oldLogP','oldValue','reward','done','advantage','target'],'Rollout transition');validateVector(s.x,13,'features',-1,1);if(s.x[12]!==1||s.x.slice(0,3).some(v=>v!==0&&v!==1))throw new Error('Invalid feature bias/mask');finiteInteger(s.action,'action',0,2);if(distribution(Array(39).fill(0),s.x)[s.action]===0)throw new Error('Invalid masked rollout action');finite(s.oldLogP,'old log probability',-30,0);finite(s.oldValue,'old value',-1e9,1e9);finite(s.reward,'reward',-20,20);finite(s.advantage,'advantage',-1e9,1e9);finite(s.target,'target',-1e9,1e9);if(typeof s.done!=='boolean')throw new Error('Invalid terminal mask');}
    if(c.phase==='update'){if(!c.buffer.length||c.order.length!==c.buffer.length||new Set(c.order).size!==c.order.length)throw new Error('Invalid minibatch order');c.order.forEach(i=>finiteInteger(i,'minibatch index',0,c.buffer.length-1));finiteInteger(c.cursor,'cursor',0,c.order.length-1);if(c.cursor%c.config.batchSize!==0)throw new Error('Unaligned minibatch cursor');finiteInteger(c.epoch,'epoch',0,c.config.epochs-1);}else if(c.order.length||c.cursor!==0||c.epoch!==0||c.buffer.length>=c.config.rolloutSize)throw new Error('Invalid collection phase');
    if(c.samples<c.buffer.length)throw new Error('Rollout count exceeds samples');
    if(!Array.isArray(c.scores)||c.scores.length>100||!Array.isArray(c.curve)||c.curve.length>500)throw new Error('Invalid policy history');c.scores.forEach(v=>finiteInteger(v,'score',0,400));
    for(const p of c.curve){assertRecord(p);assertKeys(p,['samples','meanScore','loss'],'Curve');finiteInteger(p.samples,'curve samples',0,c.samples);finite(p.meanScore,'curve mean',0,400);finite(p.loss,'curve loss',-1e15,1e15);}
    finite(c.loss,'loss',-1e15,1e15);finite(c.valueLoss,'value loss',0,1e18);finite(c.entropy,'entropy',0,2);finite(c.clipFraction,'clip fraction',0,1);finite(c.elapsedMs,'elapsed',0,86400000);
    assertRecord(c.rng);assertKeys(c.rng,['policy','episodes','shuffle'],'Policy RNG');trainer.policy.state=c.rng.policy;trainer.episodeRng.state=c.rng.episodes;trainer.shuffle.state=c.rng.shuffle;
    if(JSON.stringify(c.environment.config)!==JSON.stringify(trainer.config.game))throw new Error('Policy environment differs');trainer.game.restore(c.environment);if(c.environment.terminated||c.environment.truncated||trainer.config.validationSeeds.includes(c.environment.seed)||trainer.config.testSeeds.includes(c.environment.seed))throw new Error('Invalid training environment');
    trainer.model=model;trainer.buffer=structuredClone(c.buffer);trainer.phase=c.phase;trainer.order=[...c.order];trainer.cursor=c.cursor;trainer.epoch=c.epoch;trainer.samples=c.samples;trainer.updates=c.updates;trainer.episodes=c.episodes;trainer.scores=[...c.scores];trainer.curve=structuredClone(c.curve);trainer.loss=c.loss;trainer.valueLoss=c.valueLoss;trainer.entropy=c.entropy;trainer.clipFraction=c.clipFraction;trainer.accumulated=c.elapsedMs;trainer.started=performance.now();return trainer;
  }
}
export function parsePolicyCheckpoint(text:string):PolicyCheckpoint{const t=PolicyTrainer.restore(parseBoundedJSON(text));t.pause();return t.checkpoint();}
