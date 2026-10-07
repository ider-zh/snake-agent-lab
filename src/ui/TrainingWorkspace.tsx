import {useState} from 'react';
import {TrainingLab} from './TrainingLab';
import {LearningLab} from './LearningLab';
import type {PlayableModel} from '../learning/playable';
export function TrainingWorkspace({notify,onModel}:{notify:(message:string)=>void;onModel:(model:PlayableModel)=>void}){
  const [route,setRoute]=useState<'classic'|'new'>('classic'),[classicActive,setClassicActive]=useState(false),[newActive,setNewActive]=useState(false);
  return <><div className="segmented full" aria-label="训练路线"><button disabled={classicActive||newActive} className={route==='classic'?'selected':''} onClick={()=>setRoute('classic')}>DQN / GA</button><button disabled={classicActive||newActive} className={route==='new'?'selected':''} onClick={()=>setRoute('new')}>Q-learning / SARSA / PPO / 模仿</button></div><div hidden={route!=='classic'}><TrainingLab notify={notify} onModel={onModel} onActive={setClassicActive}/></div><div hidden={route!=='new'}><LearningLab notify={notify} onModel={onModel} onActive={setNewActive}/></div></>;
}
