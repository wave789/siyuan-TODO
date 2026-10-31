import { useEffect, useRef, useState } from 'react';
import { AlignLeft, Bell, CalendarClock, Check, CheckCircle2, ChevronDown, Circle, Clock3, FileText, History, Save, Tag, Trash2 } from './icons';
import { COLORS, defaultDraft, elapsedRatio, formatDateTime, status, taskDraft, validateDraft, type Task, type TaskDraft } from './model';
import { DateTimePicker } from './DateTimePicker';
import type { TaskStore } from './store';
import { useMountedRef } from './useMountedRef';

export function TaskEditor({ task, day, store, now, onSaved, onClose, onToast, onDirty }: {
  task?: Task; day: Date; store: TaskStore; now: number; onSaved: (id: string) => void; onClose: (force?: boolean) => void;
  onToast: (message: string, error?: boolean) => void; onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => task ? taskDraft(task) : defaultDraft(day));
  const baseline = useRef(task ? taskDraft(task) : undefined);
  const dirty = useRef(false);
  const saving = useRef(false);
  const mounted = useMountedRef();
  useEffect(() => {
    if (task && !dirty.current) { baseline.current = taskDraft(task); setDraft(taskDraft(task)); }
  }, [task]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    if (saving.current) return;
    dirty.current = true; setDraft(current => ({ ...current, [key]: value })); onDirty(true); setError(null);
  }
  async function save() {
    if (saving.current) return;
    const invalid = validateDraft(draft); if (invalid) { setError(invalid); return; }
    saving.current = true; setBusy(true);
    try {
      const id = await store.saveTask(draft, task?.id, baseline.current);
      if (!mounted.current) return;
      const saved = store.getSnapshot().data.tasks.find(t => t.id === id);
      if (saved) { baseline.current = taskDraft(saved); setDraft(taskDraft(saved)); }
      dirty.current = false; onDirty(false); onSaved(id); onToast(task ? '修改已保存，每一份计划都算数。' : '待办已创建，向前迈出一小步。');
    }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败'); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  async function remove() {
    if (!task || saving.current) return;
    saving.current = true; setBusy(true);
    try { await store.remove(task.id); if (mounted.current) { onToast('待办已删除'); onClose(true); } }
    catch (e) { if (mounted.current) onToast(e instanceof Error ? e.message : '删除失败', true); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  const percent = Math.round(elapsedRatio({ ...draft, completed: task?.completed, completedAt: task?.completedAt }, now) * 100);
  return <div className="editor-container"><div className="editor-heading"><div className="editor-heading-icon"><FileText size={22} strokeWidth={1.5} /></div><div><span className="eyebrow">{task ? 'EVERY DETAIL MATTERS' : 'A SMALL STEP FORWARD'}</span><h2>{task ? '待办详情' : '记录一件新的小事'}</h2><p>{task ? '让想法更清晰，让计划更靠近。' : '把想做的事写下来，剩下的慢慢实现。'}</p></div>{task && <button className={`completion-button ${task.completed ? 'is-completed' : ''}`} onClick={() => { void store.toggle(task.id).catch(e => onToast(e.message, true)); }}>{task.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}{task.completed ? '已完成' : '标记完成'}</button>}</div>
    <form className="task-form" onSubmit={e => { e.preventDefault(); void save(); }}><fieldset className="task-form-fields" disabled={busy}>
      <label className="form-field title-field"><span><FileText size={14} />任务标题 <b>*</b></span><input autoFocus maxLength={200} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="想做些什么？" aria-label="任务标题" /><small>{draft.title.length} / 200</small></label>
      <label className="form-field"><span><AlignLeft size={14} />具体细节</span><textarea value={draft.details} maxLength={100000} onChange={e => update('details', e.target.value)} placeholder="写下具体步骤、灵感或需要记住的事…" aria-label="具体细节" rows={5} /></label>
      <div className="form-time-row"><div className="form-field"><label><CalendarClock size={14} />开始时间 <b>*</b></label><DateTimePicker label="开始时间" value={draft.start} onChange={value => update('start', value)} /></div><div className="time-row-divider">→</div><div className="form-field"><label><CalendarClock size={14} />结束时间 <b>*</b></label><DateTimePicker label="结束时间" value={draft.end} onChange={value => update('end', value)} /></div></div>
      <div className="form-options-row"><label className="form-field"><span><Tag size={14} />任务分类</span><div className="select-wrap"><select aria-label="任务分类" value={draft.category} onChange={e => update('category', e.target.value)}>{['工作', '学习', '生活', '其他', ...(!['工作', '学习', '生活', '其他'].includes(draft.category) ? [draft.category] : [])].map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14} /></div></label><div className="form-field"><label>任务配色</label><div className="color-picker">{COLORS.map(color => <button key={color} type="button" className={`color-swatch color-${color} ${draft.color === color ? 'selected' : ''}`} aria-label={`选择${({ sage: '草木绿', amber: '暖阳橙', blue: '雾霭蓝', violet: '浅藤紫' })[color]}`} aria-pressed={draft.color === color} onClick={() => update('color', color)}>{draft.color === color && <Check size={13} />}</button>)}</div></div></div>
      <div className="reminder-setting"><span className="reminder-icon"><Bell size={19} strokeWidth={1.6} /></span><div><strong>给计划一个温柔的提醒</strong><p>思源运行时，会在选定的时间提醒你。</p></div><div className="select-wrap"><select aria-label="截止提醒" value={draft.remindMinutes === null ? 'none' : draft.remindMinutes} onChange={e => update('remindMinutes', e.target.value === 'none' ? null : Number(e.target.value))}><option value="none">不提醒</option><option value="0">截止时提醒</option><option value="5">提前 5 分钟</option><option value="15">提前 15 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option><option value="1440">提前 1 天</option></select><ChevronDown size={14} /></div></div>
      <label className="start-reminder"><input type="checkbox" checked={draft.remindStart} onChange={e => update('remindStart', e.target.checked)} />同时在任务开始时提醒我</label>
      {task && <div className="editor-progress"><div><Clock3 size={14} /><span>时间进度</span><strong>{percent}%</strong><small>{status(task, now).label}</small></div><div className={`task-progress color-${draft.color}`}><span style={{ width: `${percent}%` }} /></div></div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions">{task && <button type="button" className="delete-button" disabled={busy} onClick={() => setDeleteConfirm(true)}><Trash2 size={15} />删除待办</button>}<span /><button type="button" className="secondary-button" onClick={() => onClose()}>关闭</button><button type="submit" className="primary-button" disabled={busy}><Save size={15} />{busy ? '正在保存…' : task ? '保存修改' : '创建待办'}</button></div>
    </fieldset></form>
    {task && <div className="task-record"><button onClick={() => setShowHistory(!showHistory)}><History size={14} />任务记录<span>{task.history.length}</span><ChevronDown size={13} className={showHistory ? 'rotate-180' : ''} /></button>{showHistory && <ol>{task.history.slice().reverse().map((event, i) => <li key={`${event.at}-${i}`}><i /><span>{({ created: '创建了这件待办', updated: '更新了任务细节', completed: Date.parse(event.at) > Date.parse(task.end) ? '逾期完成了这件待办' : '完成了这件待办', reopened: '重新打开了待办' })[event.action]}</span><time>{formatDateTime(event.at)}</time></li>)}</ol>}<p>创建于 {formatDateTime(task.createdAt)} · 最近更新 {formatDateTime(task.updatedAt)}</p></div>}
    {deleteConfirm && <div className="sx-modal-backdrop"><div className="sx-modal small-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-symbol danger"><Trash2 size={24} /></div><h2 id="delete-title">删除这件待办？</h2><p>“{task?.title}”的详情与记录会一并删除。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteConfirm(false)}>再想想</button><button className="danger-button" disabled={busy} onClick={() => { void remove(); }}>确认删除</button></div></div></div>}
  </div>;
}
