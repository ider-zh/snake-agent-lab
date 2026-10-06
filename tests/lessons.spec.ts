import { expect, test } from '@playwright/test';
test('lessons use real frozen search, explicit moves and accessible bilingual code',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'算法课堂',exact:true}).click();
  await expect(page.getByText('无需训练的规划／规则策略',{exact:true})).toBeVisible();
  const state=page.getByTestId('lesson-state'),initial=await state.textContent();
  await expect(page.getByRole('button',{name:'执行建议动作',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
  await expect(state).toHaveText(initial!);await expect(page.getByText(/搜索帧 1 \//)).toBeVisible();
  await page.getByRole('button',{name:'上一步搜索',exact:true}).click();await expect(page.getByText(/搜索帧 0 \//)).toBeVisible();
  for(let i=0;i<64&&await page.getByRole('button',{name:'下一步搜索',exact:true}).isEnabled();i++)await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
  await page.getByRole('button',{name:'执行建议动作',exact:true}).click();await expect(state).toContainText('游戏步数 1');
  await page.getByRole('button',{name:'重置场景',exact:true}).click();await expect(state).toHaveText(initial!);
  await page.getByRole('button',{name:'下一步搜索',exact:true}).click();
  const js=page.getByRole('button',{name:'JavaScript',exact:true});await js.scrollIntoViewIfNeeded();await js.focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Python',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByText(/搜索帧 1 \//)).toBeAttached();
  const code=page.locator('pre[aria-label="Python 可运行示例"]');await expect(code).toContainText('def search');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载示例',exact:true}).click();expect((await download).suggestedFilename()).toBe('snakelab-bfs.py');
  // Stub only the browser clipboard transport; verify the exact downloaded source is copied.
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as unknown as {copied:string}).copied=text;}}});});
  await page.getByRole('button',{name:'复制代码',exact:true}).click();await expect(page.getByText('已复制完整示例',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(await code.textContent());
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
  await page.getByRole('button',{name:'复制代码',exact:true}).click();await expect(page.getByText('复制不可用，请聚焦代码框手动选择，或下载文件。',{exact:true})).toBeVisible();
  for(const id of ['ppo','imitation','q-learning','sarsa','dijkstra','best-first','beam','mcts','tail-safe','hamiltonian-shortcut','astar','random','legal-random','greedy','safe-greedy','hamiltonian','encoding','dqn','ga','evaluation']){
    await page.getByLabel('选择课程',{exact:true}).selectOption(id);
    await expect(page.getByText('边界与限制',{exact:true})).toBeAttached();
    const answer=page.getByText('显示练习解答',{exact:true});await answer.click();await expect(answer.locator('..')).toHaveAttribute('open','');
    if(id==='ppo'||id==='imitation'||id==='q-learning'||id==='sarsa'||id==='dqn'||id==='ga'||id==='evaluation')await page.getByRole('button',{name:'下一步计算',exact:true}).click();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow,`${id} page overflow`).toBe(false);
  }
  await page.getByLabel('选择课程',{exact:true}).selectOption('astar');await page.getByRole('button',{name:'下一步搜索',exact:true}).click();await page.getByText('查看 frontier / visited 数值',{exact:true}).click();
  await page.getByTestId('lessons-lab').screenshot({path:`docs/qa/lessons/${info.project.name}-astar.png`});
  await page.getByLabel('选择课程',{exact:true}).selectOption('dqn');await page.getByRole('button',{name:'Python',exact:true}).click();await page.getByTestId('lessons-lab').screenshot({path:`docs/qa/lessons/${info.project.name}-dqn.png`});
  expect(errors).toEqual([]);
});
