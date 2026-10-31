import { build } from 'esbuild';
import { access, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import archiver from 'archiver';
import { generateIconAssets } from './icon-assets.mjs';

const manifest = JSON.parse(await readFile('plugin.json', 'utf8'));
const project = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version) || manifest.version !== project.version) {
  throw new Error('plugin.json 与 package.json 必须使用一致的有效版本号');
}
await mkdir('dist', { recursive: true });
const base = `siyuan-TODO-v${manifest.version}`;
const buildStamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
let artifactName;
let releaseDir;
let archivePath;
for (let attempt = 0; ; attempt++) {
  artifactName = attempt === 0 ? base : `${base}-build-${buildStamp}${attempt > 1 ? `-${attempt}` : ''}`;
  releaseDir = `dist/${artifactName}`;
  archivePath = `${releaseDir}.zip`;
  // Reserve a new directory and never reuse any existing archive or release.
  try { await access(archivePath); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await mkdir(releaseDir); break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const outdir = `${releaseDir}/siyuan-todo`;
await generateIconAssets();
await mkdir(outdir, { recursive: true });
await build({ entryPoints: ['src/plugin.tsx'], outfile: `${outdir}/index.js`, bundle: true, format: 'cjs', platform: 'browser', external: ['siyuan'],
  target: ['chrome110'], minify: true, jsx: 'automatic', loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
  footer: { js: 'module.exports = module.exports.default;' }, legalComments: 'eof' });
for (const file of ['plugin.json', 'README.md', 'LICENSE']) await copyFile(file, `${outdir}/${file}`);
await copyFile('public/icon.svg', `${outdir}/icon.svg`);
await copyFile('public/icon.png', `${outdir}/icon.png`);
await mkdir(`${outdir}/i18n`, { recursive: true });
await writeFile(`${outdir}/i18n/zh_CN.json`, JSON.stringify({ openTodo: '打开siyuan-TODO待办' }, null, 2));
await writeFile(`${outdir}/i18n/en_US.json`, JSON.stringify({ openTodo: 'Open siyuan-TODO Todo' }, null, 2));
const output = createWriteStream(archivePath, { flags: 'wx' });
const archive = archiver('zip', { zlib: { level: 9 } });
const finished = new Promise((resolve, reject) => { output.on('close', resolve); archive.on('error', reject); output.on('error', reject); });
archive.pipe(output); archive.directory(outdir, false); await archive.finalize(); await finished;
await writeFile('dist/latest.json', JSON.stringify({ version: manifest.version, pluginDir: outdir, archive: archivePath, createdAt: new Date().toISOString() }, null, 2));
console.log(`思源离线插件：${outdir}\n安装包：${archivePath} (${archive.pointer()} bytes)`);
