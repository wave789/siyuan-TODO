import { readFile, writeFile } from 'node:fs/promises';

export async function generateThirdPartyNotices(destination) {
  const notices = ['# Third-party notices', '', 'siyuan-TODO is distributed under Apache-2.0. The bundled third-party components below retain their own licenses.', ''];
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const project = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    const license = await readFile(`node_modules/${name}/LICENSE`, 'utf8');
    notices.push(`## ${name} ${project.version}`, '', `License: ${project.license}`, '', '```text', license.trim(), '```', '');
  }
  await writeFile(destination, notices.join('\n'));
}
