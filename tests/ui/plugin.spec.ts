import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask, defaultDraft } from '../../src/model';
import { bootHost } from '../helpers/siyuan-host';

test('发布包可加载，原生侧栏和标签共享硬盘数据，并可卸载重启', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-native-')); const disk = join(dir, 'todos.json');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await bootHost(page, disk);
    await page.getByRole('button', { name: '新建待办任务', exact: true }).click();
    await page.getByRole('textbox', { name: '任务标题' }).fill('写入真正的 JSON 文件');
    await page.getByRole('combobox', { name: '截止提醒' }).selectOption('none');
    await page.getByRole('button', { name: '创建待办', exact: true }).click();
    await expect(page.locator('.stodo-dock .task-title')).toHaveText('写入真正的 JSON 文件');
    expect(JSON.parse(await readFile(disk, 'utf8')).tasks[0].title).toBe('写入真正的 JSON 文件');
    await expect(page.locator('.editor-tab-item')).toHaveCount(1);
    await page.getByRole('checkbox', { name: '完成：写入真正的 JSON 文件' }).click();
    await expect(page.getByRole('button', { name: '已完成', exact: true })).toBeVisible();
    await page.evaluate(async () => { const sdk = (window as any).sdk; await sdk.instance.onunload(); await sdk.boot(); });
    await page.locator('.task-filters').getByRole('button', { name: /已完成/ }).click();
    await expect(page.getByRole('checkbox', { name: '取消完成：写入真正的 JSON 文件' })).toBeChecked();
    await page.locator('.stodo-dock .task-title').click();
    await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('写入真正的 JSON 文件');
    await page.getByRole('button', { name: '新建待办任务' }).click();
    await expect(page.locator('.editor-tab-item')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});

test('原生文件损坏时保持文件内容，页面可见错误并阻止新建', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-corrupt-')); const disk = join(dir, 'todos.json');
  try {
    await writeFile(disk, '{corrupt-file');
    await bootHost(page, disk);
    await page.getByRole('button', { name: '打开日程总览' }).click();
    await expect(page.getByRole('alert')).toContainText('读取任务失败');
    await expect(page.getByRole('main').getByRole('button', { name: '新建待办', exact: true })).toBeDisabled();
    expect(await readFile(disk, 'utf8')).toBe('{corrupt-file');
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});

test('原生插件在断网时保存文件，侧栏与标签即时跟随思源的暗黑主题', async ({ page, context }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-offline-')); const disk = join(dir, 'todos.json');
  const external: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') external.push(url.href);
  });
  try {
    await bootHost(page, disk);
    await page.evaluate(() => {
      document.documentElement.dataset.themeMode = 'dark';
      document.documentElement.style.setProperty('--b3-theme-background', '#101a15');
      document.documentElement.style.setProperty('--b3-theme-surface', '#18251e');
    });
    await expect.poll(() => page.locator('.stodo-app').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(16, 26, 21)');
    await expect.poll(() => page.locator('.task-sidebar').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(24, 37, 30)');
    await context.setOffline(true);
    await page.getByRole('button', { name: '新建待办任务' }).click();
    await page.getByRole('textbox', { name: '任务标题' }).fill('断网运行的本地待办');
    await page.getByRole('combobox', { name: '截止提醒' }).selectOption('none');
    await page.getByRole('button', { name: '创建待办', exact: true }).click();
    await expect(page.locator('.stodo-dock .task-title')).toHaveText('断网运行的本地待办');
    expect(JSON.parse(await readFile(disk, 'utf8')).tasks[0].title).toBe('断网运行的本地待办');
    expect(external).toEqual([]);
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});

test('原生插件改名后迁移旧任务到新文件，保留旧文件', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-migrate-')); const disk = join(dir, 'todos.json'), legacy = join(dir, 'previous.json');
  const original = { version: 1, tasks: [createTask({ ...defaultDraft(), title: '上一版留下的计划', remindMinutes: null })] };
  try {
    await writeFile(legacy, JSON.stringify(original));
    await bootHost(page, disk, legacy);
    await expect(page.locator('.stodo-dock .task-title')).toHaveText('上一版留下的计划');
    expect(JSON.parse(await readFile(disk, 'utf8'))).toEqual(original);
    expect(JSON.parse(await readFile(legacy, 'utf8'))).toEqual(original);
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});
