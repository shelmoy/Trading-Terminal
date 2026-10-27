import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  testDir: '.',
  testMatch: 'chart-trading.spec.ts',
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: '../../tmp/chart-trading-browser-20261026',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1100, height: 700 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      '"C:/Users/ashut/.codex/runtimes/node-v24.22.1/node-v24.22.1-win-x64/node.exe" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
