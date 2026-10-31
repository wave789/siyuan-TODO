export type TaskColor = 'sage' | 'amber' | 'blue' | 'violet';
export type View = 'year' | 'month' | 'week' | 'day';
export type TaskEvent = { at: string; action: 'created' | 'updated' | 'completed' | 'reopened' };
export interface Task {
  id: string;
  title: string;
  details: string;
  start: string;
  end: string;
  completed: boolean;
  completedAt: string | null;
  color: TaskColor;
  category: string;
  remindMinutes: number | null;
  remindStart: boolean;
  notified: string[];
  createdAt: string;
  updatedAt: string;
  history: TaskEvent[];
}
export interface TaskFile { version: 1; tasks: Task[]; }
export type TaskDraft = Pick<Task, 'title' | 'details' | 'start' | 'end' | 'color' | 'category' | 'remindMinutes' | 'remindStart'>;
export function taskDraft(task: TaskDraft): TaskDraft {
  return { title: task.title, details: task.details, start: task.start, end: task.end,
    color: task.color, category: task.category, remindMinutes: task.remindMinutes, remindStart: task.remindStart };
}
export function sameDraft(a: TaskDraft, b: TaskDraft): boolean {
  return (Object.keys(taskDraft(a)) as (keyof TaskDraft)[]).every(key => a[key] === b[key]);
}
export const EMPTY_FILE: TaskFile = { version: 1, tasks: [] };
export const COLORS: TaskColor[] = ['sage', 'amber', 'blue', 'violet'];
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
export const pad = (n: number) => String(n).padStart(2, '0');
export function dateKey(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function formatDateTime(value: string): string {
  const d = new Date(value);
  return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function timeLabel(value: Date | string): string {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function startOfDay(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
export function addDays(date: Date, amount: number): Date { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
export function startOfWeek(date: Date): Date { return addDays(startOfDay(date), -((date.getDay() + 6) % 7)); }
export function elapsedRatio(task: Pick<Task, 'start' | 'end'> & Partial<Pick<Task, 'completed' | 'completedAt'>>, now = Date.now()): number {
  const completedAt = task.completed && task.completedAt ? Date.parse(task.completedAt) : NaN;
  const at = Number.isFinite(completedAt) ? completedAt : now;
  const duration = Date.parse(task.end) - Date.parse(task.start);
  if (duration <= 0) return at >= Date.parse(task.end) ? 1 : 0;
  return Math.max(0, Math.min(1, (at - Date.parse(task.start)) / duration));
}
export function tasksOnDay(tasks: Task[], day: Date): Task[] {
  const from = startOfDay(day).getTime();
  const to = addDays(startOfDay(day), 1).getTime();
  return tasks.filter(t => Date.parse(t.start) < to && Date.parse(t.end) > from)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
export function status(task: Task, now = Date.now()): { label: string; key: string } {
  if (task.completed) {
    const overdueHours = task.completedAt ? (Date.parse(task.completedAt) - Date.parse(task.end)) / 3600000 : 0;
    const label = overdueHours > 0
      ? overdueHours < 0.01 ? '逾期不足 0.01 小时完成' : `逾期 ${Number(overdueHours.toFixed(2))} 小时完成`
      : '已完成';
    return { label, key: 'completed' };
  }
  if (Date.parse(task.end) <= now) return { label: '已逾期', key: 'overdue' };
  if (Date.parse(task.start) > now) return { label: '未开始', key: 'upcoming' };
  return { label: '进行中', key: 'active' };
}
export function validateDraft(draft: TaskDraft): string | null {
  if (!draft.title.trim()) return '给这件事起一个名字吧';
  if (draft.title.trim().length > 200) return '任务标题请控制在 200 字以内';
  if (draft.details.length > 100000) return '具体细节请控制在 100,000 字以内';
  if (!Number.isFinite(Date.parse(draft.start)) || !Number.isFinite(Date.parse(draft.end))) return '请选择有效的开始和结束时间';
  if (Date.parse(draft.end) <= Date.parse(draft.start)) return '结束时间需要晚于开始时间';
  return null;
}
export function createTask(draft: TaskDraft, now = new Date().toISOString()): Task {
  const error = validateDraft(draft); if (error) throw new Error(error);
  return { ...draft, title: draft.title.trim(), id: crypto.randomUUID(), completed: false, completedAt: null,
    notified: [], createdAt: now, updatedAt: now, history: [{ at: now, action: 'created' }] };
}
function validDate(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function parseTaskFile(input: unknown): TaskFile {
  if (!input || typeof input !== 'object') throw new Error('文件格式不正确，请选择siyuan-TODO导出的 JSON 文件');
  const file = input as Partial<TaskFile>;
  if (file.version !== 1 || !Array.isArray(file.tasks)) throw new Error('不支持的文件版本或任务格式');
  if (file.tasks.length > 20000) throw new Error('单次最多导入 20,000 个任务');
  const ids = new Set<string>();
  const tasks = file.tasks.map((raw, i): Task => {
    if (!raw || typeof raw !== 'object') throw new Error(`第 ${i + 1} 个任务无效`);
    const t = raw as Task;
    if (typeof t.id !== 'string' || !t.id || t.id.length > 200 || ids.has(t.id)) throw new Error(`第 ${i + 1} 个任务的 ID 无效或重复`);
    ids.add(t.id);
    if (typeof t.title !== 'string' || typeof t.details !== 'string' || typeof t.completed !== 'boolean' ||
      !validDate(t.start) || !validDate(t.end) || !validDate(t.createdAt) || !validDate(t.updatedAt) ||
      !COLORS.includes(t.color) || typeof t.category !== 'string' || t.category.length > 50 ||
      !(t.remindMinutes === null || [0, 5, 15, 30, 60, 1440].includes(t.remindMinutes)) ||
      typeof t.remindStart !== 'boolean' || !(t.completedAt === null || validDate(t.completedAt)) ||
      !Array.isArray(t.notified) || t.notified.length > 1000 || !t.notified.every(v => typeof v === 'string') ||
      !Array.isArray(t.history) || t.history.length > 10000 || !t.history.every(h => h && validDate(h.at) && ['created', 'updated', 'completed', 'reopened'].includes(h.action))) {
      throw new Error(`第 ${i + 1} 个任务字段不完整或无效`);
    }
    const error = validateDraft(t); if (error) throw new Error(`第 ${i + 1} 个任务：${error}`);
    return { id: t.id, title: t.title.trim(), details: t.details, start: new Date(t.start).toISOString(), end: new Date(t.end).toISOString(),
      completed: t.completed, completedAt: t.completedAt, color: t.color, category: t.category, remindMinutes: t.remindMinutes,
      remindStart: t.remindStart, notified: [...t.notified], createdAt: t.createdAt, updatedAt: t.updatedAt,
      history: t.history.map(h => ({ at: h.at, action: h.action })) };
  });
  return { version: 1, tasks };
}
export interface DueReminder { taskId: string; key: string; title: string; body: string; }
export function dueReminders(tasks: Task[], now = Date.now()): DueReminder[] {
  const result: DueReminder[] = [];
  for (const task of tasks) {
    if (task.completed) continue;
    const events: { key: string; at: number; body: string }[] = [];
    if (task.remindStart) events.push({ key: `start:${task.start}`, at: Date.parse(task.start), body: `任务已开始，截止 ${formatDateTime(task.end)}` });
    if (task.remindMinutes !== null) {
      events.push({ key: `before:${task.end}:${task.remindMinutes}`, at: Date.parse(task.end) - task.remindMinutes * 60000,
        body: now >= Date.parse(task.end) ? '任务已到截止时间' : `距截止时间还有 ${Math.ceil((Date.parse(task.end) - now) / 60000)} 分钟` });
    }
    for (const event of events) if (now >= event.at && now - event.at < 86400000 && !task.notified.includes(event.key)) {
      result.push({ taskId: task.id, key: event.key, title: task.title, body: event.body });
    }
  }
  return result;
}
export function defaultDraft(day = new Date()): TaskDraft {
  const start = startOfDay(day); start.setHours(9, 0, 0, 0);
  const end = startOfDay(day); end.setHours(18, 0, 0, 0);
  return { title: '', details: '', start: start.toISOString(), end: end.toISOString(), color: 'sage', category: '工作', remindMinutes: 15, remindStart: false };
}
