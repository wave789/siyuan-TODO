import { createRoot } from 'react-dom/client';
import { App } from './App';
import { demoFile } from './demo';
import { browserStorage, TaskStore } from './store';
import './styles.css';
import './preview.css';

const root = createRoot(document.getElementById('root')!);
const store = new TaskStore({
  async load() {
    const data = await browserStorage.load();
    if (data !== null) return data;
    const demo = demoFile();
    await browserStorage.save(demo);
    return demo;
  },
  save: browserStorage.save,
});
await store.init().catch(error => console.error('[siyuan-TODO] 数据加载失败', error));
root.render(<App store={store} />);
