<script>
	// The concierge — the live site.
	//
	// The version sealed at /v1 answered "which pools have a swim today?"
	// with a directory. This answers "when could I go for a swim?" with a
	// handful of appointments. The difference is entirely in src/lib/dip.js
	// and src/lib/appeal.js; this file is presentation and plumbing.
	import { onMount } from 'svelte';
	import { torontoNow } from '$lib/time.js';
	import { fetchTravelTimesFor } from '$lib/travel.js';
	import { fetchTransitTimes } from '$lib/transit.js';
	import { planDay } from '$lib/dip.js';
	import { MODES, modeRule } from '$lib/appeal.js';
	import { dayLabel, freshnessLabel } from '$lib/labels.js';
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

	let now = $state(null);
	let coords = $state(null); // { lat, lng } — lives only in this browser tab
	let liveStatus = $state('off'); // 'off' | 'idle' | 'asking' | 'denied'
	let placed = $state(null); // { lat, lng } the reader tapped on the map
	let framed = $state(false);
	let selfUrl = $state('');
	let kind = $state(DEFAULT_SWIM_KIND);
	let preferredMin = $state(DEFAULT_DIP_DURATION_MIN);
	let travel = $state(null); // Map<location_id, { walk, bike, drive }>
	let transitTimes = $state(null); // Map<location_id, { minutes, connections }>
	let travelFailed = $state(false);

	// Where we measure from — and there is no default. v3 never measures from
	// a landmark and calls the result yours: a precisely routed trip from a
	// place you are not standing is a worse lie than an approximate one from
	// where you actually are. Either the browser tells us, or the reader
	// does, or we have nothing to offer and say so.
	const origin = $derived(coords ?? placed);
	// The map is the first thing on the page, not the fallback it used to be.
	// v3 used to fire the browser's location prompt on load and show the map
	// only to readers who refused: an interruption before the page had said
	// anything, asked of someone with no way yet to judge whether it was
	// worth answering — and a prompt refused once is refused for good. Now
	// nothing is asked until the reader asks for it, and the map answers the
	// same question without asking anyone anything.
	const needsPlace = $derived(!origin);

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

	// Which face of transit each pool's trip turned out to be — bus, subway or
	// streetcar. It never reaches the dip, because it changes nothing about
	// the offer: appeal.js weighs every transit trip the same way, and if this
	// were a term on the dip it would be one nothing scores. It exists so the
	// planner's trip line can carry the right icon, so the planner is where it
	// is looked up.
	const transitVia = $derived.by(() => {
		const out = new Map();
		for (const [id, t] of transitTimes ?? []) if (t.via) out.set(id, t.via);
		return out;
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

		fetchTransitTimes(origin, candidates, {
			maxConnections: modeRule('transit').MAX_CONNECTIONS
		}).then(
			(map) => (transitTimes = new Map([...(transitTimes ?? []), ...map])),
			(e) => console.warn('transit times unavailable:', e.message)
		);
	});

	// The reader has told us where they are. Snapped like any other origin
	// before it reaches a routing provider.
	function setPlace(point) {
		placed = snapToGrid(point);
		loadTravelTimes();
	}

	// Back to the map, whichever way we got here: a reader who let the browser
	// answer should be able to change their mind as easily as one who tapped,
	// so this clears the browser's fix too rather than leaving it to win.
	function rePlace() {
		coords = null;
		geoDenied = false;
		placed = null;
		travel = null;
		travelFailed = false;
	}

	// The one place a location prompt can come from: a press. Nothing else in
	// v3 calls getCurrentPosition.
	function useLiveLocation() {
		if (liveStatus !== 'idle') return;
		liveStatus = 'asking';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				// Snapped to a ~50 m grid before any routing provider sees it.
				coords = snapToGrid({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				liveStatus = 'idle';
				loadTravelTimes();
			},
			() => {
				// Refused, or no fix. Either way the browser will not be asked
				// twice — a denial sticks to the origin, so a second press
				// would raise nothing at all — and the map is still there.
				liveStatus = 'denied';
			},
			{ maximumAge: 300_000, timeout: 15_000 }
		);
	}

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
		// refuse to offer the prompt at all — the map asks the same question
		// and raises nothing a parent page could take credit for.
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

		// The button only appears where pressing it could do something.
		if (navigator.geolocation) liveStatus = 'idle';
	});

</script>

<svelte:head>
	<title>Swimmm — a dip in Toronto</title>
</svelte:head>

