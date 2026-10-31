import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, defaultDraft, dueReminders, type TaskFile } from '../src/model';
import { TaskStore, type StorageAdapter } from '../src/store';
import { siyuanStorage } from '../src/siyuan-storage';
import { migrateLegacyStorage } from '../src/legacy-storage';

function memory(initial: unknown = null) {
  let saved: unknown = initial;
  const adapter: StorageAdapter = { async load() { return saved; }, async save(data) { saved = structuredClone(data); } };
  return { adapter, read: () => saved as TaskFile };
}
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
}
test('重新读取与保存共用队列，慢读取不会覆盖新保存的任务', async () => {
  const disk = memory({ version: 1, tasks: [] });
  const started = deferred(), blocked = deferred(); let loads = 0;
  const store = new TaskStore({ ...disk.adapter, async load() {
    const data = structuredClone(await disk.adapter.load());
    if (++loads === 2) { started.resolve(); await blocked.promise; }
    return data;
  } });
  await store.init();
  const reload = store.init(); await started.promise;
  const save = store.saveTask({ ...defaultDraft(), title: '读取期间创建' });
  // Let the old implementation finish its concurrent write before the stale read.
  await new Promise(resolve => setImmediate(resolve));
  blocked.resolve(); await Promise.all([reload, save]);
  assert.equal(store.getSnapshot().data.tasks.length, 1);
  assert.deepEqual(store.getSnapshot().data, disk.read());
});
test('重新读取失败后，已经排队的保存也不能覆盖损坏文件', async () => {
  const disk = memory({ version: 1, tasks: [] });
  const started = deferred(), blocked = deferred(); let loads = 0, writes = 0;
  const store = new TaskStore({ async load() {
    if (++loads === 2) { started.resolve(); await blocked.promise; throw new Error('文件已损坏'); }
    return disk.adapter.load();
  }, async save(data) { writes++; await disk.adapter.save(data); } });
  await store.init();
  const reload = store.init(); const failedReload = assert.rejects(reload, /文件已损坏/); await started.promise;
  const save = store.saveTask({ ...defaultDraft(), title: '不得写入' });
  const failedSave = assert.rejects(save);
  blocked.resolve(); await Promise.all([failedReload, failedSave]);
  assert.equal(writes, 0); assert.equal(store.getSnapshot().ready, false);
});
test('串行操作不会被慢写入覆盖，完成记录可以恢复', async () => {
  const disk = memory(); const store = new TaskStore(disk.adapter); await store.init();
  const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => store.saveTask({ ...defaultDraft(), title: `任务 ${i}` })));
  assert.equal(disk.read().tasks.length, 8);
  await Promise.all([store.toggle(ids[0]), store.toggle(ids[1]), store.toggle(ids[0])]);
  assert.equal(store.getSnapshot().data.tasks.find(t => t.id === ids[0])?.completed, false);
  assert.equal(store.getSnapshot().data.tasks.find(t => t.id === ids[1])?.completed, true);
  assert.deepEqual(disk.read().tasks[0].history.map(h => h.action), ['created', 'completed', 'reopened']);
  assert.equal(store.getSnapshot().saving, false);
});
test('完成时间记录勾选时刻，不被之前排队的慢保存推迟', async context => {
  const task = createTask({ ...defaultDraft(), title: '等待保存的任务' });
  const disk = memory({ version: 1, tasks: [task] });
  let releaseSave!: () => void, notifyStarted!: () => void;
  const blocked = new Promise<void>(resolve => { releaseSave = resolve; });
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  let writes = 0;
  const store = new TaskStore({ ...disk.adapter, async save(data) {
    if (writes++ === 0) { notifyStarted(); await blocked; }
    await disk.adapter.save(data);
  } });
  await store.init();
  const clickedAt = Date.parse('2026-10-27T20:30:00+08:00');
  context.mock.timers.enable({ apis: ['Date'], now: clickedAt });
  const editing = store.saveTask({ ...task, details: '先保存详情' }, task.id);
  await started;
  const completing = store.toggle(task.id);
  context.mock.timers.tick(3600000);
  releaseSave();
  await Promise.all([editing, completing]);
  assert.equal(disk.read().tasks[0].completedAt, new Date(clickedAt).toISOString());
  assert.equal(disk.read().tasks[0].history.at(-1)?.at, new Date(clickedAt).toISOString());
});
test('保存失败不会提交内存状态，后续操作可重试', async () => {
  const disk = memory(); let fail = true;
  const store = new TaskStore({ ...disk.adapter, async save(data) { if (fail) throw new Error('磁盘不可用'); await disk.adapter.save(data); } });
  await store.init();
  await assert.rejects(store.saveTask({ ...defaultDraft(), title: '需要保留的草稿' }));
  assert.equal(store.getSnapshot().data.tasks.length, 0); assert.match(store.getSnapshot().error || '', /磁盘不可用/);
  fail = false;
  await store.saveTask({ ...defaultDraft(), title: '重试' });
  assert.equal(disk.read().tasks.length, 1); assert.equal(store.getSnapshot().error, null);
});
test('编辑期间勾选完成不会误报冲突，也不会被旧草稿改回未完成', async () => {
  const task = createTask({ ...defaultDraft(), title: '编辑和完成并行' });
  const disk = memory({ version: 1, tasks: [task] }); const store = new TaskStore(disk.adapter); await store.init();
  await store.toggle(task.id);
  await store.saveTask({ ...task, details: '完成后的补充' }, task.id, task);
  const saved = disk.read().tasks[0];
  assert.equal(saved.completed, true); assert.ok(saved.completedAt);
  assert.equal(saved.details, '完成后的补充');
  assert.deepEqual(saved.history.map(event => event.action), ['created', 'completed', 'updated']);
});
test('草稿冲突检查在实际写入前进行，不会覆盖排在前面的导入更新', async () => {
  const task = createTask({ ...defaultDraft(), title: '旧标题' }, '2026-10-25T00:00:00Z');
  const disk = memory({ version: 1, tasks: [task] }); const store = new TaskStore(disk.adapter); await store.init();
  const importing = store.merge({ version: 1, tasks: [{ ...task, title: '较新的标题', updatedAt: '2026-10-26T00:00:00Z' }] });
  const editing = store.saveTask({ ...task, details: '旧草稿' }, task.id, task);
  await assert.rejects(editing, /已在其他位置更新/); await importing;
  assert.equal(disk.read().tasks[0].title, '较新的标题');
  assert.equal(disk.read().tasks[0].details, '');
});
test('损坏文件阻止写入，避免覆盖原数据', async () => {
  const disk = memory({ version: 999, tasks: [] }); const store = new TaskStore(disk.adapter);
  await assert.rejects(store.init());
  await assert.rejects(store.saveTask({ ...defaultDraft(), title: '不能写入' }));
  assert.equal(store.getSnapshot().ready, false);
  assert.deepEqual(disk.read(), { version: 999, tasks: [] });
});
test('导入按 ID 保留较新记录，相同时间保留本地，无关任务不被删除', async () => {
  const old = createTask({ ...defaultDraft(), title: '本地' }, '2026-10-25T00:00:00Z');
  const other = createTask({ ...defaultDraft(), title: '其他' });
  const disk = memory({ version: 1, tasks: [old, other] }); const store = new TaskStore(disk.adapter); await store.init();
  await store.merge({ version: 1, tasks: [{ ...old, title: '同时间' }] });
  assert.equal(store.getSnapshot().data.tasks[0].title, '本地');
  await store.merge({ version: 1, tasks: [{ ...old, title: '更新记录', updatedAt: '2026-10-26T00:00:00Z' }] });
  assert.equal(store.getSnapshot().data.tasks[0].title, '更新记录'); assert.equal(disk.read().tasks.length, 2);
  const again = new TaskStore(disk.adapter); await again.init(); assert.deepEqual(again.getSnapshot().data, store.getSnapshot().data);
});
test('已通知标记持久化，重启不重复提醒', async () => {
  const task = createTask({ ...defaultDraft(), title: '提醒', remindMinutes: 0, remindStart: false });
  const disk = memory({ version: 1, tasks: [task] }); const store = new TaskStore(disk.adapter); await store.init();
  const events = dueReminders(store.getSnapshot().data.tasks, Date.parse(task.end));
  assert.equal(events.length, 1); await store.markNotified(events);
  const restarted = new TaskStore(disk.adapter); await restarted.init();
  assert.equal(dueReminders(restarted.getSnapshot().data.tasks, Date.parse(task.end) + 1000).length, 0);
});
test('删除任务后重启仍保持删除，编辑不存在的任务会失败', async () => {
  const disk = memory(); const store = new TaskStore(disk.adapter); await store.init();
  const id = await store.saveTask({ ...defaultDraft(), title: '删除' }); await store.remove(id);
  await assert.rejects(store.saveTask({ ...defaultDraft(), title: '旧标签' }, id));
  const restarted = new TaskStore(disk.adapter); await restarted.init(); assert.equal(restarted.getSnapshot().data.tasks.length, 0);
});
test('思源适配器检查内核失败码，而不是把已兑现的请求当作成功', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ code: -1, msg: '权限不足' }), { status: 200 })) as typeof fetch;
  const adapter = siyuanStorage('test', fetcher);
  await assert.rejects(adapter.save({ version: 1, tasks: [] }), /权限不足/);
  await assert.rejects(adapter.load(), /权限不足/);
});
test('思源适配器仅将 404 视为空数据，其余 HTTP 和解析错误保留', async () => {
  const missing = siyuanStorage('test', (async () => new Response(JSON.stringify({ code: 404 }))) as typeof fetch);
  assert.equal(await missing.load(), null);
  const failed = siyuanStorage('test', (async () => new Response('offline', { status: 503 })) as typeof fetch);
  await assert.rejects(failed.load(), /503/);
  const corrupt = siyuanStorage('test', (async () => new Response('broken-json')) as typeof fetch);
  await assert.rejects(corrupt.load());
});

