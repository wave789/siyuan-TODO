import type { Task } from './model';

export const CALENDAR_LEGEND = [
  { key: 'work', label: '工作' },
  { key: 'study', label: '学习' },
  { key: 'life', label: '生活' },
  { key: 'completed', label: '已完成' },
] as const;

/** Calendar markers, sidebar card borders and task boxes share the legend colors. */
export function calendarMarkerClass(task: Pick<Task, 'category' | 'completed'>): string {
  if (task.completed) return 'calendar-marker-completed';
  const category = CALENDAR_LEGEND.find(item => item.key !== 'completed' && item.label === task.category.trim());
  return `calendar-marker-${category?.key ?? 'custom'}`;
}
