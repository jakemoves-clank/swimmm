<script>
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { fetchTravelTimes, isReachable } from '$lib/travel.js';
	import { maxTravelMin, minSwimMin } from '$lib/config.js';

	let loading = $state(true);
	let error = $state(null);
	let payload = $state(null);
	let coords = $state(null); // { lat, lng } — lives only in this browser tab
	let geoDenied = $state(false);
	let sortBy = $state('soonest');
	let travel = $state(null); // Map<location_id, {walk, bike}> once Mapbox responds
	let limits = $state({ maxTravel: 60, minSwim: 30 });

	const mapboxToken = env.PUBLIC_MAPBOX_TOKEN;

	async function loadTravelTimes() {
		if (!mapboxToken || !coords || !payload) return;
		const seen = new Map();
		for (const s of payload.sessions) {
			if (s.lat != null && !seen.has(s.location_id))
				seen.set(s.location_id, { id: s.location_id, lat: s.lat, lng: s.lng });
		}
		try {
			travel = await fetchTravelTimes(coords, [...seen.values()], mapboxToken);
		} catch (e) {
			console.warn('travel times unavailable:', e.message);
			travel = null; // fall back to straight-line distances, no filtering
		}
	}

	onMount(async () => {
		const params = new URLSearchParams(location.search);
		limits = { maxTravel: maxTravelMin(params), minSwim: minSwimMin(params) };
		try {
			const res = await fetch('/api/today');
			if (!res.ok) throw new Error(`API error ${res.status}`);
			payload = await res.json();
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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

	function haversineKm(a, b) {
		const R = 6371;
		const toRad = (d) => (d * Math.PI) / 180;
		const dLat = toRad(b.lat - a.lat);
		const dLng = toRad(b.lng - a.lng);
		const h =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
		return 2 * R * Math.asin(Math.sqrt(h));
	}

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
				km: coords && s.lat != null ? haversineKm(coords, { lat: s.lat, lng: s.lng }) : null,
				travel: t,
				travelLabel: travelLabel(t),
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
</script>

<svelte:head>
	<title>Swimmm — lane swim today in Toronto</title>
</svelte:head>

<main>
	<header>
		<h1>Swimmm</h1>
		<p class="tagline">Adult lane swim at City of Toronto pools — today</p>
	</header>

	{#if loading}
		<p class="status">Loading today's swims…</p>
	{:else if error}
		<p class="status">Couldn't load swim times ({error}). Try again in a minute.</p>
	{:else if sessions.length === 0}
		<p class="status">No more adult lane swims today. Check back tomorrow morning.</p>
	{:else}
		<div class="controls">
			<span class="count">{sessions.length} swims left today</span>
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
		{#if geoDenied}
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
						{#if s.title !== 'Lane Swim'}<span class="variant">{s.title.replace('Lane Swim: ', '')}</span>{/if}
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
