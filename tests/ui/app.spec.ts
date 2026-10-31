import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('siyuan-todo-v1', JSON.stringify({ version: 1, tasks: [] })));
  await page.reload();
});
async function create(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('main').getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByRole('textbox', { name: '任务标题', exact: true }).fill(title);
  await page.getByRole('textbox', { name: '具体细节', exact: true }).fill('先想清楚，再慢慢完成。');
  await page.getByRole('combobox', { name: '截止提醒', exact: true }).selectOption('none');
  await page.getByRole('button', { name: '创建待办', exact: true }).click();
  await expect(page.getByRole('button', { name: title, exact: true }).first()).toBeVisible();
}
test('创建、编辑、完成、恢复与刷新后持久化', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await create(page, '写一份清晰的计划');
  await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('完成今天的计划');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('checkbox', { name: '完成：完成今天的计划', exact: true }).click();
  await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible();
  await page.locator('.task-filters').getByRole('button', { name: /已完成/ }).click();
  await expect(page.getByRole('checkbox', { name: '取消完成：完成今天的计划' })).toBeChecked();
  await page.getByRole('checkbox', { name: '取消完成：完成今天的计划' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '完成今天的计划', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '编辑：完成今天的计划', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '具体细节' })).toHaveValue('先想清楚，再慢慢完成。');
  await page.getByRole('button', { name: /任务记录/ }).click();
  await expect(page.getByText('重新打开了待办', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('年、月、周、日和跨年导航均有实际内容', async ({ page }) => {
  await page.getByRole('tab', { name: '年', exact: true }).click();
  await expect(page.locator('.mini-month')).toHaveCount(12);
  await page.getByRole('button', { name: '下一时段' }).click();
  await expect(page.locator('.calendar-navigation h2')).toContainText(String(new Date().getFullYear() + 1));
  await page.getByRole('tab', { name: '月', exact: true }).click();
  expect(await page.locator('.month-cell').count()).toBeGreaterThanOrEqual(28);
  await page.getByRole('tab', { name: '周', exact: true }).click();
  await expect(page.locator('.agenda-day')).toHaveCount(7);
  await page.getByRole('tab', { name: '日', exact: true }).click();
  await expect(page.locator('.agenda-day')).toHaveCount(1);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.locator('.agenda-day')).toHaveClass(/agenda-today/);
});
test('时间选择器可以滚动并选择具体分钟，错误区间不会保存', async ({ page }) => {
  await page.getByRole('main').getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByRole('textbox', { name: '任务标题' }).fill('分钟选择');
  await page.getByRole('button', { name: '选择开始时间', exact: true }).click();
  await page.getByRole('textbox', { name: '开始时间日期' }).fill('2026-10-26');
  await page.getByRole('listbox', { name: '开始时间小时' }).getByRole('option', { name: '15', exact: true }).click();
  await page.getByRole('listbox', { name: '开始时间分钟' }).getByRole('option', { name: '37', exact: true }).click();
  await page.getByRole('listbox', { name: '开始时间分钟' }).evaluate(el => { el.scrollTop = 42 * 32; });
  await expect(page.getByRole('listbox', { name: '开始时间分钟' }).getByRole('option', { name: '42', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '确定时间' }).click();
  await expect(page.getByRole('button', { name: '选择开始时间' })).toContainText('2026-10-26 15:42');
  await page.getByRole('button', { name: '选择结束时间', exact: true }).click();
  await page.getByRole('textbox', { name: '结束时间日期' }).fill('2026-10-25');
  await page.getByRole('button', { name: '确定时间' }).click();
  await page.getByRole('button', { name: '创建待办', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('结束时间需要晚于开始时间');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('siyuan-todo-v1')!).tasks.length)).toBe(0);
});
test('任务导出往返、导入去重以及损坏 JSON 不会覆盖数据', async ({ page }) => {
  await create(page, '备份我的小计划');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.locator('.action-menu').getByRole('button', { name: '导出', exact: true }).click();
  const download = await downloadPromise; const path = await download.path();
  const contents = await readFile(path!, 'utf8');
  expect(JSON.parse(contents).tasks[0].title).toBe('备份我的小计划');
  await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
  await expect(page.getByRole('dialog')).toContainText('准备导入');
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('siyuan-todo-v1')!).tasks.length)).toBe(1);
  await page.getByTestId('import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('JSON 文件无法解析');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('siyuan-todo-v1')!).tasks.length)).toBe(1);
});
test('草稿切换保留且关闭前确认，删除同样需要确认', async ({ page }) => {
  await create(page, '稍后再想');
  await page.getByRole('textbox', { name: '任务标题' }).fill('未保存的标题');
  await page.getByRole('tab', { name: '月', exact: true }).click();
  await page.getByRole('tab', { name: '稍后再想', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('未保存的标题');
  await page.getByRole('button', { name: '关闭标签 稍后再想' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('还有未保存的修改');
  await page.getByRole('button', { name: '放弃修改' }).click();
  await page.getByRole('button', { name: '编辑：稍后再想' }).click();
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('稍后再想');
  await page.getByRole('button', { name: '删除待办', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('删除这件待办');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('.task-cards .task-card')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.task-cards .task-card')).toHaveCount(0);
});
test('提醒在时间到达后触发并写入标记，刷新不重复', async ({ page }) => {
  await create(page, '到了该行动的时候');
  await page.evaluate(() => {
    const file = JSON.parse(localStorage.getItem('siyuan-todo-v1')!);
    const now = Date.now();
    Object.assign(file.tasks[0], { start: new Date(now - 60000).toISOString(), end: new Date(now - 1000).toISOString(), remindMinutes: 0, remindStart: false, notified: [] });
    localStorage.setItem('siyuan-todo-v1', JSON.stringify(file));
  });
  await page.reload();
  await expect(page.getByRole('status')).toContainText('任务已到截止时间');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('siyuan-todo-v1')!).tasks[0].notified.length)).toBe(1);
  await page.reload();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('存储读取失败时显示错误并阻止新建', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('siyuan-todo-v1', '{bad-json'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('读取任务失败');
  await expect(page.getByRole('main').getByRole('button', { name: '新建待办', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('siyuan-todo-v1'))).toBe('{bad-json');
});
