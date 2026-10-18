import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/ui.spec.ts', '**/deployment.spec.ts'],
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4173 --strictPort --base /JUEGO-battleship-COMUN/', url: 'http://127.0.0.1:4173/JUEGO-battleship-COMUN/', reuseExistingServer: !process.env.CI },
  ],
});
