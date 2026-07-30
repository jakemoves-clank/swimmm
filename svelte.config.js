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
				// 'unsafe-inline' is required by SvelteKit's own #svelte-announcer
				// (a11y live region), which sets a style attribute — attributes
				// can't be covered by CSP hashes or nonces. Our own markup has no
				// inline styles, so this is the only thing keeping it here.
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'connect-src': ['self', 'https://api.mapbox.com', 'https://api.transitous.org'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		}
	}
};
