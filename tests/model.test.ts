import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createTask, dateKey, defaultDraft, dueReminders, elapsedRatio, parseTaskFile, startOfWeek, status, tasksOnDay, validateDraft, type TaskDraft } from '../src/model';

const draft: TaskDraft = { title: '任务', details: '记录', start: '2026-10-26T07:30:00.000Z', end: '2026-10-27T04:00:00.000Z', color: 'sage', category: '工作', remindMinutes: 15, remindStart: true };
const task = () => createTask(draft, '2026-10-25T00:00:00.000Z');

test('未完成任务的时间进度按当前时间计算并限制上下界', () => {
  const t = task(), start = Date.parse(t.start), end = Date.parse(t.end);
  assert.equal(elapsedRatio(t, start - 1), 0);
  assert.equal(elapsedRatio(t, start), 0);
  assert.equal(elapsedRatio(t, (start + end) / 2), .5);
  assert.equal(elapsedRatio(t, end + 100000), 1);
});
test('已完成任务保留完成时的进度，当前时间推移及 JSON 往返后仍保持一半', () => {
  const t = task(), start = Date.parse(t.start), end = Date.parse(t.end);
  const completed = { ...t, completed: true, completedAt: new Date((start + end) / 2).toISOString() };
  assert.equal(elapsedRatio(completed, end), .5);
  assert.equal(elapsedRatio(completed, end + 30 * 86400000), .5);
  const restored = parseTaskFile(JSON.parse(JSON.stringify({ version: 1, tasks: [completed] }))).tasks[0];
  assert.equal(elapsedRatio(restored, end + 86400000), .5);
  assert.equal(elapsedRatio({ ...completed, completed: false, completedAt: null }, start + (end - start) * .75), .75);
});
test('完成进度限制在零到百分之百，缺少有效完成时间时兼容原有计算', () => {
  const t = task(), start = Date.parse(t.start), end = Date.parse(t.end), now = (start + end) / 2;
  assert.equal(elapsedRatio({ ...t, completed: true, completedAt: new Date(start - 1000).toISOString() }, now), 0);
  assert.equal(elapsedRatio({ ...t, completed: true, completedAt: new Date(end + 1000).toISOString() }, now), 1);
  for (const completedAt of [null, 'bad']) assert.equal(elapsedRatio({ ...t, completed: true, completedAt }, now), .5);
});
test('时间进度对无效的零时长数据不会除零', () => {
  const t = task(); t.end = t.start;
  assert.equal(elapsedRatio(t, Date.parse(t.start) - 1), 0);
  assert.equal(elapsedRatio(t, Date.parse(t.start)), 1);
});
test('草稿拒绝空标题、无效日期和反向区间', () => {
  assert.ok(validateDraft({ ...draft, title: '  ' }));
  assert.ok(validateDraft({ ...draft, end: draft.start }));
  assert.ok(validateDraft({ ...draft, end: 'bad' }));
  assert.equal(validateDraft(draft), null);
});
test('跨日任务覆盖每一个相交日，午夜结束不进入下一天', () => {
  const t = task(), day = new Date(2026, 9, 26);
  t.start = new Date(2026, 9, 26, 15, 30).toISOString();
  t.end = new Date(2026, 9, 28, 0, 0).toISOString();
  assert.equal(tasksOnDay([t], day).length, 1);
  assert.equal(tasksOnDay([t], addDays(day, 1)).length, 1);
  assert.equal(tasksOnDay([t], addDays(day, 2)).length, 0);
  assert.equal(tasksOnDay([t], addDays(day, -1)).length, 0);
});
test('周视图从星期一开始，跨年日期按本地日期计算', () => {
  assert.equal(dateKey(startOfWeek(new Date(2026, 9, 25))), '2026-10-19');
  assert.equal(dateKey(addDays(new Date(2026, 11, 31), 1)), '2027-01-01');
});
test('状态区分未开始、进行中、到期和完成', () => {
  const t = task();
  assert.equal(status(t, Date.parse(t.start) - 1).key, 'upcoming');
  assert.equal(status(t, Date.parse(t.start)).key, 'active');
  assert.equal(status(t, Date.parse(t.end)).key, 'overdue');
  assert.equal(status({ ...t, completed: true }, Date.parse(t.end)).key, 'completed');
});
test('逾期完成按完成时刻与截止时间之差计算，之后的当前时间不改变记录', () => {
  const t = task(), end = Date.parse(t.end);
  for (const [hours, label] of [
    [2, '逾期 2 小时完成'], [2.5, '逾期 2.5 小时完成'],
    [26.75, '逾期 26.75 小时完成'], [1 / 60, '逾期 0.02 小时完成'],
    [1 / 3600, '逾期不足 0.01 小时完成'],
  ] as const) {
    const completed = { ...t, completed: true, completedAt: new Date(end + hours * 3600000).toISOString() };
    assert.deepEqual(status(completed, end + 3600000), { key: 'completed', label });
    assert.deepEqual(status(completed, end + 30 * 86400000), { key: 'completed', label });
  }
});
test('按时完成、恰好截止时完成或没有完成时刻的旧任务保持已完成', () => {
  const t = task(), end = Date.parse(t.end);
  for (const completedAt of [null, new Date(end - 3600000).toISOString(), t.end]) {
    assert.deepEqual(status({ ...t, completed: true, completedAt }, end + 86400000), { key: 'completed', label: '已完成' });
  }
});
test('JSON 导出往返保留任务和历史，但移除未声明的字段', () => {
  const t = task(); const file = parseTaskFile(JSON.parse(JSON.stringify({ version: 1, tasks: [{ ...t, unknown: 'discard' }] })));
  assert.deepEqual(file.tasks[0], t);
  assert.equal('unknown' in file.tasks[0], false);
});
test('导入拒绝重复 ID、错误版本、无效时间和坏记录', () => {
  const t = task();
  for (const file of [ { version: 2, tasks: [] }, { version: 1, tasks: [t, t] }, { version: 1, tasks: [{ ...t, completed: 'yes' }] },
    { version: 1, tasks: [{ ...t, end: t.start }] }, { version: 1, tasks: [{ ...t, history: [{ at: 'bad', action: 'created' }] }] },
    { version: 1, tasks: [{ ...t, remindMinutes: -1 }] }, { version: 1, tasks: [null] } ]) assert.throws(() => parseTaskFile(file));
});
test('提醒可提前、去重，已完成任务不提醒', () => {
  const t = task(); t.remindStart = false;
  const trigger = Date.parse(t.end) - 15 * 60000;
  assert.equal(dueReminders([t], trigger - 1).length, 0);
  const events = dueReminders([t], trigger);
  assert.equal(events.length, 1);
  t.notified = [events[0].key];
  assert.equal(dueReminders([t], trigger + 15000).length, 0);
  t.notified = []; t.completed = true;
  assert.equal(dueReminders([t], trigger).length, 0);
});
test('恢复后只补发最近 24 小时内的提醒，修改时间生成新标记', () => {
  const t = task(); t.remindMinutes = null;
  const trigger = Date.parse(t.start);
  assert.equal(dueReminders([t], trigger + 86399999).length, 1);
  assert.equal(dueReminders([t], trigger + 86400000).length, 0);
  t.notified = dueReminders([t], trigger).map(e => e.key);
  t.start = new Date(trigger + 60000).toISOString();
  assert.equal(dueReminders([t], trigger + 60000).length, 1);
});
test('关闭全部提醒的任务保持安静', () => {
  const t = task(); t.remindStart = false; t.remindMinutes = null;
  assert.equal(dueReminders([t], Date.parse(t.end)).length, 0);
});
test('新建待办使用选中日期本地时间09:00到18:00，包括当天及跨年日期', () => {
  for (const day of [new Date(), new Date(2026, 11, 31, 23, 45, 37), new Date(2027, 0, 1, 0, 30, 12)]) {
    const d = defaultDraft(day);
    const start = new Date(d.start), end = new Date(d.end);
    assert.equal(dateKey(start), dateKey(day));
    assert.equal(dateKey(end), dateKey(day));
    assert.equal(start.getHours(), 9);
    assert.equal(end.getHours(), 18);
    assert.equal(start.getMinutes(), 0);
    assert.equal(end.getMinutes(), 0);
    assert.equal(start.getSeconds(), 0);
    assert.equal(end.getSeconds(), 0);
    assert.equal(start.getMilliseconds(), 0);
    assert.equal(end.getMilliseconds(), 0);
  }
});
