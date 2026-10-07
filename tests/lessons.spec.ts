import { expect, test } from '@playwright/test';
import { lessons } from '../src/lessons/content';
import { exampleCode } from '../src/lessons/examples';

test('overview and all 21 specific lessons retain interactive demos', async({page},info)=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#/lessons');
 await expect(page.getByRole('heading',{level:1,name:'从下一步，读懂一套策略'})).toBeVisible();
 await expect(page.locator('.lesson-index a[data-lesson-id]')).toHaveCount(21);
 await expect(page.getByLabel('选择课程',{exact:true})).toHaveCount(0);
 expect(await page.locator('.lesson-index').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 expect((await page.locator('.lesson-index a[data-lesson-id]').first().boundingBox())!.width).toBeGreaterThan(120);
 await page.screenshot({path:'docs/qa/classroom/'+info.project.name+'-overview.png',fullPage:true});
 for(const lesson of lessons){
  await page.locator('.lesson-index a[data-lesson-id="'+lesson.id+'"]').click();
  await expect(page.getByRole('heading',{level:1,name:lesson.title,exact:true})).toBeVisible();
  await expect(page.locator('.lesson-index a[aria-current="page"]')).toHaveAttribute('data-lesson-id',lesson.id);
  await expect(page.locator('.lesson-objectives li')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'为什么需要它',exact:true})).toBeAttached();
  await expect(page.locator('.lesson-terms dt')).toHaveCount(3);
  await expect(page.locator('#lesson-worked-example')).not.toBeEmpty();
  await expect(page.getByRole('heading',{name:'把讲解对照到代码',exact:true})).toBeAttached();
  expect(await page.locator('.lesson-sources a').count()).toBeGreaterThan(0);
  await page.getByRole('navigation',{name:'本课内容',exact:true}).getByRole('button',{name:'手算例子',exact:true}).click();
  await expect(page.locator('#lesson-worked-example')).toBeFocused();
  await expect(page).toHaveURL(new RegExp('/lessons/'+lesson.id+'$'));
  await page.locator('#lesson-practice-section summary').first().click();
  await expect(page.locator('#lesson-practice-section details').first()).toHaveAttribute('open','');
  for(const [name,language] of [['JavaScript','js'],['Python','py']] as const){
   await page.getByRole('tab',{name,exact:true}).click();
   expect(await page.locator('#code-panel pre').textContent()).toBe(exampleCode(lesson.id,language));
   await expect(page.locator('#code-panel .syntax-keyword').first()).toBeAttached();
  }
  await expect(page.getByRole('heading',{name:'适用边界',exact:true})).toBeAttached();
  await page.getByText('显示练习解答',{exact:true}).click();
  await expect(page.locator('.lesson-exercise details')).toHaveAttribute('open','');
  await expect(page.getByRole('button',{name:'下载示例',exact:true})).toHaveCount(0);
  if(lesson.agent){
   await expect(page.locator('.lesson-board canvas')).toBeAttached();
   await expect(page.getByTestId('lesson-state')).toContainText('游戏步数 0');
  }else if(lesson.id==='encoding')await expect(page.locator('.lesson-feature-grid > div')).toHaveCount(12);
  else {
   await page.getByRole('button',{name:'下一步计算',exact:true}).click();
   await expect(page.locator('.lesson-calculation')).toContainText('2 / 4');
   await page.getByRole('button',{name:'重置计算',exact:true}).click();
   await expect(page.locator('.lesson-calculation')).toContainText('1 / 4');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lesson.id+' viewport').toBe(true);
 }
 for(const id of ['astar','dqn']){
  await page.locator('.lesson-index a[data-lesson-id="'+id+'"]').click();
  if(id==='astar')await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
  else await page.getByRole('tab',{name:'Python',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.getByTestId('lessons-lab').screenshot({path:'docs/qa/classroom/'+info.project.name+'-'+id+'.png'});
  if(id==='astar'){
   const board=page.locator('.lesson-board');
   expect((await board.boundingBox())!.width).toBeGreaterThan(info.project.name==='chromium-desktop'?600:300);
   await board.screenshot({path:'docs/qa/classroom/'+info.project.name+'-board-detail.png'});
  }else await page.locator('#lesson-code-section').screenshot({path:'docs/qa/classroom/'+info.project.name+'-code-detail.png'});
 }
 expect(errors).toEqual([]);
});

