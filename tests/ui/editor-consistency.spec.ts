import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask, defaultDraft, type TaskFile } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

test('导入更新刷新未修改的编辑页，保留草稿并阻止旧草稿覆盖新版本', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-editor-refresh-'));
  const disk = join(dir, 'todos.json');
  const task = createTask({ ...defaultDraft(), title: '原始任务', remindMinutes: null }, '2026-10-25T00:00:00Z');
  const file: TaskFile = { version: 1, tasks: [task] };
  async function importTitle(title: string, updatedAt: string) {
    file.tasks[0] = { ...file.tasks[0], title, updatedAt };
    await page.getByTestId('import-file').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  try {
    await writeFile(disk, JSON.stringify(file));
    await bootHost(page, disk, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await page.locator('.stodo-dock .task-title').click();
    await importTitle('第一次导入的新标题', '2026-10-26T00:00:00Z');
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('第一次导入的新标题');
    await page.getByRole('textbox', { name: '具体细节', exact: true }).fill('我正在写的草稿');
    await importTitle('第二次导入的新标题', '2026-10-27T00:00:00Z');
    await expect(page.getByRole('textbox', { name: '具体细节', exact: true })).toHaveValue('我正在写的草稿');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(page.locator('.form-error')).toContainText('已在其他位置更新');
    expect(JSON.parse(await readFile(disk, 'utf8')).tasks[0].title).toBe('第二次导入的新标题');
    await expect(page.getByRole('textbox', { name: '具体细节', exact: true })).toHaveValue('我正在写的草稿');
    await page.getByRole('button', { name: '关闭标签 第二次导入的新标题', exact: true }).click();
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await page.locator('.stodo-dock .task-title').click();
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('第二次导入的新标题');
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});

test('慢保存时锁定表单，关闭工作区后保存回调不会干扰新工作区', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-editor-save-'));
  const disk = join(dir, 'todos.json'); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await bootHost(page, disk, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await page.route('**/api/file/putFile', async route => { await gate; await route.fallback(); });
    await page.getByRole('button', { name: '新建待办任务', exact: true }).click();
    await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('慢保存任务');
    await page.getByRole('combobox', { name: '截止提醒' }).selectOption('none');
    await page.getByRole('button', { name: '创建待办', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toBeDisabled();
    await page.evaluate(() => (window as any).sdk.closeWorkspace());
    await page.getByRole('button', { name: '打开日程总览', exact: true }).click();
    await expect(page.locator('.stodo-app')).toBeVisible();
    release();
    await expect(page.locator('.stodo-dock .task-title')).toHaveText('慢保存任务');
    await expect(page.locator('.editor-tab-item')).toHaveCount(0);
    await expect(page.locator('.sx-toast')).toHaveCount(0);
  } finally { release(); await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});
