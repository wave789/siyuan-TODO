import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask, defaultDraft, type TaskColor } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

// Deliberately use custom colors that differ from the categories. Check the
// compiled installation package, not just the Vite source or inherited SVG color.
const cases: { key: string; category: string; title: string; color: TaskColor; completed?: boolean }[] = [
  { key: 'work', category: '工作', title: '完成工作计划', color: 'blue' },
  { key: 'study', category: '学习', title: '阅读并整理重点', color: 'sage' },
  { key: 'life', category: '生活', title: '安排一次散步', color: 'amber' },
  { key: 'completed', category: '学习', title: '已完成的学习记录', color: 'violet', completed: true },
];

for (const theme of ['light', 'dark']) {
  test(`发布包 ${theme} 周日标题为实心竖条，分类色匹配图例且日期不是圆点，完成后可恢复分类色`, async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'stodo-markers-'));
    try {
      await page.clock.setFixedTime(new Date('2026-10-26T10:00:00+08:00'));
      const tasks = cases.map((item, index) => {
        const task = createTask({ ...defaultDraft(), title: item.title, category: item.category, color: item.color,
          start: `2026-10-26T${String(8 + index).padStart(2, '0')}:00:00+08:00`,
          end: `2026-10-26T${String(9 + index).padStart(2, '0')}:00:00+08:00`,
          remindMinutes: null, remindStart: false }, '2026-10-25T09:00:00+08:00');
        return { ...task, completed: !!item.completed, completedAt: item.completed ? '2026-10-26T09:30:00+08:00' : null };
      });
      const file = join(dir, 'todos.json');
      await writeFile(file, JSON.stringify({ version: 1, tasks }));
      await bootHost(page, file);
      await page.evaluate(mode => { document.documentElement.dataset.themeMode = mode; }, theme);
      // A host theme can fill SVGs. The category marker must remain a solid CSS
      // bar and the separate date symbol must keep its calendar outline.
      await page.addStyleTag({ content: 'svg { fill: currentColor; }' });
      for (const view of ['周', '日']) {
        await page.getByRole('tab', { name: view, exact: true }).click();
        for (const item of cases) {
          const card = page.locator('.agenda-task').filter({ hasText: item.title });
          const marker = card.locator('.agenda-task-marker');
          const sample = page.locator(`.calendar-legend .calendar-marker-${item.key} ${item.key === 'completed' ? 'svg' : '.legend-dot'}`);
          const expected = await sample.evaluate((el, completed) => completed ? getComputedStyle(el).color : getComputedStyle(el).backgroundColor, !!item.completed);
          await expect(marker).toHaveCSS('background-color', expected);
          await expect(marker).toHaveCSS('opacity', '1');
          await expect(card).toHaveCSS('opacity', '1');
          const box = await marker.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.height).toBeGreaterThan(box!.width * 3);
          await expect(card.locator('.agenda-task-title > svg')).toHaveCount(0);
          await expect(card.locator('.agenda-task-time > svg[data-todo-icon="CalendarDays"]')).toHaveCSS('fill', 'none');
          await expect(card.locator('.agenda-task-time circle')).toHaveCount(0);
        }
        await mkdir('artifacts', { recursive: true });
        await page.locator('.agenda-task').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `artifacts/v1.1.5-native-${theme}-${view === '周' ? 'week' : 'day'}.png` });
      }
      await page.getByRole('checkbox', { name: '完成：完成工作计划', exact: true }).click();
      const workMarker = page.locator('.agenda-task').filter({ hasText: '完成工作计划' }).locator('.agenda-task-marker');
      const completedColor = await page.locator('.calendar-legend .legend-completed').evaluate(el => getComputedStyle(el).color);
      await expect(workMarker).toHaveCSS('background-color', completedColor);
      await page.locator('.task-filters').getByRole('button', { name: /已完成/ }).click();
      await page.getByRole('checkbox', { name: '取消完成：完成工作计划', exact: true }).click();
      const workColor = await page.locator('.calendar-legend .calendar-marker-work .legend-dot').evaluate(el => getComputedStyle(el).backgroundColor);
      await expect(workMarker).toHaveCSS('background-color', workColor);
    } finally {
      await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}
