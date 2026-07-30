import { test, expect } from '@playwright/test';

// The user story: a person in Toronto opens Swimmm, shares their location,
// and sees which city pools have adult lane swim today — closest and soonest.
test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside "Nearby Pool"
	permissions: ['geolocation'],
	viewport: { width: 390, height: 844 } // phone-sized
});

test('shows today’s lane swims, sorted by closeness, with times and distances', async ({
	page
}) => {
	await page.goto('/');

	// Both seeded pools with lane swim today are listed
	await expect(page.getByText('Nearby Pool')).toBeVisible();
	await expect(page.getByText('Faraway Pool')).toBeVisible();
	await expect(page.getByText('2 swims left today')).toBeVisible();

	// Location was granted → sorted by distance, nearest first, distances shown
	const cards = page.locator('.card');
	await expect(cards.first()).toContainText('Nearby Pool');
	await expect(cards.first()).toContainText('0.0 km');
	await expect(cards.nth(1)).toContainText('Faraway Pool');

	// Times are rendered as ranges (e.g. "6:30 p.m.–7:30 p.m.")
	await expect(cards.first()).toContainText(/\d{1,2}:\d{2} [ap]\.m\.–\d{1,2}:\d{2} [ap]\.m\./);

	// Switching to "Soonest" puts the earlier (but farther) session first
	await page.getByRole('button', { name: 'Soonest' }).click();
	await expect(cards.first()).toContainText('Faraway Pool');
});
