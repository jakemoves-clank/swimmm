import { defineConfig, devices } from '@playwright/test';

// In sandboxes that provide a system Chromium (and block downloads), set
// PW_CHROMIUM_PATH (e.g. /opt/pw-browsers/chromium). The webkit project needs
// `npx playwright install webkit` wherever downloads are allowed.
const chromiumLaunch = process.env.PW_CHROMIUM_PATH
	? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
	: {};

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:4173'
	},
	projects: [
		{
			name: 'mobile-chrome',
			use: { ...devices['Pixel 7'], ...chromiumLaunch }
		},
		{
			name: 'mobile-safari',
			use: { ...devices['iPhone 13'] }
		}
	],
	webServer: {
		command: 'node tests/e2e/seed.js && npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			SWIMMM_DATA_FILE: 'tests/e2e/.tmp/schedule.json',
			PUBLIC_MAPBOX_TOKEN: 'pk.e2e-test-token'
		}
	}
});
