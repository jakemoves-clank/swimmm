// FROZEN — /v1's spec, copied from the live suite at the moment /v1 was cut.
//
// /v1 owns its implementation (src/routes/v1/lib/), so this describes code
// that no longer changes, and it should stay green without ever being edited.
// If it goes red, an upstream change reached into the snapshot: fix the
// snapshot, or retire the version. Editing these assertions to match new
// behaviour would quietly rewrite what /v1 is — which is the one thing
// pinning it was meant to prevent.
//
// The live equivalent is tests/e2e/live/ — that is the copy that follows the
// product, and the one to change when behaviour genuinely moves on.
import { test, expect } from '@playwright/test';
import { pinClock } from '../fixture-time.js';

// The user story: someone who wants an open swim rather than lengths flips the
// toggle and sees leisure sessions instead — and can link straight to that tab.
// Seed (tests/e2e/seed.js): lane at both pools, leisure only at Nearby Pool.
test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside "Nearby Pool"
	permissions: ['geolocation']
});

// Mapbox is unreachable in e2e, so the list shows straight-line distances and
// nothing is filtered out — the same fallback the happy path covers.
test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
});

test('toggling to Leisure swaps the list, and back to Lane restores it', async ({ page }) => {
	await page.goto('/v1');

	// Lane is the default tab
	await expect(page.getByRole('button', { name: 'Lane' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('2 swims left today')).toBeVisible();
	await expect(page.locator('.card')).toHaveCount(2);

	await page.getByRole('button', { name: 'Leisure' }).click();

	// Only the seeded leisure session remains, at Nearby Pool
	await expect(page.getByRole('button', { name: 'Leisure' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByText('1 swim left today')).toBeVisible();
	const cards = page.locator('.card');
	await expect(cards).toHaveCount(1);
	await expect(cards.first()).toContainText('Nearby Pool');
	await expect(page.getByText('Faraway Pool')).toBeHidden();

	// The tab is reflected in the URL so the view can be shared or reloaded
	await expect(page).toHaveURL(/[?&]kind=leisure/);

	// Switching back restores lane, and drops the param rather than pinning the
	// default into every shared link
	await page.getByRole('button', { name: 'Lane' }).click();
	await expect(page.locator('.card')).toHaveCount(2);
	await expect(page).not.toHaveURL(/kind=/);
});

test('?kind=leisure opens directly on the leisure tab', async ({ page }) => {
	await page.goto('/v1?kind=leisure');

	await expect(page.getByRole('button', { name: 'Leisure' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('.card')).toHaveCount(1);
	await expect(page.locator('.card').first()).toContainText('Nearby Pool');
});

test('an unknown kind falls back to lane rather than an empty page', async ({ page }) => {
	await page.goto('/v1?kind=cannonball');

	await expect(page.getByRole('button', { name: 'Lane' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.card')).toHaveCount(2);
});
