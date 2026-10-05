import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
const output = process.argv[2] ?? 'qa-artifacts/soft-dark';
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
   await page.keyboard.press('Tab');
   const data = await page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (c: number[]) => c.slice(0, 3).map(v => {const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const contrast = (a:number[],b:number[]) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
    const lowContrast = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml'&&Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent?.trim())&&el.getBoundingClientRect().width>0&&!el.closest('[disabled]')).flatMap(el=>{
     const style=getComputedStyle(el);let parent:HTMLElement|null=el;let background=[36,44,40];
     while(parent){const candidate=rgb(getComputedStyle(parent).backgroundColor);if(candidate.length>=3&&(candidate.length<4||candidate[3]>.9)){background=candidate;break;}parent=parent.parentElement;}
     const ratio=contrast(rgb(style.color),background);const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
     return ratio<(large?3:4.5)?[{text:el.textContent?.trim().slice(0,55),ratio:Number(ratio.toFixed(2)),color:style.color,font:style.fontSize}]:[];
    });
    const smallButtons=Array.from(document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(b=>b.getBoundingClientRect().width>0).map(b=>({text:b.innerText||b.getAttribute('aria-label'),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})).filter(b=>b.width<44||b.height<44);
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,lowContrast,smallButtons,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches&&Array.from(document.querySelectorAll('button')).every(el=>getComputedStyle(el).transitionDuration==='0s')};
   });
   const focus = await page.evaluate(()=>{const el=document.activeElement;if(!(el instanceof Element))return false;const style=getComputedStyle(el);return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;});
   findings.push({width,mode,...data,focusVisible:focus,errors:[...errors]});
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
  const capture=async(mode:string)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/${width}-${mode}.png`,fullPage:true});await audit(mode);};
  const nav=(name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  await nav('批量评测');await capture('batch-empty');
  if(width===1440||width===390){await page.getByLabel('共同种子数').selectOption('10');await page.getByLabel('每局步数上限').fill('100');await page.getByRole('button',{name:'运行 40 局',exact:true}).click();await expect(page.getByRole('button',{name:'JSON',exact:true})).toBeEnabled({timeout:60000});await capture('batch-results');}
  await nav('回放档案');await capture('replay-empty');
  await page.getByLabel('导入回放文件').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});await expect(page.locator('.toast')).toContainText('失败');await capture('import-error');
  await nav('实验台');for(let i=0;i<6;i++)await page.getByRole('button',{name:'单步',exact:true}).click();await page.getByRole('button',{name:'查看本局回放',exact:true}).click();await capture('replay');
  if(width===1440||width===390){await page.getByRole('button',{name:'打开实验说明',exact:true}).click();await capture('help');await page.keyboard.press('Escape');await nav('实验台');const summary=page.locator('.rule-controls>summary');if(await summary.isVisible())await summary.click();await page.getByTestId('game-lab').getByLabel('棋盘尺寸',{exact:true}).selectOption('9');await page.getByLabel('决策策略').selectOption('hamiltonian');await expect(page.locator('.empty-state.error')).toBeVisible();await capture('strategy-error');}
  await context.close();
 }
 await writeFile(`${output}/audit.json`,JSON.stringify(findings,null,2));
 console.log(JSON.stringify(findings));
 if(findings.some(item=>item.overflow||item.lowContrast.length||item.smallButtons.length||item.errors.length||!item.reducedMotion||!item.focusVisible))throw new Error('Theme audit found visual or accessibility issues; inspect audit.json');
} finally { await browser.close(); }
