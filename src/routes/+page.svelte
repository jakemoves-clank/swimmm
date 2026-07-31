<script>
	import { onMount } from 'svelte';
	import { torontoNow } from '$lib/time.js';
	import { fetchTravelTimes, isReachable } from '$lib/travel.js';
	import { pickTopResult } from '$lib/topResult.js';
	import { fetchTransitTimes } from '$lib/transit.js';
	import { variantLabel } from '$lib/labels.js';
	import { haversineKm } from '$lib/geo/distance.js';
	import {
		maxTravelMin,
		minSwimMin,
		swimKindParam,
		snapToGrid,
		TOP_RESULT,
		CITY_SWIM_URLS,
		SWIM_KINDS,
		SWIM_KIND_LABELS,
		SWIM_KIND_NOUNS,
		DEFAULT_SWIM_KIND
	} from '$lib/config.js';

	let { data } = $props();

	let now = $state(null); // set client-side; the prerendered shell shows "Loading"
	let coords = $state(null); // { lat, lng } — lives only in this browser tab
	let geoDenied = $state(false);
	let framed = $state(false);
	let selfUrl = $state('');
	let sortBy = $state('soonest');
	let travel = $state(null); // Map<location_id, {walk, bike}> once Mapbox responds
	let limits = $state({ maxTravel: 60, minSwim: 30 });
	let kind = $state(DEFAULT_SWIM_KIND); // 'lane' | 'leisure'

	const mapboxToken = data.mapboxToken;

	// Everything still to come today, both kinds, joined to its pool. The
	// toggle filters this rather than refetching: both kinds are baked into the
	// same payload, so switching tabs costs no round trip.
	const today = $derived.by(() => {
		if (!now) return null;
		const pools = new Map(data.schedule.locations.map((l) => [l.id, l]));
		const sessions = data.schedule.sessions
			.filter((s) => s.date === now.date && s.end_min > now.minutes)
			.map((s) => {
				const pool = pools.get(s.location_id);
				return {
					...s,
					pool: pool?.name ?? 'Unknown pool',
					address: pool?.address ?? '',
					lat: pool?.lat ?? null,
					lng: pool?.lng ?? null
				};
			})
			.sort((a, b) => a.start_min - b.start_min);
		return {
			date: now.date,
			now_min: now.minutes,
			data_from: data.schedule.programs_last_refreshed,
			sessions
		};
	});

	const payload = $derived(
		today ? { ...today, sessions: today.sessions.filter((s) => s.kind === kind) } : null
	);

	const otherKind = $derived(SWIM_KINDS.find((k) => k !== kind));
	const otherKindCount = $derived(
		today ? today.sessions.filter((s) => s.kind === otherKind).length : 0
	);

	// Fetched across *both* kinds' pools, so toggling never waits on Mapbox.
	// One extra Matrix chunk or two at load beats a stall on every switch.
	async function loadTravelTimes() {
		if (!mapboxToken || !coords || !today) return;
		const seen = new Map();
		for (const s of today.sessions) {
			if (hasCoords(s) && !seen.has(s.location_id))
				seen.set(s.location_id, { id: s.location_id, lat: s.lat, lng: s.lng });
		}
		try {
			travel = await fetchTravelTimes(coords, [...seen.values()], mapboxToken);
		} catch (e) {
			console.warn('travel times unavailable:', e.message);
			travel = null; // fall back to straight-line distances, no filtering
		}
	}

	function selectKind(k) {
		kind = k;
		// Keep the tab in the URL so a reload or a shared link lands on it.
		const url = new URL(location.href);
		if (k === DEFAULT_SWIM_KIND) url.searchParams.delete('kind');
		else url.searchParams.set('kind', k);
		history.replaceState(history.state, '', url);
	}

	onMount(() => {
		const params = new URLSearchParams(location.search);
		limits = { maxTravel: maxTravelMin(params), minSwim: minSwimMin(params) };
		kind = swimKindParam(params);
		now = torontoNow();

		// GitHub Pages can't send X-Frame-Options, and CSP frame-ancestors is
		// header-only (a meta tag can't carry it), so a hostile page could frame
		// this one and dress up the location prompt. Try to break out; if the
		// browser blocks that, still refuse to ask for location.
		if (window.self !== window.top) {
			framed = true;
			selfUrl = window.self.location.href;
			try {
				window.top.location = window.self.location.href;
			} catch {
				// cross-origin parent blocked the navigation — stay put, no prompt
			}
			return;
		}

		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					// Snapped to a ~50 m grid before anything (Mapbox, Transitous)
					// sees it — precise position stays on the device.
					coords = snapToGrid({ lat: pos.coords.latitude, lng: pos.coords.longitude });
					sortBy = 'closest';
					loadTravelTimes();
				},
				() => {
					geoDenied = true;
				},
				{ maximumAge: 300_000, timeout: 15_000 }
			);
		} else {
			geoDenied = true;
		}
	});

	function fmtTime(min) {
		let h = Math.floor(min / 60);
		const m = min % 60;
		const ampm = h >= 12 ? 'p.m.' : 'a.m.';
		h = h % 12 || 12;
		return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	function fmtKm(km) {
		return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
	}

	// Both halves must be present: a half-located pool would build a malformed
	// routing URL and poison the distance sort with NaN.
	function hasCoords(s) {
		return Number.isFinite(s.lat) && Number.isFinite(s.lng);
	}

	function fastestMin(t) {
		const modes = [t?.walk, t?.bike].filter((m) => m != null);
		return modes.length ? Math.min(...modes) : null;
	}

	// "bike 8 min · walk 20 min", omitting modes we have no time for.
	function travelLabel(t) {
		return [
			t?.bike != null ? `bike ${t.bike} min` : null,
			t?.walk != null ? `walk ${t.walk} min` : null
		]
			.filter(Boolean)
			.join(' · ');
	}

	const annotated = $derived.by(() => {
		if (!payload) return [];
		return payload.sessions.map((s) => {
			const t = travel?.get(s.location_id);
			return {
				...s,
				km: coords && hasCoords(s) ? haversineKm(coords, { lat: s.lat, lng: s.lng }) : null,
				travel: t,
				travelLabel: travelLabel(t),
				variant: variantLabel(s),
				inProgress: s.start_min <= payload.now_min
			};
		});
	});

	const hiddenCount = $derived(
		travel ? annotated.filter((s) => !isReachable(s, s.travel, payload.now_min, limits)).length : 0
	);

	const sessions = $derived.by(() => {
		const shown = travel
			? annotated.filter((s) => isReachable(s, s.travel, payload.now_min, limits))
			: annotated;
		const near = (s) => fastestMin(s.travel) ?? s.km ?? 1e9;
		const byTime = (a, b) => a.start_min - b.start_min || near(a) - near(b);
		const byDist = (a, b) => near(a) - near(b) || a.start_min - b.start_min;
		return [...shown].sort(sortBy === 'closest' && coords ? byDist : byTime);
	});

	// Top pick (and its dry-pool fallback) only exist once travel times are in —
	// without them we can't honestly claim anything is "within a 15-min walk".
	let transitTimes = $state(null); // Map<location_id, {minutes, connections}>
	// Per kind: each tab has its own candidate pools, so a lookup done for lane
	// doesn't mean leisure has been tried. Times themselves are kind-agnostic
	// (a pool is the same distance whatever swim is in it), so results merge
	// into one map rather than replacing it.
	const transitTriedFor = new Set();

	const pickOpts = $derived({
		nowMin: payload?.now_min,
		minSwim: limits.minSwim,
		config: TOP_RESULT,
		getTransit: (id) => transitTimes?.get(id) ?? null
	});

	const topPick = $derived(travel && payload ? pickTopResult(sessions, pickOpts) : null);

	// Transit is the last tier and costs one Transitous request per pool, so
	// only look it up when walking and biking both fail to produce a pick.
	$effect(() => {
		if (!travel || !payload || !coords || transitTriedFor.has(kind)) return;
		if (pickTopResult(sessions, { ...pickOpts, getTransit: () => null })) return;
		transitTriedFor.add(kind);
		const candidates = new Map();
		for (const s of sessions) {
			if (
				hasCoords(s) &&
				s.start_min - payload.now_min <= TOP_RESULT.WINDOW_MIN &&
				!candidates.has(s.location_id)
			) {
				candidates.set(s.location_id, { id: s.location_id, lat: s.lat, lng: s.lng });
			}
		}
		if (!candidates.size) return;
		fetchTransitTimes(coords, [...candidates.values()], {
			maxConnections: TOP_RESULT.TRANSIT_MAX_CONNECTIONS
		}).then(
			(map) => (transitTimes = new Map([...(transitTimes ?? []), ...map])),
			(e) => console.warn('transit times unavailable:', e.message)
		);
	});

	// Shown when no tier yields a top pick. Decorative only — the caption
	// beneath it carries the meaning for screen readers.
	const DRY_POOL = String.raw`
 .-----------------------------.
 | |                           |
 | |                           |
 | |      no water here        |
 | |___________________________|
  \___________________________/`;
</script>

<svelte:head>
	<title>Swimmm — {SWIM_KIND_NOUNS[kind]} today in Toronto</title>
</svelte:head>

<main>
	<header>
		<h1>Swimmm</h1>
		<p class="tagline">Adult {SWIM_KIND_NOUNS[kind]} at City of Toronto pools — today</p>
	</header>

	<div class="kinds" role="group" aria-label="Swim type">
		{#each SWIM_KINDS as k (k)}
			<button class:active={kind === k} aria-pressed={kind === k} onclick={() => selectKind(k)}>
				{SWIM_KIND_LABELS[k]}
			</button>
		{/each}
	</div>

	{#if !payload}
		<p class="status">Loading today's swims…</p>
	{:else if sessions.length === 0}
		<p class="status">
			No more adult {SWIM_KIND_NOUNS[kind]}s today.
			{#if otherKindCount > 0}
				There {otherKindCount === 1 ? 'is' : 'are'}
				{otherKindCount}
				{SWIM_KIND_NOUNS[otherKind]}{otherKindCount === 1 ? '' : 's'} left —
				<button class="linklike" onclick={() => selectKind(otherKind)}>
					switch to {SWIM_KIND_LABELS[otherKind]}
				</button>.
			{:else}
				Check back tomorrow morning, or see the
				<a href={CITY_SWIM_URLS[kind]}>city's {SWIM_KIND_NOUNS[kind]} schedules</a>.
			{/if}
		</p>
	{:else}
		{#if topPick}
			<section class="top-pick" aria-label="Top pick">
				<span class="top-label">Top pick</span>
				<div class="row">
					<span class="pool">{topPick.session.pool}</span>
					<span class="km">{topPick.mode} {topPick.minutes} min</span>
				</div>
				<div class="row">
					<span class="time">
						{fmtTime(topPick.session.start_min)}–{fmtTime(topPick.session.end_min)}
						{#if topPick.session.inProgress}<em class="now">in the water now</em>{/if}
					</span>
				</div>
				<div class="row meta"><span class="address">{topPick.session.address}</span></div>
			</section>
		{:else if travel}
			<section class="dry-pool-box" aria-label="No easy swim right now">
				<pre class="dry-pool" aria-hidden="true">{DRY_POOL}</pre>
				<p class="dry-pool-caption">
					No swim within an easy trip right now — nothing inside a {TOP_RESULT.WALK_MAX_MIN} min
					walk, {TOP_RESULT.BIKE_MAX_MIN} min ride, or {TOP_RESULT.TRANSIT_MAX_MIN} min transit
					trip starting in the next {TOP_RESULT.WINDOW_MIN / 60} hours.
				</p>
			</section>
		{/if}
		<div class="controls">
			<span class="count">{sessions.length} {sessions.length === 1 ? 'swim' : 'swims'} left today</span>
			<div class="sort" role="group" aria-label="Sort by">
				<button class:active={sortBy === 'soonest'} onclick={() => (sortBy = 'soonest')}>
					Soonest
				</button>
				<button
					class:active={sortBy === 'closest'}
					disabled={!coords}
					onclick={() => (sortBy = 'closest')}
				>
					Closest
				</button>
			</div>
		</div>
		{#if framed}
			<p class="geo-note">
				Swimmm is embedded in another page, so it won't ask for your location.
				<a href={selfUrl} target="_top" rel="noopener">Open Swimmm directly</a> to see travel times.
			</p>
		{:else if geoDenied}
			<p class="geo-note">
				Location unavailable — showing swims by start time. Your location is only ever used in your
				browser; it is never sent to or stored on our server.
			</p>
		{/if}
		{#if hiddenCount > 0}
			<p class="geo-note">
				{hiddenCount} {hiddenCount === 1 ? 'swim' : 'swims'} hidden — farther than {limits.maxTravel}
				min by bike or on foot, or too late for a {limits.minSwim}-min swim.
			</p>
		{/if}
		<ul class="sessions">
			{#each sessions as s (s.course_id + '-' + s.location_id + '-' + s.start_min)}
				<li class="card" class:in-progress={s.inProgress}>
					<div class="row">
						<span class="pool">{s.pool}</span>
						{#if s.travelLabel}
							<span class="km">{s.travelLabel}</span>
						{:else if s.km != null}
							<span class="km">{fmtKm(s.km)}</span>
						{/if}
					</div>
					<div class="row">
						<span class="time">
							{fmtTime(s.start_min)}–{fmtTime(s.end_min)}
							{#if s.inProgress}<em class="now">in the water now</em>{/if}
						</span>
					</div>
					<div class="row meta">
						<span class="address">{s.address}</span>
						{#if s.variant}<span class="variant">{s.variant}</span>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<footer>
		<p>
			Data: <a href="https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/"
				>City of Toronto Open Data</a
			>{#if payload?.data_from}&nbsp;· city last updated {payload.data_from.slice(0, 10)}{/if}
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
	.status a {
		color: #0b66e4;
	}
	/* A button that reads as a link: the empty state's "switch to Leisure"
	   changes a tab rather than navigating, so it must not be an anchor. */
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: #0b66e4;
		text-decoration: underline;
		cursor: pointer;
	}
	/* The primary mode switch, so it sits full-width above everything and is
	   deliberately heavier than the Soonest/Closest control below it. */
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
	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 0.75rem 0;
		gap: 0.5rem;
	}
	.count {
		font-size: 0.85rem;
		color: #555;
	}
	.sort {
		display: flex;
		border: 1px solid #ccc;
		border-radius: 999px;
		overflow: hidden;
		background: #fff;
	}
	.sort button {
		border: 0;
		background: transparent;
		padding: 0.45rem 0.9rem;
		font-size: 0.85rem;
		color: #444;
		cursor: pointer;
	}
	.sort button.active {
		background: #0b66e4;
		color: #fff;
	}
	.sort button:disabled {
		color: #aaa;
		cursor: not-allowed;
	}
	.geo-note {
		font-size: 0.8rem;
		color: #777;
		margin: 0 0 0.75rem;
	}
	.sessions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.card {
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 0.6rem;
		padding: 0.7rem 0.85rem;
	}
	.card.in-progress {
		border-left: 4px solid #0b66e4;
	}
	.top-pick {
		background: #fff;
		border: 2px solid #0b66e4;
		border-radius: 0.6rem;
		padding: 0.7rem 0.85rem;
		margin: 0.75rem 0;
	}
	.top-label {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #0b66e4;
		margin-bottom: 0.25rem;
	}
	.dry-pool-box {
		text-align: center;
		margin: 0.75rem 0;
		padding: 0.5rem 0;
	}
	.dry-pool {
		display: inline-block;
		text-align: left;
		font-size: 0.7rem;
		line-height: 1.25;
		color: #777;
		margin: 0;
		overflow-x: auto;
		max-width: 100%;
	}
	.dry-pool-caption {
		font-size: 0.8rem;
		color: #777;
		margin: 0.5rem auto 0;
		max-width: 22rem;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.pool {
		font-weight: 600;
	}
	.km {
		color: #0b66e4;
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.time {
		font-size: 0.95rem;
		color: #333;
	}
	.now {
		font-style: normal;
		color: #0b66e4;
		font-size: 0.8rem;
		margin-left: 0.4rem;
	}
	.meta {
		margin-top: 0.15rem;
	}
	.address {
		font-size: 0.8rem;
		color: #777;
	}
	.variant {
		font-size: 0.75rem;
		color: #555;
		background: #eee;
		border-radius: 0.3rem;
		padding: 0.1rem 0.4rem;
		white-space: nowrap;
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
