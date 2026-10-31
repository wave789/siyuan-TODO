import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ExportFile, ArrowRight, ImportFile, Bell, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheck, Clock3, Ellipsis, Eye, EyeOff, FileJson, DayPlan, FolderOpen, HardDrive, LayoutGrid, ListTodo, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, Settings2, ShieldCheck, Sprout, X } from './icons';
import { Calendar, CalendarNavigation, CalendarLegend } from './Calendar';
import { calendarMarkerClass } from './calendar-colors';
import { Brand, TaskList } from './TaskList';
import { PluginIcon } from './PluginIcon';
import { TaskEditor } from './TaskEditor';
import { dateKey, formatDateTime, parseTaskFile, status, tasksOnDay, WEEKDAYS, type DueReminder, type Task, type TaskFile, type View } from './model';
import { desktopNotify, startReminders } from './reminders';
import type { TaskStore } from './store';
import { useMountedRef } from './useMountedRef';
import manifest from '../plugin.json';

interface EditorTab { key: string; taskId?: string; day: Date; dirty: boolean; }
export type WorkspaceOpenHandler = (taskId: string) => void;
export interface AppProps { store: TaskStore; mode?: 'preview' | 'plugin'; showSidebar?: boolean; initialTaskId?: string; storagePath?: string; onWorkspaceReady?: (open: WorkspaceOpenHandler) => (() => void); }

