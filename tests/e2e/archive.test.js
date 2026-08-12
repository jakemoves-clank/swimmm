import { test, expect } from '@playwright/test';
import { pinClock } from './fixture-time.js';

// `/v1` and `/v2` are archived snapshots, not live routes. Nothing new gets
// built on them; they exist so a link to "Swimmm as it was" keeps working.
//
// That makes their contract narrower than the root's, and deliberately so.
// The archive is a copy of the *route*, not of the whole app — both snapshots
// still import `$lib` (config, time, travel, the concepts model), so upstream
// work does reach them. When it does, the snapshot showing an older reading of
// the day is the intended outcome, not a failure. What is never acceptable is
// a snapshot that throws, renders a blank shell, or has controls that no
// longer respond.
//
// So this file asserts structure and liveness, never content: something drew,
// the controls still work, the query parameters still route, and nothing was
// thrown along the way. The data-level assertions live with the routes that
// are still under development — the root's own suite (happy-path, kind-toggle,
// travel-filter) and concepts.test.js. If upstream data moves on, those are
// the tests meant to be updated; this one should stay green untouched. If it
// ever goes red, an archive genuinely broke.

test.use({
	geolocation: { latitude: 43.66, longitude: -79.4 }, // beside "Nearby Pool"
	permissions: ['geolocation']
});

test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
});

// Fails on the first uncaught exception rather than letting a half-dead page
// render an empty shell and pass.
function watchForErrors(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return errors;
}

// A prerendered page is on the screen long before it is alive. Both snapshots
// ship a loading line in their HTML and swap it for the real thing once the
// client code runs, and until then the buttons have no handlers attached.
//
// /v1's loading line is a `<p class="status">`, which is also one of the three
// things its `drew` locator accepts — so "it drew" was satisfied by the shell,
// and the test went on to click a dead button and wait five seconds for a
// state change that was never coming. It failed about one run in three under
// the full parallel suite, on a machine busy enough to make hydration late,
// and passed every time on its own. Hence: wait for the page to come up.
//
// Waiting on a snapshot's own loading copy would be a brittle thing to do to
// a live route. It is safe here for the reason this whole file exists: an
// archive's markup cannot change.
async function open(page, archive, url = archive.path) {
	await page.goto(url);
	await expect(page.getByText(archive.loading)).toHaveCount(0);
}

const ARCHIVES = [
	{
		path: '/v1',
		loading: /Loading today/,
		// The root page resolves to a list, an empty-state line, or the dry pool.
		// Any of the three is a page that worked; none of them is a blank shell.
		drew: (page) => page.locator('.card, .status, .dry-pool-box').first(),
		// One control that has to keep responding, checked through the state it
		// owns rather than the rows it produces.
		async explore(page) {
			await page.getByRole('button', { name: 'Leisure' }).click();
			await expect(page.getByRole('button', { name: 'Leisure' })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await expect(page).toHaveURL(/[?&]kind=leisure/);
		},
		deepLink: '/v1?kind=leisure',
		async landed(page) {
			await expect(page.getByRole('button', { name: 'Leisure' })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
		},
		nonsense: '/v1?kind=cannonball'
	},
	{
		path: '/v2',
		loading: /Reading today/,
		drew: (page) => page.locator('#stage figure').first(),
		// The gallery's control is its nav: a second concept has to be reachable
		// and has to change what is on the stage.
		async explore(page) {
			const heading = page.getByRole('heading', { level: 2 });
			const before = await heading.textContent();
			await page.getByRole('button', { name: /^02 — / }).click();
			await expect(heading).not.toHaveText(before);
			await expect(page).toHaveURL(/[?&]c=/);
		},
		deepLink: '/v2?c=almanac',
		async landed(page) {
			await expect(page.getByRole('button', { name: /^08 — / })).toHaveAttribute(
				'aria-current',
				'true'
			);
		},
		nonsense: '/v2?c=butterfly'
	}
];

for (const archive of ARCHIVES) {
	const { path } = archive;

	test(`${path} still renders`, async ({ page }) => {
		const errors = watchForErrors(page);
		await open(page, archive);

		await expect(page.locator('main')).toBeVisible();
		// Titled with something, whatever the snapshot's era called itself.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/\S/);

		// Drawn with real size, not collapsed to nothing.
		const drawn = archive.drew(page);
		await expect(drawn).toBeVisible();
		const box = await drawn.boundingBox();
		expect(box.height, `${path} drew nothing`).toBeGreaterThan(20);

		expect(errors, errors.join('\n')).toEqual([]);
	});

	test(`${path} is still explorable`, async ({ page }) => {
		const errors = watchForErrors(page);
		await open(page, archive);
		await expect(archive.drew(page)).toBeVisible();

		await archive.explore(page);

		// Whatever the control did, it left a page rather than a blank.
		await expect(archive.drew(page)).toBeVisible();
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test(`${path} still honours its deep links, and survives a bad one`, async ({ page }) => {
		const errors = watchForErrors(page);

		await open(page, archive, archive.deepLink);
		await archive.landed(page);
		await expect(archive.drew(page)).toBeVisible();

		// A stale link from the snapshot's era should degrade to the default view,
		// never to an empty page — an archive nobody maintains will be linked to
		// with parameters nobody remembers.
		await open(page, archive, archive.nonsense);
		await expect(page.locator('main')).toBeVisible();
		await expect(archive.drew(page)).toBeVisible();

		expect(errors, errors.join('\n')).toEqual([]);
	});
}
