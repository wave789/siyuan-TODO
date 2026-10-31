import { build } from 'esbuild';
import { access, constants, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import archiver from 'archiver';
import { generateIconAssets } from './icon-assets.mjs';
import { generateThirdPartyNotices } from './third-party-notices.mjs';
import { sourceAsset, validateMarketplace } from './validate-marketplace.mjs';

await generateIconAssets();
const manifest = await validateMarketplace({ source: true });
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
const outdir = `${releaseDir}/${manifest.name}`;
await mkdir(outdir, { recursive: true });
await build({ entryPoints: ['src/plugin.tsx'], outfile: `${outdir}/index.js`, bundle: true, format: 'cjs', platform: 'browser', external: ['siyuan'],
  target: ['chrome110'], minify: true, jsx: 'automatic', loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
  footer: { js: 'module.exports = module.exports.default;' }, legalComments: 'eof' });
for (const file of new Set(['plugin.json', 'README.md', 'LICENSE', ...Object.values(manifest.readme), manifest.icon, manifest.preview, 'icon.svg', 'public/icon.png', 'assets/wechat-reward.png'])) {
  const destination = `${outdir}/${file}`;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(await sourceAsset('.', file), destination);
}
await generateThirdPartyNotices(`${outdir}/THIRD_PARTY_NOTICES.md`);
await mkdir(`${outdir}/i18n`, { recursive: true });
await writeFile(`${outdir}/i18n/zh_CN.json`, JSON.stringify({ openTodo: '打开siyuan-TODO待办' }, null, 2));
await writeFile(`${outdir}/i18n/en_US.json`, JSON.stringify({ openTodo: 'Open siyuan-TODO Todo' }, null, 2));
await validateMarketplace({ root: outdir });
const output = createWriteStream(archivePath, { flags: 'wx' });
const archive = archiver('zip', { zlib: { level: 9 } });
const finished = new Promise((resolve, reject) => { output.on('close', resolve); archive.on('error', reject); output.on('error', reject); });
archive.pipe(output); archive.directory(outdir, false); await archive.finalize(); await finished;
// The bazaar requires this exact asset name. Keep it inside the versioned release
// directory so older package.zip files and personal ZIPs are never replaced.
const marketplaceArchive = `${releaseDir}/package.zip`;
await copyFile(archivePath, marketplaceArchive, constants.COPYFILE_EXCL);
const digest = createHash('sha256').update(await readFile(archivePath)).digest('hex');
const checksums = `${releaseDir}/SHA256SUMS.txt`;
await writeFile(checksums, `${digest}  package.zip\n${digest}  ${artifactName}.zip\n`, { flag: 'wx' });
await writeFile('dist/latest.json', JSON.stringify({ version: manifest.version, pluginDir: outdir, archive: archivePath, marketplaceArchive, checksums, createdAt: new Date().toISOString() }, null, 2));
console.log(`思源离线插件：${outdir}\n安装包：${archivePath} (${archive.pointer()} bytes)\n集市附件：${marketplaceArchive}`);
