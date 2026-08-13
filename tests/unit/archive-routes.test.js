import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// `/v1` and `/v2` are archived snapshots: copies of the site as it stood, kept
// renderable rather than kept current. Each owns its implementation under
// `src/routes/vN/lib/`, which is what lets its frozen behavioural suite
// (tests/e2e/vN/) stay green without ever being edited — a frozen test over a
// shared implementation would only fail for the wrong reasons.
//
// So the snapshots have to stay sealed, and there are three ways they leak:
//
//   1. Someone notices `/v1` duplicates `/` and lifts the shared markup into
//      one component. After that a change to `/` rewrites what `/v1` shows.
//   2. Someone tidies an import back to `$lib`. Subtler, same effect: the
//      snapshot starts tracking live code again.
//   3. Someone deletes a frozen suite as redundant, and the snapshot keeps
//      rendering while nothing describes what it is supposed to render.
//
// The duplication is deliberate, and this test is what says so out loud.
//
// The single deliberate exception is `$lib/server/**`, the build-time data
// pipeline. It is shared on purpose: `+page.server.js` runs at prerender, so a
// frozen copy of the loader would fail the *whole* build — `/` included — the
// day the city changes its data format. Sharing it means an archive can go
// stale, which is allowed; freezing it would mean an archive can block a
// deploy, which is not. The version boundary is the schedule payload it
// returns.

const ROUTES = 'src/routes';
const LIVE_ROUTE = 'src/routes/+page.svelte';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

// Derived from disk, never hand-listed: a `/v4` added next year is sealed by
// these tests the day it appears, rather than the day someone remembers to
// register it here.
const versionNames = () =>
	readdirSync(new URL(`${ROUTES}/`, root))
		.filter((entry) => /^v\d+$/.test(entry))
		.filter((entry) => statSync(new URL(`${ROUTES}/${entry}`, root)).isDirectory())
		.sort();

// A `vN` directory is one of two things, and the difference decides which of
// the rules below apply to it:
//
//   - a *snapshot* — the sealed copy of the site as it stood, owning its code
//     under src/routes/vN/lib/ and described by a frozen suite in tests/e2e/vN/
//   - a *signpost* — a redirect to `/`, for the version number that is still
//     live. A real copy of the live route under a `vN/` path would import
//     `$lib` and fail the seal the moment it existed, and freezing the version
//     still being worked on would be a lie; answering with a redirect keeps the
//     published address resolving to the thing it names either way.
//
// The day a live version is superseded, its signpost is replaced by the
// snapshot cut from it, and the address never moves.
//
// Classification is by the evidence a snapshot leaves behind — its own lib/, or
// its frozen spec — and never by "the directory looks small". That matters: it
// is what stops either leak from hiding here. Delete a snapshot's lib/ and its
// frozen spec still convicts it; delete the spec and its lib/ does. Retiring a
// version means removing both, deliberately, which is the one case where a
// snapshot is *meant* to become a signpost.
const isSnapshot = (name) => exists(`${ROUTES}/${name}/lib`) || exists(`tests/e2e/${name}`);
const snapshotNames = () => versionNames().filter(isSnapshot);
const signpostNames = () => versionNames().filter((name) => !isSnapshot(name));

function walk(dir) {
	return readdirSync(new URL(`${dir}/`, root)).flatMap((entry) => {
		const path = `${dir}/${entry}`;
		return statSync(new URL(path, root)).isDirectory() ? walk(path) : [path];
	});
}

