import { test, expect } from '@playwright/test';
import { anchorInstant, pinClock, readAnchor } from '../fixture-time.js';

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

	const dip = page.locator('.dip').first();
	await expect(dip).toContainText('Nearby Pool');
	// The default 45-minute dip inside the 2–3 p.m. lane swim. The length is
	// not printed: the range already says 45 minutes, and saying it twice is
	// redundant ink. It appears only when the dip is shorter than you asked.
	await expect(dip).toContainText('2–2:45pm');
	await expect(dip).not.toContainText('45 min');
	await expect(dip).toContainText('10-min walk');
	await expect(dip).toContainText('leave 1:50pm');
	// The dip is a window inside a longer swim, and the block says so: you
	// could arrive later, or stay on until the session itself ends at 3.
	await expect(dip).toContainText('open until 3pm');
});

// A hairline from departure to water is a hairline until something says what
// kind of trip it is. The mode rides on the line itself, as an icon.
test('says on the trip line how you would be getting there', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('.trip-rule .mode')).toHaveCount(1);
});

test('offers nothing at a pool no mode can reach in time', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('.dip')).toHaveCount(1);
	await expect(page.getByText('Faraway Pool')).toHaveCount(0);
});

test('?dip=30 books a shorter window in the same water', async ({ page }) => {
	await page.goto('/?dip=30');

	const dip = page.locator('.dip').first();
	await expect(dip).toContainText('2–2:30pm');
});

test('the lane/leisure toggle changes what you are offered, and rides in the URL', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('.dip').first()).toContainText('2–2:45pm');

	await page.getByRole('button', { name: 'Leisure' }).click();
	// Leisure at Nearby Pool runs 1–2:30 p.m., so the dip starts an hour earlier.
	await expect(page.locator('.dip').first()).toContainText('1–1:45pm');
	await expect(page).toHaveURL(/kind=leisure/);
});

test('degrades to distances, saying so, when it cannot route a trip', async ({ page }) => {
	// Routing gone. We still know where the reader is and where the pools
	// are, so the offer stands — but with the distance in place of a journey
	// time, and no departure time, because we will not guess one.
	await page.unroute('**/api.mapbox.com/directions-matrix/**');
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
	await page.goto('/');

	const dip = page.locator('.dip').first();
	await expect(dip).toContainText('Nearby Pool');
	await expect(dip).toContainText('2–2:45pm');
	await expect(dip).toContainText('km away');
	await expect(dip).not.toContainText('leave');
	await expect(page.getByText(/straight-line distances/)).toBeVisible();
});

// The planner's whole claim is that distance down the page is time. If that
// stops being true it is a list with decoration, so the axis gets a test.
test('places a dip on the day where it actually falls', async ({ page }) => {
	await page.goto('/');

	const nowLine = page.locator('.now');
	const dip = page.locator('.slot').first();
	await expect(nowLine).toBeVisible();

	// The seeded dip is two hours after the pinned clock, so it must sit
	// below the now line, and the hour axis must be drawn around it.
	const [nowBox, dipBox] = [await nowLine.boundingBox(), await dip.boundingBox()];
	expect(dipBox.y).toBeGreaterThan(nowBox.y);
	await expect(page.locator('.hour')).not.toHaveCount(0);
});

// A concierge asked at eleven at night should be offering tomorrow, not
// shrugging. Same machinery covers a holiday Monday with every pool shut and
// the small hours before anything has opened — see planDay.
test('rolls on to the next day once tonight has nothing left', async ({ page }) => {
	// 11:30 p.m.: today's seeded swims finished hours ago, but Nearby Pool
	// runs a 9–11 a.m. lane swim tomorrow.
	const anchor = readAnchor();
	const lateNight = new Date(
		anchorInstant(anchor.date).getTime() + (23 * 60 + 30 - 720) * 60_000
	);
	await page.clock.setFixedTime(lateNight);
	await page.goto('/');

	// The header no longer counts the dips or names the day; the note that
	// explains *why* you are looking at another day is what says it now.
	await expect(page.getByText(/so this is\s+tomorrow/)).toBeVisible();
	const dip = page.locator('.dip').first();
	await expect(dip).toContainText('Nearby Pool');
	await expect(dip).toContainText('9–9:45am');
	// Tomorrow has no "now" on it, so the planner draws no now line.
	await expect(page.locator('.now')).toHaveCount(0);
});

