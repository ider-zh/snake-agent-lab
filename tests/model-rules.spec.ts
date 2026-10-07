import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('arena model rules are visible and incompatible peers are excluded',async({page})=>{
 const model=JSON.parse(await readFile('docs/qa/policy/ppo-seed-1-model.json','utf8'));
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();await page.getByRole('button',{name:'Q-learning / SARSA / PPO / 模仿',exact:true}).click();
 const input=page.getByLabel('导入新学习模型或检查点');
 await input.setInputFiles({name:'open.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();const first=page.getByLabel('棋盘 1 策略',{exact:true});
 const saved=first.locator('optgroup[label="已保存的训练模型"] option');await expect(saved).toHaveCount(1);const openId=(await saved.getAttribute('value'))!;
 await page.getByRole('navigation').getByRole('button',{name:'训练实验室',exact:true}).click();
 // Schema-valid compatibility fixture; this is not a training-effect claim.
 model.game.obstacles=[18,19,44,45];await input.setInputFiles({name:'obstacle-rule-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
 await page.getByRole('navigation').getByRole('button',{name:'策略竞技',exact:true}).click();await expect(saved).toHaveCount(2);
 const ids=await saved.evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value)),obstacleId=ids.find(id=>id!==openId)!;
 await first.selectOption(openId);
 await expect(page.getByLabel('棋盘 2 策略',{exact:true}).locator(`option[value="${obstacleId}"]`)).toHaveJSProperty('disabled',true);
 await expect(first.locator(`option[value="${obstacleId}"]`)).toHaveJSProperty('disabled',false);
  await first.selectOption(obstacleId);
 const rules=page.locator('.rule-controls');if(await rules.getAttribute('open')===null)await rules.locator('summary').click();
 await expect(page.getByLabel('棋盘尺寸',{exact:true})).toHaveValue('8');await expect(page.getByLabel('棋盘尺寸',{exact:true})).toBeDisabled();
 await expect(page.getByTestId('arena-lab').getByRole('checkbox',{name:/障碍地图/})).toBeChecked();
 await page.getByRole('button',{name:'单步',exact:true}).click();for(let i=0;i<4;i++)await expect(page.locator('.arena-choice').nth(i)).toContainText('1 步');
});
