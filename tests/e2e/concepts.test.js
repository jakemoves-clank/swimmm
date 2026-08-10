import { test, expect } from '@playwright/test';
import { anchorInstant, pinClock, readAnchor } from './fixture-time.js';

// The gallery at /v2 draws the same day eleven ways. What matters in
// e2e is that all eleven actually render against real payload shapes — several
// build layouts from measured widths, run a force simulation, or tessellate
// the city, and any of those can throw on a two-pool day without the unit
// tests noticing.
//
// Seed (tests/e2e/seed.js), anchored at noon: the user stands beside Nearby
// Pool, whose lane swim runs 2–3 pm. Faraway Pool's lane swim starts sooner
// (12:30) but is ~19 km off, so you would arrive with 25 minutes left — under
// the 30-minute minimum. Nearby Pool is therefore the answer, and a concept
// that says otherwise has its arithmetic wrong.
const CONCEPTS = [
	['trip-line', 'The Trip Line'],
	['day-planner', 'The Day Planner'],
	['pool-clock', 'The Pool Clock'],
	['parking-sign', 'Swim Permitted Between'],
	['map-of-minutes', 'A Map of Minutes'],
	['your-pool', 'Your Pool'],
	['twelve-maps', 'The Day in Twelve Maps'],
	['almanac', 'The Almanac'],
	['soonest-splash', 'Soonest Splash'],
	['worth-the-trip', 'Worth the Trip'],
	['strings', 'Strings']
];

test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside "Nearby Pool"
	permissions: ['geolocation']
});

test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
});

// Fails the test on the first uncaught exception rather than letting a broken
// concept render an empty <figure> and pass.
function watchForErrors(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return errors;
}

// The nav shows eleven numerals but is named "01 — The Trip Line" for screen
// readers, so match on the numeral the reader sees plus the title it announces.
const navName = (i) => `${String(i + 1).padStart(2, '0')} — ${CONCEPTS[i][1]}`;
const navTo = (page, i) => page.getByRole('button', { name: navName(i), exact: true }).click();

test('all eleven concepts draw, one after another, without throwing', async ({ page }) => {
	const errors = watchForErrors(page);
	await page.goto('/v2');

	for (const [i, [slug, title]] of CONCEPTS.entries()) {
		await navTo(page, i);

		await expect(page.getByRole('heading', { level: 2 })).toContainText(title);
		// Something was actually drawn, with real size — not an empty shell.
		const figure = page.locator('#stage figure').first();
		await expect(figure).toBeVisible();
		const box = await figure.boundingBox();
		expect(box.height, `${slug} drew nothing`).toBeGreaterThan(120);

		await expect(page).toHaveURL(slug === 'trip-line' ? /\/v2$/ : new RegExp(`c=${slug}`));
	}

	expect(errors, errors.join('\n')).toEqual([]);
});

test('a deep link opens straight onto its concept', async ({ page }) => {
	const errors = watchForErrors(page);
	await page.goto('/v2?c=almanac');

	await expect(page.getByRole('heading', { level: 2 })).toContainText('The Almanac');
	await expect(page.getByRole('button', { name: navName(7), exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	expect(errors, errors.join('\n')).toEqual([]);
});

test('an unknown concept falls back to the first rather than a blank wall', async ({ page }) => {
	await page.goto('/v2?c=butterfly');
	await expect(page.getByRole('heading', { level: 2 })).toContainText('The Trip Line');
});

test('the concepts agree on which swim you can actually get to', async ({ page }) => {
	await page.goto('/v2');

	// Faraway Pool starts sooner but leaves you 25 minutes in the water, so
	// every concept that names an answer has to name Nearby Pool.
	await expect(page.locator('#stage')).toContainText('Nearby Pool');
	await expect(page.locator('#stage .verdict')).not.toContainText('Faraway Pool');

	await navTo(page, 8); // 09 — Soonest Splash
	await expect(page.locator('#stage')).toContainText('Nearby Pool');
	await expect(page.locator('#stage')).not.toContainText('Faraway Pool');
});

test('the lane/leisure toggle filters inside a concept and rides in the URL', async ({ page }) => {
	await page.goto('/v2?c=almanac');

	// Lane: both pools run one. Leisure: only Nearby Pool does.
	await expect(page.locator('#stage [role="row"]:not(.head)')).toHaveCount(2);

	await page.getByRole('button', { name: 'Leisure' }).click();
	const rows = page.locator('#stage [role="row"]:not(.head)');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Nearby Pool');
	await expect(page).toHaveURL(/kind=leisure/);
});

// The sign board is the one concept that refuses to post a pool over an hour
// away — no plausible street sign tells you to cycle to Scarborough — so
// Faraway Pool, ~19 km off, never gets a sign even though it has a swim.
test('the sign board drops a pool it would be absurd to send you to', async ({ page }) => {
	await page.goto('/v2?c=parking-sign');

	await expect(page.locator('#stage .sign')).toHaveCount(1);
	await expect(page.locator('#stage .sign').first()).toContainText('Nearby Pool');
	await expect(page.locator('#stage')).not.toContainText('Faraway Pool');
});

test('?at= sets the clock, and every concept survives an empty day', async ({ page }) => {
	const errors = watchForErrors(page);
	await page.goto('/v2?at=23:30');

	await expect(page.getByText(/Clock set to 11:30 pm/)).toBeVisible();
	await expect(page.locator('.meta')).toContainText('0 still to come');

	// Nothing to draw is the state most likely to throw — every scale has an
	// empty domain and every "best" is null.
	for (const [i, [, title]] of CONCEPTS.entries()) {
		await navTo(page, i);
		await expect(page.getByRole('heading', { level: 2 })).toContainText(title);
	}
	expect(errors, errors.join('\n')).toEqual([]);
});

test('when the whole city is shut, the gallery rehearses the day and says so', async ({ page }) => {
	// Ten past midnight: past every seeded session, so the real clock would
	// leave all eleven concepts drawing an empty city.
	const lateNight = new Date(anchorInstant(readAnchor().date).getTime() + (23 * 60 + 50 - 720) * 60_000);
	await page.clock.setFixedTime(lateNight);
	await page.goto('/v2');

	await expect(page.getByText(/Rehearsal/)).toBeVisible();
	await expect(page.locator('.meta')).toContainText('still to come');
	await expect(page.locator('#stage figure').first()).toBeVisible();
});
