import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootHost } from '../helpers/siyuan-host';

const cases = [
  { view: '周', date: '2027-01-01', next: false, label: '周视图跨年日期' },
  { view: '日', date: '2027-01-01', next: true, label: '日视图所选日期' },
  { view: '日', date: '2026-12-31', next: false, label: '当天深夜仍使用固定时间' },
];

for (const item of cases) {
  test(`发布包空状态新建：${item.label}，日期正确且保存为09:00至18:00`, async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'stodo-empty-create-'));
    try {
      await page.clock.setFixedTime(new Date('2026-12-31T22:45:37+08:00'));
      const file = join(dir, 'todos.json');
      await writeFile(file, JSON.stringify({ version: 1, tasks: [] }));
      await bootHost(page, file);
      await page.getByRole('tab', { name: item.view, exact: true }).click();
      if (item.next) await page.getByRole('button', { name: '下一时段', exact: true }).click();
      const day = page.locator(`.agenda-day[data-date="${item.date}"]`);
      await expect(day.locator('.agenda-empty-copy strong')).toHaveText('这一天还没有待办');
      await day.getByRole('button', { name: '点击新建待办', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '选择开始时间', exact: true })).toContainText(`${item.date} 09:00`);
      await expect(page.getByRole('button', { name: '选择结束时间', exact: true })).toContainText(`${item.date} 18:00`);
      const title = `${item.label}的待办`;
      await page.getByRole('textbox', { name: '任务标题', exact: true }).fill(title);
      await page.getByRole('combobox', { name: '截止提醒', exact: true }).selectOption('none');
      await page.getByRole('button', { name: '创建待办', exact: true }).click();
      await expect(page.locator('.stodo-dock .task-title')).toHaveText(title);
      const saved = JSON.parse(await readFile(file, 'utf8'));
      expect(saved.tasks).toHaveLength(1);
      expect(saved.tasks[0].start).toBe(new Date(`${item.date}T09:00:00+08:00`).toISOString());
      expect(saved.tasks[0].end).toBe(new Date(`${item.date}T18:00:00+08:00`).toISOString());
      await page.getByRole('tab', { name: '日程总览', exact: true }).click();
      await expect(page.getByRole('region', { name: '所选日期待办' })).toHaveAttribute('data-selected-date', item.date);
    } finally {
      await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}
