import { describe, it, expect } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { Game, legalActions, relativeAction } from '../core';
import type { Observation, Direction } from '../core';
import { encodeObservation, trainingReward } from './encoding';
import { policyArgmax, predictModel, parseFrozenModel, flattenWeights } from './inference';
import { DQNTrainer } from './dqn';
import { GATrainer, breedPopulation, featurePolicyGenes, initializeFeaturePolicy } from './ga';
import { TrainingRandom } from './random';
import { makeTrainingConfig } from './config';
import { parseCheckpoint } from './checkpoint';
import { compactTrainingPreset } from './presets';
import type { TrainingConfigInput } from './types';
const compact: TrainingConfigInput = { ...compactTrainingPreset('dqn'), game:{width:4,height:4,maxSteps:30,maxNoFood:20}, dqn:{batchSize:4,warmup:4,replayCapacity:64,trainEvery:1,targetEvery:3,validationEvery:10000}, budget:{maxEnvSteps:1000,maxWallMs:60000} };
describe('versioned compact training', () => {
  it('evolves only the 75 GA coefficients while preserving fixed features and elites', () => {
    const genes=featurePolicyGenes(),rng=new TrainingRandom(42);
    const population=Array.from({length:4},()=>flattenWeights(initializeFeaturePolicy(rng)));
    const config=makeTrainingConfig('ga',{...compact,ga:{populationSize:4,eliteCount:1,tournamentSize:2,mutationRate:1,mutationStd:.1,crossoverRate:0}}).ga;
    const next=breedPopulation(population,[0,1,2,3],config,rng,genes);
    expect(genes.size).toBe(75); expect(next[0]).toEqual(population[3]);
    for(const child of next) for(let i=0;i<child.length;i++) if(!genes.has(i)) expect(child[i]).toBe(population[0][i]);
    expect(next.slice(1).some(child=>!population.some(parent=>child.every((v,i)=>v===parent[i])))).toBe(true);
  });
  it('uses rotation-invariant bounded features and exactly the core legal move semantics', () => {
    const o = new Game({width:4,height:4,obstacles:[0]},77).observe();
    const rotate = (c:number) => (c%4)*4+3-Math.floor(c/4);
    const rotated: Observation = {...o,config:{...o.config,obstacles:o.config.obstacles.map(rotate)},snake:o.snake.map(rotate),food:o.food===null?null:rotate(o.food),direction:((o.direction+1)%4) as Direction};
    const encoded = encodeObservation(o,'compact-v2');
    expect(encoded).toEqual(encodeObservation(rotated,'compact-v2'));
    expect(encoded).toHaveLength(12); expect([...encoded].every(n=>n>=-1&&n<=1)).toBe(true);
    for(let i=0;i<3;i++) expect(encoded[i]===0).toBe(legalActions(o).includes(relativeAction(o.direction,i)));
    expect(policyArgmax([999,2,3],[1,0,0],'compact-v2')).toBe(2);
    expect(policyArgmax([999,2,3],[1,1,1],'compact-v2')).toBe(0);
    expect(policyArgmax([999,2,3],[1,0,0])).toBe(0); // v1 action semantics preserved
  });
  it('rewards food and approach, penalizes retreat and collision, without changing core rewards', () => {
    const base=new Game({width:4,height:4}).observe();
    const before={...base,snake:[5,4,0],food:7};
    expect(trainingReward(before,{...before,snake:[6,5,4]},-.001,'compact-v2')).toBeCloseTo(.49);
    expect(trainingReward(before,{...before,snake:[4,5,1]},-.001,'compact-v2')).toBeCloseTo(-.51);
    expect(trainingReward(before,{...before,score:1},1,'compact-v2')).toBe(10);
    expect(trainingReward(before,{...before,terminated:true,reason:'wall'},-1,'compact-v2')).toBe(-10);
    expect(trainingReward(before,before,-.001)).toBe(-.001);
  });
  it('masks impossible next actions in TD targets, while keeping terminal bootstrap suppressed', async () => {
    const t=await DQNTrainer.create({...compact,dqn:{...compact.dqn,gamma:1,doubleDQN:true}});
    try {
      for(const network of [t.online,t.target]) network.variables.forEach(v=>tf.tidy(()=>v.assign(tf.zeros(v.shape))));
      tf.tidy(()=>t.online.variables[5].assign(tf.tensor1d([0,100,1])));
      tf.tidy(()=>t.target.variables[5].assign(tf.tensor1d([1,999,2])));
      const next=new Float32Array(12); next[1]=1;
      expect(t.update({observations:new Float32Array(12),nextObservations:next,actions:new Int32Array([0]),rewards:new Float32Array([0]),flags:new Uint8Array([0])})).toBeCloseTo(1.5);
    } finally {t.dispose();}
  });
  it('roundtrips signed features, shaped rewards, optimizer and exact continued DQN updates', async () => {
    const original=await DQNTrainer.create(compact); let restored:DQNTrainer|undefined;
    try {
      for(let i=0;i<12;i++) await original.advance();
      const checkpoint=parseCheckpoint(JSON.stringify(await original.checkpoint()));
      if(checkpoint.algorithm!=='dqn') throw new Error('wrong algorithm');
      restored=await DQNTrainer.restore(checkpoint);
      for(let i=0;i<6;i++){await original.advance();await restored.advance();}
      expect(restored.game.hash()).toBe(original.game.hash());
      expect([...flattenWeights(restored.online.weights())]).toEqual([...flattenWeights(original.online.weights())]);
      const model=original.exportModel(), loaded=parseFrozenModel(JSON.stringify(model));
      expect(model.observationVersion).toBe('relative-features-v2');
      expect(predictModel(loaded,original.game.observe())).toEqual(predictModel(model,original.game.observe()));
      expect(()=>parseFrozenModel(JSON.stringify({...model,observationVersion:'board-five-channels-v1'}))).toThrow();
    } finally {original.dispose();restored?.dispose();}
  });
  it('preserves a compact GA population, partial fitness and future evolution on restore', async () => {
    const input={...compact,ga:{populationSize:4,eliteCount:1,tournamentSize:2,episodesPerIndividual:2,crossoverRate:0}};
    const original=new GATrainer(input);let restored:GATrainer|undefined;
    try {
      for(let i=0;i<30;i++) await original.advance();
      const checkpoint=parseCheckpoint(JSON.stringify(await original.checkpoint()));
      if(checkpoint.algorithm!=='ga') throw new Error('wrong algorithm');
      restored=GATrainer.restore(checkpoint);
      for(let i=0;i<100;i++){await original.advance();await restored.advance();}
      expect(restored.population).toEqual(original.population);
      expect(restored.fitness).toEqual(original.fitness);
      expect(restored.exportModel()).toEqual(original.exportModel());
      expect(restored.counters).toEqual(original.counters);
    }finally{original.dispose();restored?.dispose();}
  });
});
