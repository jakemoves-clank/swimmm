<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	// `/concepts` was this gallery's address before it was archived at `/v2`.
	// Links published under the old name — including deep links like
	// `?c=almanac` and `?at=23:30` — are exactly the thing the /vN scheme
	// exists to keep working, so the old path stands in for them rather than
	// 404ing. This page is a signpost, not a route anyone develops on.
	//
	// GitHub Pages serves static files and cannot issue a real 301, so the
	// redirect happens in the browser. (On Cloudflare, static/_redirects
	// handles it properly before this page is ever reached.) The query string
	// and fragment ride along, which a <meta http-equiv="refresh"> could not
	// do — its URL has to be fixed at prerender time, when nobody knows what
	// `?c=` the reader arrived with.
	const target = `${base}/v2`;

	onMount(() => {
		// replace(), not assign(): a signpost shouldn't sit in history, where
		// Back would bounce the reader off the gallery and straight through
		// here again.
		location.replace(target + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>Moved to /v2 — Swimmm</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<h1>This gallery moved</h1>
	<!-- Seen only with JavaScript off, or for the instant before the redirect. -->
	<p>The design studies are now at <a href={target}>{target}</a>.</p>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 0 auto;
		padding: 3rem 1rem;
		font: 1rem/1.5 system-ui, sans-serif;
	}

	h1 {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}
</style>