export function App({ store, mode = 'preview', showSidebar = true, initialTaskId, storagePath = '浏览器本地存储（localStorage）', onWorkspaceReady }: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { data, saving, error, ready } = snapshot;
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [category, setCategory] = useState('全部分类');
  const [showCompleted, setShowCompleted] = useState(true);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState('calendar');
  const initialRequest = useRef(initialTaskId);
  const [modal, setModal] = useState<'help' | 'settings' | 'import' | null>(null);
  const [pendingImport, setPendingImport] = useState<TaskFile | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [discardTab, setDiscardTab] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState(false);
  const [reminderPanel, setReminderPanel] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(typeof Notification === 'undefined' ? 'unavailable' : Notification.permission);
  const [reminderHistory, setReminderHistory] = useState<DueReminder[]>([]);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const mounted = useMountedRef();
  const toastMessage = useCallback((text: string, isError = false) => {
    if (!mounted.current) return;
    setToast({ text, error: isError });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), isError ? 7000 : 4000);
  }, [mounted]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => { clearInterval(timer); if (toastTimer.current) clearTimeout(toastTimer.current); }; }, []);
  useEffect(() => {
    if (mode !== 'preview') return;
    return startReminders(store, events => {
      desktopNotify(events); setReminderHistory(list => [...events, ...list].slice(0, 50));
      toastMessage(events.length === 1 ? `${events[0].title} · ${events[0].body}` : `有 ${events.length} 条新的待办提醒`);
    });
  }, [store, mode, toastMessage]);
  const openTask = useCallback((task: Task) => {
    setTabs(previous => previous.some(tab => tab.taskId === task.id) ? previous : [...previous, { key: task.id, taskId: task.id, day: new Date(task.start), dirty: false }]);
    setActiveTab(task.id);
  }, []);
  const newTask = useCallback((day = selectedDay) => {
    if (!store.getSnapshot().ready) return;
    const key = `new-${crypto.randomUUID()}`;
    setTabs(previous => [...previous, { key, day, dirty: false }]); setActiveTab(key);
  }, [store, selectedDay]);
  const handleWorkspaceOpen = useCallback((id: string) => {
    if (id === 'new') newTask();
    else if (id === 'calendar') setActiveTab('calendar');
    else { const task = store.getSnapshot().data.tasks.find(t => t.id === id); if (task) openTask(task); }
  }, [newTask, openTask, store]);
  useEffect(() => {
    if (!ready) return;
    const initial = initialRequest.current; initialRequest.current = undefined;
    if (initial) handleWorkspaceOpen(initial);
    return onWorkspaceReady?.(handleWorkspaceOpen);
  }, [ready, handleWorkspaceOpen, onWorkspaceReady]);
  useEffect(() => {
    const reminders = (event: Event) => { const events = (event as CustomEvent<DueReminder[]>).detail; setReminderHistory(list => [...events, ...list].slice(0, 50)); toastMessage(events.length === 1 ? `${events[0].title} · ${events[0].body}` : `有 ${events.length} 条待办提醒`); };
    window.addEventListener('stodo:reminders', reminders);
    return () => { window.removeEventListener('stodo:reminders', reminders); };
  }, [toastMessage]);
  useEffect(() => {
    if (!actionMenu) return;
    const close = (event: PointerEvent) => { if (!actionsRef.current?.contains(event.target as Node)) setActionMenu(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [actionMenu]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (!importBusy) setModal(null); setReminderPanel(false); setActionMenu(false); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [importBusy]);
  useEffect(() => { if (modal !== 'import') setPendingImport(null); }, [modal]);
  useEffect(() => {
    if (!tabs.some(t => t.dirty)) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [tabs]);
  function closeTab(key: string, force = false) {
    const tab = tabs.find(t => t.key === key);
    if (tab?.dirty && !force) { setDiscardTab(key); return; }
    setTabs(previous => previous.filter(t => t.key !== key));
    setActiveTab(active => active === key ? 'calendar' : active);
    setDiscardTab(null);
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `siyuan-TODO待办-${dateKey(new Date())}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toastMessage(`已导出 ${data.tasks.length} 件待办`); setActionMenu(false);
  }
  async function readImport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
      const imported = parseTaskFile(JSON.parse(await file.text()));
      if (mounted.current) { setPendingImport(imported); setModal('import'); }
    } catch (e) { toastMessage(e instanceof SyntaxError ? 'JSON 文件无法解析，请检查文件内容' : e instanceof Error ? e.message : '无法读取文件', true); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  }
  async function confirmImport() {
    if (!pendingImport || importBusy) return;
    setImportBusy(true);
    try { await store.merge(pendingImport); if (mounted.current) { toastMessage('导入完成，已合并任务并保留较新的记录'); setModal(null); setPendingImport(null); } }
    catch (e) { toastMessage(e instanceof Error ? e.message : '导入失败', true); }
    finally { if (mounted.current) setImportBusy(false); }
  }
  async function enableNotifications() {
    if (typeof Notification === 'undefined') { toastMessage('当前环境不支持系统通知，仍会显示应用内提醒'); return; }
    try { const result = await Notification.requestPermission(); if (mounted.current) { setNotificationPermission(result); toastMessage(result === 'granted' ? '系统通知已开启' : '可在浏览器或系统设置中允许通知，应用内提醒仍可用'); } }
    catch { toastMessage('系统通知不可用，应用内提醒仍可用'); }
  }
  const today = new Date(now);
  const completed = data.tasks.filter(t => t.completed).length;
  const ongoing = data.tasks.filter(t => status(t, now).key === 'active').length;
  const dueToday = data.tasks.filter(t => !t.completed && dateKey(t.end) === dateKey(today)).length;
  const visibleTasks = data.tasks.filter(t => (showCompleted || !t.completed) && (category === '全部分类' || t.category === category));
  const categories = [...new Set(data.tasks.map(t => t.category))];
  const selectedTasks = tasksOnDay(data.tasks, selectedDay);
  const activeEditor = tabs.find(t => t.key === activeTab);
  const upcoming = data.tasks.filter(t => !t.completed && t.remindMinutes !== null && Date.parse(t.end) > now).sort((a, b) => Date.parse(a.end) - Date.parse(b.end));

  return <div className={`stodo-app ${mode === 'plugin' ? 'plugin-mode' : ''} ${activeTab !== 'calendar' ? 'editor-active' : ''}`}>
    {mode === 'preview' && <nav className="app-rail" aria-label="应用导航"><button className="rail-logo" title="siyuan-TODO" onClick={() => setModal('help')}><PluginIcon size={35} /></button><div className="rail-divider" /><button className={`rail-button ${activeTab !== 'calendar' ? 'rail-active' : ''}`} aria-label="待办任务" onClick={() => { setSidebarOpen(!sidebarOpen); }}><ListTodo size={21} /></button><button className={`rail-button ${activeTab === 'calendar' ? 'rail-active' : ''}`} aria-label="日程总览" onClick={() => setActiveTab('calendar')}><CalendarDays size={20} /></button><button className={`rail-button ${reminderPanel ? 'rail-active' : ''}`} aria-label="提醒中心" onClick={() => setReminderPanel(!reminderPanel)}><Bell size={20} />{reminderHistory.length > 0 && <i className="rail-notification-dot" />}</button><span className="rail-spacer" /><button className="rail-button" aria-label="设置" onClick={() => setModal('settings')}><Settings2 size={20} /></button><button className="rail-avatar" aria-label="本地工作空间" onClick={() => setModal('help')}>T</button></nav>}
    {showSidebar && sidebarOpen && <TaskList store={store} now={now} activeId={activeEditor?.taskId} onOpen={openTask} onNew={() => newTask()} onError={text => toastMessage(text, true)} />}
    <main className="main-workspace">
      <header className="workspace-topbar"><div className="workspace-title">{showSidebar && <button className="icon-button sidebar-toggle" aria-label={sidebarOpen ? '收起任务列表' : '展开任务列表'} onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>}<PluginIcon size={20} /><h1>小事有序，生活从容。</h1></div><div className="workspace-top-actions"><StorageStatus saving={saving} error={error} path={storagePath} /><button className="icon-button" aria-label="提醒中心" onClick={() => setReminderPanel(!reminderPanel)}><Bell size={17} /></button><div className="action-menu-root" ref={actionsRef}><button className="icon-button" aria-label="更多操作" onClick={() => setActionMenu(!actionMenu)}><Ellipsis size={20} /></button>{actionMenu && <div className="action-menu"><button onClick={() => { fileInput.current?.click(); setActionMenu(false); }}><ImportFile size={15} />导入</button><button onClick={exportFile}><ExportFile size={15} />导出</button><button onClick={() => { setModal('settings'); setActionMenu(false); }}><Settings2 size={15} />提醒与存储</button><button onClick={() => { setModal('help'); setActionMenu(false); }}><FileJson size={15} />使用说明</button></div>}</div></div></header>
      <div className="workspace-scroll">
        <section className="page-intro"><div><div className="intro-eyebrow"><span />A LITTLE MORE ORGANIZED, EVERY DAY</div><p>把想做的事交给计划，把更多的时间留给生活。</p></div><div className="intro-date"><span>{today.getFullYear()} 年 {today.getMonth() + 1} 月 {today.getDate()} 日</span><strong>星期{WEEKDAYS[(today.getDay() + 6) % 7]}<span> · </span>好好过今天</strong></div></section>
        {error && <div className="storage-error" role="alert"><HardDrive size={17} /><span>{error}</span>{!ready && <button onClick={() => { void store.init().catch(() => {}); }}>重试读取</button>}</div>}
        <section className="stats-row" aria-label="待办统计"><Stat label="全部待办" value={data.tasks.length} sub="每一件，都值得记住" icon={<LayoutGrid size={18} />} /><Stat label="进行中" value={ongoing} sub="保持节奏，慢慢向前" icon={<Clock3 size={18} />} color="sage" /><Stat label="今日截止" value={dueToday} sub={dueToday ? '记得给它们一点关注' : '今天没有待办截止'} icon={<CalendarDays size={18} />} color="amber" /><Stat label="已经完成" value={completed} sub="积累每一个小小成就" icon={<CircleCheck size={19} />} color="blue" /></section>
        <section className="calendar-panel">
          <div className="view-toolbar"><div className="view-switcher" role="tablist" aria-label="日历视图">{(['year', 'month', 'week', 'day'] as const).map(v => <button role="tab" aria-selected={view === v && activeTab === 'calendar'} key={v} className={view === v && activeTab === 'calendar' ? 'is-active' : ''} onClick={() => { setView(v); setActiveTab('calendar'); }}>{({ year: '年', month: '月', week: '周', day: '日' })[v]}</button>)}</div><span className="view-caption"><CalendarDays size={13} />让计划一目了然</span><button className="primary-button new-task-button" disabled={!ready} onClick={() => newTask()}><Plus size={17} />新建待办</button></div>
          {tabs.length > 0 && <div className="editor-tabs" role="tablist" aria-label="打开的任务标签"><button role="tab" aria-selected={activeTab === 'calendar'} className={activeTab === 'calendar' ? 'active-editor-tab' : ''} onClick={() => setActiveTab('calendar')}><CalendarDays size={13} />日程总览</button>{tabs.map(tab => <div className={`editor-tab-item ${activeTab === tab.key ? 'active-editor-tab' : ''}`} key={tab.key}><button role="tab" aria-selected={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}><FileJson size={12} /><span>{tab.taskId ? data.tasks.find(t => t.id === tab.taskId)?.title || '已删除的待办' : '新建待办'}</span>{tab.dirty && <i className="unsaved-dot" />}</button><button className="close-tab" aria-label={`关闭标签 ${tab.taskId ? data.tasks.find(t => t.id === tab.taskId)?.title : '新建待办'}`} onClick={() => closeTab(tab.key)}><X size={12} /></button></div>)}</div>}
          {activeTab === 'calendar' && <><div className="calendar-heading"><CalendarNavigation date={date} view={view} onDate={d => { setDate(d); setSelectedDay(d); }} /><div className="calendar-filters"><div className="select-wrap"><span className="category-dot" /><select aria-label="日历分类筛选" value={category} onChange={e => setCategory(e.target.value)}><option>全部分类</option>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={12} /></div><button className={`icon-button completed-toggle ${showCompleted ? '' : 'is-active'}`} aria-label={showCompleted ? '隐藏已完成任务' : '显示已完成任务'} title={showCompleted ? '隐藏已完成任务' : '显示已完成任务'} onClick={() => setShowCompleted(!showCompleted)}>{showCompleted ? <Eye size={18} strokeWidth={1.6} /> : <EyeOff size={18} strokeWidth={1.6} />}</button></div></div><Calendar tasks={visibleTasks} filtered={category !== '全部分类' || !showCompleted} view={view} date={date} selectedDay={selectedDay} onDate={setDate} onSelectDay={setSelectedDay} onTask={openTask} onNew={newTask} onView={setView} /><CalendarLegend /></>}
          {tabs.map(tab => <div key={tab.key} hidden={activeTab !== tab.key}>{!tab.taskId || data.tasks.some(t => t.id === tab.taskId) ? <TaskEditor task={data.tasks.find(t => t.id === tab.taskId)} day={tab.day} store={store} now={now} onSaved={id => { setTabs(previous => previous.map(t => t.key === tab.key ? { ...t, taskId: id, key: id, dirty: false } : t)); setActiveTab(active => active === tab.key ? id : active); }} onClose={force => closeTab(tab.key, force)} onToast={toastMessage} onDirty={dirty => setTabs(previous => previous.map(t => t.key === tab.key ? { ...t, dirty } : t))} /> : <div className="deleted-task"><FolderOpen size={32} /><p>这件待办已被删除</p><button className="secondary-button" onClick={() => closeTab(tab.key, true)}>返回日程</button></div>}</div>)}
        </section>
        {activeTab === 'calendar' && <section className="day-overview" aria-label="所选日期待办" data-selected-date={dateKey(selectedDay)}>
          <div className="day-overview-heading">
            <span className="overview-symbol"><DayPlan size={24} strokeWidth={1.6} /></span>
            <div><h3>{dateKey(selectedDay) === dateKey(today) ? '今天的小目标' : `${selectedDay.getMonth() + 1} 月 ${selectedDay.getDate()} 日的待办`}</h3><p>{selectedTasks.length} 件小事，按自己的节奏完成。</p></div>
            <span className="overview-count">{selectedTasks.filter(task => task.completed).length}<i> / {selectedTasks.length}</i></span>
          </div>
          {selectedTasks.length ? <ol className="overview-tasks" aria-label="当日全部待办">
            {selectedTasks.map((task, index) => {
              const taskStatus = status(task, now);
              return <li key={task.id}>
                <button onClick={() => openTask(task)} className={task.completed ? 'overview-completed' : ''}>
                  <span className="overview-task-number" aria-hidden="true">{index + 1}.</span>
                  <span className={`overview-task-dot color-${task.color} ${calendarMarkerClass(task)}`}>{task.completed && <Check size={11} />}</span>
                  <span className="overview-task-copy"><strong>{task.title}</strong><span>{task.category} · {formatDateTime(task.start)} → {formatDateTime(task.end)}</span></span>
                  <span className={`overview-task-status status-${taskStatus.key}`}>{taskStatus.label}</span><ChevronRight size={15} />
                </button>
              </li>;
            })}
          </ol> : <button className="empty-overview" onClick={() => newTask(selectedDay)}><Plus size={17} />添加一件想做的事<ArrowRight size={15} /></button>}
        </section>}
        <footer className="workspace-footer"><span><PluginIcon size={13} /><span>把日子理顺，把心安放。</span></span><span>siyuan-TODO v{manifest.version}</span></footer>
      </div>
    </main>
    <input type="file" ref={fileInput} accept="application/json,.json" hidden onChange={e => { void readImport(e.target.files?.[0]); }} data-testid="import-file" />
    {toast && <div role={toast.error ? 'alert' : 'status'} className={`sx-toast ${toast.error ? 'toast-error' : ''}`}>{toast.error ? <CircleCheck size={17} /> : <Check size={17} />}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="关闭提示"><X size={14} /></button></div>}
    {reminderPanel && <div className="sx-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setReminderPanel(false); }}><section className="sx-modal reminders-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title"><button className="modal-close icon-button" onClick={() => setReminderPanel(false)} aria-label="关闭提醒中心"><X size={18} /></button><div className="modal-symbol"><Bell size={25} strokeWidth={1.5} /></div><span className="eyebrow">A GENTLE NUDGE</span><h2 id="reminder-title">待办提醒</h2><p>不打扰你的专注，也不错过重要的小事。</p><div className="notification-banner"><ShieldCheck size={18} /><span>{notificationPermission === 'granted' ? '系统通知已开启' : '应用内提醒已启用'}</span><button onClick={() => { void enableNotifications(); }}>{notificationPermission === 'granted' ? '已开启' : '开启系统通知'}</button></div><h3 className="modal-section-title">{reminderHistory.length ? '最近提醒' : '即将提醒'}</h3><div className="reminder-list">{reminderHistory.length ? reminderHistory.map((r, i) => <button key={`${r.key}-${i}`} onClick={() => { const task = data.tasks.find(t => t.id === r.taskId); if (task) openTask(task); setReminderPanel(false); }}><Bell size={15} /><div><strong>{r.title}</strong><small>{r.body}</small></div><ChevronRight size={15} /></button>) : upcoming.length ? upcoming.slice(0, 8).map(task => <button key={task.id} onClick={() => { openTask(task); setReminderPanel(false); }}><Clock3 size={15} /><div><strong>{task.title}</strong><small>{formatDateTime(new Date(Date.parse(task.end) - (task.remindMinutes || 0) * 60000).toISOString())} 提醒</small></div><ChevronRight size={15} /></button>) : <div className="modal-empty"><Sprout size={28} /><p>暂时没有提醒，好好享受当下。</p></div>}</div><p className="modal-footnote">提醒每 15 秒检查一次，需保持{mode === 'preview' ? '此页面' : '思源和插件'}运行。</p></section></div>}
    {modal && <div className="sx-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !importBusy) setModal(null); }}><section className="sx-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label="关闭对话框" disabled={importBusy} onClick={() => setModal(null)}><X size={18} /></button>
      {modal === 'help' && <><Brand /><h2 id="modal-title">小事有序，生活从容。</h2><p>一个安静的待办空间，把计划、提醒和记录放在一起。</p><div className="help-features"><div><CalendarDays size={19} /><span><strong>换个角度看计划</strong><p>年、月、周、日视图，点击日历里的待办即可编辑。</p></span></div><div><ListTodo size={19} /><span><strong>记录每一份进展</strong><p>勾选完成，随时重新打开。进度条表示时间流逝比例。</p></span></div><div><CalendarDays size={19} /><span><strong>精确到每一分钟</strong><p>在时间选择器里选择日期，滚动小时和分钟列。</p></span></div><div><FileJson size={19} /><span><strong>计划留在自己手中</strong><p>JSON 导出备份；导入时按 ID 合并，保留更新的记录。</p></span></div></div><div className="storage-location"><HardDrive size={16} /><div><strong>数据存储位置</strong><code>{storagePath}</code>{mode === 'preview' && <p>预览首次载入示例待办；预览数据与思源插件数据独立。</p>}</div></div><button className="primary-button full-width" onClick={() => setModal(null)}>开始有序的一天<ArrowRight size={15} /></button></>}
      {modal === 'settings' && <><div className="modal-symbol"><Settings2 size={25} strokeWidth={1.5} /></div><span className="eyebrow">MAKE ROOM FOR WHAT MATTERS</span><h2 id="modal-title">提醒与存储</h2><p>让计划安心留存，让重要的事及时被记起。</p><div className="settings-section"><h3><Bell size={16} />提醒设置</h3><p>应用内提醒始终启用。每件待办可单独设置开始提醒和截止提醒；完成的待办不再提醒。</p><div className="settings-status"><span><i className={notificationPermission === 'granted' ? 'permission-on' : ''} />系统通知：{notificationPermission === 'granted' ? '已开启' : notificationPermission === 'denied' ? '已被系统阻止' : '尚未开启'}</span><button className="secondary-button" onClick={() => { void enableNotifications(); }}>允许通知</button></div><small>关闭应用后无法提醒；重新打开时补发最近 24 小时内错过的提醒。系统通知需浏览器或操作系统授权。</small></div><div className="settings-section"><h3><HardDrive size={16} />本地数据</h3><p>所有 {data.tasks.length} 件待办以 JSON 保存。导出文件包含任务详情、完成状态和变更记录。</p><code className="settings-path">{storagePath}</code><div className="settings-data-buttons"><button className="secondary-button" onClick={() => fileInput.current?.click()}><ImportFile size={15} />导入</button><button className="primary-button" onClick={exportFile}><ExportFile size={15} />导出备份</button></div></div></>}
      {modal === 'import' && pendingImport && <><div className="modal-symbol"><ImportFile size={25} strokeWidth={1.5} /></div><span className="eyebrow">BRING YOUR PLANS ALONG</span><h2 id="modal-title">把计划带回来</h2><p>已验证文件，准备导入 <strong>{pendingImport.tasks.length}</strong> 件待办。</p><div className="import-summary"><span><FileJson size={18} />JSON 格式 · 版本 1<Check size={16} /></span><p>相同 ID 的任务会合并，并保留更新时间较新的内容。现有的其他待办会继续保留。</p></div><div className="modal-actions"><button className="secondary-button" disabled={importBusy} onClick={() => setModal(null)}>取消</button><button className="primary-button" disabled={importBusy || !ready} onClick={() => { void confirmImport(); }}><ImportFile size={15} />{importBusy ? '正在导入…' : '确认导入'}</button></div></>}
    </section></div>}
    {discardTab && <div className="sx-modal-backdrop"><section className="sx-modal small-modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><div className="modal-symbol"><FileJson size={24} /></div><h2 id="discard-title">还有未保存的修改</h2><p>关闭标签后，这次修改将不会保留。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDiscardTab(null)}>继续编辑</button><button className="primary-button" onClick={() => closeTab(discardTab, true)}>放弃修改</button></div></section></div>}
  </div>;
}
function Stat({ label, value, sub, icon, color = 'neutral' }: { label: string; value: number; sub: string; icon: React.ReactNode; color?: string }) {
  return <div className={`stat-item stat-${color}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}<span>件</span></strong><p>{sub}</p></div>;
}

function StorageStatus({ saving, error, path }: { saving: boolean; error: string | null; path: string }) {
  const tooltipId = useId();
  return <span className={`save-status ${error ? 'save-error' : ''}`} tabIndex={0} aria-describedby={tooltipId}>
    {error ? <CircleCheck size={15} /> : saving ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}
    {error ? '存储异常' : saving ? '正在保存' : '已保存到本地'}
    <span id={tooltipId} className="save-path-tooltip" role="tooltip"><span>保存路径</span><code>{path}</code></span>
  </span>;
}
