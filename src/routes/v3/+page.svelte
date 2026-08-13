<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	// v3 was asked for at `/v3` as well as `/`, and this is the half of that
	// which can be honoured. A real route here would have to be either a live
	// copy of `/` — which imports `$lib`, and so fails the archive seal the
	// moment it exists — or a snapshot, which v3 is not: it is the version
	// still being worked on. So `/v3` is a signpost to the live site.
	//
	// It stops being one the day v3 is superseded. Then this file is replaced
	// by a sealed snapshot under `src/routes/v3/lib/`, cut from `/` as it
	// stood, with a frozen suite at `tests/e2e/v3/` — and the address people
	// have been linking to keeps resolving, to the thing it always described.
	// That is the whole reason to answer here now rather than 404.
	//
	// GitHub Pages serves static files and cannot issue a real 301, so the
	// redirect happens in the browser. (On Cloudflare, static/_redirects
	// handles it before this page is ever reached.) The query string and
	// fragment ride along: `/v3?kind=leisure&dip=30` is a link someone can
	// reasonably hold, and dropping its parameters would land them on a
	// different offer while looking like it worked.
	const target = `${base}/`;

	onMount(() => {
		// replace(), not assign(): a signpost shouldn't sit in history, where
		// Back would bounce the reader off the site and straight through here
		// again.
		location.replace(target + location.search + location.hash);
	});
</script>

<svelte:head>
	<title>v3 is the live site — Swimmm</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<h1>v3 is the live site</h1>
	<!-- Seen only with JavaScript off, or for the instant before the redirect.
	     The label is the canonical path; `target` is where it actually points,
	     which under a base path (a /pr-N preview, or the project site itself)
	     is resolved and relative, and reads like nonsense to a human. -->
	<p>Swimmm as it stands is at <a href={target}>/</a>.</p>
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
