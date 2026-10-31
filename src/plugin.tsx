import { Plugin, openTab, showMessage } from 'siyuan';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { App, type WorkspaceOpenHandler } from './App';
import { TaskList } from './TaskList';
import { TaskStore } from './store';
import { siyuanStorage } from './siyuan-storage';
import { desktopNotify, startReminders } from './reminders';
import type { Task } from './model';
import { LEGACY_PLUGIN_ID, migrateLegacyStorage } from './legacy-storage';
import artwork from './icon-artwork.json';
import './styles.css';

const TAB_TYPE = 'stodo-workspace';
const DOCK_TYPE = 'stodo-tasks';
const ICON = 'iconsiyuan-TODOTodo';

export default class SiyuanTodoPlugin extends Plugin {
  private store!: TaskStore;
  private roots = new Map<HTMLElement, Root>();
  private stopReminders?: () => void;
  private workspaceElement?: HTMLElement;
  private layoutReady = false;
  private dockInitialized = false;
  private workspaceData: Record<string, unknown> = {};
  private workspaceOpener?: WorkspaceOpenHandler;
  private workspaceOpening?: Promise<void>;
  private pendingWorkspaceTasks: string[] = [];
  private unloading = false;
  private lifecycle = 0;

  async onload() {
    this.unloading = false;
    const lifecycle = ++this.lifecycle;
    const store = this.store = new TaskStore(migrateLegacyStorage(siyuanStorage(this.name), siyuanStorage(LEGACY_PLUGIN_ID)));
    const mark: { paths: string[]; circles: number[][] } = artwork.TodoMark;
    this.addIcons(`<symbol id="${ICON}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${mark.paths.map(d => `<path d="${d}"/>`).join('')}${mark.circles.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('')}</g></symbol>`);
    // Register custom UI synchronously, before layout restoration.
    const plugin = this;
    this.addTab({ type: TAB_TYPE,
      init() {
        if (plugin.unloading || plugin.lifecycle !== lifecycle) return;
        const element = this.element as HTMLElement;
        plugin.workspaceElement = element;
        // Keep restored workspace data stable too; the host uses it as tab identity.
        plugin.workspaceData = this.data ?? {};
        plugin.workspaceOpener = undefined;
        element.style.height = '100%';
        const root = createRoot(element); plugin.roots.set(element, root);
        root.render(<App store={store} mode="plugin" showSidebar={false} initialTaskId={this.data?.taskId} storagePath={plugin.storagePath} onWorkspaceReady={open => {
          if (!plugin.unloading && plugin.lifecycle === lifecycle && plugin.workspaceElement === element) {
            plugin.workspaceOpener = open;
            plugin.flushWorkspaceTasks();
          }
          return () => { if (plugin.workspaceOpener === open) plugin.workspaceOpener = undefined; };
        }} />);
      },
      destroy() { plugin.unmount(this.element as HTMLElement); },
    });
    this.addDock({ type: DOCK_TYPE, config: { position: 'LeftTop', size: { width: 305, height: 0 }, icon: ICON, title: 'siyuan-TODO任务', hotkey: '⌥⌘T' }, data: {},
      init() {
        if (plugin.unloading || plugin.lifecycle !== lifecycle) return;
        const element = this.element as HTMLElement;
        element.classList.add('stodo-dock');
        const root = createRoot(element); plugin.roots.set(element, root);
        root.render(<Dock store={store} onOpen={taskId => plugin.openWorkspace(taskId)} />);
        plugin.dockInitialized = true;
        if (plugin.layoutReady && !plugin.workspaceElement?.isConnected) plugin.openWorkspace('calendar');
      },
      destroy() { plugin.unmount(this.element as HTMLElement); },
    });
    this.addCommand({ langKey: 'openTodo', langText: '打开siyuan-TODO待办', hotkey: '⇧⌘T', callback: () => this.openWorkspace('calendar') });
    try { await store.init(); }
    catch { if (!this.unloading && this.lifecycle === lifecycle) showMessage('siyuan-TODO：任务文件读取失败，原文件已保留，请在待办页查看详情。', 10000, 'error'); }
    // The host can disable the plugin while the initial file request is pending.
    if (this.unloading || this.lifecycle !== lifecycle) return;
    this.stopReminders = startReminders(store, events => {
      desktopNotify(events);
      const message = events.length === 1 ? `siyuan-TODO提醒：${events[0].title} · ${events[0].body}` : `siyuan-TODO：有 ${events.length} 条待办提醒，请打开待办查看。`;
      // showMessage renders HTML; render task titles as escaped plain text.
      const text = document.createElement('span'); text.textContent = message;
      showMessage(text.innerHTML, 10000);
      window.dispatchEvent(new CustomEvent('stodo:reminders', { detail: events }));
    });
  }
  onLayoutReady() {
    if (this.unloading) return;
    this.layoutReady = true;
    if (this.dockInitialized && !this.workspaceElement?.isConnected) this.openWorkspace('calendar');
  }
  private get storagePath() {
    const host = window as unknown as { siyuan?: { config?: { system?: { workspaceDir?: string } } } };
    const workspace = host.siyuan?.config?.system?.workspaceDir;
    const relative = `data/storage/petal/${this.name}/todos.json`;
    if (!workspace) return `工作空间/${relative}`;
    const separator = workspace.includes('\\') ? '\\' : '/';
    return `${workspace.replace(/[\\/]+$/, '')}${separator}${relative.replaceAll('/', separator)}`;
  }
  private unmount(element: HTMLElement) {
    this.roots.get(element)?.unmount(); this.roots.delete(element); element.classList.remove('stodo-dock');
    if (this.workspaceElement === element) {
      this.workspaceElement = undefined; this.workspaceOpener = undefined;
      this.workspaceData = {}; this.pendingWorkspaceTasks = [];
    }
  }
  private flushWorkspaceTasks() {
    if (this.unloading || !this.workspaceElement?.isConnected || !this.workspaceOpener) return;
    for (const taskId of this.pendingWorkspaceTasks.splice(0)) this.workspaceOpener(taskId);
  }
  private openWorkspace(taskId = 'calendar') {
    if (this.unloading) return;
    this.pendingWorkspaceTasks.push(taskId);
    this.flushWorkspaceTasks();
    if (this.workspaceOpening) return;
    const opening = this.revealWorkspace();
    this.workspaceOpening = opening;
    void opening.finally(() => { if (this.workspaceOpening === opening) this.workspaceOpening = undefined; });
  }
  private async revealWorkspace() {
    try {
      // SiYuan matches custom tabs by type AND data. Task IDs belong in the
      // internal editor tabs, not in the host workspace's identity.
      await openTab({ app: this.app, removeCurrentTab: false, custom: {
        id: `${this.name}${TAB_TYPE}`, icon: ICON, title: 'siyuan-TODO计划',
        data: this.workspaceElement?.isConnected ? this.workspaceData : {},
      } });
      this.flushWorkspaceTasks();
    } catch {
      this.pendingWorkspaceTasks = [];
      if (!this.unloading) showMessage('siyuan-TODO：无法打开待办工作区，请重试。', 8000, 'error');
    }
  }
  async onDataChanged() {
    if (!this.store || this.unloading) return;
    const lifecycle = this.lifecycle;
    await this.store.init().catch(() => {
      if (!this.unloading && this.lifecycle === lifecycle) showMessage('siyuan-TODO：同步后的任务文件读取失败，原数据未覆盖。', 8000, 'error');
    });
  }
  async onunload() {
    this.unloading = true;
    this.lifecycle++;
    this.layoutReady = false; this.dockInitialized = false;
    this.stopReminders?.(); this.stopReminders = undefined;
    this.pendingWorkspaceTasks = []; this.workspaceOpener = undefined; this.workspaceOpening = undefined;
    this.workspaceElement = undefined; this.workspaceData = {};
    for (const [element, root] of this.roots) { root.unmount(); element.classList.remove('stodo-dock'); } this.roots.clear();
    await this.store?.flush();
  }
}

function Dock({ store, onOpen }: { store: TaskStore; onOpen: (taskId: string) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const reportError = (error: unknown) => { const span = document.createElement('span'); span.textContent = error instanceof Error ? error.message : String(error); showMessage(span.innerHTML, 7000, 'error'); };
  return <TaskList compact store={store} now={now} onOpen={(task: Task) => onOpen(task.id)} onNew={() => onOpen('new')} onOverview={() => onOpen('calendar')} onError={reportError} />;
}
