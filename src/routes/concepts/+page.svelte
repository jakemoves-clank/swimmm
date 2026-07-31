<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { torontoNow } from '$lib/time.js';
	import { fetchTravelTimes } from '$lib/travel.js';
	import { buildDay, clockOverride, fmtClock, DEMO_MIN } from '$lib/concepts/model.js';
	import { CONCEPTS, DEFAULT_CONCEPT, conceptBySlug } from '$lib/concepts/registry.js';
	import {
		snapToGrid,
		minSwimMin,
		swimKindParam,
		SWIM_KINDS,
		SWIM_KIND_LABELS,
		DEFAULT_SWIM_KIND
	} from '$lib/config.js';

	let { data } = $props();

	// Nathan Phillips Square. Somewhere has to be the middle of the map before
	// the browser tells us where you are, and every concept here is *about*
	// distance — an origin-less version of these pictures would be a different
	// (and much duller) set of designs.
	const CITY_HALL = { lat: 43.6535, lng: -79.3839 };

	let now = $state(null);
	let slug = $state(DEFAULT_CONCEPT);
	let kind = $state(DEFAULT_SWIM_KIND);
	let coords = $state(null);
	let geoState = $state('idle'); // idle | asking | granted | denied | framed
	let travel = $state(null);
	let minSwim = $state(30);
	let clock = $state('live'); // live | demo | set

	const concept = $derived(conceptBySlug(slug));
	const origin = $derived(coords ?? CITY_HALL);
	const travelSource = $derived(travel ? 'routed' : 'estimated');

	// One kind at a time: both are baked into the same payload, so switching is
	// a filter, never a fetch.
	const scheduleForKind = $derived({
		...data.schedule,
		sessions: data.schedule.sessions.filter((s) => s.kind === kind)
	});

	const day = $derived(
		now ? buildDay(scheduleForKind, { now, origin, travel, minSwim }) : null
	);

	function setKind(k) {
		kind = k;
		syncUrl();
	}

	function select(next) {
		slug = next;
		syncUrl();
		document.getElementById('stage')?.scrollIntoView({ block: 'nearest' });
	}

	function syncUrl() {
		const url = new URL(location.href);
		if (slug === DEFAULT_CONCEPT) url.searchParams.delete('c');
		else url.searchParams.set('c', slug);
		if (kind === DEFAULT_SWIM_KIND) url.searchParams.delete('kind');
		else url.searchParams.set('kind', kind);
		history.replaceState(history.state, '', url);
	}

	function step(delta) {
		const i = CONCEPTS.findIndex((c) => c.slug === slug);
		select(CONCEPTS[(i + delta + CONCEPTS.length) % CONCEPTS.length].slug);
	}

	function onKeydown(e) {
		if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === 'ArrowRight') step(1);
		else if (e.key === 'ArrowLeft') step(-1);
	}

	async function askLocation() {
		if (!navigator.geolocation) return (geoState = 'denied');
		geoState = 'asking';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				coords = snapToGrid({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				geoState = 'granted';
				loadTravel();
			},
			() => (geoState = 'denied'),
			{ maximumAge: 300_000, timeout: 15_000 }
		);
	}

	// Real routed times when the build has a Mapbox token; otherwise every
	// concept says "estimated" in its footer and uses the grid-detour guess.
	async function loadTravel() {
		if (!data.mapboxToken || !coords) return;
		const pools = (data.schedule.locations ?? [])
			.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
			.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng }));
		try {
			travel = await fetchTravelTimes(coords, pools, data.mapboxToken);
		} catch (e) {
			console.warn('travel times unavailable:', e.message);
			travel = null;
		}
	}

	onMount(() => {
		const params = new URLSearchParams(location.search);
		if (params.get('c')) slug = conceptBySlug(params.get('c')).slug;
		kind = swimKindParam(params);
		minSwim = minSwimMin(params);

		const real = torontoNow();
		const at = clockOverride(params);
		if (at != null) {
			now = { date: real.date, minutes: at };
			clock = 'set';
		} else if (data.schedule.sessions.some((s) => s.date === real.date && s.end_min > real.minutes)) {
			now = real;
		} else {
			// Every pool in the city is shut. Rehearse the day at 1 p.m. rather
			// than show eleven empty plates — and say so, loudly, in the footer.
			now = { date: real.date, minutes: DEMO_MIN };
			clock = 'demo';
		}

		// Same reasoning as the main page: framed, we never prompt for location.
		if (window.self !== window.top) {
			geoState = 'framed';
			return;
		}
		askLocation();
	});

	const index = $derived(CONCEPTS.findIndex((c) => c.slug === slug) + 1);
	const Concept = $derived(concept.component);
	const pad = (n) => String(n).padStart(2, '0');
