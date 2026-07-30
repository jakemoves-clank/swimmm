import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:4173',
		// Use a system-provided Chromium when the environment supplies one
		// (e.g. CI sandboxes with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set).
		...(process.env.PW_CHROMIUM_PATH
			? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
			: {})
	},
	webServer: {
		command: 'node tests/e2e/seed.js && npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			DB_PATH: 'tests/e2e/.tmp/e2e.db',
			SKIP_REFRESH: '1'
		}
	}
});
