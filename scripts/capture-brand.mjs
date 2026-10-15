/* global document, MediaRecorder, Blob, setTimeout, console, Buffer */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
async function record(name,route,duration){
 await page.goto('http://127.0.0.1:4189/'+route);
 await page.locator('canvas').waitFor();
 await page.locator('.rule-controls').evaluate(element=>{element.open=true});
 if(name==='shortcut'){
  await page.getByLabel('决策策略').selectOption('hamiltonian-shortcut');
  await page.getByLabel('棋盘尺寸', {exact:true}).selectOption('8');
 }
 await page.getByLabel('运行速度').fill('30');
 await page.getByRole('button',{name:'开始运行',exact:true}).click();
 await page.locator('canvas').scrollIntoViewIfNeeded();
 await page.waitForTimeout(1000);
 await page.locator('canvas').screenshot({path:`public/media/${name}-poster.png`});
 const result=await page.evaluate(async(ms)=>{
  const canvas=document.querySelector('canvas');
  const stream=canvas.captureStream(20);
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm;codecs=vp8';
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:700000});
  const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(resolve=>{rec.onstop=async()=>resolve({bytes:Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),mime,width:canvas.width,height:canvas.height})});
  rec.start();await new Promise(r=>setTimeout(r,ms));rec.stop();stream.getTracks().forEach(t=>t.stop());return done;
 },duration);
 writeFileSync(`public/media/${name}.webm`,Buffer.from(result.bytes));
 console.log(JSON.stringify({name,mime:result.mime,width:result.width,height:result.height,bytes:result.bytes.length,durationMs:duration}));
}
await record('arena','#/arena',12000);

await record('shortcut','#/play',24000);
await browser.close();