</script>

<svelte:head>
	<title>Swimmm — eleven ways to find a swim</title>
	<meta
		name="description"
		content="Eleven visual answers to one question: which Toronto pool has a swim I can get to, and how soon?"
	/>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
	<header>
		<p class="eyebrow">Swimmm · design studies</p>
		<h1>Eleven ways to find a swim</h1>
		<p class="deck">
			One question — <em
				>which city pool has a swim today that I can actually get to, and how soon?</em
			> — drawn eleven ways from the same City of Toronto data. Each concept gets at most two
			things you can touch.
		</p>
	</header>

	<nav aria-label="Concepts">
		<ol>
			{#each CONCEPTS as c, i (c.slug)}
				<li>
					<!-- The nav is eleven numerals, which is all a screen reader would
					     have to go on. The accessible name leads with the visible text
					     so it still satisfies label-in-name, then says which one it is. -->
					<button
						class:current={c.slug === slug}
						aria-current={c.slug === slug ? 'true' : undefined}
						aria-label="{pad(i + 1)} — {c.title}"
						title={c.title}
						onclick={() => select(c.slug)}
					>
						{pad(i + 1)}
					</button>
				</li>
			{/each}
		</ol>
	</nav>

	<div class="titling">
		<h2><span class="num">{pad(index)}</span>{concept.title}</h2>
		<p class="standfirst">{concept.standfirst}</p>
	</div>

	<div id="stage" class="stage">
		{#if day}
			{#key concept.slug}
				<Concept {day} {kind} {setKind} {travelSource} {origin} />
			{/key}
		{:else}
			<p class="loading">Reading today’s schedule…</p>
		{/if}
	</div>

	<div class="caption">
		<div class="caption-main">
			<p>{concept.reads}</p>
			<p class="weakness"><span>Weak spot</span> {concept.weakness}</p>
		</div>
		<dl class="meta">
			<dt>After</dt>
			<dd>{concept.lineage}</dd>
			<dt>Touch</dt>
			<dd>
				{#if concept.touches.length === 0}
					Nothing. It is a poster.
				{:else}
					<ol class="touches">
						{#each concept.touches as t (t)}<li>{t}</li>{/each}
					</ol>
				{/if}
			</dd>
			<dt>Showing</dt>
			<dd>
				{SWIM_KIND_LABELS[kind]} swim · {day ? day.upcoming.length : 0} still to come at
				{day ? new Set(day.upcoming.map((s) => s.poolId)).size : 0} pools
			</dd>
		</dl>
	</div>

	<div class="pager">
		<button onclick={() => step(-1)}>← {CONCEPTS[(index + CONCEPTS.length - 2) % CONCEPTS.length].title}</button>
		<button onclick={() => step(1)}>{CONCEPTS[index % CONCEPTS.length].title} →</button>
	</div>

	{#if clock !== 'live' && day}
		<p class="clock-note">
			{#if clock === 'demo'}
				<b>Rehearsal.</b> Every city pool is shut at this hour, so the gallery is set to
				{fmtClock(day.nowMin)} today — otherwise all eleven concepts would draw an empty city.
			{:else}
				<b>Clock set to {fmtClock(day.nowMin)}</b> by the <code>?at=</code> parameter, not the
				real time.
			{/if}
		</p>
	{/if}

	<footer>
		<p class="where">
			{#if geoState === 'granted'}
				Distances from your location, snapped to a ~50 m grid before it leaves this tab.
			{:else if geoState === 'framed'}
				Embedded in another page, so no location prompt — measuring from City Hall.
			{:else if geoState === 'asking'}
				Asking your browser where you are — measuring from City Hall meanwhile.
			{:else}
				Measuring from Nathan Phillips Square.
				<button class="linklike" onclick={askLocation}>Use my location instead</button>
			{/if}
			{#if travelSource === 'estimated'}
				Travel times are straight-line estimates (4.8 km/h walking, 15 km/h cycling, ×4/π for
				the street grid), not routed directions.
			{:else}
				Walking and cycling times routed by Mapbox.
			{/if}
		</p>
		<p>
			Data: <a href="https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/"
				>City of Toronto Open Data</a
			>{#if data.schedule?.programs_last_refreshed}&nbsp;· city last updated
				{data.schedule.programs_last_refreshed.slice(0, 10)}{/if} ·
			<a href="{base}/">back to Swimmm</a>
		</p>
	</footer>
</main>

<style>
	/* The gallery wall is deliberately colourless: every concept below brings
	   its own palette, and a chrome with opinions would fight all eleven. */
	:global(body) {
		margin: 0;
		background: #ffffff;
		color: #16181c;
		font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
		-webkit-text-size-adjust: 100%;
	}
	main {
		max-width: 62rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}
	header {
		border-bottom: 1px solid #16181c;
		padding-bottom: 1rem;
	}
	.eyebrow {
		margin: 0;
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #8b9098;
	}
	h1 {
		margin: 0.2rem 0 0;
		font-size: clamp(1.6rem, 5vw, 2.4rem);
		letter-spacing: -0.02em;
		line-height: 1.05;
	}
	.deck {
		margin: 0.5rem 0 0;
		max-width: 40rem;
		color: #4a5058;
		font-size: 0.95rem;
		line-height: 1.5;
	}
	.deck em {
		color: #16181c;
		font-style: italic;
	}

	/* Discreet nav: eleven numerals and a rule. Whatever is on the wall should
	   be louder than the way you move along it. */
	nav {
		position: sticky;
		top: 0;
		z-index: 5;
		background: #fff;
		border-bottom: 1px solid #e6e8ec;
		margin: 0 -1rem;
		padding: 0 1rem;
	}
	nav ol {
		display: flex;
		gap: 0.1rem;
		list-style: none;
		margin: 0;
		padding: 0.4rem 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	nav ol::-webkit-scrollbar {
		display: none;
	}
	nav button {
		border: 0;
		background: none;
		cursor: pointer;
		font: 600 0.78rem/1 ui-monospace, 'SF Mono', Menlo, monospace;
		letter-spacing: 0.04em;
		color: #a8adb5;
		padding: 0.45rem 0.5rem;
		border-bottom: 2px solid transparent;
	}
	nav button:hover {
		color: #16181c;
	}
	nav button.current {
		color: #16181c;
		border-bottom-color: #16181c;
	}

	.titling {
		padding: 1.4rem 0 0.9rem;
	}
	h2 {
		margin: 0;
		font-size: clamp(1.25rem, 4vw, 1.75rem);
		letter-spacing: -0.015em;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.num {
		font: 400 0.85rem/1 ui-monospace, 'SF Mono', Menlo, monospace;
		color: #a8adb5;
	}
	.standfirst {
		margin: 0.3rem 0 0;
		color: #4a5058;
		font-size: 0.95rem;
	}

	.stage {
		margin: 0 -1rem;
	}
	.loading {
		padding: 5rem 1rem;
		text-align: center;
		color: #8b9098;
	}

	.caption {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: 1fr;
		margin-top: 1.4rem;
		padding-top: 1.1rem;
		border-top: 1px solid #e6e8ec;
		font-size: 0.85rem;
		line-height: 1.55;
	}
	@media (min-width: 46rem) {
		.caption {
			grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
			gap: 2.5rem;
		}
	}
	.caption p {
		margin: 0 0 0.6rem;
		color: #33383f;
	}
	.weakness {
		color: #6b7078;
	}
	.weakness span {
		font-weight: 650;
		color: #16181c;
	}
	.meta {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.9rem;
		align-content: start;
		font-size: 0.8rem;
	}
	.meta dt {
		color: #a8adb5;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.65rem;
		padding-top: 0.25rem;
	}
	.meta dd {
		margin: 0;
		color: #33383f;
	}
	.touches {
		margin: 0;
		padding-left: 1.1rem;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 1.6rem;
	}
	.pager button {
		flex: 1;
		border: 1px solid #e6e8ec;
		background: #fff;
		border-radius: 0.4rem;
		padding: 0.6rem 0.8rem;
		font-size: 0.8rem;
		color: #4a5058;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pager button:first-child {
		text-align: left;
	}
	.pager button:last-child {
		text-align: right;
	}
	.pager button:hover {
		border-color: #16181c;
		color: #16181c;
	}

	.clock-note {
		margin: 1.4rem 0 0;
		padding: 0.55rem 0.75rem;
		border-left: 3px solid #d9a441;
		background: #fdf7ea;
		font-size: 0.78rem;
		color: #5d4a20;
		line-height: 1.5;
	}
	.clock-note code {
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}

	footer {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid #e6e8ec;
		font-size: 0.75rem;
		color: #8b9098;
		line-height: 1.5;
	}
	footer p {
		margin: 0 0 0.35rem;
	}
	footer a {
		color: #4a5058;
	}
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: #16181c;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