// The general rule is "before anything has opened", not a hardcoded hour:
// today's swims are all still ahead of the clock, so today is the answer.
test('still offers today when asked before any pool has opened', async ({ page }) => {
	const anchor = readAnchor();
	const smallHours = new Date(anchorInstant(anchor.date).getTime() + (3 * 60 - 720) * 60_000);
	await page.clock.setFixedTime(smallHours);
	await page.goto('/');

	// Today, so the planner says nothing about which day it is showing — the
	// "so this is tomorrow" note is the only day label left, and it is absent.
	await expect(page.getByText(/so this is/)).toHaveCount(0);
	await expect(page.locator('.dip').first()).toContainText('2–2:45pm');
	// The axis leads in from an hour before the 1:50 p.m. departure, rather
	// than drawing ten hours of empty night from 3 a.m. to get there.
	await expect(page.locator('.hour').first()).toContainText('12pm');
	await expect(page.getByText('3am', { exact: true })).toHaveCount(0);
});

// v3 never measures from a landmark and calls the result yours. Decline the
// permission and it asks directly, on a map, rather than quietly answering
// for somewhere you are not.
test.describe('when the browser will not say where you are', () => {
	test.use({ permissions: [] });

	test('asks you to place yourself instead of guessing', async ({ page, context }) => {
		await context.setGeolocation(null).catch(() => {});
		await page.goto('/');

		await expect(page.getByRole('heading', { name: /Roughly where are you/ })).toBeVisible();
		await expect(page.locator('.dip')).toHaveCount(0);
		// Nothing is offered until the question is answered.
		await expect(page.getByRole('button', { name: /Tap the map first/ })).toBeDisabled();
	});

	test('offers dips measured from the point you tapped', async ({ page, context }) => {
		await context.setGeolocation(null).catch(() => {});
		await page.goto('/');

		const map = page.locator('button.map');
		await expect(map).toBeVisible();
		const box = await map.boundingBox();
		// Nearby Pool is at 43.66, -79.40 — close to the middle of the city
		// box, which is good enough for a test of the mechanism.
		await map.click({ position: { x: box.width * 0.45, y: box.height * 0.62 } });
		await page.getByRole('button', { name: /Show dips from here/ }).click();

		// The sentence about where we are measuring from is now a pin in the
		// nav, which is also the way back to the map.
		await expect(page.getByRole('button', { name: /Move the spot/ })).toBeVisible();
		await expect(page.locator('.dip').first()).toContainText('Nearby Pool');
	});

	// A map you can only tap is a map some people cannot use.
	test('can be answered from the keyboard alone', async ({ page, context }) => {
		await context.setGeolocation(null).catch(() => {});
		await page.goto('/');

		await page.locator('button.map').focus();
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');

		await expect(page.getByRole('button', { name: /Move the spot/ })).toBeVisible();
	});
});

// The planner's claim is that distance down the page is time, so an hour rule
// has to sit on its own minute. It is drawn inside a flex row that centres it,
// which once put every rule — and the "now" line — half a label-height late.
test('an hour rule sits level with a dip that starts on that hour', async ({ page }) => {
	await page.goto('/');

	// The seeded lane swim starts at 2:00 p.m. exactly, so its block's top edge
	// and the 2pm rule should be the same line.
	const block = await page.locator('.slot').first().boundingBox();
	const rule = await page
		.locator('.hour')
		.filter({ hasText: /^\s*2pm\s*$/ })
		.locator('.hrule')
		.boundingBox();

	expect(Math.abs(rule.y - block.y)).toBeLessThanOrEqual(1);
});
