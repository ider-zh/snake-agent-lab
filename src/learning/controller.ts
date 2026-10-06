import {PolicyTrainer,type PolicyCheckpoint} from './policy-trainer';
import {predictPolicy,validatePolicyModel,type PolicyModel,type PolicyConfig} from './policy';
import {Game} from '../core';
import {finiteInteger} from '../storage/validation';
import {predictTabular,TabularTrainer,validateTabularModel} from './tabular';
import type {LearningMetrics,TabularCheckpoint,TabularConfig,TabularModel} from './tabular';
export type LearningModel=TabularModel|PolicyModel;
export type LearningCheckpoint=TabularCheckpoint|PolicyCheckpoint;
export type LearningConfig=Partial<TabularConfig>|Partial<PolicyConfig>;
export function restoreLearning(value:LearningCheckpoint){return value.version==='snake-policy-checkpoint-v1'?PolicyTrainer.restore(value):TabularTrainer.restore(value);}
export interface TabularEvaluation {version:'snake-learning-evaluation-v1';algorithm:LearningModel['algorithm'];split:'test'|'validation';requestedSeeds:number[];episodes:{seed:number;score:number;steps:number;fill:number;reason:string|null}[];cancelled:boolean;meanScore:number;}
export type LearningCommand= {jobId:string}&({type:'start';config:LearningConfig}|{type:'restore';checkpoint:LearningCheckpoint;extraSteps?:number}|{type:'pause'|'resume'|'cancel'|'checkpoint'}|{type:'evaluate';model:LearningModel;split?:'test'|'validation'});
type Payload={type:'status';status:'running'|'paused'|'completed'|'cancelled'|'error';reason?:string}|{type:'metrics';metrics:LearningMetrics}|{type:'model';model:LearningModel}|{type:'checkpoint';checkpoint:LearningCheckpoint}|{type:'evaluation';result:TabularEvaluation};
export type LearningEvent=Payload&{jobId:string;sequence:number};
export class TabularEvaluator {
  readonly model:LearningModel;readonly seeds:number[];readonly split:'test'|'validation';private game:Game;private index=0;private rows:TabularEvaluation['episodes']=[];
  constructor(model:LearningModel,split:'test'|'validation'='test'){this.model=model.version==='snake-policy-v1'?validatePolicyModel(model):validateTabularModel(model);this.split=split;this.seeds=[...this.model.seedSplit[split==='test'?'testSeeds':'validationSeeds']];this.game=new Game(this.model.game,this.seeds[0]);}
  get done(){return this.index===this.seeds.length;}
  tick(){if(this.done)return;this.game.step((this.model.version==='snake-policy-v1'?predictPolicy(this.model,this.game.observe()):predictTabular(this.model,this.game.observe())).action);const o=this.game.observe();if(o.terminated||o.truncated){this.rows.push({seed:this.seeds[this.index],score:o.score,steps:o.steps,fill:o.snake.length/(o.config.width*o.config.height-o.config.obstacles.length),reason:o.reason});this.index++;if(!this.done)this.game=new Game(this.model.game,this.seeds[this.index]);}}
  result(cancelled=false):TabularEvaluation{return {version:'snake-learning-evaluation-v1',algorithm:this.model.algorithm,split:this.split,requestedSeeds:[...this.seeds],episodes:structuredClone(this.rows),cancelled,meanScore:this.rows.reduce((s,r)=>s+r.score,0)/(this.rows.length||1)};}
}
export class LearningController {
  private trainer:TabularTrainer|PolicyTrainer|null=null;private evaluator:TabularEvaluator|null=null;private saved:LearningCheckpoint|null=null;
  private jobId='';private sequence=0;private pending:LearningCommand[]=[];private pumping=false;private paused=false;private lastReport=0;private evaluationWorkMs=0;
  constructor(private send:(event:LearningEvent)=>void){}
  private emit(payload:Payload){this.send({...payload,jobId:this.jobId,sequence:++this.sequence});}
  handle(command:LearningCommand){if(!command||typeof command.jobId!=='string'||command.jobId.length>200)return;this.pending.push(command);void this.pump();}
  private command(c:LearningCommand){
    if(c.type==='start'||c.type==='restore'||c.type==='evaluate'){
      this.trainer=null;this.evaluator=null;this.saved=null;this.jobId=c.jobId;this.sequence=0;this.paused=false;this.evaluationWorkMs=0;
      if(c.type==='start')this.trainer=c.config.algorithm==='ppo'||c.config.algorithm==='imitation'?new PolicyTrainer(c.config as Partial<PolicyConfig>):new TabularTrainer(c.config as Partial<TabularConfig>);
      else if(c.type==='restore'){
        const checked=restoreLearning(c.checkpoint).checkpoint();
        if(c.extraSteps){finiteInteger(c.extraSteps,'extra steps',1,1000000);checked.config.maxSteps+=c.extraSteps;checked.config.maxWallMs=Math.min(300000,checked.config.maxWallMs+60000);}
        this.trainer=restoreLearning(checked);
      }else{if(c.split!==undefined&&!['validation','test'].includes(c.split))throw new Error('Invalid evaluation split');this.evaluator=new TabularEvaluator(c.model,c.split);}
      this.emit({type:'status',status:'running'});if(this.trainer){this.emit({type:'metrics',metrics:this.trainer.metrics()});this.emit({type:'model',model:this.trainer.exportModel()});}return;
    }
    if(c.jobId!==this.jobId)return;
    if(c.type==='pause'){this.paused=true;this.trainer?.pause();this.emit({type:'status',status:'paused'});}
    if(c.type==='resume'){if(!this.trainer&&!this.evaluator)throw new Error('No paused task');this.paused=false;this.trainer?.resume();this.emit({type:'status',status:'running'});}
    if(c.type==='checkpoint'){if(this.trainer)this.saved=this.trainer.checkpoint();if(!this.saved)throw new Error('No checkpoint');this.emit({type:'checkpoint',checkpoint:this.saved});}
    if(c.type==='cancel'){
      if(this.trainer){this.trainer.pause();this.saved=this.trainer.checkpoint();this.emit({type:'metrics',metrics:this.trainer.metrics()});this.emit({type:'model',model:this.trainer.exportModel()});}
      if(this.evaluator)this.emit({type:'evaluation',result:this.evaluator.result(true)});
      this.trainer=null;this.evaluator=null;this.emit({type:'status',status:'cancelled'});
    }
  }
  private async pump(){
    if(this.pumping)return;this.pumping=true;
    try{while(this.pending.length||(!this.paused&&(this.trainer||this.evaluator))){
      try{
        while(this.pending.length)this.command(this.pending.shift()!);
        if(this.paused)break;
        const start=performance.now();
        for(let i=0;i<128&&performance.now()-start<8&&!this.pending.length;i++){
          if(this.trainer){
            if(!this.trainer.advance()){
              this.trainer.pause();this.saved=this.trainer.checkpoint();this.emit({type:'metrics',metrics:this.trainer.metrics()});this.emit({type:'model',model:this.trainer.exportModel()});this.emit({type:'status',status:'completed',reason:this.trainer.elapsedMs>=this.trainer.config.maxWallMs?'time-budget':'step-budget'});this.trainer=null;break;
            }
          }else if(this.evaluator){this.evaluator.tick();if(this.evaluator.done||this.evaluationWorkMs>=60000){const cancelled=!this.evaluator.done;this.emit({type:'evaluation',result:this.evaluator.result(cancelled)});this.evaluator=null;this.emit({type:'status',status:cancelled?'cancelled':'completed',reason:cancelled?'evaluation-time-budget':'evaluation'});break;}}
          else break;
        }
        if(this.evaluator)this.evaluationWorkMs+=performance.now()-start;
        if(this.trainer&&performance.now()-this.lastReport>200){this.lastReport=performance.now();this.emit({type:'metrics',metrics:this.trainer.metrics()});}
      }catch(error){this.trainer=null;this.evaluator=null;this.emit({type:'status',status:'error',reason:error instanceof Error?error.message:String(error)});}
      if(this.pending.length||(!this.paused&&(this.trainer||this.evaluator)))await new Promise<void>(resolve=>setTimeout(resolve,0));
    }}finally{this.pumping=false;if(this.pending.length)void this.pump();}
  }
  dispose(){this.pending=[];this.trainer=null;this.evaluator=null;}
}
