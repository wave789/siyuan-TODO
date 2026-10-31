import { readFile } from 'node:fs/promises';

/** Integration checks always load the newly built release, keeping older builds intact. */
export async function latestRelease(): Promise<{ version: string; pluginDir: string; archive: string }> {
  return JSON.parse(await readFile('dist/latest.json', 'utf8'));
}
