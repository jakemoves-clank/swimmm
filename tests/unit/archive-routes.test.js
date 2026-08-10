import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// `/v1` and `/v2` are archived snapshots: copies of the routes as they stood,
// kept renderable rather than kept current. The tempting cleanup — notice that
// `/v1` duplicates most of `/`, lift the shared markup into one component, have
// both render it — is the one change that quietly defeats the point, because
// after it a change to `/` rewrites what `/v1` shows.
//
// Duplication between the archive and the live route is therefore deliberate,
// and this is the test that says so out loud. Sharing through `$lib` is fine
// and unavoidable (an archive is a copy of the route, not of the whole app);
// what is forbidden is one route reaching into another's directory.

const ROUTES = ['src/routes/+page.svelte', 'src/routes/v1/+page.svelte', 'src/routes/v2/+page.svelte'];

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Every `import ... from '<specifier>'` in the file's <script> block.
const importsOf = (source) =>
	[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('archived routes stay standalone copies', () => {
	for (const path of ROUTES) {
		it(`${path} imports nothing from a sibling route`, () => {
			const escaping = importsOf(read(path)).filter((spec) => spec.startsWith('..'));
			// A relative import climbing out of the route's own folder is the shape
			// every "let's deduplicate these" refactor takes.
			expect(escaping, `${path} reaches outside its route directory`).toEqual([]);
		});

		it(`${path} carries its own markup rather than re-exporting another route's`, () => {
			expect(read(path), `${path} has no page markup of its own`).toContain('<main>');
		});
	}
});
