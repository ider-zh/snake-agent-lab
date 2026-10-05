import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function geometry(page:Page){
 return page.locator('.board-canvas').evaluate(host=>{
  const canvas=host.querySelector('canvas')!,box=canvas.getBoundingClientRect();
  const boards=JSON.parse(host.getAttribute('data-board-rects')??'[]') as {x:number;y:number;width:number;height:number;label:string}[];
  return {width:box.width,height:box.height,pixels:[canvas.width,canvas.height],resolution:Math.min(devicePixelRatio,2),boards};
 });
}

test('arena draws larger complete boards and resizes through mobile focus without restarting',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
 await page.getByRole('button',{name:'单步',exact:true}).click();
 for(const [width,height,minimum] of [[1440,1000,350],[1920,1080,500],[1024,768,330],[1440,720,350],[390,664,300],[320,664,260],[1440,1000,350]]){
  await page.setViewportSize({width,height});
  await expect.poll(async()=>{const g=await geometry(page);return g.boards.length===(width>720?4:1)&&g.boards.every(b=>b.width>=minimum&&b.x>=0&&b.y>=0&&b.x+b.width<=g.width+1&&b.y+b.height<=g.height+1)&&Math.abs(g.pixels[0]-g.width*g.resolution)<=2&&Math.abs(g.pixels[1]-g.height*g.resolution)<=2;}).toBe(true);
  await expect(page.locator('.board-canvas')).toHaveAttribute('aria-label',/步数 1/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(width<=720){
   const choices=page.getByRole('group',{name:'选择观察策略'}).getByRole('button');await expect(choices).toHaveCount(4);
   for(let i=0;i<4;i++){await choices.nth(i).click();await expect(choices.nth(i)).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>(await geometry(page)).boards[0]?.label).toBe(await choices.nth(i).locator('strong').innerText());}
   await page.locator('.board-focus').evaluate(el=>el.scrollIntoView({block:'center'}));
   const fits=await page.locator('.board-canvas').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=document.querySelector('.playback-controls')!.getBoundingClientRect().bottom-1&&r.bottom<=document.querySelector('.sidebar')!.getBoundingClientRect().top+1;});expect(fits).toBe(true);
  }
 }
 await page.getByRole('button',{name:'开始运行',exact:true}).click();await expect(page.locator('.board-focus')).toBeFocused();
 await expect.poll(async()=>page.locator('.metric').filter({hasText:'环境步数'}).locator('strong').innerText()).not.toBe('1');
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'实验台',exact:true}).click();
 await expect.poll(async()=>(await geometry(page)).boards[0]?.width).toBeGreaterThanOrEqual(650);
 await page.setViewportSize({width:390,height:664});
 await expect.poll(async()=>{const g=await geometry(page);return g.boards[0]?.width>=300&&Math.abs(g.height-g.width)<=1;}).toBe(true);
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();await expect.poll(async()=>(await geometry(page)).boards.length).toBe(4);
 expect(errors).toEqual([]);
});
