import { test, expect } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`home autoplays with ${reducedMotion}, independent of lab settings, and preserves pause`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => localStorage.setItem('snake-lab-play-v1', JSON.stringify({ strategy: 'bfs', size: 12, seed: 7, speed: 8, manual: false, obstacles: false, completionBudget: true, overlay: true })));
    const hero = page.locator('.brand-hero .brand-live');
    const advances = async () => {
      await expect(hero).toHaveAttribute('data-running', 'true');
      const before = await hero.getAttribute('data-steps');
      await expect(hero).not.toHaveAttribute('data-steps', before!);
    };
    await page.goto('/');
    await advances();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');
    if (reducedMotion === 'reduce') {
      await expect(hero.locator('.signal')).toHaveCSS('animation-name', 'none');
      await expect(hero.locator('button').first()).toHaveCSS('transition-duration', '0s');
    }
    await page.reload();
    await advances();
    await page.evaluate(() => { location.hash = '/lab'; });
    await expect(page.getByTestId('game-lab')).toBeVisible();
    await expect(page.getByRole('button', { name: '开始运行', exact: true })).toBeVisible();
    await page.evaluate(() => { location.hash = ''; });
    await advances();
    await page.locator('.brand-final').scrollIntoViewIfNeeded();
    await expect(hero).toHaveAttribute('data-running', 'false');
    await hero.scrollIntoViewIfNeeded();
    await advances();
    const visibility = async (hidden: boolean) => page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await visibility(true);
    await expect(hero).toHaveAttribute('data-running', 'false');
    const stopped = await hero.getAttribute('data-steps');
    await page.waitForTimeout(200);
    await expect(hero).toHaveAttribute('data-steps', stopped!);
    await visibility(false);
    await advances();
    await hero.locator('button').first().click();
    const paused = await hero.getAttribute('data-steps');
    await visibility(true); await visibility(false);
    await page.emulateMedia({ reducedMotion: reducedMotion === 'reduce' ? 'no-preference' : 'reduce' });
    await page.waitForTimeout(200);
    await expect(hero).toHaveAttribute('data-running', 'false');
    await expect(hero).toHaveAttribute('data-steps', paused!);
    await hero.locator('button').first().click();
    await advances();
  });
}
