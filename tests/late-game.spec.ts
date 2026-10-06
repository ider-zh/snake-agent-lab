import {test,expect} from '@playwright/test';
test('late-game arena uses production budgets and exports a valid long replay',async({page},info)=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
 const rules=page.locator('.rule-controls');if(await rules.getAttribute('open')===null)await rules.locator('summary').click();
 await page.getByLabel('棋盘尺寸',{exact:true}).selectOption('8');await page.getByLabel('游戏种子',{exact:true}).fill('63001');
 for(const [i,id] of ['astar','beam','mcts','hamiltonian-shortcut'].entries())await page.getByLabel(`棋盘 ${i+1} 策略`,{exact:true}).selectOption(id);
 const step=page.getByRole('button',{name:'单步',exact:true});let batches=0;
 // Accelerate real UI step events; production agents retain the 20 ms/10k cap.
 while(await step.isEnabled()&&batches++<170){await step.evaluate(button=>{for(let i=0;i<30&&!(button as HTMLButtonElement).disabled;i++)(button as HTMLButtonElement).click();});}
 await expect(step).toBeDisabled();
 const results=await page.locator('.arena-choice small').allTextContents();
 const scores=results.slice(0,3).map(text=>Number(text.match(/^(\d+)/)?.[1]??0));expect(Math.max(...scores)).toBeGreaterThanOrEqual(45);
 await info.attach('production-budget-long-game',{body:JSON.stringify({seed:63001,initialization:'cycle',size:8,maxNodes:10000,maxMs:20,results,stepBatches:batches}),contentType:'application/json'});
 await page.screenshot({path:`docs/qa/repair/${info.project.name}-late-arena.png`,fullPage:true});
 await page.getByRole('button',{name:'查看本局回放',exact:true}).click();const slider=page.getByLabel('回放进度',{exact:true});await slider.fill((await slider.getAttribute('max'))!);
 await expect(page.getByText('当前帧验证一致',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
