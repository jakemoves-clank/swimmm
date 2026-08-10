import { test, expect } from '@playwright/test';
import { pinClock } from './fixture-time.js';

// v3's user story: a person opens Swimmm and is offered a few dips they
// could actually take today — each one an appointment (leave at, in the
// water from, for how long), not a row in a directory.
//
// Against the seed (see seed.js, anchored at midday): Nearby Pool is beside
// the test user and runs lane swim 2–3 p.m. and leisure swim 1–2:30 p.m.;
// Faraway Pool is ~19 km off and runs lane swim 12:30–1:30 p.m.
test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside Nearby Pool
	permissions: ['geolocation']
});

// Nearby Pool is a ten-minute walk; Faraway Pool is beyond every threshold,
// including driving, so the concierge has nothing to say about it.
const MINUTES = {
	walking: { near: 10, far: 120 },
	cycling: { near: 4, far: 90 },
	driving: { near: 5, far: 25 }
};

async function mockRouting(page) {
	await page.route('**/api.mapbox.com/directions-matrix/**', (route) => {
		const url = new URL(route.request().url());
		const profile = url.pathname.split('/')[4];
		// Destination order follows the coordinates in the path; match pools by
		// longitude: Nearby Pool is -79.4, Faraway Pool is -79.19.
		const coords = url.pathname.split('/').pop().split(';').slice(1);
		const durations = coords.map((c) =>
			c.startsWith('-79.4,') ? MINUTES[profile].near * 60 : MINUTES[profile].far * 60
		);
		route.fulfill({ json: { code: 'Ok', durations: [[0, ...durations]] } });
	});
	// Transit is a real community service; never call it from a test.
	await page.route('**/api.transitous.org/**', (route) => route.abort());
}

test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await mockRouting(page);
});

test('offers a dip as an appointment: when to leave, when you are in the water', async ({
	page
}) => {
	await page.goto('/');

	const dip = page.locator('.card').first();
	await expect(dip).toContainText('Nearby Pool');
	// The default 45-minute dip inside the 2–3 p.m. lane swim.
	await expect(dip).toContainText('2:00 p.m.–2:45 p.m.');
	await expect(dip).toContainText('45 min');
	await expect(dip).toContainText('10-min walk');
	await expect(dip).toContainText('leave 1:50 p.m.');
});

test('offers nothing at a pool no mode can reach in time', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('.card')).toHaveCount(1);
	await expect(page.getByText('Faraway Pool')).toHaveCount(0);
});

test('?dip=30 books a shorter window in the same water', async ({ page }) => {
	await page.goto('/?dip=30');

	const dip = page.locator('.card').first();
	await expect(dip).toContainText('2:00 p.m.–2:30 p.m.');
	await expect(dip).toContainText('30 min');
});

test('the lane/leisure toggle changes what you are offered, and rides in the URL', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('.card').first()).toContainText('2:00 p.m.–2:45 p.m.');

	await page.getByRole('button', { name: 'Leisure' }).click();
	// Leisure at Nearby Pool runs 1–2:30 p.m., so the dip starts an hour earlier.
	await expect(page.locator('.card').first()).toContainText('1:00 p.m.–1:45 p.m.');
	await expect(page).toHaveURL(/kind=leisure/);
});

test('/v3 is the same page as the root, not a copy that can drift', async ({ page }) => {
	await page.goto('/v3');

	const dip = page.locator('.card').first();
	await expect(dip).toContainText('Nearby Pool');
	await expect(dip).toContainText('2:00 p.m.–2:45 p.m.');
	await expect(dip).toContainText('leave 1:50 p.m.');
});

test('says so plainly when it cannot work out a trip at all', async ({ page }) => {
	// A dip without a routed travel time is just a listing, so v3 declines to
	// guess — it never dresses a straight-line estimate up as an offer.
	await page.unroute('**/api.mapbox.com/directions-matrix/**');
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
	await page.goto('/');

	await expect(page.getByText(/Travel times are unavailable/)).toBeVisible();
	await expect(page.locator('.card')).toHaveCount(0);
});
