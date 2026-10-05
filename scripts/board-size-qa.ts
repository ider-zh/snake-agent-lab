import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
const output=process.argv[2]??'qa-artifacts/board-size';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const measurements=[];
try{
 for(const [width,height] of [[1440,1000],[1920,1080],[1024,768],[390,664],[320,664],[1440,720]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:width<721?2:1});
  await page.goto('http://127.0.0.1:4173');
  for(const mode of ['play','arena']){
   if(mode==='arena')await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
   await expect(page.locator('canvas')).toHaveCount(1);
   for(let i=0;i<6;i++)await page.getByRole('button',{name:'单步',exact:true}).click();
   if(mode==='arena'&&width<721)await page.getByRole('group',{name:'选择观察策略'}).getByRole('button',{name:/BFS/}).click();
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const data=await page.locator('.board-canvas').evaluate((host)=>{
    const canvas=host.querySelector('canvas')!,rect=canvas.getBoundingClientRect(),count=host.classList.contains('multi-board')?4:1;
    const side=count===4?Math.min((rect.width-20)/2,(rect.height-20)/2-26):Math.min(rect.width,rect.height);
    const actual=host.getAttribute('data-board-rects');
    return {canvasWidth:rect.width,canvasHeight:rect.height,bufferWidth:canvas.width,bufferHeight:canvas.height,dpr:devicePixelRatio,perBoardWidth:actual?JSON.parse(actual)[0].width:side,perBoardHeight:actual?JSON.parse(actual)[0].height:side,count,rects:actual?JSON.parse(actual):null,overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   measurements.push({viewport:[width,height],mode,...data,boardAreaToViewport:data.count*data.perBoardWidth*data.perBoardHeight/(width*height)});
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:`${output}/${width}x${height}-${mode}.png`,fullPage:true});
   if(mode==='arena'&&width<721){await page.locator('.board-focus').evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:`${output}/${width}x${height}-arena-focused.png`});}
  }
  await page.close();
 }
 await writeFile(`${output}/measurements.json`,JSON.stringify(measurements,null,2));
 console.log(JSON.stringify(measurements));
}finally{await browser.close();}
