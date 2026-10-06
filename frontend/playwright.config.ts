import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: '/opt/pw-browsers/chromium' }, viewport: { width: 1440, height: 900 } },
  webServer: [
    { command: 'cd ../backend && FCS_DB=/tmp/fcs-e2e.db python3 -m uvicorn app.main:app --port 8000', url: 'http://127.0.0.1:8000/api/state', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx vite --port 5173 --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
})
