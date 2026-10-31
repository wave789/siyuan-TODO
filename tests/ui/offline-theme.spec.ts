import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { latestRelease } from '../release';

test('思源主题即时切换，日历、编辑器、滚轮及弹窗均使用暗色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const scheme = () => page.locator('.stodo-app').evaluate(el => getComputedStyle(el).colorScheme);
  await expect.poll(scheme).toBe('dark');
  // Explicit host light mode overrides an OS dark preference.
  await page.evaluate(() => document.documentElement.dataset.themeMode = 'light');
  await expect.poll(scheme).toBe('light');
  await page.evaluate(() => document.documentElement.dataset.themeMode = 'dark');
  await expect.poll(scheme).toBe('dark');
  for (const selector of ['.stodo-app', '.task-sidebar', '.task-card', '.search-box', '.workspace-topbar', '.stat-item', '.calendar-panel', '.month-cell', '.calendar-event']) {
    const rgb = await page.locator(selector).first().evaluate(el => getComputedStyle(el).backgroundColor);
    const values = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    expect(Math.max(...values), `${selector}: ${rgb}`).toBeLessThan(115);
  }
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/dark-calendar.png' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  expect(await page.locator('.sx-modal').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(34, 42, 37)');
  await page.getByRole('button', { name: '关闭对话框' }).click();
  await page.getByRole('main').getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByRole('textbox', { name: '任务标题' }).fill('暗黑主题下也清晰的计划');
  await page.getByRole('button', { name: '选择开始时间' }).click();
  for (const selector of ['.title-field input', '.task-form textarea', '.date-trigger', '.date-popover', '.picker-date-label input']) {
    const rgb = await page.locator(selector).first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(Math.max(...rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number)), selector).toBeLessThan(115);
  }
  await page.screenshot({ path: 'artifacts/dark-editor.png' });
  // The same page must return to light colors without reloading or losing a draft.
  await page.evaluate(() => document.documentElement.dataset.themeMode = 'light');
  await expect.poll(scheme).toBe('light');
  await expect(page.getByRole('textbox', { name: '任务标题' })).toHaveValue('暗黑主题下也清晰的计划');
  await page.screenshot({ path: 'artifacts/light-editor.png' });
});

test('构建产物在断网状态下从本地资源加载，支持创建和备份且没有公网请求', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname !== '127.0.0.1') external.push(url.href);
  });
  await page.route('**/offline-preview/**', async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname.slice('/offline-preview/'.length)) || 'index.html';
    const root = resolve('dist-preview'), file = resolve(root, relative);
    if (!file.startsWith(`${root}/`)) { await route.abort(); return; }
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] || 'application/octet-stream' });
  });
  await page.route('**/icon.svg', route => route.fulfill({ path: 'dist-preview/icon.svg', contentType: 'image/svg+xml' }));
  await context.setOffline(true);
  await page.goto('/offline-preview/');
  await expect(page).toHaveTitle('siyuan-TODO');
  await expect(page.locator('[data-todo-icon="PluginIcon"]').first()).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByRole('textbox', { name: '任务标题' }).fill('完全断网也能保存');
  await page.getByRole('combobox', { name: '截止提醒' }).selectOption('none');
  await page.getByRole('button', { name: '创建待办', exact: true }).click();
  await expect(page.locator('.task-title').filter({ hasText: '完全断网也能保存' })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.locator('.action-menu').getByRole('button', { name: '导出', exact: true }).click();
  const file = await (await downloadEvent).path();
  expect(JSON.parse(await readFile(file!, 'utf8')).tasks.some((t: { title: string }) => t.title === '完全断网也能保存')).toBe(true);
  await page.reload();
  await expect(page.locator('.task-title').filter({ hasText: '完全断网也能保存' })).toBeVisible();
  expect(external).toEqual([]);
});

test('预览迁移上一版的本地任务，不再加载图标库', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T10:00:00+08:00'));
  await page.goto('/');
  await expect(page.locator('.task-card').first()).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem('siyuan-todo-v1'));
  await page.evaluate(file => { localStorage.clear(); localStorage.setItem('shixu-todos-v1', file!); }, original);
  await page.reload();
  // Migration validates and serializes tasks, so JSON property order may change.
  await expect.poll(() => page.evaluate(() => {
    const file = localStorage.getItem('siyuan-todo-v1');
    return file ? JSON.parse(file) : null;
  })).toEqual(JSON.parse(original!));
  await expect(page.locator('.task-card').first()).toBeVisible();
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  expect(manifest.dependencies['lucide-react']).toBeUndefined();
  const { pluginDir } = await latestRelease();
  const css = await readFile(`${pluginDir}/index.css`, 'utf8');
  expect(css).not.toMatch(/@import|https?:\/\//);
});
