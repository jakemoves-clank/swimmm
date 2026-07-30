import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		adapter: adapter(),
		// SvelteKit nonces its own inline bootstrap script under this CSP.
		// connect-src covers the two routing providers the browser talks to.
		csp: {
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
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		}
	}
};
