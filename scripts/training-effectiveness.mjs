import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const out = process.argv[2] ?? 'qa-artifacts/training-baseline.json';
const { DQNTrainer } = await server.ssrLoadModule('/src/training/dqn.ts');
const { GATrainer } = await server.ssrLoadModule('/src/training/ga.ts');
const { FrozenEvaluator } = await server.ssrLoadModule('/src/training/evaluation.ts');
const { compactTrainingPreset } = await server.ssrLoadModule('/src/training/presets.ts');
const { Game, legalActions, moveCell, SeededRandom } = await server.ssrLoadModule('/src/core/index.ts');
const { createAgent } = await server.ssrLoadModule('/src/agents/index.ts');
const seeds = Array.from({ length: Number(process.argv[7] ?? 30) }, (_, i) => 30001 + i);
const width = Number(process.argv[4] ?? 8), steps = Number(process.argv[5] ?? 10000);
const compact = process.argv[3] === 'compact';
const gameConfig = { width, height: width, maxSteps: 1000, maxNoFood: 200 };
function stats(episodes) {
  const scores = episodes.map(e => e.score), sorted = [...scores].sort((a,b)=>a-b);
  return { n: scores.length, mean: scores.reduce((a,b)=>a+b,0)/scores.length, median: (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2, min: sorted[0], max: sorted.at(-1), zero: scores.filter(s=>s===0).length, scores, meanSteps: episodes.reduce((n,e)=>n+e.steps,0)/episodes.length, reasons: episodes.reduce((counts,e)=>({...counts,[e.reason]:(counts[e.reason]??0)+1}),{}) };
}
function evaluate(model) {
  const evaluator = new FrozenEvaluator(model, seeds);
  while (!evaluator.done) evaluator.tick();
  return stats(evaluator.episodes);
}
const report = { started: new Date().toISOString(), environment: process.version, testSeeds: seeds, game: gameConfig, baselines: {}, runs: [] };
report.trainingSourceHash = createHash('sha256').update(readdirSync('src/training').filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts')).sort().map(f=>f+'\n'+readFileSync('src/training/'+f,'utf8')).join('\n')).digest('hex');
mkdirSync('qa-artifacts', { recursive: true });
const save = () => writeFileSync(out, JSON.stringify(report,null,2));
for (const policy of ['legal-random','legal-greedy','greedy']) {
  const episodes = seeds.map(seed => {
    const game = new Game(gameConfig,seed), rng = new SeededRandom(seed ^ 123456), agent = createAgent('greedy',seed);
    let observation = game.observe();
    while (!observation.terminated && !observation.truncated) {
      const legal = legalActions(observation);
      let action = legal.length ? legal[rng.int(legal.length)] : observation.direction;
      if (policy === 'greedy') action = agent.decide(observation).action;
      if (policy === 'legal-greedy' && legal.length) {
        const distance = a => { const c = moveCell(observation.snake[0],a,width,width), f=observation.food; return Math.abs(c%width-f%width)+Math.abs(Math.floor(c/width)-Math.floor(f/width)); };
        action = [...legal].sort((a,b)=>distance(a)-distance(b)||a-b)[0];
      }
      observation = game.step(action).observation;
    }
    return observation;
  });
  report.baselines[policy] = stats(episodes);
}
save(); console.log(JSON.stringify({ baselines: report.baselines }));
try {
  for (const algorithm of (process.argv[6] === 'baselines' ? [] : process.argv[6] ? [process.argv[6]] : ['dqn','ga'])) for (const seed of [7,42,123]) {
    const input = compact ? { ...compactTrainingPreset(algorithm,seed,steps), game:gameConfig, budget:{maxEnvSteps:steps,maxWallMs:60000,maxGenerations:50} } : { seed, game: gameConfig, budget: {maxEnvSteps:10000,maxWallMs:60000,maxGenerations:50}, dqn:{doubleDQN:false,warmup:128,batchSize:32,replayCapacity:10000,validationEvery:1000}, ga:{populationSize:16,eliteCount:2,episodesPerIndividual:3}, validationSeeds:[20001,20002,20003,20004,20005], testSeeds:Array.from({length:100},(_,i)=>30001+i) };
    const trainer = algorithm === 'dqn' ? await DQNTrainer.create(input) : new GATrainer(input);
    trainer.pause(); const before = evaluate(trainer.exportModel()); trainer.resume();
    let firstGeneration = null;
    while (await trainer.advance()) {
      if (algorithm === 'ga' && trainer.counters.generation === 1 && firstGeneration === null) {
        trainer.pause(); firstGeneration = evaluate(trainer.exportModel()); trainer.resume();
      }
    }
    trainer.pause(); const metrics = trainer.metrics(), model=trainer.exportModel();
    const after = evaluate(model);
    writeFileSync(out.replace(/\.json$/,`-${algorithm}-${seed}-model.json`),JSON.stringify(model));
    const run = { algorithm, seed, before, firstGeneration, after, counters: trainer.counters, elapsedMs: metrics.elapsedMs, epsilon:metrics.epsilon, loss:metrics.loss, stopReason:trainer.stopReason, exported: model.provenance, config:trainer.config };
    report.runs.push(run); save(); console.log(JSON.stringify(run)); trainer.dispose();
  }
} finally { await server.close(); }
