import { expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { latestRelease } from '../release';

// Load the actual CommonJS release bundle against a minimal documented SiYuan
// frontend, while the file API writes a real JSON file in a temporary directory.
export interface HostOptions {
  pluginDir?: string;
  openFilesUseCurrentTab?: boolean;
  tabInitDelayMs?: number;
}
export async function bootHost(page: Page, diskPath: string, legacyPath?: string, options: HostOptions = {}) {
  const pluginDir = options.pluginDir ?? (await latestRelease()).pluginDir;
  await page.route('**/api/file/getFile', async route => {
    const requested = route.request().postDataJSON().path;
    expect(['/data/storage/petal/siyuan-todo/todos.json', '/data/storage/petal/siyuan-shixu-todo/todos.json']).toContain(requested);
    const target = requested.includes('/siyuan-shixu-todo/') ? legacyPath : diskPath;
    try {
      if (!target) throw new Error('No previous data');
      await route.fulfill({ status: 200, contentType: 'application/json', body: await readFile(target, 'utf8') });
    }
    catch { await route.fulfill({ status: 202, json: { code: 404, msg: '', data: null } }); }
  });
  await page.route('**/api/file/putFile', async route => {
    const incoming = new Request('http://host/api/file/putFile', { method: 'POST', headers: route.request().headers(), body: new Uint8Array(route.request().postDataBuffer()!).buffer });
    const form = await incoming.formData();
    expect(form.get('path')).toBe('/data/storage/petal/siyuan-todo/todos.json');
    await writeFile(diskPath, await (form.get('file') as File).text());
    await route.fulfill({ json: { code: 0, msg: '', data: null } });
  });
  await page.goto('/tests/host.html');
  await page.addStyleTag({ content: await readFile(`${pluginDir}/index.css`, 'utf8') });
  await page.evaluate(async ({ source, settings }) => {
    const scope = window as unknown as { sdk: any };
    const sdk: any = { instance: null, messages: [], tabModel: null, nativeTabs: [], openTabCalls: [], NativePlugin: null };
    scope.sdk = sdk;
    class Plugin {
      name = 'siyuan-todo'; app = {}; data = {}; tabConfig: any; dockConfig: any;
      addIcons() {}
      addCommand() {}
      addTab(config: any) { this.tabConfig = config; }
      addDock(config: any) { this.dockConfig = config; }
    }
    // SiYuan matches custom tabs by BOTH type and data, rather than type alone.
    // https://github.com/siyuan-note/siyuan/blob/master/app/src/editor/util.ts
    async function openTab(options: any) {
      sdk.openTabCalls.push(options);
      let model = sdk.nativeTabs.find((item: any) => item.type === options.custom.id && JSON.stringify(item.data) === JSON.stringify(options.custom.data));
      if (!model) {
        const previous = sdk.tabModel;
        const element = document.createElement('div'); element.style.cssText = 'flex:1;min-width:0;height:100%;';
        document.getElementById('host')!.appendChild(element);
        model = { element, type: options.custom.id, data: structuredClone(options.custom.data), initialized: false };
        model.tab = { model };
        sdk.nativeTabs.push(model);
        model.ready = (async () => {
          if (settings.tabInitDelayMs) await new Promise(resolve => setTimeout(resolve, settings.tabInitDelayMs));
          if (!element.isConnected) return;
          sdk.instance.tabConfig.init.call(model, model); model.initialized = true;
          if (settings.openFilesUseCurrentTab && options.removeCurrentTab !== false && previous) sdk.closeTab(previous);
        })();
      }
      sdk.tabModel = model;
      sdk.nativeTabs.forEach((item: any) => { item.element.hidden = item !== model; });
      await model.ready;
      options.afterOpen?.(model);
      return model.tab;
    }
    sdk.closeTab = (model: any) => {
      if (model.initialized) sdk.instance.tabConfig.destroy.call(model);
      model.element.remove(); sdk.nativeTabs = sdk.nativeTabs.filter((item: any) => item !== model);
      if (sdk.tabModel === model) { sdk.tabModel = sdk.nativeTabs.at(-1) ?? null; if (sdk.tabModel) sdk.tabModel.element.hidden = false; }
    };
    sdk.closeWorkspace = () => { [...sdk.nativeTabs].forEach(sdk.closeTab); };
    sdk.restoreWorkspace = (data: any) => openTab({ custom: { id: 'siyuan-todostodo-workspace', data }, removeCurrentTab: false });
    const module = { exports: {} };
    const require = (name: string) => {
      if (name !== 'siyuan') throw new Error(`Unexpected external: ${name}`);
      return { Plugin, openTab, showMessage: (message: string) => sdk.messages.push(message), confirm: (_: string, __: string, callback: () => void) => callback() };
    };
    new Function('module', 'exports', 'require', source)(module, module.exports, require);
    sdk.NativePlugin = module.exports;
    sdk.boot = async () => {
      document.getElementById('host')!.innerHTML = ''; sdk.tabModel = null; sdk.nativeTabs = []; sdk.openTabCalls = [];
      sdk.instance = new sdk.NativePlugin(); await sdk.instance.onload();
      const dock = document.createElement('aside'); dock.style.cssText = 'width:305px;flex-shrink:0;height:100%;';
      document.getElementById('host')!.appendChild(dock);
      expectNoop(sdk.instance.dockConfig.config.position === 'LeftTop');
      sdk.dockModel = { element: dock, data: {} };
      sdk.instance.dockConfig.init.call(sdk.dockModel, sdk.dockModel);
      sdk.instance.onLayoutReady();
    };
    function expectNoop(condition: boolean) { if (!condition) throw new Error('Dock must be on the left'); }
    await sdk.boot();
  }, { source: await readFile(`${pluginDir}/index.js`, 'utf8'), settings: options });
}

