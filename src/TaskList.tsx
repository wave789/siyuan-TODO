import { useState, useSyncExternalStore } from 'react';
import { ArrowDownWideNarrow, ArrowUpRight, Check, ChevronDown, FolderOpen, Plus, Search } from './icons';
import { PluginIcon } from './PluginIcon';
import { calendarMarkerClass } from './calendar-colors';
import { elapsedRatio, formatDateTime, status, type Task } from './model';
import type { TaskStore } from './store';

export interface TaskListProps {
  store: TaskStore; now: number; activeId?: string; onOpen: (task: Task) => void; onNew: () => void;
  onError: (text: string) => void;
  compact?: boolean; onOverview?: () => void;
}
export function Brand({ small = false }: { small?: boolean }) {
  return <div className={`sx-brand ${small ? 'brand-small' : ''}`}><span className="brand-mark"><PluginIcon size={small ? 30 : 38} /></span><div><strong>siyuan-TODO</strong>{!small && <p>离线待办 · 本地记录</p>}</div></div>;
}
export function TaskList({ store, now, activeId, onOpen, onNew, onError, compact, onOverview }: TaskListProps) {
  const { data, ready } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'end' | 'start'>('end');
  const [sortOpen, setSortOpen] = useState(false);
  const counts = { all: data.tasks.length, pending: data.tasks.filter(t => !t.completed).length, completed: data.tasks.filter(t => t.completed).length };
  const tasks = data.tasks.filter(t => (filter === 'all' || (filter === 'completed' ? t.completed : !t.completed)) && `${t.title} ${t.details} ${t.category}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Date.parse(a[sort]) - Date.parse(b[sort]));
  return <aside className={`task-sidebar ${compact ? 'sidebar-compact' : ''}`}>
    <div className="sidebar-brand"><Brand />{compact && <button className="icon-button" title="打开日程总览" onClick={onOverview}><ArrowUpRight size={18} /></button>}</div>
    <div className="sidebar-title"><h2>待办任务列表 <span>{data.tasks.length}</span></h2><button className="icon-button" aria-label="新建待办任务" onClick={onNew} disabled={!ready}><Plus size={19} /></button></div>
    <div className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索你的待办…" aria-label="搜索待办" /><kbd>⌕</kbd></div>
    <div className="task-filters">{(['all', 'pending', 'completed'] as const).map(key => <button className={key === filter ? 'is-active' : ''} key={key} onClick={() => setFilter(key)}>{({ all: '全部', pending: '待完成', completed: '已完成' })[key]}<span>{counts[key]}</span></button>)}</div>
    <div className="list-subheading"><span>{filter === 'completed' ? '每一步，都算数' : filter === 'all' ? '小事有序，心中有数' : '专注当下，慢慢来'}</span><div className="sort-wrapper"><button className="sort-button" onClick={() => setSortOpen(!sortOpen)} aria-label="任务排序" aria-expanded={sortOpen}><ArrowDownWideNarrow size={12} />{sort === 'end' ? '按截止时间' : '按开始时间'}<ChevronDown size={11} /></button>{sortOpen && <div className="sort-menu">{(['end', 'start'] as const).map(key => <button key={key} onClick={() => { setSort(key); setSortOpen(false); }}>{key === 'end' ? '按截止时间' : '按开始时间'}{sort === key && <Check size={12} />}</button>)}</div>}</div></div>
    <div className="task-cards">
      {tasks.map(task => { const state = status(task, now); const percent = Math.round(elapsedRatio(task, now) * 100); return <article key={task.id} className={`task-card color-${task.color} ${calendarMarkerClass(task)} ${task.completed ? 'task-completed' : ''} ${activeId === task.id ? 'task-selected' : ''}`}>
        <div className="task-card-top"><button className={`task-checkbox ${task.completed ? 'is-checked' : ''}`} role="checkbox" aria-checked={task.completed} aria-label={`${task.completed ? '取消完成' : '完成'}：${task.title}`} onClick={() => { void store.toggle(task.id).catch(e => onError(e.message)); }}>{task.completed && <Check size={12} strokeWidth={3} />}</button><button className="task-title" onClick={() => onOpen(task)}>{task.title}</button><span className="task-open-arrow"><ArrowUpRight size={13} /></span></div>
        <button className="task-card-body" onClick={() => onOpen(task)} aria-label={`编辑：${task.title}`}>
          <div className="task-time"><span>开始</span><time>{formatDateTime(task.start)}</time></div><div className="task-time"><span>截止</span><time>{formatDateTime(task.end)}</time></div>
          <div className="task-progress-info"><span className={`task-status status-${state.key}`}><i />{state.label}</span><span>时间进度 <b>{percent}%</b></span></div><div className="task-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${task.title}时间进度`}><span style={{ width: `${percent}%` }} /></div>
        </button>
      </article>; })}
      {!tasks.length && <div className="sidebar-empty"><FolderOpen size={33} strokeWidth={1.2} /><strong>{query ? '没有找到相关待办' : filter === 'completed' ? '完成的小事会留在这里' : '为今天安排一件小事'}</strong><p>{query ? '试试其他关键词' : '从一个小小的计划开始'}</p>{!query && filter !== 'completed' && <button className="text-button" disabled={!ready} onClick={onNew}>新建待办 <Plus size={13} /></button>}</div>}
      {tasks.length > 0 && <div className="list-end"><span />{filter === 'completed' ? '那些完成的事，都值得记住' : '按自己的节奏，一件一件来'}<span /></div>}
    </div>
    <div className="sidebar-bottom"><div className="gentle-note"><PluginIcon size={24} /><div><strong>不必匆忙，保持向前。</strong><p>给计划一点时间，也给自己一点空间。</p></div></div></div>
  </aside>;
}
