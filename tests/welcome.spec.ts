import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('first lab visit autostarts under production CSP and preserves pause and restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto('/#/lab');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self';");
  expect(csp).not.toContain("'unsafe-eval'");
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('决策策略')).toHaveValue('hamiltonian-shortcut');
  const board = page.locator('.board-canvas');
  await expect(board).not.toHaveAttribute('aria-label', /步数 0$/);
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeInViewport();
  await expect(board).toBeInViewport({ ratio: test.info().project.name.includes('mobile') ? 0.75 : 0.35 });
  mkdirSync('docs/qa/welcome', { recursive: true });
  await page.screenshot({ path: `docs/qa/welcome/${test.info().project.name}-first-viewport.png` });
  await page.screenshot({ path: `docs/qa/welcome/${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await board.getAttribute('aria-label');
  await page.waitForTimeout(250);
  expect(await board.getAttribute('aria-label')).toBe(paused);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '重开', exact: true }).click();
  await expect(board).toHaveAttribute('aria-label', /步数 0$/);
  await page.waitForTimeout(150);
  await expect(board).toHaveAttribute('aria-label', /步数 0$/);
  expect(errors).toEqual([]);
});

test('long-running real demo fills the board and verifies the exact replay hash', async ({ page }) => {
  // Published CI reached step 534/675 before the old 90s whole-test limit.
  // Software WebGL renderers can delay real-time ticks; this is not an engine step budget.
  test.setTimeout(240000);
  const started = Date.now();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/#/lab');
  const csp = response!.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self';");
  expect(csp).not.toContain("'unsafe-eval'");
  const board = page.locator('.board-canvas');
  await expect(board).not.toHaveAttribute('aria-label', /步数 0$/);
  const first = await board.getAttribute('aria-label');
  await expect(board).not.toHaveAttribute('aria-label', first!, {timeout:15000});
  mkdirSync('docs/qa/welcome', { recursive: true });
  await expect(page.locator('.end-banner')).toContainText('填满棋盘，胜利！', { timeout: 210000 });
  await expect(board).toHaveAttribute('aria-label', /得分 61，步数 675$/);
  const terminal = await board.getAttribute('aria-label');
  await page.waitForTimeout(250);
  expect(await board.getAttribute('aria-label')).toBe(terminal);
  await page.screenshot({ path: `docs/qa/welcome/${test.info().project.name}-filled.png`, fullPage: true });
  await page.getByRole('button', { name: '查看本局回放' }).click();
  const progress = page.getByLabel('回放进度');
  const steps = await progress.getAttribute('max');
  expect(steps).toBe('675');
  await progress.fill(steps!);
  await expect(page.locator('.board-canvas')).toHaveAttribute('aria-label', new RegExp(`得分 61，步数 ${steps}`));
  await expect(page.locator('.hash-value')).toHaveText('19e52bf6');
  expect(errors).toEqual([]);
  writeFileSync(`docs/qa/welcome/${test.info().project.name}.json`, JSON.stringify({ project: test.info().project.name, viewport: page.viewportSize(), elapsedMs: Date.now()-started, csp, steps: Number(steps), score: 61, filledCells: 64, replayHash: '19e52bf6', consoleErrors: errors }, null, 2));
});

test('switching strategy, returning preferences and explicit routes keep user control', async ({ page }) => {
  await page.goto('/#/lab');
  await page.getByLabel('决策策略').selectOption('bfs');
  await expect(page.getByRole('button', { name: '开始运行', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('决策策略')).toHaveValue('bfs');
  await expect(page.locator('.board-canvas')).toHaveAttribute('aria-label', /步数 0$/);
  await page.waitForTimeout(250);
  await expect(page.locator('.board-canvas')).toHaveAttribute('aria-label', /步数 0$/);
  await page.getByRole('button', { name: '手动游玩', exact: true }).click();
  await expect(page.getByRole('button', { name: '向上', exact: true })).toBeVisible();
  await page.goto('/#/lessons/astar');
  await expect(page.getByTestId('game-lab')).toHaveCount(0);
});

test('reduced motion starts the demonstration paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/lab');
  await expect(page.getByLabel('决策策略')).toHaveValue('hamiltonian-shortcut');
  await expect(page.getByRole('button', { name: '开始运行', exact: true })).toBeVisible();
  await expect(page.locator('.board-canvas')).toHaveAttribute('aria-label', /步数 0$/);
});

test('visibility events pause the demo until explicit resume', async ({ page }) => {
  await page.goto('/#/lab');
  const board = page.locator('.board-canvas');
  await expect(board).not.toHaveAttribute('aria-label', /步数 0$/);
  // Dispatch the browser visibility contract deterministically; exact timer counts
  // and StrictMode cleanup are additionally covered with fake timers in ui.test.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '开始运行', exact: true })).toBeVisible();
  const paused = await board.getAttribute('aria-label');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  expect(await board.getAttribute('aria-label')).toBe(paused);
  await page.getByRole('button', { name: '开始运行', exact: true }).click();
  await expect(board).not.toHaveAttribute('aria-label', paused!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: '开始运行', exact: true })).toBeVisible();
});
