import { test, expect } from '@playwright/test';
import { pinClock } from '../fixture-time.js';

// User feedback: "I only want to see swim sessions that I can actually get to."
// Mapbox Matrix API is mocked; the seeded Faraway Pool is >60 min away by both
// modes, so it must be filtered out, while Nearby Pool shows travel times.
test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside "Nearby Pool"
	permissions: ['geolocation']
});

test.beforeEach(async ({ page }) => {
	await pinClock(page);
});

test('filters out swims farther than the travel limit and shows walk/bike times', async ({
	page
}) => {
	await page.route('**/api.mapbox.com/directions-matrix/**', (route) => {
		const url = route.request().url();
		const profile = url.includes('/walking/') ? 'walking' : 'cycling';
		// Destination order follows the coordinates in the URL; match pools by
		// longitude: Nearby Pool is -79.4, Faraway Pool is -79.19.
		const coords = new URL(url).pathname.split('/').pop().split(';').slice(1);
		const durations = coords.map((c) => {
			const near = c.startsWith('-79.4,');
			if (profile === 'cycling') return near ? 300 : 5400; // 5 min vs 90 min
			return near ? 600 : 7200; // 10 min vs 120 min
		});
		route.fulfill({ json: { code: 'Ok', durations: [[0, ...durations]] } });
	});

	await page.goto('/v1');

	// The reachable pool is shown with real travel times, not straight-line km
	const cards = page.locator('.card');
	await expect(cards.first()).toContainText('Nearby Pool');
	await expect(cards.first()).toContainText('bike 5 min');
	await expect(cards.first()).toContainText('walk 10 min');

	// The unreachable pool is hidden, and the page says so
	await expect(page.getByText('Faraway Pool')).toHaveCount(0);
	await expect(page.getByText(/1 swim hidden/)).toBeVisible();
	await expect(page.getByText('1 swim left today')).toBeVisible();

	// Nearby Pool is a 10-min walk and starts within 2 hours → it's the top pick
	const top = page.locator('.top-pick');
	await expect(top).toContainText('Top pick');
	await expect(top).toContainText('Nearby Pool');
	await expect(top).toContainText('walk 10 min');
});

test('falls back to a transit top pick when walking and biking are too slow', async ({ page }) => {
	await page.route('**/api.mapbox.com/directions-matrix/**', (route) => {
		const url = route.request().url();
		const profile = url.includes('/walking/') ? 'walking' : 'cycling';
		const coords = new URL(url).pathname.split('/').pop().split(';').slice(1);
		const durations = coords.map((c) => {
			const near = c.startsWith('-79.4,');
			// Near pool is reachable for the list but beyond walk/bike tiers
			if (profile === 'cycling') return near ? 3000 : 5400;
			return near ? 3600 : 7200;
		});
		route.fulfill({ json: { code: 'Ok', durations: [[0, ...durations]] } });
	});
	// Transitous: subway + one bus, 22 minutes
	await page.route('**/api.transitous.org/**', (route) =>
		route.fulfill({ json: { itineraries: [{ duration: 1320, transfers: 1 }] } })
	);

	await page.goto('/v1');

	const top = page.locator('.top-pick');
	await expect(top).toContainText('Nearby Pool');
	await expect(top).toContainText('transit 22 min');
	await expect(page.locator('.dry-pool')).toHaveCount(0);
});

test('shows the dry pool when nothing is an easy walk, ride, or transit trip', async ({ page }) => {
	// No transit routes either
	await page.route('**/api.transitous.org/**', (route) =>
		route.fulfill({ json: { itineraries: [] } })
	);
	await page.route('**/api.mapbox.com/directions-matrix/**', (route) => {
		const url = route.request().url();
		const profile = url.includes('/walking/') ? 'walking' : 'cycling';
		const coords = new URL(url).pathname.split('/').pop().split(';').slice(1);
		const durations = coords.map((c) => {
			const near = c.startsWith('-79.4,');
			// Near pool: 50 min bike / 60 min walk — reachable for the list
			// (≤ 60 min) but beyond every top-pick tier. Far pool: way out.
			if (profile === 'cycling') return near ? 3000 : 5400;
			return near ? 3600 : 7200;
		});
		route.fulfill({ json: { code: 'Ok', durations: [[0, ...durations]] } });
	});

	await page.goto('/v1');

	// The list still shows the reachable-but-not-easy swim…
	await expect(page.getByText('Nearby Pool')).toBeVisible();
	// …but there's no top pick, just sand and a cactus
	await expect(page.locator('.top-pick')).toHaveCount(0);
	await expect(page.locator('.dry-pool')).toBeVisible();
	await expect(page.getByText(/No swim within an easy trip right now/)).toBeVisible();
});
