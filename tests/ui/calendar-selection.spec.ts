import { test, expect, type Page } from '@playwright/test';
import { createTask, defaultDraft, type Task } from '../../src/model';

const targetDay = '2026-10-27';
const emptyDay = '2026-10-29';
const expectedOrder = ['跨日事项', '已完成的晨间任务', '上午计划', '午后阅读', '傍晚整理'];

function fixtureTasks(): Task[] {
  const make = (title: string, start: string, end: string, completed = false, category = '工作') => {
    const task = createTask({ ...defaultDraft(), title, start, end, category, remindMinutes: null, remindStart: false }, '2026-10-25T00:00:00+08:00');
    return { ...task, completed, completedAt: completed ? '2026-10-27T08:15:00+08:00' : null };
  };
  return [
    make('傍晚整理', '2026-10-27T18:00:00+08:00', '2026-10-27T19:00:00+08:00'),
    make('上午计划', '2026-10-27T09:00:00+08:00', '2026-10-27T10:00:00+08:00'),
    make('跨日事项', '2026-10-26T23:00:00+08:00', '2026-10-27T11:00:00+08:00'),
    make('午后阅读', '2026-10-27T13:00:00+08:00', '2026-10-27T14:00:00+08:00', false, '生活'),
    make('已完成的晨间任务', '2026-10-27T08:00:00+08:00', '2026-10-27T08:30:00+08:00', true),
    make('其他日期任务', '2026-10-28T09:00:00+08:00', '2026-10-28T10:00:00+08:00'),
  ];
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T10:00:00+08:00'));
  await page.goto('/');
  await page.evaluate(tasks => localStorage.setItem('siyuan-todo-v1', JSON.stringify({ version: 1, tasks })), fixtureTasks());
  await page.reload();
});

async function selectBlank(page: Page, view: string, date: string) {
  if (view === '年') {
    await page.locator('.mini-days').getByRole('button', { name: `选择 ${date}`, exact: true }).click();
  } else {
    const cell = page.locator(`${view === '月' ? '.month-cell' : '.agenda-day'}[data-date="${date}"]`);
    const box = await cell.boundingBox();
    expect(box).not.toBeNull();
    await cell.click({ position: { x: box!.width - 6, y: box!.height - 6 } });
  }
}

for (const view of ['年', '月', '周']) {
  test(`${view}视图空白选日保留视图，完整列出含跨日和已完成的有序任务，空日期不会新建`, async ({ page }) => {
    await page.getByRole('tab', { name: view, exact: true }).click();
    await selectBlank(page, view, targetDay);
    const panel = page.getByRole('region', { name: '所选日期待办' });
    await expect(panel).toHaveAttribute('data-selected-date', targetDay);
    await expect(page.getByRole('tab', { name: view, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('.overview-task-copy > strong')).toHaveText(expectedOrder);
    await expect(panel.locator('.overview-task-number')).toHaveText(['1.', '2.', '3.', '4.', '5.']);
    await expect(panel).toContainText('5 件小事，按自己的节奏完成。');
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveCount(0);
    // Calendar-only filters must not hide tasks from the requested full-day list.
    await page.getByRole('combobox', { name: '日历分类筛选' }).selectOption('生活');
    await page.getByRole('button', { name: '隐藏已完成任务' }).click();
    await expect(panel.locator('.overview-task-copy > strong')).toHaveText(expectedOrder);
    await selectBlank(page, view, emptyDay);
    await expect(panel).toHaveAttribute('data-selected-date', emptyDay);
    await expect(panel).toContainText('0 件小事，按自己的节奏完成。');
    await expect(panel.getByRole('list')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: view, exact: true })).toHaveAttribute('aria-selected', 'true');
  });
}

test('点击月、周任务打开编辑，不会改变之前选中的日期；序号清单也可以打开任务', async ({ page }) => {
  for (const view of ['月', '周']) {
    await page.getByRole('tab', { name: view, exact: true }).click();
    await selectBlank(page, view, targetDay);
    const container = page.locator(`${view === '月' ? '.month-cell' : '.agenda-day'}[data-date="2026-10-28"]`);
    await container.getByRole('button', { name: /其他日期任务/ }).click();
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('其他日期任务');
    await page.getByRole('tab', { name: '日程总览', exact: true }).click();
    await expect(page.getByRole('region', { name: '所选日期待办' })).toHaveAttribute('data-selected-date', targetDay);
  }
  await page.getByRole('region', { name: '所选日期待办' }).getByRole('button', { name: /午后阅读/ }).click();
  await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('午后阅读');
});
