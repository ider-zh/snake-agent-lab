import type {FrozenModel} from '../training/types';
import {predictModel} from '../training/inference';
import type {Observation} from '../core';
import {predictTabular,type TabularModel} from './tabular';
export type PlayableModel=FrozenModel|TabularModel;
export function predictPlayable(model:PlayableModel,observation:Observation){return model.version==='snake-tabular-v1'?predictTabular(model,observation):predictModel(model,observation);}
