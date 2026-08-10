import { test, expect } from '@playwright/test';
import { pinClock } from './fixture-time.js';

// The Content-Security-Policy is only worth having if it is actually clean:
// a policy that reports a violation on every page load trains everyone to
// ignore violations, and is one step from being loosened back out to make the
// noise stop. So this asserts zero violations rather than "it mostly works".
//
// It also guards the one fiddly part. `style-src` carries a hash pinned to the
// style attribute SvelteKit puts on its own #svelte-announcer, and a Kit
// upgrade can change that string. Nothing breaks visually when it does — the
// announcer keeps its styles and stays hidden — so without this test the only
// symptom would be a console message nobody reads.

// Both of these are async, and awaiting them is the whole test: register the
// listener after the first navigation and it records nothing, so every
// assertion below passes no matter how broken the policy is.
async function watchViolations(page) {
	const violations = [];
	await page.exposeFunction('__cspViolation', (v) => violations.push(v));
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (e) =>
			window.__cspViolation({
				directive: e.violatedDirective,
				blocked: e.blockedURI,
				source: e.sourceFile
			})
		);
	});
	return violations;
}

const describe = (v) => v.map((x) => `${x.directive} blocked ${x.blocked} (${x.source ?? '—'})`);

test.beforeEach(async ({ page }) => {
	await pinClock(page);
	await page.route('**/api.mapbox.com/**', (route) => route.abort());
});

for (const path of ['/', '/v1', '/v2', '/v3']) {
	test(`${path} loads with no CSP violations`, async ({ page }) => {
		const violations = await watchViolations(page);
		await page.goto(path);
		await expect(page.locator('main')).toBeVisible();
		await page.waitForTimeout(500);

		expect(describe(violations)).toEqual([]);
	});
}

// The announcer only announces on a client-side navigation, which is also the
// moment its style attribute is written — so the interesting case is a route
// change, not a cold load.
test('a client-side navigation announces without tripping the policy', async ({ page }) => {
	const violations = await watchViolations(page);
	await page.goto('/v2');
	await page.getByRole('link', { name: 'back to Swimmm' }).click();
	await expect(page).toHaveURL(/\/$/);

	const announcer = page.locator('#svelte-announcer');
	await expect(announcer).toHaveText(/Swimmm/);
	// Still clipped to a pixel: if the hash ever stopped covering the attribute
	// the styles would come from the CSSOM anyway, but a regression that leaves
	// the page title floating over the layout should fail loudly.
	await expect(announcer).toHaveCSS('width', '1px');
	await expect(announcer).toHaveCSS('position', 'absolute');

	expect(describe(violations)).toEqual([]);
});

test('the policy does not fall back to blanket unsafe-inline', async ({ page }) => {
	await page.goto('/');
	const policy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');

	const styleSrc = /style-src ([^;]*)/.exec(policy)?.[1] ?? '';
	expect(styleSrc, policy).not.toContain('unsafe-inline');
	expect(styleSrc).toContain('sha256-');
	// script-src has never needed an escape hatch; keep it that way.
	expect(/script-src ([^;]*)/.exec(policy)?.[1] ?? '').not.toContain('unsafe');
});
