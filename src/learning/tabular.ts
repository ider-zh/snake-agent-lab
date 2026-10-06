import {Game,normalizeConfig,relativeAction,SeededRandom} from '../core';
import type {GameConfig,Observation,Snapshot} from '../core';
import {encodeObservation,trainingReward} from '../training/encoding';
import {assertKeys,assertRecord,finiteInteger,parseBoundedJSON} from '../storage/validation';
export type TabularAlgorithm='q-learning'|'sarsa';
export const TABLE_STATES=5832;
export interface TabularConfig {algorithm:TabularAlgorithm;seed:number;game:GameConfig;maxSteps:number;maxWallMs:number;alpha:number;gamma:number;epsilonStart:number;epsilonEnd:number;epsilonDecay:number;validationSeeds:number[];testSeeds:number[];}
export interface TabularModel {version:'snake-tabular-v1';observationVersion:'relative-discrete-v1';algorithm:TabularAlgorithm;game:GameConfig;table:number[];seedSplit:{trainingPolicy:'generated-excluding-held-out';validationSeeds:number[];testSeeds:number[]};provenance:{seed:number;samples:number;updates:number};}
export interface LearningMetrics {samples:number;updates:number;episodes:number;meanScore:number;loss:number;epsilon:number;elapsedMs:number;changedEntries:number;curve:{samples:number;meanScore:number;loss:number}[];snapshot:Snapshot;}
export interface TabularCheckpoint {version:'snake-tabular-checkpoint-v1';config:TabularConfig;model:TabularModel;environment:Snapshot;action:number;rng:{policy:number;episodes:number};samples:number;updates:number;episodes:number;scores:number[];loss:number;elapsedMs:number;curve:LearningMetrics['curve'];}
const number=(v:unknown,name:string,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid ${name}`);return v;};
function seeds(v:unknown):number[]{if(!Array.isArray(v)||v.length<1||v.length>100)throw new Error('Invalid seed split');const out=v.map(x=>finiteInteger(x,'seed',0,0xffffffff));if(new Set(out).size!==out.length)throw new Error('Duplicate seeds');return out;}
export function tabularConfig(input:Partial<TabularConfig>={}):TabularConfig {
  assertRecord(input);assertKeys(input,['algorithm','seed','game','maxSteps','maxWallMs','alpha','gamma','epsilonStart','epsilonEnd','epsilonDecay','validationSeeds','testSeeds'],'Learning configuration');
  const c={algorithm:'q-learning' as TabularAlgorithm,seed:7,game:normalizeConfig({width:8,height:8,maxSteps:1000,maxNoFood:200}),maxSteps:50000,maxWallMs:60000,alpha:.2,gamma:.95,epsilonStart:1,epsilonEnd:.05,epsilonDecay:20000,validationSeeds:[41001,41002,41003,41004,41005],testSeeds:Array.from({length:20},(_,i)=>42001+i),...input};
  if(!['q-learning','sarsa'].includes(c.algorithm))throw new Error('Unsupported tabular algorithm');
  c.game=normalizeConfig(c.game);if(c.game.width>20||c.game.height>20||c.game.initialization!=='standard'||c.game.maxSteps<1||c.game.maxSteps>5000||c.game.maxNoFood<1)throw new Error('Unsupported learning game');
  finiteInteger(c.seed,'seed',0,0xffffffff);finiteInteger(c.maxSteps,'training steps',1,1000000);finiteInteger(c.maxWallMs,'wall budget',1,300000);finiteInteger(c.epsilonDecay,'epsilon decay',1,1000000);
  for(const key of ['alpha','gamma','epsilonStart','epsilonEnd'] as const)number(c[key],key,0,1);
  c.validationSeeds=seeds(c.validationSeeds);c.testSeeds=seeds(c.testSeeds);if(c.validationSeeds.some(s=>c.testSeeds.includes(s)))throw new Error('Seed splits overlap');return c;
}
/** Mixed-radix local observation; 8 danger × 9 food signs × 27 clear rays × 3 length bins. */
export function discreteState(o:Observation):number {
  const x=encodeObservation(o,'compact-v2'),digits=[x[0],x[1],x[2],Math.sign(x[3])+1,Math.sign(x[4])+1,...[8,9,10].map(i=>x[i]===0?0:x[i]<=.25?1:2),Math.min(2,Math.floor(x[11]*3))];
  return digits.reduce((state,d,i)=>state*(i<3?2:3)+d,0);
}
export function maskedChoices(o:Observation):number[]{const x=encodeObservation(o,'compact-v2'),allowed=[0,1,2].filter(i=>!x[i]);return allowed.length?allowed:[0,1,2];}
export function tabularValues(model:TabularModel,o:Observation):number[]{const offset=discreteState(o)*3;return model.table.slice(offset,offset+3);}
export function greedyTabular(model:TabularModel,o:Observation):number {const q=tabularValues(model,o);return maskedChoices(o).reduce((best,a)=>q[a]>q[best]?a:best);}
export function predictTabular(model:TabularModel,o:Observation){if(JSON.stringify(model.game.obstacles)!==JSON.stringify(o.config.obstacles)||model.game.width!==o.config.width||model.game.height!==o.config.height)throw new Error('Model and game differ');return {action:relativeAction(o.direction,greedyTabular(model,o)),qValues:tabularValues(model,o)};}
export function tdUpdate(old:number,reward:number,next:number,terminal:boolean,alpha:number,gamma:number):number{return old+alpha*(reward+(terminal?0:gamma*next)-old);}
export function validateTabularModel(value:unknown):TabularModel {
  assertRecord(value);assertKeys(value,['version','observationVersion','algorithm','game','table','seedSplit','provenance'],'Tabular model');
  const m=value as unknown as TabularModel;
  if(m.version!=='snake-tabular-v1'||m.observationVersion!=='relative-discrete-v1')throw new Error('Unsupported tabular schema');
  assertRecord(m.game);if(['width','height','initialLength','initialization','obstacles','maxSteps','maxNoFood'].some(key=>!(key in m.game)))throw new Error('Missing game metadata');
  assertRecord(m.seedSplit);assertKeys(m.seedSplit,['trainingPolicy','validationSeeds','testSeeds'],'Seed split');
  if(m.seedSplit.trainingPolicy!=='generated-excluding-held-out')throw new Error('Missing split provenance');
  const c=tabularConfig({algorithm:m.algorithm,game:m.game,validationSeeds:m.seedSplit.validationSeeds,testSeeds:m.seedSplit.testSeeds});
  if(!Array.isArray(m.table)||m.table.length!==TABLE_STATES*3)throw new Error('Incorrect table dimensions');m.table.forEach(v=>number(v,'Q value',-1000000,1000000));
  assertRecord(m.provenance);assertKeys(m.provenance,['seed','samples','updates'],'Provenance');finiteInteger(m.provenance.seed,'seed',0,0xffffffff);finiteInteger(m.provenance.samples,'samples',0,1000000);finiteInteger(m.provenance.updates,'updates',0,1000000);
  return {...m,game:c.game,table:[...m.table],seedSplit:{trainingPolicy:'generated-excluding-held-out',validationSeeds:c.validationSeeds,testSeeds:c.testSeeds},provenance:{...m.provenance}};
}
export function parseTabularModel(text:string):TabularModel{return validateTabularModel(parseBoundedJSON(text));}
export class TabularTrainer {
  readonly config:TabularConfig;private model:TabularModel;private game:Game;private policy:SeededRandom;private episodesRng:SeededRandom;private action=0;
  samples=0;updates=0;episodes=0;loss=0;scores:number[]=[];curve:LearningMetrics['curve']=[];
  private accumulated=0;private started=performance.now();private paused=false;
  constructor(input:Partial<TabularConfig>={}){
    this.config=tabularConfig(input);const c=this.config;this.policy=new SeededRandom(c.seed^0x9e3779b9);this.episodesRng=new SeededRandom(c.seed^0x85ebca6b);
    this.model={version:'snake-tabular-v1',observationVersion:'relative-discrete-v1',algorithm:c.algorithm,game:c.game,table:Array(TABLE_STATES*3).fill(0),seedSplit:{trainingPolicy:'generated-excluding-held-out',validationSeeds:[...c.validationSeeds],testSeeds:[...c.testSeeds]},provenance:{seed:c.seed,samples:0,updates:0}};
    this.game=this.newGame();this.action=this.choose(this.game.observe());
  }
  get elapsedMs(){return this.accumulated+(this.paused?0:performance.now()-this.started);}
  get epsilon(){return this.config.epsilonEnd+(this.config.epsilonStart-this.config.epsilonEnd)*Math.max(0,1-this.samples/this.config.epsilonDecay);}
  get done(){return this.samples>=this.config.maxSteps||this.elapsedMs>=this.config.maxWallMs;}
  pause(){if(!this.paused){this.accumulated=this.elapsedMs;this.paused=true;}}
  resume(){if(this.paused){this.started=performance.now();this.paused=false;}}
  private newGame(){let seed:number;do{seed=this.episodesRng.int(0x100000000);}while(this.config.validationSeeds.includes(seed)||this.config.testSeeds.includes(seed));return new Game(this.config.game,seed);}
  private choose(o:Observation){const actions=maskedChoices(o);return this.policy.next()<this.epsilon?actions[this.policy.int(actions.length)]:greedyTabular(this.model,o);}
  advance():boolean {
    if(this.done||this.paused)return false;
    const before=this.game.observe(),index=discreteState(before)*3+this.action;
    const result=this.game.step(relativeAction(before.direction,this.action)),after=result.observation,terminal=after.terminated||after.truncated;
    this.samples++;const nextAction=terminal?0:this.choose(after),values=tabularValues(this.model,after);
    const next=this.config.algorithm==='sarsa'?values[nextAction]:values[greedyTabular(this.model,after)];
    const reward=trainingReward(before,after,result.reward,'compact-v2'),old=this.model.table[index],updated=tdUpdate(old,reward,next,terminal,this.config.alpha,this.config.gamma);
    this.model.table[index]=updated;this.loss=(updated-old)**2;this.updates++;
    if(terminal){this.episodes++;this.scores.push(after.score);if(this.scores.length>100)this.scores.shift();this.game=this.newGame();this.action=this.choose(this.game.observe());}else this.action=nextAction;
    if(this.samples%500===0){this.curve.push({samples:this.samples,meanScore:this.meanScore,loss:this.loss});if(this.curve.length>500)this.curve.shift();}
    return true;
  }
  get meanScore(){return this.scores.reduce((a,b)=>a+b,0)/(this.scores.length||1);}
  exportModel():TabularModel{return {...this.model,game:{...this.config.game,obstacles:[...this.config.game.obstacles]},table:[...this.model.table],seedSplit:{...this.model.seedSplit,validationSeeds:[...this.config.validationSeeds],testSeeds:[...this.config.testSeeds]},provenance:{seed:this.config.seed,samples:this.samples,updates:this.updates}};}
  metrics():LearningMetrics{return {samples:this.samples,updates:this.updates,episodes:this.episodes,meanScore:this.meanScore,loss:this.loss,epsilon:this.epsilon,elapsedMs:this.elapsedMs,changedEntries:this.model.table.filter(v=>v!==0).length,curve:[...this.curve],snapshot:this.game.snapshot()};}
  checkpoint():TabularCheckpoint{return {version:'snake-tabular-checkpoint-v1',config:structuredClone(this.config),model:this.exportModel(),environment:this.game.snapshot(),action:this.action,rng:{policy:this.policy.state,episodes:this.episodesRng.state},samples:this.samples,updates:this.updates,episodes:this.episodes,scores:[...this.scores],loss:this.loss,elapsedMs:this.elapsedMs,curve:structuredClone(this.curve)};}
  static restore(value:unknown):TabularTrainer {
    assertRecord(value);assertKeys(value,['version','config','model','environment','action','rng','samples','updates','episodes','scores','loss','elapsedMs','curve'],'Tabular checkpoint');
    const c=value as unknown as TabularCheckpoint;if(c.version!=='snake-tabular-checkpoint-v1')throw new Error('Unsupported checkpoint');
    assertRecord(c.config);if(Object.keys(tabularConfig()).some(key=>!(key in c.config)))throw new Error('Incomplete checkpoint configuration');
    const model=validateTabularModel(c.model),trainer=new TabularTrainer(c.config);
    if(model.algorithm!==trainer.config.algorithm||JSON.stringify(model.game)!==JSON.stringify(trainer.config.game)||JSON.stringify(model.seedSplit.validationSeeds)!==JSON.stringify(trainer.config.validationSeeds)||JSON.stringify(model.seedSplit.testSeeds)!==JSON.stringify(trainer.config.testSeeds))throw new Error('Checkpoint metadata mismatch');
    for(const key of ['samples','updates','episodes'] as const)finiteInteger(c[key],key,0,trainer.config.maxSteps);
    if(c.updates!==c.samples||model.provenance.samples!==c.samples||model.provenance.updates!==c.updates||model.provenance.seed!==trainer.config.seed)throw new Error('Checkpoint counters disagree');
    if(!Array.isArray(c.scores)||c.scores.length>100||!Array.isArray(c.curve)||c.curve.length>500)throw new Error('Invalid checkpoint history');c.scores.forEach(v=>finiteInteger(v,'score',0,trainer.config.game.width*trainer.config.game.height));
    for(const p of c.curve){assertRecord(p);assertKeys(p,['samples','meanScore','loss'],'Curve');finiteInteger(p.samples,'curve sample',0,c.samples);number(p.meanScore,'curve mean',0,400);number(p.loss,'curve loss',0,1e12);}
    number(c.loss,'loss',0,1e12);number(c.elapsedMs,'elapsed',0,86400000);finiteInteger(c.action,'action',0,2);assertRecord(c.rng);assertKeys(c.rng,['policy','episodes'],'RNG');
    if(JSON.stringify(c.environment.config)!==JSON.stringify(trainer.config.game))throw new Error('Checkpoint environment differs');
    trainer.game.restore(c.environment);if(c.environment.terminated||c.environment.truncated)throw new Error('Checkpoint expects an active next environment');
    if(trainer.config.testSeeds.includes(c.environment.seed)||trainer.config.validationSeeds.includes(c.environment.seed))throw new Error('Training environment uses held-out seed');
    trainer.model=model;trainer.samples=c.samples;trainer.updates=c.updates;trainer.episodes=c.episodes;trainer.action=c.action;trainer.scores=[...c.scores];trainer.loss=c.loss;trainer.curve=structuredClone(c.curve);trainer.accumulated=c.elapsedMs;trainer.started=performance.now();
    trainer.policy.state=c.rng.policy;trainer.episodesRng.state=c.rng.episodes;return trainer;
  }
}
export function parseTabularCheckpoint(text:string):TabularCheckpoint {const trainer=TabularTrainer.restore(parseBoundedJSON(text));trainer.pause();return trainer.checkpoint();}
