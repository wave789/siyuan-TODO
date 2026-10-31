import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask, defaultDraft } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

const titles = ['计划甲', '计划乙', '计划丙'];
const fixture = () => ({ version: 1, tasks: titles.map(title => createTask({ ...defaultDraft(), title, details: `${title}原始详情`, remindMinutes: null, remindStart: false })) });

for (const replaceCurrent of [false, true]) {
  test(`侧栏连续打开任务保留同一个工作区、全部编辑标签及草稿，当前页签打开=${replaceCurrent}`, async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'stodo-tabs-'));
    const file = join(dir, 'todos.json');
    try {
      await writeFile(file, JSON.stringify(fixture()));
      await bootHost(page, file, undefined, { openFilesUseCurrentTab: replaceCurrent, pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
      const card = (title: string) => page.locator('.stodo-dock .task-title').filter({ hasText: title });
      const tabs = page.getByRole('tablist', { name: '打开的任务标签' });
      await card(titles[0]).click();
      await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue(titles[0]);
      await page.getByRole('textbox', { name: '具体细节', exact: true }).fill('甲的未保存内容');
      for (const title of titles.slice(1)) {
        await card(title).click();
        await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue(title);
      }
      await expect(tabs.locator('.editor-tab-item')).toHaveCount(3);
      for (const title of titles) await expect(tabs.getByRole('tab', { name: title, exact: true })).toHaveCount(1);
      expect(await page.evaluate(() => (window as any).sdk.nativeTabs.length)).toBe(1);
      await card(titles[0]).click();
      await expect(page.getByRole('textbox', { name: '具体细节', exact: true })).toHaveValue('甲的未保存内容');
      await expect(tabs.locator('.editor-tab-item')).toHaveCount(3);
      await page.getByRole('button', { name: '新建待办任务', exact: true }).click();
      await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('新的未保存待办');
      await card(titles[1]).click();
      await expect(tabs.locator('.editor-tab-item')).toHaveCount(4);
      await tabs.getByRole('tab', { name: '新建待办', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('新的未保存待办');
      await page.getByRole('button', { name: '打开日程总览', exact: true }).click();
      await expect(tabs.getByRole('tab', { name: '日程总览', exact: true })).toHaveAttribute('aria-selected', 'true');
      await card(titles[0]).click();
      await expect(page.getByRole('textbox', { name: '具体细节', exact: true })).toHaveValue('甲的未保存内容');
      await tabs.getByRole('button', { name: `关闭标签 ${titles[2]}`, exact: true }).click();
      await card(titles[2]).click();
      await expect(tabs.locator('.editor-tab-item')).toHaveCount(4);
      expect(await page.evaluate(() => (window as any).sdk.nativeTabs.length)).toBe(1);
      const disk = JSON.parse(await readFile(file, 'utf8'));
      expect(disk.tasks).toHaveLength(3);
      expect(disk.tasks.find((task: { title: string }) => task.title === titles[0]).details).toBe(`${titles[0]}原始详情`);
    } finally {
      await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('延迟初始化时快速打开多个卡片不丢请求，关闭工作区后仍可重新打开任务', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-tabs-delayed-'));
  try {
    const file = join(dir, 'todos.json'); await writeFile(file, JSON.stringify(fixture()));
    await bootHost(page, file, undefined, { tabInitDelayMs: 250, pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await page.locator('.stodo-dock .task-title').first().waitFor();
    await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.stodo-dock .task-title').forEach(button => button.click()));
    const tabs = page.getByRole('tablist', { name: '打开的任务标签' });
    await expect(tabs.locator('.editor-tab-item')).toHaveCount(3);
    expect(await page.evaluate(() => (window as any).sdk.nativeTabs.length)).toBe(1);
    await page.evaluate(() => (window as any).sdk.closeWorkspace());
    await expect(page.locator('.stodo-app')).toHaveCount(0);
    await page.locator('.stodo-dock .task-title').filter({ hasText: titles[1] }).click();
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue(titles[1]);
    await expect(tabs.locator('.editor-tab-item')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).sdk.nativeTabs.length)).toBe(1);
  } finally {
    await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
    await rm(dir, { recursive: true, force: true });
  }
});

test('恢复旧版带任务标识的工作区后，继续复用原工作区并保留草稿', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-tabs-restored-'));
  try {
    const file = join(dir, 'todos.json'), original = fixture();
    await writeFile(file, JSON.stringify(original));
    await bootHost(page, file, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await expect(page.locator('.stodo-app')).toBeVisible();
    await page.evaluate(async taskId => {
      const sdk = (window as any).sdk; sdk.closeWorkspace(); await sdk.restoreWorkspace({ taskId });
    }, original.tasks[0].id);
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue(titles[0]);
    await page.getByRole('textbox', { name: '具体细节', exact: true }).fill('恢复后继续编辑的草稿');
    await page.locator('.stodo-dock .task-title').filter({ hasText: titles[1] }).click();
    await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue(titles[1]);
    await page.locator('.stodo-dock .task-title').filter({ hasText: titles[0] }).click();
    await expect(page.getByRole('textbox', { name: '具体细节', exact: true })).toHaveValue('恢复后继续编辑的草稿');
    await expect(page.locator('.editor-tab-item')).toHaveCount(2);
    expect(await page.evaluate(() => (window as any).sdk.nativeTabs.length)).toBe(1);
  } finally {
    await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); });
    await rm(dir, { recursive: true, force: true });
  }
});
