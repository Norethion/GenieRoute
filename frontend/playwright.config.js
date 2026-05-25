import { defineConfig, devices } from '@playwright/test';

// GenieRoute E2E test yapilandirmasi.
// Calistirma: cd frontend && npx playwright test
// Tek test:   cd frontend && npx playwright test tests/e2e/map-interactions.spec.js
// UI modu:    cd frontend && npx playwright test --ui
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000, // LLM streaming icin uzun timeout
  expect: { timeout: 10_000 },
  fullyParallel: false, // Backend tek session paylasimi var, sira disi calismasin
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Dev sunucusu manuel calistirilmali (helper.bat veya `npm run dev`)
  // Otomatik baslatma istenirse webServer kullanilabilir, ama backend de
  // ayrica acilmali oldugundan elle yonetmek daha guvenli.
});
