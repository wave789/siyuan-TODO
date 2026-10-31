import type { TaskFile } from './model';
import type { StorageAdapter } from './store';

// Use the documented file APIs directly: loadData can silently return a cached value
// on read failure, and saveData does not reject every kernel failure (petal API docs).
export function siyuanStorage(pluginName: string, fetcher: typeof fetch = fetch): StorageAdapter {
  const path = `/data/storage/petal/${pluginName}/todos.json`;
  async function request(endpoint: string, body: BodyInit, headers?: HeadersInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(endpoint, { method: 'POST', body, headers, signal: controller.signal,
        mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
      // Consume the body before clearing the timeout, including stalled downloads.
      const contents = await response.arrayBuffer();
      return new Response(contents, { status: response.status, headers: response.headers });
    } catch (e) {
      if (controller.signal.aborted) throw new Error('思源存储请求超时，请检查内核连接后重试');
      throw e;
    } finally { clearTimeout(timeout); }
  }
  return {
    async load() {
      const response = await request('/api/file/getFile', JSON.stringify({ path }), { 'Content-Type': 'application/json' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`读取文件失败（HTTP ${response.status}）`);
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'code' in data) {
        const result = data as { code: number; msg?: string };
        if (result.code === 404) return null;
        throw new Error(result.msg || `读取文件失败（${result.code}）`);
      }
      return data;
    },
    async save(data: TaskFile) {
      const body = new FormData(); body.append('path', path); body.append('isDir', 'false');
      body.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'todos.json');
      const response = await request('/api/file/putFile', body);
      if (!response.ok) throw new Error(`写入文件失败（HTTP ${response.status}）`);
      const result: { code: number; msg?: string } = await response.json();
      if (result.code !== 0) throw new Error(result.msg || `写入文件失败（${result.code}）`);
    },
  };
}
