import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootHost } from '../helpers/siyuan-host';

async function trackResources(page: Page) {
  await page.addInitScript(() => {
    const intervals = new Set<number>();
    const start = window.setInterval, stop = window.clearInterval;
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = start(handler, timeout, ...args); if (timeout === 15000) intervals.add(id); return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => { if (id !== undefined) intervals.delete(id); stop(id); }) as typeof window.clearInterval;
    const watched = new Set(['focus', 'visibilitychange', 'stodo:reminders', 'beforeunload', 'pointerdown', 'keydown']);
    const listeners: { target: EventTarget; type: string; callback: unknown; capture: boolean }[] = [];
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, callback, options) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      if ((this === window || this === document) && watched.has(type) && !listeners.some(l => l.target === this && l.type === type && l.callback === callback && l.capture === capture)) listeners.push({ target: this, type, callback, capture });
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function(type, callback, options) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const index = listeners.findIndex(l => l.target === this && l.type === type && l.callback === callback && l.capture === capture);
      if (index !== -1) listeners.splice(index, 1);
      return remove.call(this, type, callback, options);
    };
    (window as any).resourceCounts = () => ({ intervals: intervals.size, listeners: listeners.length });
    (window as any).resourceListeners = () => listeners.map(l => l.type);
  });
}
const counts = (page: Page) => page.evaluate(() => (window as any).resourceCounts());

test('读取未完成时卸载，不会重新启动提醒或挂载延迟侧栏', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-unload-'));
  await trackResources(page);
  try {
    await bootHost(page, join(dir, 'todos.json'), undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await page.evaluate(async () => { await (window as any).sdk.instance.onunload(); });
    const baseline = await counts(page);
    const result = await page.evaluate(async () => {
      const sdk = (window as any).sdk;
      const original = window.fetch;
      let release!: () => void, started!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const loading = new Promise<void>(resolve => { started = resolve; });
      window.fetch = async () => { started(); await gate; return new Response(JSON.stringify({ version: 1, tasks: [] })); };
      const plugin = new sdk.NativePlugin();
      try {
        const load = plugin.onload(); await loading;
        const unload = plugin.onunload(); release(); await Promise.all([load, unload]);
        const afterLoad = (window as any).resourceCounts();
        const element = document.createElement('div'); document.body.append(element);
        plugin.dockConfig.init.call({ element, data: {} });
        await new Promise(resolve => setTimeout(resolve, 50));
        const lateDockMounted = !!element.querySelector('.task-sidebar');
        await plugin.onunload(); element.remove();
        return { afterLoad, lateDockMounted };
      } finally { window.fetch = original; await plugin.onunload(); }
    });
    expect(result.afterLoad).toEqual(baseline);
    expect(result.lateDockMounted).toBe(false);
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});

test('反复开关工作区和插件后，定时器与全局监听恢复基线', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'stodo-lifecycle-'));
  await trackResources(page);
  try {
    const disk = join(dir, 'todos.json'); await writeFile(disk, JSON.stringify({ version: 1, tasks: [] }));
    await bootHost(page, disk, undefined, { pluginDir: process.env.STODO_TEST_PLUGIN_DIR });
    await expect(page.locator('.stodo-app')).toBeVisible();
    const opened = await counts(page);
    for (let cycle = 0; cycle < 8; cycle++) {
      await page.getByRole('button', { name: '新建待办任务', exact: true }).click();
      await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('未保存的生命周期测试');
      await page.getByRole('button', { name: '选择开始时间', exact: true }).click();
      await page.evaluate(() => (window as any).sdk.closeWorkspace());
      await expect(page.locator('.stodo-app')).toHaveCount(0);
      await page.getByRole('button', { name: '打开日程总览', exact: true }).click();
      await expect(page.locator('.stodo-app')).toBeVisible();
      await expect.poll(() => counts(page)).toEqual(opened);
    }
    await page.evaluate(async () => { await (window as any).sdk.instance.onunload(); });
    const unloaded = await counts(page);
    // Vite/Playwright keep their own beforeunload/pointerdown handlers. Plugin
    // handlers must disappear, and later enable/disable cycles must not grow.
    const remaining = await page.evaluate(() => (window as any).resourceListeners() as string[]);
    expect(remaining.filter(type => ['focus', 'visibilitychange', 'stodo:reminders', 'keydown'].includes(type))).toEqual([]);
    expect(unloaded.intervals).toBe(0);
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(async () => { await (window as any).sdk.boot(); });
      await expect(page.locator('.stodo-app')).toBeVisible();
      await expect.poll(() => counts(page)).toEqual(opened);
      await page.evaluate(async () => { await (window as any).sdk.instance.onunload(); });
      await expect.poll(() => counts(page)).toEqual(unloaded);
    }
  } finally { await page.evaluate(async () => { await (window as any).sdk?.instance?.onunload(); }); await rm(dir, { recursive: true, force: true }); }
});
