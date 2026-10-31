import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1080 },
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_BUNDLED_CHROMIUM ? undefined : process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 15000 },
});
