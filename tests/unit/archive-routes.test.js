import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// `/v1` and `/v2` are archived snapshots: copies of the site as it stood, kept
// renderable rather than kept current. Each owns its implementation under
// `src/routes/vN/lib/`, which is what lets its frozen behavioural suite
// (tests/e2e/vN/) stay green without ever being edited — a frozen test over a
// shared implementation would only fail for the wrong reasons.
//
// So the snapshots have to stay sealed, and there are two ways they leak:
//
//   1. Someone notices `/v1` duplicates `/` and lifts the shared markup into
//      one component. After that a change to `/` rewrites what `/v1` shows.
//   2. Someone tidies an import back to `$lib`. Subtler, same effect: the
//      snapshot starts tracking live code again.
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

const SNAPSHOTS = ['src/routes/v1', 'src/routes/v2'];
const LIVE_ROUTE = 'src/routes/+page.svelte';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function walk(dir) {
	return readdirSync(new URL(`${dir}/`, root)).flatMap((entry) => {
		const path = `${dir}/${entry}`;
		return statSync(new URL(path, root)).isDirectory() ? walk(path) : [path];
	});
}

// Every `import ... from '<specifier>'` in a file.
const importsOf = (source) => [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

// Does a relative specifier stay inside the snapshot it was written in?
const staysInside = (snapshot, file, spec) => {
	const resolved = new URL(spec, new URL(file, root));
	return resolved.href.startsWith(new URL(`${snapshot}/`, root).href);
};

describe('archived routes stay sealed', () => {
	for (const snapshot of SNAPSHOTS) {
		const files = walk(snapshot).filter((f) => /\.(js|svelte)$/.test(f));

		it(`${snapshot} has files to check`, () => {
			// Guards against the walk silently finding nothing and every assertion
			// below passing over an empty list.
			expect(files.length).toBeGreaterThan(2);
		});

		it(`${snapshot} imports no live app code beyond the shared data pipeline`, () => {
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
			expect(leaks, `${snapshot} reaches outside itself`).toEqual([]);
		});

		it(`${snapshot} carries its own page markup`, () => {
			expect(read(`${snapshot}/+page.svelte`)).toContain('<main>');
		});
	}

	it('the live route does not reach into an archive', () => {
		// The reverse leak: building on a snapshot instead of copying from it,
		// which would make the archive load-bearing and impossible to retire.
		const reaching = importsOf(read(LIVE_ROUTE)).filter((spec) => /(^|\/)v\d+\//.test(spec));
		expect(reaching, 'the live page imports from an archive').toEqual([]);
	});
});