test('改名迁移会校验旧文件，写入新位置并保留旧数据', async () => {
  const file: TaskFile = { version: 1, tasks: [createTask({ ...defaultDraft(), title: '旧版任务' })] };
  const old = memory(file), current = memory();
  const store = new TaskStore(migrateLegacyStorage(current.adapter, old.adapter));
  await store.init();
  assert.deepEqual(current.read(), file);
  assert.deepEqual(old.read(), file);
  assert.equal(store.getSnapshot().data.tasks[0].title, '旧版任务');
});
test('已有新文件时不重新导入旧任务，新文件损坏时也不会退回覆盖', async () => {
  const old = memory({ version: 1, tasks: [createTask({ ...defaultDraft(), title: '旧任务' })] });
  const current = memory({ version: 1, tasks: [] });
  const store = new TaskStore(migrateLegacyStorage(current.adapter, old.adapter)); await store.init();
  assert.equal(store.getSnapshot().data.tasks.length, 0);
  const damaged = memory({ version: 99, tasks: [] });
  const broken = new TaskStore(migrateLegacyStorage(damaged.adapter, old.adapter));
  await assert.rejects(broken.init());
  assert.equal(damaged.read().version, 99);
});
test('旧文件损坏或迁移写入失败时停止写入，避免静默丢失任务', async () => {
  const current = memory();
  const broken = new TaskStore(migrateLegacyStorage(current.adapter, memory({ version: 99 }).adapter));
  await assert.rejects(broken.init()); assert.equal(current.read(), null);
  const old = memory({ version: 1, tasks: [] });
  const failing = new TaskStore(migrateLegacyStorage({ ...current.adapter, async save() { throw new Error('写入失败'); } }, old.adapter));
  await assert.rejects(failing.init());
  assert.equal(failing.getSnapshot().ready, false); assert.deepEqual(old.read(), { version: 1, tasks: [] });
});
test('文件请求只能访问当前思源内核，禁止跨源和重定向', async () => {
  const calls: [string, RequestInit][] = [];
  const fetcher = (async (endpoint: string, options: RequestInit) => {
    calls.push([endpoint, options]);
    return new Response(JSON.stringify(endpoint.endsWith('getFile') ? { version: 1, tasks: [] } : { code: 0 }));
  }) as typeof fetch;
  const adapter = siyuanStorage('siyuan-todo', fetcher); await adapter.load(); await adapter.save({ version: 1, tasks: [] });
  assert.deepEqual(calls.map(c => c[0]), ['/api/file/getFile', '/api/file/putFile']);
  for (const [, options] of calls) { assert.equal(options.mode, 'same-origin'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'same-origin'); }
});
