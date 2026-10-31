import { dueReminders, type DueReminder } from './model';
import type { TaskStore } from './store';

export function startReminders(store: TaskStore, notify: (events: DueReminder[]) => void): () => void {
  let running = false;
  let stopped = false;
  async function tick() {
    if (running || stopped || !store.getSnapshot().ready) return;
    const events = dueReminders(store.getSnapshot().data.tasks);
    if (!events.length) return;
    running = true;
    try {
      await store.markNotified(events);
      if (!stopped) notify(events);
    } catch (error) { console.error('[siyuan-TODO] 提醒记录保存失败', error); }
    finally { running = false; }
  }
  const interval = window.setInterval(() => { void tick(); }, 15000);
  const wake = () => { if (document.visibilityState === 'visible') void tick(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  void tick();
  return () => { stopped = true; clearInterval(interval); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); };
}
export function desktopNotify(events: DueReminder[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    if (events.length > 3) { new Notification('siyuan-TODO提醒', { body: `有 ${events.length} 条待办提醒，打开siyuan-TODO查看。`, tag: 'stodo-summary' }); return; }
    for (const event of events) new Notification(`siyuan-TODO · ${event.title}`, { body: event.body, tag: `stodo-${event.taskId}-${event.key}` });
  } catch (error) { console.warn('[siyuan-TODO] 系统通知不可用', error); }
}
