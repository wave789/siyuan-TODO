import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Generate the package icon from the same original vector geometry as the UI.
export async function generateIconAssets() {
  const drawings = JSON.parse(await readFile('src/icon-artwork.json', 'utf8'));
  const mark = drawings.TodoMark;
  const shapes = mark.paths.map(d => `<path d="${d}"/>`).join('') + mark.circles.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="todo-green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#60856b"/><stop offset="1" stop-color="#2f5342"/></linearGradient></defs><rect x="3" y="3" width="154" height="154" rx="38" fill="url(#todo-green)"/><rect x="4" y="4" width="152" height="152" rx="37" fill="none" stroke="#b8d4b2" stroke-opacity=".3"/><g transform="translate(24 24) scale(4.65)" fill="none" stroke="#f5f5e9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;
  await mkdir('public', { recursive: true });
  await mkdir('src/assets', { recursive: true });
  await writeFile('public/icon.svg', svg);
  await writeFile('src/assets/plugin-icon.svg', svg);
}