test('frozen search and highlighted keyboard tabs preserve raw source copy',async({page})=>{
 await page.goto('/#/lessons/bfs');
 const state=page.getByTestId('lesson-state');await expect(state).toContainText('游戏步数 0');const initial=await state.textContent();
 await expect(page.getByRole('button',{name:'执行建议动作',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
 await expect(state).toHaveText(initial!);await expect(page.getByText('搜索帧 1 /',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'上一步搜索',exact:true}).click();
 await expect(page.getByText('搜索帧 0 /',{exact:false})).toBeVisible();
 for(let i=0;i<64&&await page.getByRole('button',{name:'下一步搜索',exact:true}).isEnabled();i++)await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
 await page.getByRole('button',{name:'执行建议动作',exact:true}).click();await expect(state).toContainText('游戏步数 1');
 await page.getByRole('button',{name:'重置场景',exact:true}).click();await expect(state).toHaveText(initial!);
 const js=page.getByRole('tab',{name:'JavaScript',exact:true}),py=page.getByRole('tab',{name:'Python',exact:true});
 await js.focus();await page.keyboard.press('ArrowRight');await expect(py).toBeFocused();await expect(py).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Home');await expect(js).toBeFocused();await page.keyboard.press('End');await expect(py).toBeFocused();
 const code=page.locator('pre[aria-label="Python 可运行示例"]');await expect(code).toContainText('def search');
 await expect(code.locator('.syntax-keyword').first()).toBeVisible();
 // Clipboard transport is stubbed; the copied source must match the rendered text exactly.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as unknown as {copied:string}).copied=text;}}}));
 for(const tab of [py,js]){
  await tab.click();await page.getByRole('button',{name:'复制代码',exact:true}).click();
  await expect(page.getByText('已复制完整示例',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(await page.locator('#code-panel pre').textContent());
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
 await page.getByRole('button',{name:'复制代码',exact:true}).click();
 await expect(page.getByText('复制不可用，请在代码框中选择并复制。',{exact:true})).toBeVisible();
 await expect(page.locator('#code-panel pre')).toBeFocused();
});

test('lesson deep links, previous next boundaries and browser history',async({page})=>{
 await page.goto('/#/lessons/random');
 const pager=page.getByRole('navigation',{name:'课间导航',exact:true});
 await expect(pager.locator('[rel="prev"]')).toHaveCount(0);
 await pager.locator('[rel="next"]').click();await expect(page).toHaveURL(/legal-random$/);
 await pager.locator('[rel="prev"]').click();await expect(page).toHaveURL(/lessons\/random$/);
 await page.goBack();await expect(page.getByRole('heading',{level:1,name:lessons[1].title,exact:true})).toBeVisible();
 await page.goForward();await expect(page.getByRole('heading',{level:1,name:lessons[0].title,exact:true})).toBeVisible();
 await page.locator('.lesson-index a[data-lesson-id="evaluation"]').click();
 await expect(pager.locator('[rel="next"]')).toHaveCount(0);
 await expect(pager.locator('[rel="prev"]')).toHaveAttribute('href','#/lessons/imitation');
 await page.goto('/#/lessons/astar');await page.reload();
 await expect(page.getByRole('heading',{level:1,name:lessons.find(l=>l.id==='astar')!.title,exact:true})).toBeVisible();
 await expect(page).toHaveTitle(/A\*/);
 await page.getByRole('button',{name:'课程目录 ↑',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'课程目录',exact:true})).toBeFocused();
 await page.getByRole('navigation',{name:'工作区导航'}).getByRole('button',{name:'实验台',exact:true}).click();
 await expect(page.getByTestId('lessons-lab')).toHaveCount(0);
 await page.goBack();await expect(page.getByTestId('lessons-lab')).toBeVisible();await expect(page).toHaveURL(/lessons\/astar$/);
 await page.goto('/#/lessons/unknown');await expect(page.getByRole('heading',{level:1,name:'从下一步，读懂一套策略'})).toBeVisible();
});
