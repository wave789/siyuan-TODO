import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, EmptyTodo, Plus } from './icons';
import { addDays, dateKey, startOfDay, startOfWeek, tasksOnDay, timeLabel, WEEKDAYS, type Task, type View } from './model';
import { CALENDAR_LEGEND, calendarMarkerClass } from './calendar-colors';

interface CalendarProps {
  tasks: Task[]; view: View; date: Date; selectedDay: Date;
  filtered?: boolean;
  onDate: (date: Date) => void; onSelectDay: (date: Date) => void;
  onTask: (task: Task) => void; onNew: (date: Date) => void; onView: (view: View) => void;
}
function TaskPill({ task, onClick }: { task: Task; onClick: () => void }) {
  return <button className={`calendar-event color-${task.color} ${calendarMarkerClass(task)} ${task.completed ? 'event-completed' : ''}`} onClick={event => { event.stopPropagation(); onClick(); }} title={`${task.title} · ${timeLabel(task.start)}–${timeLabel(task.end)}`}>
    {task.completed ? <Check size={10} /> : <span className="event-dot" />}<span>{task.title}</span><time>{timeLabel(task.start)}</time>
  </button>;
}
export function CalendarLegend() {
  return <div className="calendar-legend"><div>{CALENDAR_LEGEND.map(item => <span key={item.key} className={`calendar-marker-${item.key}${item.key === 'completed' ? ' legend-completed' : ''}`}>
    {item.key === 'completed' ? <Check size={12} /> : <i className="legend-dot" />}{item.label}
  </span>)}</div><span>点击日期空白查看下方清单，点击待办编辑详情</span></div>;
}
export function calendarTitle(date: Date, view: View): string {
  if (view === 'year') return `${date.getFullYear()} 年`;
  if (view === 'day') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  if (view === 'week') {
    const start = startOfWeek(date), end = addDays(start, 6);
    const endYear = end.getFullYear() === start.getFullYear() ? '' : `${end.getFullYear()}年`;
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 至 ${endYear}${end.getMonth() + 1}月${end.getDate()}日`;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}
export function navigateDate(date: Date, view: View, amount: number): Date {
  const d = new Date(date);
  if (view === 'year') { const month = d.getMonth(); d.setDate(1); d.setFullYear(d.getFullYear() + amount); d.setMonth(month); }
  else if (view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + amount); }
  else d.setDate(d.getDate() + amount * (view === 'week' ? 7 : 1));
  return d;
}
export function CalendarNavigation({ date, view, onDate }: Pick<CalendarProps, 'date' | 'view' | 'onDate'>) {
  return <div className="calendar-navigation"><h2>{calendarTitle(date, view)}</h2><div className="date-arrows"><button className="icon-button" aria-label="上一时段" onClick={() => onDate(navigateDate(date, view, -1))}><ChevronLeft size={17} /></button><button className="today-button" onClick={() => onDate(new Date())}>今天</button><button className="icon-button" aria-label="下一时段" onClick={() => onDate(navigateDate(date, view, 1))}><ChevronRight size={17} /></button></div></div>;
}
export function Calendar(props: CalendarProps) {
  if (props.view === 'year') return <YearCalendar {...props} />;
  if (props.view === 'week' || props.view === 'day') return <AgendaCalendar {...props} />;
  return <MonthCalendar {...props} />;
}
function MonthCalendar({ tasks, date, selectedDay, onSelectDay, onTask, onNew }: CalendarProps) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const count = Math.ceil((((first.getDay() + 6) % 7) + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / 7) * 7;
  const today = dateKey(new Date());
  return <div className="month-calendar">
    <div className="week-labels">{WEEKDAYS.map((day, i) => <span className={i > 4 ? 'is-weekend' : ''} key={day}>周{day}</span>)}</div>
    <div className="month-grid" style={{ gridTemplateRows: `repeat(${count / 7}, minmax(88px, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => {
        const day = addDays(start, i); const key = dateKey(day); const entries = tasksOnDay(tasks, day);
        return <div className={`month-cell ${day.getMonth() !== date.getMonth() ? 'outside-month' : ''} ${key === dateKey(selectedDay) ? 'selected-day' : ''} ${i % 7 > 4 ? 'weekend-cell' : ''}`} key={key} data-date={key} role="group" aria-label={`${key} 待办`} tabIndex={0} onClick={() => onSelectDay(day)} onKeyDown={event => {
          if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelectDay(day); }
        }}>
          <div className="cell-top"><button className={`day-number ${key === today ? 'is-today' : ''}`} aria-label={`选择 ${key}`} aria-pressed={key === dateKey(selectedDay)} onClick={e => { e.stopPropagation(); onSelectDay(day); }}>{day.getDate()}</button>{key === today && <span className="today-label">今天</span>}<button className="cell-add" aria-label={`在 ${key} 新建待办`} onClick={e => { e.stopPropagation(); onNew(day); }}><Plus size={13} /></button></div>
          <div className="cell-events">{entries.slice(0, 2).map(task => <TaskPill key={task.id} task={task} onClick={() => onTask(task)} />)}{entries.length > 2 && <button className="more-events" onClick={event => { event.stopPropagation(); onSelectDay(day); }}>还有 {entries.length - 2} 件待办</button>}</div>
        </div>;
      })}
    </div>
  </div>;
}
function YearCalendar({ date, tasks, selectedDay, onSelectDay, onDate, onView }: CalendarProps) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => {
    const first = new Date(date.getFullYear(), month, 1), start = startOfWeek(first);
    const total = new Date(date.getFullYear(), month + 1, 0).getDate();
    const count = tasks.filter(t => Date.parse(t.start) < new Date(date.getFullYear(), month + 1, 1).getTime() && Date.parse(t.end) > first.getTime()).length;
    return <div className="mini-month" key={month}><button className="mini-title" onClick={() => { onDate(first); onView('month'); }}><strong>{month + 1} 月</strong><span>{count ? `${count} 件待办` : '暂无待办'}<ArrowUpRight size={13} /></span></button><div className="mini-days">{WEEKDAYS.map(d => <span className="mini-weekday" key={d}>{d}</span>)}{Array.from({ length: 42 }, (_, i) => {
      const day = addDays(start, i), inside = day.getMonth() === month;
      const key = dateKey(day);
      return <button key={i} disabled={!inside} data-date={inside ? key : undefined} aria-label={inside ? `选择 ${key}` : undefined} aria-pressed={inside && key === dateKey(selectedDay)} className={`${key === dateKey(new Date()) ? 'mini-today' : ''} ${inside && key === dateKey(selectedDay) ? 'mini-selected' : ''} ${inside && tasksOnDay(tasks, day).length ? 'has-tasks' : ''}`} onClick={() => onSelectDay(day)}>{inside && day.getDate()}</button>;
    })}</div><span className="sr-only">本月 {total} 天</span></div>;
  })}</div>;
}
function AgendaTaskCard({ task, day, showDetails, onTask }: { task: Task; day: Date; showDetails: boolean; onTask: (task: Task) => void }) {
  const key = dateKey(day);
  return <button className={`agenda-task color-${task.color} ${calendarMarkerClass(task)} ${task.completed ? 'event-completed' : ''}`} onClick={event => { event.stopPropagation(); onTask(task); }}>
    <div className="agenda-task-title">
      <span className={`agenda-task-marker ${calendarMarkerClass(task)}`} aria-hidden="true" />
      <strong>{task.title}</strong>
    </div>
    <div className="agenda-task-time" title="任务时间">
      <CalendarDays size={16} />
      <span>{dateKey(task.start) === key ? timeLabel(task.start) : '前日开始'} — {dateKey(task.end) === key ? timeLabel(task.end) : '跨日待办'}</span>
    </div>
    {showDetails && <p>{task.details || '还没有填写具体细节'}</p>}
    <small>{task.category}{task.completed ? ' · 已完成' : ''}</small>
  </button>;
}
function AgendaCalendar({ view, date, tasks, selectedDay, filtered = false, onSelectDay, onTask, onNew }: CalendarProps) {
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [startOfDay(date)];
  return <div className={`agenda-view ${view === 'day' ? 'agenda-single' : ''}`}>
    {days.map(day => {
      const entries = tasksOnDay(tasks, day);
      const key = dateKey(day);
      return <section className={`agenda-day ${key === dateKey(new Date()) ? 'agenda-today' : ''} ${key === dateKey(selectedDay) ? 'agenda-selected' : ''}`} key={key} data-date={key} role="group" aria-label={`${key} 待办`} tabIndex={0} onClick={() => onSelectDay(day)} onKeyDown={event => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelectDay(day); }
      }}>
        <div className="agenda-heading"><button aria-label={`选择 ${key}`} aria-pressed={key === dateKey(selectedDay)} onClick={event => { event.stopPropagation(); onSelectDay(day); }}><span>星期{WEEKDAYS[(day.getDay() + 6) % 7]}</span><strong>{day.getDate()}</strong></button><span>{entries.length} 件待办</span><button className="icon-button" aria-label={`在 ${key} 新建待办`} onClick={event => { event.stopPropagation(); onNew(day); }}><Plus size={15} /></button></div>
        <div className="agenda-items">{entries.length ? entries.map(task => <AgendaTaskCard key={task.id} task={task} day={day} showDetails={view === 'day'} onTask={onTask} />) : <div className="agenda-empty"><EmptyTodo size={30} strokeWidth={1.5} /><div className="agenda-empty-copy"><strong>{filtered ? '当前筛选下暂无待办' : '这一天还没有待办'}</strong><button type="button" className="agenda-empty-create" onClick={event => { event.stopPropagation(); onSelectDay(day); onNew(day); }}>点击新建待办</button></div></div>}</div>
      </section>;
    })}
  </div>;
}
