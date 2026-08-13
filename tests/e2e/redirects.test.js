import { test, expect } from '@playwright/test';
import { pinClock } from './fixture-time.js';

// The /vN scheme only means anything if old links keep resolving, and the
// gallery had a published address — /concepts — before it was archived at /v2.
// Renaming a route is the easy half; not 404ing the links people already have
// is the half that gets forgotten, so it gets a test.
//
// The deep link is the part worth guarding: dropping the query string turns a
// link to one specific concept into a link to the gallery's front page, which
// looks like it worked.

test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
});

test('/concepts lands on the gallery', async ({ page }) => {
	await page.goto('/concepts');

	await expect(page).toHaveURL(/\/v2$/);
	await expect(page.locator('#stage figure').first()).toBeVisible();
});

test('/concepts carries its deep link across', async ({ page }) => {
	await page.goto('/concepts?c=almanac');

	await expect(page).toHaveURL(/\/v2\?c=almanac$/);
	// Landed on the concept that was asked for, not just the gallery.
	await expect(page.getByRole('heading', { level: 2 })).toContainText('The Almanac');
});

test('/concepts keeps every parameter, not just the first', async ({ page }) => {
	await page.goto('/concepts?c=almanac&kind=leisure&at=13:00');

	await expect(page).toHaveURL(/c=almanac/);
	await expect(page).toHaveURL(/kind=leisure/);
	await expect(page).toHaveURL(/at=13%3A00|at=13:00/);
});

// `/v3` names the version that is currently live at `/`. It cannot be a copy
// of the live route (that would import `$lib` and fail the archive seal) and
// cannot be a snapshot (v3 is still moving), so it answers as a signpost — and
// the day v3 is superseded, the same address becomes the sealed snapshot cut
// from it. Either way the link resolves to the version it names.

test('/v3 lands on the live site', async ({ page }) => {
	await page.goto('/v3');

	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('button', { name: /use live location/ })).toBeVisible();
});

test('/v3 carries its parameters across', async ({ page }) => {
	// A held link like /v3?kind=leisure&dip=30 describes a particular offer;
	// arriving at the default one would look like it worked.
	await page.goto('/v3?kind=leisure&dip=30');

	await expect(page).toHaveURL(/kind=leisure/);
	await expect(page).toHaveURL(/dip=30/);
});

test('the signpost leaves no trace in history', async ({ page }) => {
	// Arrive from somewhere, so there is a real Back to press.
	await page.goto('/');
	await page.goto('/concepts?c=almanac');
	await expect(page).toHaveURL(/\/v2\?c=almanac$/);

	// Back should reach the page before the signpost. If the redirect used
	// assign() instead of replace(), this would land on /concepts and bounce
	// straight forward again, trapping the reader.
	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
});
