import { generateIconAssets } from './icon-assets.mjs';
await generateIconAssets();

// Optional authoring step; normal builds use the checked-in PNG and need no browser.
if (process.argv.includes('--png')) {
  const { chromium } = await import('@playwright/test');
  const { readFile } = await import('node:fs/promises');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 160, height: 160 }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;width:160px;height:160px">${await readFile('public/icon.svg', 'utf8')}</body></html>`);
    await page.locator('svg').screenshot({ path: 'public/icon.png', omitBackground: true });
  } finally { await browser.close(); }
}
