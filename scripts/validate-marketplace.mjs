import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const allowedKeys = new Set(['name', 'author', 'url', 'version', 'minAppVersion', 'displayName', 'description', 'readme', 'icon', 'preview', 'funding', 'keywords', 'backends', 'frontends', 'kernels', 'bootAppearances', 'disabledInPublish', 'settingsWindow', 'publish']);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function packagePath(name) {
  assert(nonempty(name) && !isAbsolute(name) && !name.includes('\\') && !name.split('/').some(part => !part || part === '.' || part === '..'), `包内路径无效：${name}`);
  return name;
}

export async function sourceAsset(root, name) {
  packagePath(name);
  // Marketplace metadata images live at the ZIP root; preview assets stay in public/.
  if (name === 'icon.png' || name === 'icon.svg') return join(root, 'public', name);
  return join(root, name);
}

async function requiredFile(path, label) {
  const info = await stat(path).catch(() => null);
  assert(info?.isFile() && info.size > 0, `缺少或为空：${label}`);
  return info;
}

export async function validateMarketplace({ root = '.', source = false } = {}) {
  const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
  for (const key of Object.keys(manifest)) assert(allowedKeys.has(key), `plugin.json 中有未知字段：${key}`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name), '本项目的插件包名需使用小写字母、数字和连字符');
  assert(nonempty(manifest.author), '插件作者不能为空');
  const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(manifest.url ?? '');
  assert(repo && repo[2].toLowerCase() === manifest.name.toLowerCase(), '仓库 URL 或插件包名不匹配');
  assert(stableVersion.test(manifest.version), '集市发布请使用稳定版本号，例如 1.2.9');
  assert(stableVersion.test(manifest.minAppVersion), 'minAppVersion 必须是有效版本号');
  for (const field of ['displayName', 'description', 'readme']) {
    const values = manifest[field];
    assert(values && typeof values === 'object' && !Array.isArray(values) && nonempty(values.default), `${field}.default 不能为空`);
    for (const [locale, value] of Object.entries(values)) {
      assert(nonempty(value), `${field}.${locale} 不能为空`);
      if (locale !== 'default') Intl.getCanonicalLocales(locale);
    }
  }
  for (const [field, supported] of [
    ['backends', ['windows', 'linux', 'darwin', 'docker', 'android', 'ios', 'harmony', 'all']],
    ['frontends', ['desktop', 'desktop-window', 'mobile', 'browser-desktop', 'browser-mobile', 'all']],
  ]) {
    assert(Array.isArray(manifest[field]) && manifest[field].length > 0 && manifest[field].every(value => supported.includes(value)), `${field} 包含无效环境`);
  }
  if (source) {
    for (const name of ['package.json', 'package-lock.json']) {
      const project = JSON.parse(await readFile(join(root, name), 'utf8'));
      assert(project.version === manifest.version, `${name} 的版本与 plugin.json 不一致`);
      if (name === 'package-lock.json') assert(project.packages[''].version === manifest.version, '锁文件根包版本不一致');
    }
    await requiredFile(join(root, 'src/plugin.tsx'), 'src/plugin.tsx');
    await requiredFile(join(root, `docs/releases/v${manifest.version}.md`), '当前版本的 Release 说明');
  } else {
    for (const name of ['index.js', 'index.css', 'THIRD_PARTY_NOTICES.md']) await requiredFile(join(root, name), name);
  }
  await requiredFile(join(root, 'LICENSE'), 'LICENSE');
  for (const name of new Set(['README.md', ...Object.values(manifest.readme)])) {
    packagePath(name);
    const path = join(root, name);
    await requiredFile(path, name);
    const markdown = await readFile(path, 'utf8');
    const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)|<img\b[^>]*\bsrc=["']([^"']+)["']/g)];
    for (const image of images) {
      const target = image[1] ?? image[2];
      assert(!/^(?:https?:|\/\/)/i.test(target), `${name} 的说明图片应打入安装包，以支持离线显示：${target}`);
      const local = packagePath(target.replace(/^\.\//, ''));
      await requiredFile(join(root, local), `${name} 引用的图片 ${target}`);
    }
  }
  for (const [field, limit] of [['icon', 64 * 1024], ['preview', 512 * 1024]]) {
    const name = packagePath(manifest[field]);
    assert(!name.includes('/') && name.endsWith('.png'), `${field} 必须是包根目录中的 PNG 文件`);
    const path = source ? await sourceAsset(root, name) : join(root, name);
    const info = await requiredFile(path, name);
    assert(info.size <= limit, `${name} 超过 ${limit / 1024} KiB 的集市限制`);
    const data = await readFile(path);
    assert(data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${name} 不是有效的 PNG`);
    assert(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0, `${name} 图片尺寸无效`);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = process.argv[2];
    const manifest = await validateMarketplace({ root: root || '.', source: !root });
    console.log(`集市发布预检通过：${manifest.name} v${manifest.version}${root ? '（安装目录）' : '（源码）'}`);
  } catch (error) { console.error(`集市发布预检失败：${error.message}`); process.exitCode = 1; }
}
