import { test, expect } from '@playwright/test';

test('home advances without interaction after refresh, route return and background recovery', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const hero = page.locator('.brand-hero .brand-live');
  const advances = async () => {
    await expect(hero).toHaveAttribute('data-running', 'true');
    const before = await hero.getAttribute('data-steps');
    await expect(hero).not.toHaveAttribute('data-steps', before!);
  };
  await page.goto('/');
  await advances();
  await page.reload();
  await advances();
  await page.evaluate(() => { location.hash = '/lab'; });
  await expect(page.getByTestId('game-lab')).toBeVisible();
  await page.evaluate(() => { location.hash = ''; });
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
  await visibility(true); await visibility(false);
  await expect(hero).toHaveAttribute('data-running', 'false');
  await hero.locator('button').first().click();
  await advances();
});

test('reduced motion explains static preview and allows explicit play without changing the system preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hero = page.locator('.brand-hero .brand-live');
  await expect(hero).toHaveAttribute('data-steps', '0');
  await expect(hero.locator('.brand-motion-note')).toBeVisible();
  const play = hero.locator('button').first();
  await expect(play).toBeEnabled();
  await play.click();
  await expect(hero).not.toHaveAttribute('data-steps', '0');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await play.click();
  const stopped = await hero.getAttribute('data-steps');
  await page.waitForTimeout(200);
  await expect(hero).toHaveAttribute('data-steps', stopped!);
  await play.click();
  await expect(hero).not.toHaveAttribute('data-steps', stopped!);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).toHaveAttribute('data-running', 'false');
  await page.reload();
  await expect(hero).toHaveAttribute('data-steps', '0');
  await expect(play).toBeEnabled();
});
