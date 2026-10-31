import { test, expect, type Locator } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTask, defaultDraft } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

async function expectProgress(card: Locator, percent: number, fill: string) {
  const track = card.getByRole('progressbar');
  await expect(track).toHaveAttribute('aria-valuenow', String(percent));
  await expect(card.locator('.task-progress-info b')).toHaveText(`${percent}%`);
  await expect(track.locator('span')).toHaveCSS('background-color', fill);
  const background = await track.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(fill).not.toBe(background);
  await expect.poll(async () => {
    const box = await track.boundingBox(), filled = await track.locator('span').boundingBox();
    return Math.round(filled!.width / box!.width * 100);
  }).toBe(percent);
}

for (const theme of ['light', 'dark']) {
  test(`发布包 ${theme} 完成时保留50%可见进度，重启后不增长，取消完成后继续计算`, async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'stodo-progress-'));
    try {
      await page.clock.setFixedTime(new Date('2026-10-27T13:00:00+08:00'));
      const title = '用一半时间完成的任务', lateTitle = '逾期才完成的任务';
      const tasks = [
        createTask({ ...defaultDraft(), title, start: '2026-10-27T09:00:00+08:00', end: '2026-10-27T17:00:00+08:00', color: 'blue', remindMinutes: null, remindStart: false }),
        createTask({ ...defaultDraft(), title: lateTitle, start: '2026-10-27T07:00:00+08:00', end: '2026-10-27T09:00:00+08:00', color: 'violet', remindMinutes: null, remindStart: false }),
      ];
      const file = join(dir, 'todos.json'); await writeFile(file, JSON.stringify({ version: 1, tasks }));
      await bootHost(page, file, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
      await page.evaluate(mode => { document.documentElement.dataset.themeMode = mode; }, theme);
      await page.locator('.task-filters').getByRole('button', { name: /全部/ }).click();
      const card = page.locator('.stodo-dock .task-card').filter({ has: page.locator('.task-title', { hasText: title }) });
      const lateCard = page.locator('.stodo-dock .task-card').filter({ has: page.locator('.task-title', { hasText: lateTitle }) });
      const fill = await card.locator('.task-progress > span').evaluate(el => getComputedStyle(el).backgroundColor);
      const lateFill = await lateCard.locator('.task-progress > span').evaluate(el => getComputedStyle(el).backgroundColor);
      await expectProgress(card, 50, fill);
      await card.getByRole('checkbox').click();
      await expect(card.locator('.task-status')).toHaveText('已完成');
      await expectProgress(card, 50, fill);
      await lateCard.getByRole('checkbox').click();
      await expect(lateCard.locator('.task-status')).toHaveText('逾期 4 小时完成');
      await expectProgress(lateCard, 100, lateFill);
      const saved = JSON.parse(await readFile(file, 'utf8')).tasks.find((task: { id: string }) => task.id === tasks[0].id);
      expect(saved.completedAt).toBe('2026-10-27T05:00:00.000Z');
      await card.locator('.task-title').click();
      await expect(page.locator('.editor-progress strong')).toHaveText('50%');
      await mkdir('artifacts', { recursive: true });
      await page.locator('.stodo-dock').screenshot({ path: `artifacts/v1.2.4-${theme}-progress.png` });
      await page.clock.setFixedTime(new Date('2026-10-27T15:00:00+08:00'));
      await page.evaluate(async () => { const sdk = (window as any).sdk; await sdk.instance.onunload(); await sdk.boot(); });
      await page.locator('.task-filters').getByRole('button', { name: /全部/ }).click();
      await expectProgress(card, 50, fill);
      await card.locator('.task-title').click();
      await expect(page.locator('.editor-progress strong')).toHaveText('50%');
      await card.getByRole('checkbox').click();
      await expectProgress(card, 75, fill);
      await expect(page.locator('.editor-progress strong')).toHaveText('75%');
      await card.getByRole('checkbox').click();
      await expectProgress(card, 75, fill);
      await page.clock.setFixedTime(new Date('2026-10-28T20:00:00+08:00'));
      await page.evaluate(async () => { const sdk = (window as any).sdk; await sdk.instance.onunload(); await sdk.boot(); });
      await page.locator('.task-filters').getByRole('button', { name: /全部/ }).click();
      await expectProgress(card, 75, fill);
      await expectProgress(lateCard, 100, lateFill);
    } finally {
      await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}
