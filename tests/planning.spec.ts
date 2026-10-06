import {test,expect} from '@playwright/test';
test('four planning policies execute, replay and display real search statistics',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  for(const id of ['dijkstra','best-first','beam','mcts']){
    await page.getByLabel('决策策略',{exact:true}).selectOption(id);
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'单步',exact:true}).click();
    const hash=await page.getByTestId('game-lab').locator('.tiny-stats strong[title]').getAttribute('title');
    await page.getByRole('button',{name:'查看本局回放',exact:true}).click();
    const slider=page.getByLabel('回放进度',{exact:true});await slider.fill((await slider.getAttribute('max'))!);await expect(page.locator('.hash-value')).toHaveText(hash!);
    await page.getByRole('button',{name:'实验台',exact:true}).click();
  }
  await page.getByRole('button',{name:'算法课堂',exact:true}).click();
  for(const id of ['dijkstra','best-first','beam','mcts']){
    await page.getByLabel('选择课程',{exact:true}).selectOption(id);
    if(id==='dijkstra'||id==='best-first'){
      await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
      await expect(page.getByTestId('lesson-state')).toContainText('游戏步数 0');
      for(let i=0;i<64&&await page.getByRole('button',{name:'下一步搜索',exact:true}).isEnabled();i++)await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
    }else await expect(page.getByTestId('planning-stats')).toContainText('真实 '+id.toUpperCase());
    await page.getByRole('button',{name:'执行建议动作',exact:true}).click();await expect(page.getByTestId('lesson-state')).toContainText('游戏步数 1');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByTestId('lessons-lab').screenshot({path:`docs/qa/planning/${info.project.name}-mcts.png`});
  expect(errors).toEqual([]);
});
