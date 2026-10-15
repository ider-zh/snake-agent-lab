import {useCallback,useEffect,useState} from 'react';
import {listRecords,loadRecord,saveRecord} from '../storage';
import {parseFrozenModel} from '../training/inference';
import {parseTabularModel} from '../learning/tabular';
import {parsePolicyModel} from '../learning/policy';
import type {PlayableModel} from '../learning/playable';
export interface SavedModel {id:string;label:string;model:PlayableModel;}
function parse(value:unknown):PlayableModel {
 const text=JSON.stringify(value),version=(value as {version?:string})?.version;
 return version==='snake-policy-v1'?parsePolicyModel(text):version==='snake-tabular-v1'?parseTabularModel(text):parseFrozenModel(text);
}
function entry(id:string,model:PlayableModel):SavedModel{return {id,model,label:`${model.algorithm.toUpperCase()} · ${model.provenance.samples.toLocaleString()} 样本 · ${id.slice(-6)}`};}
export function useModelLibrary(notify:(message:string)=>void){
 const [models,setModels]=useState<SavedModel[]>([]);
 useEffect(()=>{let alive=true;void listRecords('model').then(async rows=>{
  const loaded:SavedModel[]=[];
  for(const row of rows){try{loaded.push(entry(row.id,parse(await loadRecord('model',row.id))));}catch(e){console.error('Saved model validation',row.id,e);}}
  if(alive)setModels(current=>[...current,...loaded.filter(x=>!current.some(y=>x.id===y.id))]);
 }).catch(e=>notify(String(e)));return()=>{alive=false;};},[notify]);
 const remember=useCallback((model:PlayableModel)=>{
  void (async()=>{const data=new TextEncoder().encode(JSON.stringify(model)),hash=await crypto.subtle.digest('SHA-256',data),id='model-'+Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
   setModels(rows=>[entry(id,model),...rows.filter(r=>r.id!==id)]);
   await saveRecord('model',id,model);
  })().catch(e=>notify(`模型存档失败：${String(e)}`));
 },[notify]);
 return {models,remember};
}
export function sameModelRules(a:PlayableModel,b:PlayableModel):boolean{return JSON.stringify(a.game)===JSON.stringify(b.game);}
