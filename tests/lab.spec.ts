import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const nav=(page:Page,label:string)=>page.getByRole('navigation').getByRole('button',{name:new RegExp(label)});
test('manual controls, deterministic restart, responsive canvas and replay',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'从一条蛇，探索智能'})).toBeVisible();
 await expect(page.locator('canvas')).toHaveCount(1);
 await page.getByRole('button',{name:'手动游玩',exact:true}).click();
 const board=page.getByRole('img',{name:/手动，得分/});
 await expect(board).toHaveAttribute('aria-label',/步数 0/);
 await page.getByRole('button',{name:'单步',exact:true}).click();await expect(board).toHaveAttribute('aria-label',/步数 1/);
 await page.getByRole('button',{name:'重开',exact:true}).click();await expect(board).toHaveAttribute('aria-label',/步数 0/);
 await page.getByRole('button',{name:'向上',exact:true}).click();await page.getByRole('button',{name:'单步',exact:true}).click();
 await page.getByRole('button',{name:'保存回放',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'回放已保存在本浏览器'})).toBeVisible();
 await page.getByRole('button',{name:'查看本局回放'}).click();await expect(page.getByRole('heading',{name:'回到每一个关键决定'})).toBeVisible();
 await page.getByRole('button',{name:'下一步',exact:true}).click();await expect(page.getByRole('img',{name:/回放/})).toHaveAttribute('aria-label',/步数 1/);
 await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth',0);
 const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);expect(fits).toBe(true);
 await page.screenshot({path:test.info().outputPath('manual-replay.png'),fullPage:true});expect(errors).toEqual([]);
});
test('AI search, four-board arena, batch export, invalid import guard',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'单步',exact:true}).click();await expect(page.getByRole('img',{name:/A\* 安全搜索/})).toHaveAttribute('aria-label',/步数 1/);
 await nav(page,'策略竞技').click();await expect(page.locator('canvas')).toHaveCount(1);await page.getByRole('button',{name:'单步',exact:true}).click();await expect(page.getByRole('img')).toHaveAttribute('aria-label',/BFS.*步数 1/);
 await nav(page,'批量评测').click();await page.getByLabel('共同种子数').selectOption('10');await page.getByRole('button',{name:'运行 40 局'}).click();await expect(page.getByRole('button',{name:'JSON',exact:true})).toBeEnabled({timeout:60000});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();expect((await download).suggestedFilename()).toBe('snake-benchmark.csv');
 await nav(page,'回放档案').click();await page.getByLabel('导入回放文件').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":"unknown","actions":[]}')});await expect(page.getByRole('status').filter({hasText:'回放导入失败'})).toBeVisible();
 await page.screenshot({path:test.info().outputPath('batch-result.png'),fullPage:true});
});
test('real DQN training, checkpoint export, frozen evaluation and GA controls',async({page})=>{
 test.skip(test.info().project.name.includes('mobile'),'Long numeric workflow exercised on desktop; mobile layout/controls covered separately');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await nav(page,'训练实验室').click();await page.getByLabel('训练预算').selectOption('2000');await page.getByRole('button',{name:'开始训练',exact:true}).click();
 await expect(page.getByRole('button',{name:'导出推理模型',exact:true})).toBeEnabled({timeout:60000});
 await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});
 const updates=await page.locator('.metric').filter({hasText:'梯度更新'}).locator('strong').innerText();expect(Number(updates.replaceAll(',',''))).toBeGreaterThan(0);
 const checkpoint=page.waitForEvent('download');await page.getByRole('button',{name:'完整检查点',exact:true}).click();expect((await checkpoint).suggestedFilename()).toContain('checkpoint');
 await page.getByRole('button',{name:/评估冻结模型/}).click();await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});await expect(page.getByRole('button',{name:'导出评估结果'})).toBeEnabled();
 await page.getByRole('button',{name:'GA 神经进化',exact:true}).click();await page.getByLabel('训练预算').selectOption('10000');await page.getByRole('button',{name:'开始训练',exact:true}).click();
 await expect(page.locator('.status-line')).toContainText(/训练中|任务完成/);if(await page.getByRole('button',{name:'暂停',exact:true}).isVisible()){await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.locator('.status-line')).toContainText('已暂停');await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.locator('.status-line')).toContainText('已停止');}
 expect(errors).toEqual([]);await page.screenshot({path:test.info().outputPath('training-lab.png'),fullPage:true});
});