<main>
	<header>
		<h1>Swimmm</h1>
		<div class="controls">
			<div class="kinds" role="group" aria-label="Swim type">
				{#each SWIM_KINDS as k (k)}
					<button class:active={kind === k} aria-pressed={kind === k} onclick={() => selectKind(k)}>
						{SWIM_KIND_LABELS[k]}
					</button>
				{/each}
			</div>
			<!-- Where we are measuring from, for the reader who told us. It used
			     to be a sentence and a "Move it" link under the header, which
			     spent two lines of the one screen restating a thing the reader
			     had just done. A pin says the same and asks nothing until it is
			     wanted — but only ever as well as a name a screen reader can
			     read, because an icon alone is a button labelled with a guess. -->
			{#if origin}
				<button
					class="pin"
					onclick={rePlace}
					title="Change where you're measuring from"
					aria-label="Change where you're measuring from"
				>
					<svg
						viewBox="0 0 24 24"
						width="15"
						height="15"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
						<circle cx="12" cy="10" r="2.5" />
					</svg>
				</button>
			{/if}
		</div>
	</header>

	{#if framed}
		<p class="note">
			Swimmm is embedded in another page, so it won't ask your browser for your location — you can
			place yourself below instead, or
			<a href={selfUrl} target="_top" rel="noopener">open Swimmm directly</a>.
		</p>
	{/if}

	{#if needsPlace}
		<!-- Loaded only when it's needed. The map carries the city's water,
		     through-routes and subway lines — geography most readers never see,
		     because most readers let the browser answer. -->
		{#await import('./PlaceMap.svelte') then { default: PlaceMap }}
			<PlaceMap onplace={setPlace} onlive={useLiveLocation} {liveStatus} />
		{/await}
	{:else if !offer}
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
		<DayPlanner dips={offer} nowMin={plan.isToday ? plan.nowMin : null} {transitVia} />
		{#if unplacedCount > 0}
			<p class="note">
				{unplacedCount}
				{unplacedCount === 1 ? 'swim is' : 'swims are'} at a pool the city hasn't given a location, so
				we can't work out a trip to {unplacedCount === 1 ? 'it' : 'them'}.
			</p>
		{/if}
	{/if}

	<footer>
		<!-- The city's own publication date, not ours — a stale build should
		     read as stale, not as freshly deployed. -->
		{#if data.schedule?.programs_last_refreshed}
			<p>pool schedules updated {freshnessLabel(data.schedule.programs_last_refreshed)}</p>
		{/if}
	</footer>
</main>

<style>
	/* Grayscale with a single accent, spent only on "now" — as the README has
	   always said the site should be, and as v3 had drifted away from.
	   Colour used to do two unrelated jobs with one hex: #0b66e4 marked both
	   the live "now" line and every link and button, so a reader had no way
	   to tell "this is happening" from "this is pressable" except context.
	   --accent and --interactive are that split made permanent — one value
	   per job, referenced everywhere instead of repeated, so the two can
	   never drift back into meaning the same thing by accident. The greys
	   are named for the same reason: a "medium grey" typed fresh at each
	   call site tends to become a dozen almost-identical greys over time. */
	:global(:root) {
		/* The page itself, named because things other than the page have to
		   paint it: the mode icon on a trip line sits on the ground rather
		   than beside the line, and has to know what the ground is. */
		--paper: #fff;
		--ink: #1a1d21;
		--ink-dim: #33383d;
		--gray-600: #5f666d;
		--gray-500: #7c838a;
		--gray-400: #8a9097;
		--gray-300: #9aa0a6;
		--rule: #ececee;
		--dip-bg: #eef1f4;
		--dip-bg-progress: #e6ebf1;
		--dip-bg-unrouted: #e7eaee;
		--trip-rule: #b9c0c7;
		/* Data emphasis only — currently just the "now" line/label. Dark
		   enough on white to clear WCAG AA (4.5:1) as small bold text: this
		   is ~5.2:1. */
		--accent: #c2410c;
		/* Links, buttons, anything pressable — and only those. */
		--interactive: #0b66e4;
	}
	:global(html),
	:global(body) {
		height: 100%;
	}
	/* Mobile Safari's pull-to-refresh rubber-bands the page, and the planner
	   sizes itself from the viewport — so the gesture was rescaling the whole
	   day mid-pull. Containing the overscroll keeps the gesture from starting;
	   the measurement is also clamped against a negative scroll offset, so a
	   bounce that gets through can't move anything either. */
	:global(html) {
		overscroll-behavior-y: contain;
	}
	:global(body) {
		overscroll-behavior-y: contain;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		font-family: system-ui, -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	/* One screen: the header and notes take what they need, the planner takes
	   the rest. Nothing below the fold, because the shape of the day is the
	   thing being read and you cannot see a shape a screenful at a time. */
	main {
		box-sizing: border-box;
		max-width: 30rem;
		min-height: 100svh;
		margin: 0 auto;
		padding: 0.9rem 1rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	h1 {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		margin: 0;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	/* A text switch, not a pill: the shadow, the track and the capsule were
	   three pieces of ink for one bit of state. */
	.kinds {
		display: flex;
		gap: 0.75rem;
	}
	.kinds button {
		border: 0;
		background: none;
		padding: 0 0 2px;
		font: inherit;
		font-size: 0.8125rem;
		color: var(--gray-400);
		cursor: pointer;
	}
	/* A shadow rather than a border, because a border is part of the box: the
	   active word was a pixel taller than the inactive one, so the whole
	   header shifted every time the toggle was pressed — the control moving
	   under the finger that pressed it. A box-shadow draws the same line and
	   takes up no space at all. */
	.kinds button.active {
		color: var(--ink);
		box-shadow: 0 1px 0 var(--ink);
	}
	/* Quiet until it is looked at: at rest it matches the unselected half of
	   the toggle, and only says "pressable" when a pointer or the keyboard
	   arrives on it. */
	.pin {
		border: 0;
		background: none;
		padding: 0;
		display: flex;
		color: var(--gray-400);
		cursor: pointer;
	}
	.pin:hover,
	.pin:focus-visible {
		color: var(--interactive);
	}
	.status {
		color: var(--gray-600);
		font-size: 0.875rem;
		padding: 2rem 0;
		max-width: 24rem;
	}
	.status a,
	.note a {
		color: var(--interactive);
	}
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--interactive);
		text-decoration: underline;
		cursor: pointer;
	}
	.note {
		font-size: 0.6875rem;
		line-height: 1.45;
		color: var(--gray-400);
		margin: 0;
		max-width: 26rem;
	}
	footer {
		margin-top: auto;
		padding-top: 0.6rem;
		font-size: 0.6875rem;
		color: var(--gray-300);
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	footer p {
		margin: 0;
	}
</style>
