import { createTask, EMPTY_FILE, parseTaskFile, sameDraft, taskDraft, validateDraft, type DueReminder, type TaskDraft, type TaskFile } from './model';
import { BROWSER_KEY, LEGACY_BROWSER_KEY } from './legacy-storage';

export interface StorageAdapter { load(): Promise<unknown>; save(data: TaskFile): Promise<void>; }
export interface StoreSnapshot { data: TaskFile; saving: boolean; error: string | null; ready: boolean; }
export class TaskStore {
  private snapshot: StoreSnapshot = { data: structuredClone(EMPTY_FILE), saving: false, error: null, ready: false };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  constructor(private adapter: StorageAdapter) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(change: Partial<StoreSnapshot>) { this.snapshot = { ...this.snapshot, ...change }; this.listeners.forEach(fn => fn()); }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(work);
    this.queue = operation.catch(() => {});
    return operation;
  }
  init() {
    // Reads must share the write queue: a late read must never replace a newer save.
    return this.enqueue(async () => {
      try {
        const data = await this.adapter.load();
        this.emit({ data: data == null ? structuredClone(EMPTY_FILE) : parseTaskFile(data), ready: true, error: null });
      } catch (error) {
        this.emit({ ready: false, error: `读取任务失败：${error instanceof Error ? error.message : '未知错误'}。原文件已保留，请修复后重新加载。` });
        throw error;
      }
    });
  }
  private mutate(fn: (data: TaskFile) => void): Promise<void> {
    if (!this.snapshot.ready) return Promise.reject(new Error('数据尚未成功加载，暂时无法保存'));
    this.pending++; this.emit({ saving: true });
    return this.enqueue(async () => {
      try {
        // A preceding reload may have failed after this mutation was enqueued.
        if (!this.snapshot.ready) throw new Error('数据尚未成功加载，暂时无法保存');
        const next = structuredClone(this.snapshot.data);
        fn(next);
        await this.adapter.save(next);
        this.emit({ data: next, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        if (this.snapshot.ready) this.emit({ error: `保存失败：${message}` });
        throw error;
      } finally { this.pending--; this.emit({ saving: this.pending > 0 }); }
    });
  }
  async saveTask(draft: TaskDraft, id?: string, expected?: TaskDraft): Promise<string> {
    const error = validateDraft(draft); if (error) throw new Error(error);
    const input = taskDraft(draft), baseline = expected && taskDraft(expected);
    let taskId = id || '';
    await this.mutate(data => {
      const now = new Date().toISOString();
      if (id) {
        const task = data.tasks.find(t => t.id === id);
        if (!task) throw new Error('任务已被删除，请重新创建');
        if (baseline && !sameDraft(task, baseline)) throw new Error('这件待办已在其他位置更新。草稿仍保留，请复制需要的内容，再关闭并重新打开待办后编辑。');
        Object.assign(task, input, { title: input.title.trim(), updatedAt: now });
        task.history.push({ at: now, action: 'updated' });
      } else {
        const task = createTask(input, now); taskId = task.id; data.tasks.push(task);
      }
    });
    return taskId;
  }
  toggle(id: string) {
    const now = new Date().toISOString();
    return this.mutate(data => {
      const task = data.tasks.find(t => t.id === id); if (!task) return;
      task.completed = !task.completed; task.completedAt = task.completed ? now : null; task.updatedAt = now;
      task.history.push({ at: now, action: task.completed ? 'completed' : 'reopened' });
    });
  }
  remove(id: string) { return this.mutate(data => { data.tasks = data.tasks.filter(t => t.id !== id); }); }
  merge(file: TaskFile) {
    const validated = parseTaskFile(file);
    return this.mutate(data => {
      const map = new Map(data.tasks.map(t => [t.id, t]));
      for (const incoming of validated.tasks) {
        const existing = map.get(incoming.id);
        if (!existing || Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)) map.set(incoming.id, incoming);
      }
      data.tasks = [...map.values()];
    });
  }
  markNotified(events: DueReminder[]) {
    return this.mutate(data => { for (const event of events) {
      const task = data.tasks.find(t => t.id === event.taskId);
      if (task && !task.notified.includes(event.key)) task.notified = [...task.notified.slice(-99), event.key];
    } });
  }
  flush() { return this.queue; }
}
export const browserStorage: StorageAdapter = {
  async load() {
    const raw = localStorage.getItem(BROWSER_KEY);
    if (raw !== null) return JSON.parse(raw);
    const previous = localStorage.getItem(LEGACY_BROWSER_KEY);
    if (previous === null) return null;
    const validated = parseTaskFile(JSON.parse(previous));
    localStorage.setItem(BROWSER_KEY, JSON.stringify(validated));
    return validated;
  },
  async save(data) { localStorage.setItem(BROWSER_KEY, JSON.stringify(data)); },
};
