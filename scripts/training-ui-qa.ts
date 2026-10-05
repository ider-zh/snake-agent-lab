import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { EvaluationResult, FrozenModel, TrainingMetrics } from '../src/training/types';
const output='qa-artifacts/training-ui'; await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
try {
 for(const algorithm of ['dqn','ga'] as const) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const Native=window.Worker;
   (window as unknown as {qa:Record<string,unknown>}).qa={};
   window.Worker=class extends Native {
    constructor(...args:ConstructorParameters<typeof Worker>) {
     super(...args); this.addEventListener('message',event=>{
      const data=event.data;
      if(['model','evaluation','progress','error'].includes(data.type)) (window as unknown as {qa:Record<string,unknown>}).qa[data.type]=data;
     });
    }
   };
  });
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('navigation').getByRole('button',{name:/训练实验室/}).click();
  if(algorithm==='ga')await page.getByRole('button',{name:'GA 神经进化',exact:true}).click();
  await expect(page.getByLabel('训练预算')).toHaveValue(algorithm==='ga'?'500000':'100000');
  await page.getByRole('button',{name:'开始训练',exact:true}).click();
  await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:90000});
  const trained=await page.evaluate(()=>(window as unknown as {qa:{model:{model:FrozenModel};progress:{metrics:TrainingMetrics}}}).qa);
  expect(trained.model.model.observationVersion).toBe('relative-features-v2');
  expect(trained.progress.metrics.samples).toBeGreaterThan(1000);
  const modelDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出推理模型',exact:true}).click();
  const modelPath=`${output}/${algorithm}-model.json`;await(await modelDownload).saveAs(modelPath);
  expect(JSON.parse(await readFile(modelPath,'utf8'))).toEqual(trained.model.model);
  await page.getByLabel('导入模型或检查点').setInputFiles(modelPath);
  await expect(page.getByRole('status').filter({hasText:'推理模型已验证并载入'})).toBeVisible();
  await page.getByRole('button',{name:/评估冻结模型/}).click();
  await expect(page.getByRole('button',{name:'导出评估结果',exact:true})).toBeEnabled({timeout:90000});
  const evaluation=await page.evaluate(()=>(window as unknown as {qa:{evaluation:{result:EvaluationResult}}}).qa.evaluation.result);
  expect(evaluation.episodes).toHaveLength(100);expect(evaluation.cancelled).toBe(false);
  const row={algorithm,metrics:trained.progress.metrics,model:trained.model.model.provenance,evaluation,errors};results.push(row);
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  await page.getByRole('button',{name:'关闭通知',exact:true}).click();
  await page.locator('.checkpoint-grid').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${output}/${algorithm}-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:664});await page.getByRole('button',{name:'导出评估结果',exact:true}).scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`${output}/${algorithm}-mobile.png`});
  expect(errors).toEqual([]);
  console.log(JSON.stringify({algorithm,samples:row.metrics.samples,updates:row.metrics.updates,generations:row.metrics.generation,mean:evaluation.meanScore,n:evaluation.episodes.length}));
  await context.close();
 }
}finally{await browser.close();}
