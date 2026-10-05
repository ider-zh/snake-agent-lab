import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name: new RegExp(name) });
const metric = (page: Page, name: string) => page.locator('.metric').filter({ hasText: name }).locator('strong');
const samples = async (page: Page) => Number((await metric(page, '环境样本').innerText()).replaceAll(',', ''));
const armCancelMeasurement = async (page: Page, buttonName: string, selector: string, done: string) => {
  await page.getByRole('button', { name: buttonName, exact: true }).evaluate((button, target) => {
    document.documentElement.removeAttribute('data-qa-cancel-ms');
    button.addEventListener('click', () => {
      const start = performance.now();
      const observer = new MutationObserver(() => {
        if (Array.from(document.querySelectorAll(target.selector)).some(el => el.textContent?.includes(target.done))) {
          observer.disconnect(); document.documentElement.setAttribute('data-qa-cancel-ms', String(performance.now() - start));
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }, { once: true });
  }, { selector, done });
};
const downloadJson = async (page: Page, name: string) => {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await downloading;
  const path = (await file.path())!;
  return { path, data: JSON.parse(await readFile(path, 'utf8')) };
};

test('keyboard queue, repeated pause, mode changes and saved replay survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开实验说明', exact: true }).click();
  await expect(page.getByRole('button', { name: '关闭说明', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: '开始探索', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '关闭说明', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打开实验说明', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '手动游玩', exact: true }).click();
  const focus = page.locator('.board-focus');
  const board = page.locator('.board-canvas');
  await focus.press('ArrowUp');
  await focus.press('ArrowLeft'); // Only the first direction is accepted in this tick.
  await page.getByRole('button', { name: '单步', exact: true }).click();
  const replay = await downloadJson(page, '导出');
  expect(replay.data.actions).toEqual([0]);
  if(await page.locator('.rule-controls summary').isVisible()) await page.locator('.rule-controls summary').click();
  await page.getByLabel('游戏种子').focus();
  await page.getByLabel('游戏种子').press('w');
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(board).toHaveAttribute('aria-label', /步数 2/);
  await page.getByLabel('运行速度').fill('1');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '开始运行', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
  }
  const paused = await board.getAttribute('aria-label');
  await page.waitForTimeout(300);
  await expect(board).toHaveAttribute('aria-label', paused!);
  await page.getByRole('button', { name: '保存回放', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('回放已保存在本浏览器');
  await page.reload();
  await nav(page, '回放档案').click();
  await page.locator('.saved-list button').click();
  await expect(page.getByRole('img', { name: /回放/ })).toBeVisible();
  await page.getByLabel('回放进度').fill('1');
  await expect(board).toHaveAttribute('aria-label', /步数 1/);
  await nav(page, '策略竞技').click();
  await page.getByRole('button', { name: '开始运行', exact: true }).click();
  await expect(board).not.toHaveAttribute('aria-label', /A\* 安全搜索，得分 0，步数 0/);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('arena.png'), fullPage: true });
});

test('batch worker pauses, resumes, cancels and saves a partial result', async ({ page }) => {
  await page.goto('/'); await nav(page, '批量评测').click();
  await page.getByRole('button', { name: '运行 400 局' }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(metric(page, '实验状态')).toHaveText('暂停');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(metric(page, '实验状态')).toHaveText('运行中');
  await armCancelMeasurement(page, '取消', '.metric strong', '取消');
  const start = performance.now();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(metric(page, '实验状态')).toHaveText('取消');
  const cancelMs = performance.now() - start;
  await expect(page.locator('html')).toHaveAttribute('data-qa-cancel-ms', /^\d/);
  const clickToStoppedMs = Number(await page.locator('html').getAttribute('data-qa-cancel-ms'));
  const result = await downloadJson(page, 'JSON');
  expect(result.data.status).toBe('cancelled');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('实验结果已保存');
  await test.info().attach('batch-cancel-timing', { body: JSON.stringify({ cancelMs, clickToStoppedMs }), contentType: 'application/json' });
});

for (const algorithm of ['dqn', 'ga'] as const) {
  test(`${algorithm} real worker checkpoint roundtrip, invalid model and local restore`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await nav(page, '训练实验室').click();
    if (algorithm === 'ga') await page.getByRole('button', { name: 'GA 神经进化', exact: true }).click();
    await page.getByLabel('训练预算').selectOption('100000');
    await page.getByRole('button', { name: '开始训练', exact: true }).click();
    await expect.poll(() => samples(page)).toBeGreaterThan(160);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('已暂停');
    const checkpoint = await downloadJson(page, '完整检查点');
    expect(checkpoint.data.algorithm).toBe(algorithm);
    expect(checkpoint.data.counters.envSteps).toBeGreaterThan(160);
    if (algorithm === 'dqn') expect(checkpoint.data.counters.updates).toBeGreaterThan(0);
    await page.getByRole('button', { name: '本地保存', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '检查点已保存在本浏览器' })).toBeVisible();
    await armCancelMeasurement(page, '停止', '.status-line', '已停止');
    const cancelStart = performance.now();
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('已停止');
    const cancelMs = performance.now() - cancelStart;
    await expect(page.locator('html')).toHaveAttribute('data-qa-cancel-ms', /^\d/);
    const clickToStoppedMs = Number(await page.locator('html').getAttribute('data-qa-cancel-ms'));
    await expect(page.getByRole('button', { name: '完整检查点', exact: true })).toBeDisabled();
    await expect(page.locator('.tiny-stats span').filter({ hasText: '活跃张量' }).locator('strong')).toHaveText('0');
    const model = await downloadJson(page, '导出推理模型');
    await page.getByLabel('导入模型或检查点').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":"snake-mlp-v1"}') });
    await expect(page.getByRole('status').filter({ hasText: '导入失败' })).toBeVisible();
    await page.getByLabel('导入模型或检查点').setInputFiles(model.path);
    await expect(page.getByRole('status').filter({ hasText: '推理模型已验证并载入' })).toBeVisible();
    await page.getByLabel('导入模型或检查点').setInputFiles(checkpoint.path);
    await page.getByRole('button', { name: `恢复 ${algorithm.toUpperCase()} 检查点`, exact: true }).click();
    await expect.poll(() => samples(page)).toBeGreaterThan(checkpoint.data.counters.envSteps);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('已暂停');
    await nav(page, '实验台').click(); await nav(page, '训练实验室').click();
    await expect(page.locator('.status-line')).toContainText('已暂停');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('训练中');
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('已停止');
    await page.reload(); await nav(page, '训练实验室').click();
    const records = page.getByLabel('本地检查点');
    await expect(records.locator('option')).toHaveCount(2);
    await records.selectOption({ index: 1 });
    await page.getByRole('button', { name: `恢复 ${algorithm.toUpperCase()} 检查点`, exact: true }).click();
    await expect.poll(() => samples(page)).toBeGreaterThanOrEqual(checkpoint.data.counters.envSteps);
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(page.locator('.status-line')).toContainText('已停止');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${algorithm}-restored.png`), fullPage: true });
    await test.info().attach(`${algorithm}-cancel-timing`, { body: JSON.stringify({ cancelMs, clickToStoppedMs, checkpointSteps: checkpoint.data.counters.envSteps }), contentType: 'application/json' });
  });
}

test('tablet navigation retains accessible names', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 }); await page.goto('/');
  await nav(page, '策略竞技').click();
  await expect(page.getByRole('heading', { name: '同一起点，不同的思考' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('four-board input and frame timing on this device', async ({ page }) => {
  await page.goto('/'); await nav(page, '策略竞技').click();
  await page.getByLabel('运行速度').fill('30');
  await page.evaluate(() => {
    const measurements = { frames: [] as number[], inputs: [] as number[], last: performance.now(), running: true };
    Object.assign(window, { snakeQaMeasurements: measurements });
    const frame = (now: number) => { if (!measurements.running) return; measurements.frames.push(now - measurements.last); measurements.last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    document.addEventListener('click', () => { const start = performance.now(); requestAnimationFrame(() => measurements.inputs.push(performance.now() - start)); });
  });
  await page.getByRole('button', { name: '开始运行', exact: true }).click();
  for (let i = 0; i < 30; i++) await page.getByRole('checkbox', { name: '显示搜索过程' }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const measurements = await page.evaluate(() => {
    const data = (window as unknown as { snakeQaMeasurements: { frames: number[]; inputs: number[]; running: boolean } }).snakeQaMeasurements;
    data.running = false;
    const percentile = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return { frameP95Ms: percentile(data.frames.slice(2)), inputToNextFrameP95Ms: percentile(data.inputs), frameCount: data.frames.length, inputCount: data.inputs.length, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, renderer: extension ? gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable', viewport: [innerWidth, innerHeight] };
  });
  await test.info().attach('hp-performance', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  console.log(`HP_PERFORMANCE ${JSON.stringify(measurements)}`);
  await page.screenshot({ path: test.info().outputPath('arena-performance.png'), fullPage: true });
});
