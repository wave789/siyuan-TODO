import { parseTaskFile } from './model';
import type { StorageAdapter } from './store';

// These names remain only to read the previous release's data without data loss.
export const LEGACY_PLUGIN_ID = 'siyuan-shixu-todo';
export const LEGACY_BROWSER_KEY = 'shixu-todos-v1';
export const BROWSER_KEY = 'siyuan-todo-v1';

export function migrateLegacyStorage(primary: StorageAdapter, previous: StorageAdapter): StorageAdapter {
  return {
    async load() {
      const current = await primary.load();
      if (current !== null && current !== undefined) return current;
      const legacy = await previous.load();
      if (legacy === null || legacy === undefined) return null;
      const validated = parseTaskFile(legacy);
      await primary.save(validated);
      return validated;
    },
    save: data => primary.save(data),
  };
}
