import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('worker bootstrap transient recovery and persistent failure have actionable errors',async({page})=>{
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();
 await page.getByRole('checkbox',{name:/Double DQN/}).uncheck();
 let attempts=0;
 await page.route('**/training.worker-*.js',route=>{attempts++;return attempts===1?route.abort('failed'):route.continue();});
 await page.getByLabel('训练预算').selectOption('2000');await page.getByRole('button',{name:'开始训练',exact:true}).click();
 await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});expect(attempts).toBe(2);
 await page.unroute('**/training.worker-*.js');await page.route('**/training.worker-*.js',r=>r.abort('failed'));
 await page.getByRole('button',{name:'开始训练',exact:true}).click();
 await expect(page.locator('.status-line')).toContainText('脚本加载或初始化失败');
 await expect(page.locator('.status-line')).not.toContainText('undefined');
 await expect(page.getByRole('button',{name:'开始训练',exact:true})).toBeEnabled();
 await page.unroute('**/training.worker-*.js');
 for(let i=0;i<2;i++){
  await page.getByLabel('训练预算').selectOption('100000');await page.getByRole('button',{name:'开始训练',exact:true}).click();
  await expect(page.locator('.status-line')).toContainText('训练中');await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.locator('.status-line')).toContainText('已停止');
 }
 await page.getByRole('button',{name:/评估冻结模型/}).click();await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});
 await page.screenshot({path:test.info().outputPath('worker-recovered.png'),fullPage:true});
});

for(const algorithm of ['q-learning','sarsa','ppo','imitation'] as const)test(`${algorithm} repeated worker start, stop, restart and evaluation`,async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();await page.getByRole('button',{name:'Q-learning / SARSA / PPO / 模仿',exact:true}).click();
 await page.getByLabel('新学习算法').selectOption(algorithm);await page.getByLabel('新学习预算').selectOption('100000');
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'开始新学习训练',exact:true}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('训练或评估中');
  await page.getByRole('button',{name:'暂停新学习',exact:true}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('已暂停');
  await page.getByRole('button',{name:'继续新学习',exact:true}).click();await page.getByRole('button',{name:'停止新学习',exact:true}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('已停止');
 }
 await page.getByRole('button',{name:/评估新学习冻结模型/}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('任务完成',{timeout:60000});
 await expect(page.getByTestId('learning-evaluation')).toContainText('20 局');expect(errors).toEqual([]);
});

test('learning worker bootstrap failure recovers and GA restarts repeatedly',async({page})=>{
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();
 await page.getByRole('button',{name:'GA 神经进化',exact:true}).click();await page.getByLabel('训练预算').selectOption('500000');
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'开始训练',exact:true}).click();await expect(page.locator('.status-line')).toContainText('训练中');await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.locator('.status-line')).toContainText('已停止');}
 await page.getByRole('button',{name:/评估冻结模型/}).click();await expect(page.locator('.status-line')).toContainText('任务完成',{timeout:60000});
 await page.getByRole('button',{name:'Q-learning / SARSA / PPO / 模仿',exact:true}).click();await page.getByLabel('新学习预算').selectOption('2000');
 await page.route('**/learning.worker-*.js',r=>r.abort('failed'));await page.getByRole('button',{name:'开始新学习训练',exact:true}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('脚本加载或初始化失败');
 await page.unroute('**/learning.worker-*.js');await page.getByRole('button',{name:'开始新学习训练',exact:true}).click();await expect(page.locator('[data-testid="learning-lab"] [role="status"]')).toContainText('任务完成');
});

test('arena independently selects four strategies, resets fairly, and retains saved models',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('navigation').getByRole('button',{name:'策略课堂',exact:true})).toBeVisible();
 await expect(page.locator('.privacy-card')).not.toContainText('无账号');
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
 const ids=['dijkstra','mcts','tail-safe','hamiltonian-shortcut'];
 for(let i=0;i<4;i++){await page.getByLabel(`棋盘 ${i+1} 策略`,{exact:true}).selectOption(ids[i]);await expect(page.getByLabel(`棋盘 ${i+1} 策略`,{exact:true})).toHaveValue(ids[i]);}
 await page.getByRole('button',{name:'单步',exact:true}).click();
 for(let i=0;i<4;i++)await expect(page.locator('.arena-choice').nth(i)).toContainText('1 步');
 await page.getByLabel('棋盘 2 策略',{exact:true}).selectOption('beam');
 for(let i=0;i<4;i++)await expect(page.locator('.arena-choice').nth(i)).toContainText('0 步');
 await page.getByLabel('棋盘 2 策略',{exact:true}).selectOption('beam');
 await page.getByRole('button',{name:'开始运行',exact:true}).click();await expect(page.locator('.arena-choice').first()).not.toContainText('0 步');await page.getByRole('button',{name:'暂停',exact:true}).click();
 await page.getByRole('button',{name:'重开',exact:true}).click();for(let i=0;i<4;i++)await expect(page.locator('.arena-choice').nth(i)).toContainText('0 步');
 await page.screenshot({path:test.info().outputPath('arena-selectors.png'),fullPage:true});
 await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();await page.getByRole('button',{name:'Q-learning / SARSA / PPO / 模仿',exact:true}).click();
 await page.getByLabel('导入新学习模型或检查点').setInputFiles({name:'ppo.json',mimeType:'application/json',buffer:await readFile('docs/qa/policy/ppo-seed-1-model.json')});
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
 await expect(page.getByLabel('棋盘 1 策略',{exact:true}).locator('optgroup[label="已保存的训练模型"] option')).toHaveCount(1);
 const option=await page.getByLabel('棋盘 1 策略',{exact:true}).locator('optgroup[label="已保存的训练模型"] option').getAttribute('value');
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();
 await expect(page.getByLabel('棋盘 1 策略',{exact:true}).locator('optgroup[label="已保存的训练模型"] option')).toHaveCount(1);
 for(let i=0;i<4;i++)await page.getByLabel(`棋盘 ${i+1} 策略`,{exact:true}).selectOption(option!);
 await page.getByRole('button',{name:'单步',exact:true}).click();for(let i=0;i<4;i++)await expect(page.locator('.arena-choice').nth(i)).toContainText('1 步');
 await expect(page.getByLabel('棋盘 1 策略',{exact:true}).locator('option[value="hamiltonian"]')).toHaveJSProperty('disabled',true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('arena-saved-models.png'),fullPage:true});
});
