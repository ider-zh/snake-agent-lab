import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
const output = process.argv[2] ?? 'qa-artifacts/visual';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const findings = [];
try {
 for (const width of [1440, 1024, 820, 390, 320]) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 664 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('canvas')).toHaveCount(1);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '单步', exact: true }).click();
  await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({ path: `${output}/${width}-play.png`, fullPage: true });
  const audit = async (mode: string) => {
   const data = await page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (c: number[]) => c.slice(0, 3).map(v => {const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const contrast = (a:number[],b:number[]) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
    const lowContrast = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml'&&Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent?.trim())&&el.getBoundingClientRect().width>0&&!el.closest('[disabled]')).flatMap(el=>{
     const style=getComputedStyle(el);let parent:HTMLElement|null=el;let background=[244,242,233];
     while(parent){const candidate=rgb(getComputedStyle(parent).backgroundColor);if(candidate.length>=3&&(candidate.length<4||candidate[3]>.9)){background=candidate;break;}parent=parent.parentElement;}
     const ratio=contrast(rgb(style.color),background);const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
     return ratio<(large?3:4.5)?[{text:el.textContent?.trim().slice(0,55),ratio:Number(ratio.toFixed(2)),color:style.color,font:style.fontSize}]:[];
    });
    const smallButtons=Array.from(document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(b=>b.getBoundingClientRect().width>0).map(b=>({text:b.innerText||b.getAttribute('aria-label'),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})).filter(b=>b.width<44||b.height<44);
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,lowContrast,smallButtons,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches&&Array.from(document.querySelectorAll('button')).every(el=>getComputedStyle(el).transitionDuration==='0s')};
   });
   findings.push({width,mode,...data,errors:[...errors]});
  };
  await audit('play');
  await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
  for(let i=0;i<6;i++) await page.getByRole('button',{name:'单步',exact:true}).click();
  if(width<721){await expect(page.getByRole('group',{name:'选择观察策略'}).getByRole('button')).toHaveCount(4);await page.getByRole('group',{name:'选择观察策略'}).getByRole('button',{name:/BFS/}).click();}
  await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({path:`${output}/${width}-arena.png`,fullPage:true}); await audit('arena');
  if(width<721){await page.locator('.game-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await expect.poll(async()=>page.locator('.board-canvas').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.sidebar')!.getBoundingClientRect().top)).toBe(true);await page.screenshot({path:`${output}/${width}-arena-focused.png`});}
  await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();
  if(width===1440){await page.getByLabel('训练预算').selectOption('2000');await page.getByRole('button',{name:'开始训练',exact:true}).click();await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});}
  await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({path:`${output}/${width}-training.png`,fullPage:true}); await audit('training');
  await context.close();
 }
 await writeFile(`${output}/audit.json`,JSON.stringify(findings,null,2));
 console.log(JSON.stringify(findings));
} finally { await browser.close(); }
