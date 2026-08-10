<script>
	// v3 — the concierge.
	//
	// v1 answered "which pools have a swim today?" with a directory. v3
	// answers "when could I go for a swim today?" with a handful of
	// appointments. The difference is entirely in src/lib/dip.js and
	// src/lib/appeal.js; this file is presentation and plumbing.
	//
	// Rendered by both `/` and `/v3`, from one component, so the alias can
	// never drift from the root. (`/v1` is the opposite: a frozen copy.)
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { torontoNow } from '$lib/time.js';
	import { fetchTravelTimesFor } from '$lib/travel.js';
	import { fetchTransitTimes } from '$lib/transit.js';
	import { planDay } from '$lib/dip.js';
	import { MODES, modeRule } from '$lib/appeal.js';
	import { dayLabel } from '$lib/labels.js';
	import DayPlanner from './DayPlanner.svelte';
	import {
		dipDurationMin,
		swimKindParam,
		snapToGrid,
		CITY_SWIM_URLS,
		DIP_SELECTION,
		SWIM_KINDS,
		SWIM_KIND_LABELS,
		SWIM_KIND_NOUNS,
		DEFAULT_SWIM_KIND,
		DEFAULT_DIP_DURATION_MIN
	} from '$lib/config.js';

	let { data } = $props();

	// Somewhere has to be the middle of the map when the browser won't say.
	// Every dip is an offer measured from a point, so an origin-less v3 has
	// nothing to say at all — the banner is explicit that this isn't you.
	const CITY_HALL = { lat: 43.6535, lng: -79.3839 };

	let now = $state(null);
	let coords = $state(null); // { lat, lng } — lives only in this browser tab
	let geoDenied = $state(false);
	let framed = $state(false);
	let selfUrl = $state('');
	let kind = $state(DEFAULT_SWIM_KIND);
	let preferredMin = $state(DEFAULT_DIP_DURATION_MIN);
	let travel = $state(null); // Map<location_id, { walk, bike, drive }>
	let transitTimes = $state(null); // Map<location_id, { minutes, connections }>
	let travelFailed = $state(false);

	const origin = $derived(coords ?? CITY_HALL);

	// Mapbox modes are fetched up front; transit is one request per pool
	// against a free community service, so it's only ever asked for the pools
	// that need it (see the effect below) and merged in here.
	const travelWithTransit = $derived.by(() => {
		if (!travel) return null;
		if (!transitTimes?.size) return travel;
		const merged = new Map(travel);
		for (const [id, t] of transitTimes) merged.set(id, { ...(merged.get(id) ?? {}), transit: t });
		return merged;
	});

	// The day worth showing, which is usually today but is tomorrow at 11 p.m.
	// and Tuesday on a holiday Monday — see planDay.
	// Routing is preferred but no longer required: once we know where you are
	// we can always fall back to straight-line distances, which appeal.js
	// scores below every routed trip and the planner draws without a
	// departure time. `routingDone` is what we wait for — either times
	// arrived or the attempt failed — so the page doesn't flash a degraded
	// offer while Mapbox is still answering.
	const routingDone = $derived(travel != null || travelFailed);
	const plan = $derived(
		now && origin && routingDone
			? planDay(data.schedule, {
					now,
					travel: travelWithTransit,
					origin,
					kind,
					preferredMin
				})
			: null
	);
	// True when the offer on screen is distances rather than routed trips.
	const degraded = $derived(!!plan?.dips.length && plan.dips.every((d) => !d.routed));
	const offer = $derived(plan?.dips ?? null);
	const whichDay = $derived(plan && now ? dayLabel(plan.date, now.date) : '');

	// Sessions we had to leave out because the city never gave their pool a
	// coordinate. Reported rather than silently dropped: v1's promise was
	// never to hide a swim it couldn't assess, and v3 keeps the spirit of it
	// even though it can't offer them as dips.
	const unplacedCount = $derived.by(() => {
		if (!plan) return 0;
		const unplaced = new Set(
			(data.schedule.locations ?? [])
				.filter((l) => !Number.isFinite(l.lat) || !Number.isFinite(l.lng))
				.map((l) => l.id)
		);
		return (data.schedule.sessions ?? []).filter(
			(s) =>
				s.date === plan.date &&
				s.kind === kind &&
				s.end_min > plan.nowMin &&
				unplaced.has(s.location_id)
		).length;
	});

	const otherKind = $derived(SWIM_KINDS.find((k) => k !== kind));

	function poolsWithCoords() {
		const seen = new Map();
		for (const l of data.schedule.locations ?? []) {
			if (Number.isFinite(l.lat) && Number.isFinite(l.lng) && !seen.has(l.id)) {
				seen.set(l.id, { id: l.id, lat: l.lat, lng: l.lng });
			}
		}
		return [...seen.values()];
	}

	// Both kinds' pools at once, so the toggle never waits on a round trip.
	async function loadTravelTimes() {
		if (!data.mapboxToken) return (travelFailed = true);
		try {
			travel = await fetchTravelTimesFor(origin, poolsWithCoords(), data.mapboxToken, {
				// Every mode the appeal algorithm knows about except transit,
				// which has its own provider — so adding a mode to APPEAL.MODES
				// is all it takes to have it fetched here too.
				modes: MODES.filter((m) => m !== 'transit')
			});
		} catch (e) {
			console.warn('travel times unavailable:', e.message);
			travelFailed = true;
		}
	}

	// Transit is the one provider we pay per pool for, so it's a last resort:
	// only when Mapbox's modes haven't already filled the handful, and only
	// for pools those modes couldn't reach. v3 never estimates a travel time
	// — an offer built on a guess isn't an offer.
	const transitTriedFor = new Set();

	$effect(() => {
		if (!travel || !plan || transitTriedFor.has(kind)) return;
		if (plan.dips.length >= DIP_SELECTION.COUNT) return;
		transitTriedFor.add(kind);

		// Candidates come from the day the planner settled on, not from today:
		// on a holiday Monday the pools worth a transit lookup are Tuesday's.
		const offered = new Set(plan.dips.map((d) => d.location.id));
		const live = new Set(
			(data.schedule.sessions ?? [])
				.filter((s) => s.date === plan.date && s.kind === kind && s.end_min > plan.nowMin)
				.map((s) => s.location_id)
		);
		const candidates = poolsWithCoords().filter((p) => live.has(p.id) && !offered.has(p.id));
		if (!candidates.length) return;

		fetchTransitTimes(coords ?? CITY_HALL, candidates, {
			maxConnections: modeRule('transit').MAX_CONNECTIONS
		}).then(
			(map) => (transitTimes = new Map([...(transitTimes ?? []), ...map])),
			(e) => console.warn('transit times unavailable:', e.message)
		);
	});

	function selectKind(k) {
		kind = k;
		syncUrl();
	}

	function syncUrl() {
		const url = new URL(location.href);
		if (kind === DEFAULT_SWIM_KIND) url.searchParams.delete('kind');
		else url.searchParams.set('kind', kind);
		history.replaceState(history.state, '', url);
	}

	onMount(() => {
		const params = new URLSearchParams(location.search);
		kind = swimKindParam(params);
		preferredMin = dipDurationMin(params);
		now = torontoNow();

		// GitHub Pages can't send X-Frame-Options, and CSP frame-ancestors is
		// header-only, so a hostile page could frame this one and dress up the
		// location prompt. Try to break out; if the browser blocks that, still
		// refuse to ask for location.
		if (window.self !== window.top) {
			framed = true;
			selfUrl = window.self.location.href;
			try {
				window.top.location = window.self.location.href;
			} catch {
				// cross-origin parent blocked the navigation — stay put, no prompt
			}
			loadTravelTimes();
			return;
		}

		if (!navigator.geolocation) {
			geoDenied = true;
			return loadTravelTimes();
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				// Snapped to a ~50 m grid before any routing provider sees it.
				coords = snapToGrid({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				loadTravelTimes();
			},
			() => {
				geoDenied = true;
				loadTravelTimes();
			},
			{ maximumAge: 300_000, timeout: 15_000 }
		);
	});

	function fmtTime(min) {
		let h = Math.floor(min / 60);
		const m = ((min % 60) + 60) % 60;
		const ampm = h >= 12 && h < 24 ? 'p.m.' : 'a.m.';
		h = ((h % 12) + 12) % 12 || 12;
		return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
	}

</script>

<svelte:head>
	<title>Swimmm — a dip in Toronto</title>
</svelte:head>

<main>
	<header>
		<h1>Swimmm</h1>
		<p class="tagline">
			A few dips you could take — adult {SWIM_KIND_NOUNS[kind]} at City of Toronto pools
		</p>
	</header>

	<div class="kinds" role="group" aria-label="Swim type">
		{#each SWIM_KINDS as k (k)}
			<button class:active={kind === k} aria-pressed={kind === k} onclick={() => selectKind(k)}>
				{SWIM_KIND_LABELS[k]}
			</button>
		{/each}
	</div>

	{#if framed}
		<p class="note">
			Swimmm is embedded in another page, so it won't ask for your location.
			<a href={selfUrl} target="_top" rel="noopener">Open Swimmm directly</a> for dips near you.
		</p>
	{:else if geoDenied}
		<p class="note">
			Without your location there's nothing to measure from, so these dips are from Nathan Phillips
			Square. Your location is only ever used in your browser.
		</p>
	{/if}

	{#if !offer}
		<p class="status">Finding you a dip…</p>
	{:else if offer.length === 0}
		<p class="status">
			No {SWIM_KIND_NOUNS[kind]} within easy reach in the next week — nothing inside a
			{modeRule('walk').MAX_MIN} min walk, {modeRule('bike').MAX_MIN} min ride, or
			{modeRule('drive').MAX_MIN} min drive with time for a dip.
			<button class="linklike" onclick={() => selectKind(otherKind)}>
				Try {SWIM_KIND_LABELS[otherKind]}
			</button>, or see the
			<a href={CITY_SWIM_URLS[kind]}>city's {SWIM_KIND_NOUNS[kind]} schedules</a>.
		</p>
	{:else}
		<p class="count">
			{offer.length}
			{offer.length === 1 ? 'dip' : 'dips'}
			<!-- Named, because it isn't always today: at eleven at night, or on a
			     holiday Monday with every pool shut, the planner has moved on to
			     the next day that has water in it. -->
			{plan.isToday ? 'for the rest of today' : whichDay}
		</p>
		{#if degraded}
			<p class="note">
				We couldn't work out journey times just now, so these are straight-line distances — how
				long they take is your call.
			</p>
		{/if}
		{#if !plan.isToday}
			<p class="note">
				Nothing left {plan.daysAhead === 1 ? 'today' : 'between now and then'}, so this is
				{whichDay}.
			</p>
		{/if}
		<DayPlanner dips={offer} nowMin={plan.isToday ? plan.nowMin : null} {fmtTime} />
		{#if unplacedCount > 0}
			<p class="note">
				{unplacedCount}
				{unplacedCount === 1 ? 'swim is' : 'swims are'} at a pool the city hasn't given a location, so
				we can't work out a trip to {unplacedCount === 1 ? 'it' : 'them'}.
			</p>
		{/if}
	{/if}

	<footer>
		<p>
			Data: <a href="https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/"
				>City of Toronto Open Data</a
			>{#if data.schedule?.programs_last_refreshed}&nbsp;· city last updated
				{data.schedule.programs_last_refreshed.slice(0, 10)}{/if}
		</p>
		<p>
			<a href="{base}/v1">v1</a> · <a href="{base}/v2">v2 — design studies</a>
		</p>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f4f4f4;
		color: #1a1a1a;
		font-family: system-ui, -apple-system, sans-serif;
	}
	main {
		max-width: 30rem;
		margin: 0 auto;
		padding: 1rem 1rem 2rem;
	}
	header {
		margin-bottom: 0.75rem;
	}
	h1 {
		font-size: 1.6rem;
		margin: 0;
		letter-spacing: 0.02em;
	}
	.tagline {
		margin: 0.15rem 0 0;
		color: #555;
		font-size: 0.9rem;
	}
	.status {
		color: #555;
		padding: 2rem 0;
		text-align: center;
	}
	.status a,
	.note a {
		color: #0b66e4;
	}
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: #0b66e4;
		text-decoration: underline;
		cursor: pointer;
	}
	.kinds {
		display: flex;
		gap: 0.25rem;
		margin: 0.85rem 0 0.25rem;
		padding: 0.2rem;
		background: #e7e7e7;
		border-radius: 999px;
	}
	.kinds button {
		flex: 1;
		border: 0;
		border-radius: 999px;
		background: transparent;
		padding: 0.5rem 0.9rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: #555;
		cursor: pointer;
	}
	.kinds button.active {
		background: #fff;
		color: #0b66e4;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.16);
	}
	.count {
		font-size: 0.85rem;
		color: #555;
		margin: 0.75rem 0;
	}
	.note {
		font-size: 0.8rem;
		color: #777;
		margin: 0.5rem 0 0.75rem;
	}
	footer {
		margin-top: 1.5rem;
		font-size: 0.75rem;
		color: #888;
		text-align: center;
	}
	footer a {
		color: #0b66e4;
	}
</style>