const importsOf = (source) => [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

// Does a relative specifier stay inside the snapshot it was written in?
const staysInside = (snapshot, file, spec) =>
	new URL(spec, new URL(file, root)).href.startsWith(new URL(`${snapshot}/`, root).href);

const WHY_SEALED = `
Each /vN route is a sealed archive: it owns its code under src/routes/vN/lib/
so that changes to the live site can never rewrite what the snapshot shows.
An import that leaves the snapshot re-links it to live code and defeats that.

The duplication between an archive and the live route is deliberate. If you
arrived here from a "remove duplication" cleanup, that cleanup is the bug.
Only $lib/server/** may be shared — see CLAUDE.md.
`;

describe('archived routes stay sealed', () => {
	const snapshots = snapshotNames();

	it('finds the archived routes on disk', () => {
		// Without this, a broken scan would leave every check below iterating an
		// empty list and passing.
		expect(snapshots.length, `no vN routes found under ${ROUTES}`).toBeGreaterThan(0);
	});

	for (const name of snapshots) {
		const snapshot = `${ROUTES}/${name}`;
		const files = walk(snapshot).filter((f) => /\.(js|svelte)$/.test(f));

		it(`/${name} has files to check`, () => {
			expect(files.length, `${snapshot} looks empty`).toBeGreaterThan(2);
		});

		it(`/${name} imports no live app code beyond the shared data pipeline`, () => {
			const leaks = [];
			for (const file of files) {
				for (const spec of importsOf(read(file))) {
					if (spec.startsWith('$lib/server/')) continue; // the deliberate seam
					if (spec.startsWith('$lib')) leaks.push(`${file} → ${spec}`);
					else if (spec.startsWith('.') && !staysInside(snapshot, file, spec)) {
						leaks.push(`${file} → ${spec}`);
					}
				}
			}
			expect(leaks, `${snapshot} reaches outside itself:\n${WHY_SEALED}`).toEqual([]);
		});

		it(`/${name} carries its own page markup`, () => {
			expect(read(`${snapshot}/+page.svelte`)).toContain('<main>');
		});

		it(`/${name} still has its frozen spec`, () => {
			// Deleting the frozen suite is the quiet leak: nothing breaks, and the
			// snapshot simply stops being described. The floor contract in
			// archive.test.js would still cover it, but only structurally.
			const dir = `tests/e2e/${name}`;
			expect(exists(dir), `${dir} is missing — a frozen spec was deleted`).toBe(true);
			const specs = readdirSync(new URL(`${dir}/`, root)).filter((f) => f.endsWith('.test.js'));
			expect(specs.length, `${dir} has no .test.js files left`).toBeGreaterThan(0);
		});
	}

	it('every archived route is registered with the e2e floor contract', () => {
		// archive.test.js hand-writes each snapshot's "drew"/"explore" locators —
		// they can't be derived. What can be checked is that none is forgotten.
		const contract = read('tests/e2e/archive.test.js');
		const unregistered = snapshots.filter((name) => !contract.includes(`path: '/${name}'`));
		expect(
			unregistered,
			'add these to ARCHIVES in tests/e2e/archive.test.js so they get the renders/explorable contract'
		).toEqual([]);
	});

	it('the live route does not reach into an archive', () => {
		// The reverse leak: building on a snapshot instead of copying from it,
		// which would make the archive load-bearing and impossible to retire.
		const reaching = importsOf(read(LIVE_ROUTE)).filter((spec) => /(^|\/)v\d+\//.test(spec));
		expect(reaching, 'the live page imports from an archive').toEqual([]);
	});
});

describe('a /vN signpost stays a signpost', () => {
	// The failure this guards against is a signpost quietly growing into a
	// route: someone renders a dip on it "since it's already there", and the
	// version number now has two implementations that drift apart, neither of
	// them sealed.
	for (const name of signpostNames()) {
		const dir = `${ROUTES}/${name}`;
		const source = () => read(`${dir}/+page.svelte`);

		it(`/${name} is a redirect and nothing else`, () => {
			const files = walk(dir).map((path) => path.slice(dir.length + 1));
			expect(files, `${dir} holds more than a signpost`).toEqual(['+page.svelte']);
		});

		it(`/${name} points at the live route`, () => {
			expect(source()).toContain('location.replace');
			// `${base}/` — the live root under whatever base path the build is
			// served from, not another version and not a hard-coded absolute.
			expect(source(), 'a signpost points at `/`, not at another version').toMatch(
				/`\$\{base\}\/`/
			);
		});

		it(`/${name} carries the query string across`, () => {
			// Dropping it turns a link to one specific offer into a link to the
			// front page, which looks like it worked.
			expect(source()).toContain('location.search');
		});

		it(`/${name} imports no app code`, () => {
			const foreign = importsOf(source()).filter(
				(spec) => spec !== 'svelte' && !spec.startsWith('$app/')
			);
			expect(
				foreign,
				`a signpost that imports app code is a route, and a route at /${name} has to be sealed:\n${WHY_SEALED}`
			).toEqual([]);
		});

		it(`/${name} redirects at the edge too`, () => {
			// GitHub Pages can only redirect in the browser; Cloudflare does it
			// properly, but only for paths listed here. Losing one silently costs
			// the reader a round trip through a page that says nothing.
			expect(read('static/_redirects'), `/${name} is missing from static/_redirects`).toMatch(
				new RegExp(`^/${name}\\s`, 'm')
			);
		});
	}
});
