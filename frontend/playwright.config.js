import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60000,
  use: { baseURL: process.env.CLASSROOM_TEST_URL || 'http://127.0.0.1:5173', headless: true },
  reporter: 'list',
})
