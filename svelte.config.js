import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		adapter: adapter(),
		// GitHub Pages serves project sites under /<repo>; Cloudflare Pages (or
		// a custom domain) wants ''. The deploy workflow sets BASE_PATH.
		paths: {
			base: process.env.BASE_PATH || ''
		},
		// With prerendering, SvelteKit emits this CSP as hashes in a meta tag
		// (GitHub Pages can't set headers; static/_headers covers Cloudflare).
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// The only inline style on the whole site is the one SvelteKit puts
				// on its own #svelte-announcer (the a11y live region), and it is a
				// style *attribute*, which a plain hash can't cover. 'unsafe-hashes'
				// is what covers attributes: it permits exactly the one string below
				// and nothing else, where 'unsafe-inline' would permit any CSS an
				// injection could dream up.
				//
				// The hash is pinned to SvelteKit's markup, so a Kit upgrade can
				// stale it. That fails softly — the announcer is applied through the
				// CSSOM and stays hidden either way; you just get a console
				// violation — and tests/e2e/csp.test.js fails on any violation, so
				// it gets noticed rather than lived with.
				'style-src': [
					'self',
					'unsafe-hashes',
					'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
				],
				'img-src': ['self', 'data:'],
				'connect-src': ['self', 'https://api.mapbox.com', 'https://api.transitous.org'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		}
	}
};
