import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask, defaultDraft, type TaskColor } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

const cases: { key: string; category: string; title: string; color: TaskColor; end: string; completed?: boolean }[] = [
  { key: 'work', category: '工作', title: '逾期后完成的工作', color: 'blue', end: '2026-10-27T18:00:00+08:00' },
  { key: 'study', category: '学习', title: '继续学习', color: 'sage', end: '2026-10-28T18:00:00+08:00' },
  { key: 'life', category: '生活', title: '生活计划', color: 'amber', end: '2026-10-29T18:00:00+08:00' },
  { key: 'completed', category: '生活', title: '按时完成的任务', color: 'blue', end: '2026-10-27T18:00:00+08:00', completed: true },
];

for (const theme of ['light', 'dark']) {
  test(`发布包 ${theme} 卡片和勾选框匹配图例，逾期完成时长保存后固定，重开和再次完成会更新`, async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'stodo-card-'));
    try {
      await page.setViewportSize({ width: 1440, height: 1400 });
      await page.clock.setFixedTime(new Date('2026-10-27T20:30:00+08:00'));
      const tasks = cases.map(item => {
        const task = {
          ...createTask({ ...defaultDraft(), title: item.title, category: item.category, color: item.color,
            start: '2026-10-27T09:00:00+08:00', end: item.end, remindMinutes: null, remindStart: false }),
          completed: !!item.completed, completedAt: item.completed ? '2026-10-27T17:30:00+08:00' : null,
        };
        if (task.completedAt) task.history.push({ at: task.completedAt, action: 'completed' });
        return task;
      });
      const file = join(dir, 'todos.json'); await writeFile(file, JSON.stringify({ version: 1, tasks }));
      await bootHost(page, file, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
      await page.evaluate(mode => { document.documentElement.dataset.themeMode = mode; }, theme);
      await page.locator('.task-filters').getByRole('button', { name: /全部/ }).click();
      const card = (title: string) => page.locator('.stodo-dock .task-card').filter({ has: page.locator('.task-title', { hasText: title }) });
      for (const item of cases) {
        const sample = page.locator(`.calendar-legend .calendar-marker-${item.key} ${item.completed ? 'svg' : '.legend-dot'}`);
        const expected = await sample.evaluate((el, completed) => completed ? getComputedStyle(el).color : getComputedStyle(el).backgroundColor, !!item.completed);
        const current = card(item.title);
        await expect(current).toHaveCSS('border-top-color', expected);
        await expect(current.locator('.task-checkbox')).toHaveCSS('border-top-color', expected);
        await expect(current).toHaveCSS('opacity', '1');
        await current.hover();
        await expect(current).toHaveCSS('border-top-color', expected);
        if (item.completed) await expect(current.locator('.task-status')).toHaveText('已完成');
      }
      const work = card(cases[0].title);
      await expect(work.locator('.task-status')).toHaveText('已逾期');
      await work.getByRole('checkbox').click();
      await expect(work.locator('.task-status')).toHaveText('逾期 2.5 小时完成');
      const gray = await page.locator('.calendar-legend .legend-completed').evaluate(el => getComputedStyle(el).color);
      await expect(work).toHaveCSS('border-top-color', gray);
      await expect(work.locator('.task-checkbox')).toHaveCSS('background-color', gray);
      let saved = JSON.parse(await readFile(file, 'utf8')).tasks.find((task: { id: string }) => task.id === tasks[0].id);
      expect(saved.completedAt).toBe('2026-10-27T12:30:00.000Z');
      const record = page.locator('.task-record:visible');
      await work.locator('.task-title').click();
      await record.getByRole('button', { name: /任务记录/ }).click();
      await expect(record.locator('ol > li > span')).toHaveText(['逾期完成了这件待办', '创建了这件待办']);
      await card(cases[3].title).locator('.task-title').click();
      await record.getByRole('button', { name: /任务记录/ }).click();
      await expect(record.locator('ol > li > span')).toHaveText(['完成了这件待办', '创建了这件待办']);
      await mkdir('artifacts', { recursive: true });
      await page.locator('.stodo-dock').screenshot({ path: `artifacts/v1.2.3-${theme}-cards.png` });
      await page.clock.setFixedTime(new Date('2026-10-28T23:30:00+08:00'));
      await page.evaluate(async () => { const sdk = (window as any).sdk; await sdk.instance.onunload(); await sdk.boot(); });
      await page.locator('.task-filters').getByRole('button', { name: /全部/ }).click();
      await expect(work.locator('.task-status')).toHaveText('逾期 2.5 小时完成');
      await work.getByRole('checkbox').click();
      await expect(work.locator('.task-status')).toHaveText('已逾期');
      const green = await page.locator('.calendar-legend .calendar-marker-work .legend-dot').evaluate(el => getComputedStyle(el).backgroundColor);
      await expect(work).toHaveCSS('border-top-color', green);
      await expect(work.locator('.task-checkbox')).toHaveCSS('border-top-color', green);
      await page.clock.setFixedTime(new Date('2026-10-29T00:30:00+08:00'));
      await work.getByRole('checkbox').click();
      await expect(work.locator('.task-status')).toHaveText('逾期 30.5 小时完成');
      saved = JSON.parse(await readFile(file, 'utf8')).tasks.find((task: { id: string }) => task.id === tasks[0].id);
      expect(saved.completedAt).toBe('2026-10-28T16:30:00.000Z');
      await work.locator('.task-title').click();
      await record.getByRole('button', { name: /任务记录/ }).click();
      await expect(record.locator('ol > li > span')).toHaveText([
        '逾期完成了这件待办', '重新打开了待办', '逾期完成了这件待办', '创建了这件待办',
      ]);
      // A narrower dock should wrap the longer completion label, without
      // overlapping the existing time-progress text or stretching the card.
      await page.locator('.stodo-dock').evaluate(el => { el.style.width = '250px'; });
      const fits = await work.locator('.task-progress-info').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
      expect(fits).toBe(true);
      const spans = work.locator('.task-progress-info > span');
      const left = await spans.nth(0).boundingBox(), right = await spans.nth(1).boundingBox();
      expect(left!.x + left!.width <= right!.x + 1 || left!.y + left!.height <= right!.y + 1).toBe(true);
    } finally {
      await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}
