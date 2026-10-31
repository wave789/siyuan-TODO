import { appendFile, readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateMarketplace } from './validate-marketplace.mjs';

const manifest = await validateMarketplace({ source: true });
const latest = JSON.parse(await readFile('dist/latest.json', 'utf8'));
const tag = `v${manifest.version}`;
if (!process.env.GITHUB_ENV) throw new Error('此脚本只在 GitHub Actions 发布步骤中使用');
if (`https://github.com/${process.env.GITHUB_REPOSITORY}`.toLowerCase() !== manifest.url.toLowerCase()) throw new Error('当前仓库与 plugin.json.url 不一致');
if (process.env.GITHUB_REF?.startsWith('refs/tags/') && process.env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error('Git 标签与清单版本不一致');
if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('请在 main 分支运行手动发布');
if (latest.version !== manifest.version) throw new Error('构建产物版本不一致');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const existingTag = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], { encoding: 'utf8' });
if (existingTag.status === 0 && existingTag.stdout.trim() !== head) throw new Error('该版本标签已指向其他提交，请提升版本号后重新发布');
const values = {
  RELEASE_TAG: tag,
  RELEASE_NOTES: `docs/releases/${tag}.md`,
  MARKETPLACE_ARCHIVE: latest.marketplaceArchive,
  VERSIONED_ARCHIVE: latest.archive,
  CHECKSUMS: latest.checksums,
};
for (const [key, value] of Object.entries(values)) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error(`发布参数无效：${key}`);
}
await appendFile(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
console.log(`准备发布 ${manifest.url} ${tag}`);
