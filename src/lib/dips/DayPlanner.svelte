<script>
	// The day planner, after /v2's Concept 02 — the timetable and Bertin's
	// reorderable matrix — but turned through ninety degrees in what it is
	// about. The concept put one column per pool and asked you to compare
	// fourteen; this has one column, the rest of your day, with the offered
	// dips on it.
	//
	// Two rules, both Tufte's:
	//
	// 1. It fits on the screen. The scale is computed from the height
	//    available rather than fixed, and the axis starts at now — the morning
	//    you slept through is not an option you can take, so drawing it is ink
	//    that says nothing. A reader should see the whole offer without
	//    scrolling, because the question ("when could I go?") is about the
	//    shape of the day, and you cannot see a shape a screen at a time.
	//
	// 2. Nothing is drawn twice. The block's position and height already say
	//    when the dip starts and how long it runs, so the duration is printed
	//    only when it isn't what you asked for; the trip is a rule from
	//    departure to water rather than a hatched band; and there are no
	//    borders, no shadows and no rounded corners, because none of them
	//    carry a number. What is left is type on a grid.
	import { layoutDips, planSpan } from './layout.js';
	import { clockLabel, clockRange, departurePhrase, reachPhrase } from '$lib/labels.js';

	// nowMin is null when the planner is showing a day that isn't today: there
	// is no "now" on tomorrow, and nothing on it is in progress or late.
	//
	// transitVia says which face of transit a trip is — bus, subway or
	// streetcar — keyed by pool. It is a lookup rather than a field on the dip
	// because it changes nothing about the offer: appeal.js scores every
	// transit trip alike, and only the icon can tell the three apart.
	let { dips, nowMin, transitVia = new Map() } = $props();

	// The scale floor. Below about this, a 30-minute dip is too short to hold
	// its own name and the planner stops being readable — so past this point
	// it keeps the scale and lets the page scroll instead of shrinking into
	// illegibility. A day that busy is a good problem.
	const MIN_PX_PER_MIN = 0.55;
	const MAX_PX_PER_MIN = 3;
	// Below this a block holds one line, not the three it wants: a name, a
	// window in the water, and a trip.
	const TERSE_PX = 54;
	// The variant ("Long Course (50m)") is the first thing to go: it qualifies
	// the swim rather than describing the appointment.
	const VARIANT_PX = 88;
	// Below this the rule is shorter than the icon that would sit on it. Most
	// trips are short — a ten-minute walk is ten pixels at a tight scale — so
	// the threshold is the icon's own height and no more; the words in the
	// block still say the mode when it goes.
	const ICON_MIN_PX = 11;
	// What sits below the planner: the footer line, the page's bottom padding,
	// and any note about pools the city never placed. Erring generous costs a
	// few pixels of scale; erring mean costs a scrollbar.
	const BELOW_PX = 44;

	let el = $state(null);
	let viewportH = $state(0);
	let avail = $state(0);

	// The planner used to measure its own box and scroll inside it, which put a
	// second scrollable region inside a scrollable page — two places to be
	// lost, and the outer one showing no sign that the inner one had more in
	// it. So the box it fits into is now the screen: the viewport, less
	// everything above it. That measurement has to come from something other
	// than the planner's own height, or setting the height would change the
	// measurement that set it.
	function measure(viewportHeight, _offer) {
		if (!el) return;
		// Document-relative, so a reader who has scrolled doesn't get a
		// different scale from one who hasn't.
		// Clamped: iOS rubber-banding drives scrollY negative, which would
		// otherwise read as "the planner starts higher up the page" and
		// rescale the day for the length of the bounce.
		const top = el.getBoundingClientRect().top + Math.max(0, window.scrollY);
		avail = Math.max(0, viewportHeight - top - BELOW_PX);
	}

	// Both reasons to measure again — the window resized, or the offer changed
	// and with it the notes the planner sits under — are passed in as
	// arguments rather than read inside, so neither dependency can be tidied
	// away by someone who can't see why a value is mentioned and unused.
	$effect(() => measure(viewportH, dips));

	const span = $derived(planSpan(dips, nowMin));
	const minutes = $derived(Math.max(1, span[1] - span[0]));
	const scale = $derived(
		Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, (avail || 480) / minutes))
	);
	const height = $derived(minutes * scale);
	const laid = $derived(layoutDips(dips));
	const y = (min) => (min - span[0]) * scale;

	// Hourly while there is room for hourly; every two or three hours when the
	// day is long and the scale has tightened. An axis whose labels collide is
	// worse than an axis with fewer of them.
	const step = $derived(scale * 60 >= 34 ? 60 : scale * 60 >= 18 ? 120 : 180);

	const hours = $derived.by(() => {
		const out = [];
		const first = Math.ceil(span[0] / step) * step;
		for (let t = first; t <= span[1]; t += step) {
			if (nowMin != null && Math.abs(t - nowMin) * scale < 9) continue;
			out.push(t);
		}
		return out;
	});

	// A dip's mode is what the concierge chose; which vehicle that means is
	// only known for transit, and only when Transitous said so.
	function iconFor(dip) {
		if (dip.mode === 'drive') return 'car';
		if (dip.mode === 'transit') return transitVia.get(dip.location.id) ?? 'transit';
		return dip.mode;
	}
</script>

<!-- A trip line with no label is a line. These say which trip it is, at the
     size of a footnote: enough to tell a walk from a streetcar at a glance,
     not enough to compete with the type. Drawn rather than fetched — the CSP
     is hash-based and an icon font or a sprite file would be a request. The
     mode is in the block's words too, so they are decoration for a reader
     using a screen reader and hidden from one. -->
{#snippet modeIcon(kind)}
	<svg
		class="mode"
		viewBox="0 0 24 24"
		width="13"
		height="13"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if kind === 'walk'}
			<circle cx="12" cy="4" r="2" fill="currentColor" stroke="none" />
			<path d="M12 8v6" />
			<path d="M12 14l-3 7M12 14l3 7" />
			<path d="M8 10l4-2 4 2" />
		{:else if kind === 'bike'}
			<circle cx="5.5" cy="17" r="3.5" />
			<circle cx="18.5" cy="17" r="3.5" />
			<path d="M5.5 17l4.5-8h4l4.5 8" />
			<path d="M10 9h5" />
		{:else if kind === 'bus'}
			<rect x="4" y="3" width="16" height="14" rx="2" />
			<path d="M4 10h16" />
			<path d="M7 17v3M17 17v3" />
		{:else if kind === 'subway'}
			<rect x="5" y="2" width="14" height="15" rx="4" />
			<path d="M5 10h14" />
			<path d="M8 21l2.5-4M16 21l-2.5-4" />
		{:else if kind === 'streetcar'}
			<rect x="5" y="4" width="14" height="13" rx="2" />
			<path d="M5 11h14" />
			<path d="M12 4V1" />
			<path d="M8 21l2.5-4M16 21l-2.5-4" />
		{:else if kind === 'car'}
			<path d="M4 17v-4l2-5h12l2 5v4" />
			<path d="M4 13h16" />
			<path d="M7 17v2M17 17v2" />
		{:else}
			<!-- Some vehicle, on some route: Transitous named a mode we don't
			     recognise, or none at all. Better a shape that says "transit"
			     than one that says the wrong thing confidently. -->
			<rect x="5" y="3" width="14" height="13" rx="3" />
			<path d="M5 10h14" />
			<path d="M3 20h18" />
		{/if}
	</svg>
{/snippet}

<svelte:window bind:innerHeight={viewportH} />

<div class="planner" bind:this={el}>
	<div class="canvas" style="height: {height}px">
		<div class="axis" aria-hidden="true">
			{#each hours as t (t)}
				<div class="hour" style="top: {y(t)}px">
					<span class="hlabel">{clockLabel(t)}</span>
					<span class="hrule"></span>
				</div>
			{/each}
		</div>

		{#if nowMin != null && nowMin >= span[0] && nowMin <= span[1]}
			<div class="now" style="top: {y(nowMin)}px" aria-hidden="true">
				<span class="nowlabel">now</span>
				<span class="nowrule"></span>
			</div>
		{/if}

		<ol class="blocks">
			{#each laid as { dip, lane, lanes } (dip.id)}
				{@const h = (dip.end_min - dip.start_min) * scale}
				{@const terse = h < TERSE_PX}
				{@const tripH = dip.routed ? (dip.start_min - dip.leaveBy) * scale : 0}
				<li
					class="slot"
					class:in-progress={dip.inProgress}
					class:unrouted={!dip.routed}
					style="top: {y(dip.start_min)}px; height: {h}px; left: calc({(lane / lanes) *
						100}% + {lane ? 0.2 : 0}rem); width: calc({(1 / lanes) * 100}% - {lanes > 1
						? 0.2
						: 0}rem)"
				>
					<!-- The trip, drawn where it happens: a rule from when you would
					     leave to when you would be in the water. The concept hatched
					     this band; a hairline and a tick say the same thing with a
					     twentieth of the ink. -->
					{#if dip.routed && dip.leaveBy < dip.start_min}
						{@const showIcon = tripH >= ICON_MIN_PX}
						<span
							class="trip-rule"
							class:ticked={!showIcon}
							style="top: {(dip.leaveBy - dip.start_min) * scale}px; height: {tripH}px"
							aria-hidden="true"
						>
							{#if showIcon}{@render modeIcon(iconFor(dip))}{/if}
						</span>
					{/if}

					<article class="dip">
						{#if terse}
							<p class="tight">
								<span class="clock">{clockLabel(dip.start_min)}</span>
								<span class="pool">{dip.location.name}</span>
								<span class="reach">{reachPhrase(dip)}</span>
							</p>
						{:else}
							<h3 class="pool">{dip.location.name}</h3>
							<p class="when">
								<span class="clock">{clockRange(dip.start_min, dip.end_min)}</span>
								{#if dip.shortfallMin > 0}
									<span class="short">{dip.durationMin} min, not {dip.preferredMin}</span>
								{/if}
								<!-- A dip is a 45-minute window inside a longer swim, and a
								     reader who can only see the window has no way to know
								     they could arrive later or stay on. The session's own
								     closing time, unrounded: rounding this one up would
								     promise water that isn't there. -->
								{#if dip.session.end_min > dip.end_min}
									<span class="until">· open until {clockLabel(dip.session.end_min)}</span>
								{/if}
							</p>
							<p class="trip">
								{#if dip.routed}
									{departurePhrase(dip.leaveBy, nowMin)}&nbsp;·
								{/if}
								{reachPhrase(dip)}{#if dip.location.approx}
									<span class="approx" title="The city publishes no location for this pool, so the trip is measured to the complex it sits in">≈</span>
								{/if}
							</p>
							{#if dip.session.variant && h > VARIANT_PX}
								<p class="variant">{dip.session.variant}</p>
							{/if}
						{/if}
					</article>
				</li>
			{/each}
		</ol>
	</div>
</div>

<style>
	.planner {
		/* The axis gutter. Times are right-aligned into it so the hour column
		   and the block column each have one edge. */
		padding-left: 2.1rem;
	}
	.canvas {
		position: relative;
	}
	.axis {
		position: absolute;
		inset: 0;
	}
	/* `top` places the row's edge, but the rule is centred inside it, so
	   without this the rule lands half a label-height *below* its own time —
	   about two minutes at full scale and eleven at the compressed floor. In a
	   chart whose whole claim is that position is time, that is the axis
	   lying. Pull the row up by half its height so the rule sits exactly on
	   the minute it names, level with a dip that starts on it. */
	.hour,
	.now {
		position: absolute;
		left: -2.1rem;
		right: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		transform: translateY(-50%);
	}
	.hlabel,
	.nowlabel {
		width: 1.7rem;
		flex: none;
		text-align: right;
		font-size: 0.6875rem;
		font-variant-numeric: proportional-nums lining-nums;
		letter-spacing: 0.01em;
	}
	.hlabel {
		color: var(--gray-300);
	}
	.hrule {
		flex: 1;
		border-top: 1px solid var(--rule);
	}
	/* The one accent on the page, spent on the one thing that moves. */
	.now {
		z-index: 2;
		pointer-events: none;
	}
	.nowlabel {
		color: var(--accent);
		font-weight: 600;
	}
	.nowrule {
		flex: 1;
		border-top: 1px solid var(--accent);
	}
	.blocks {
		position: absolute;
		inset: 0;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.slot {
		position: absolute;
	}
	.trip-rule {
		position: absolute;
		left: 0;
		width: 0;
		border-left: 1px solid var(--trip-rule);
		z-index: 0;
	}
	.trip-rule.ticked::before {
		/* The departure itself: a tick you can put a finger on. */
		content: '';
		position: absolute;
		top: 0;
		left: -2px;
		width: 5px;
		border-top: 1px solid var(--trip-rule);
	}
	/* Sat on the rule rather than beside it, with the page showing through
	   behind it, so the icon reads as a label on the line and not as a second
	   mark near it. */
	/* On the departure end, not the middle. Centred on the line it would
	   otherwise interrupt, it reads as the mark the trip starts from — the
	   line runs out of the icon and down to the water — instead of as a break
	   halfway along. It also survives a short trip, which the middle did not:
	   there is always a top, and most trips are only a few minutes long. */
	.mode {
		position: absolute;
		top: 0;
		left: 1px;
		transform: translate(-50%, -50%);
		display: block;
		color: var(--gray-500);
		background: var(--paper);
		border-radius: 50%;
	}
	/* No border, no radius, no shadow: a pale ground is all it takes to read
	   as a block against the rules, and the rest was decoration.
	   The two pixels off the bottom are the exception, and they are structural
	   rather than decorative: two dips running back to back share an edge, and
	   two grounds meeting at an edge are one ground — a single 2:00–3:30 block
	   where the day holds two dips. The gap is taken from the foot because the
	   top edge is the one carrying a claim (this is when it starts); at the
	   scales here the bottom is losing well under a minute. */
	.dip {
		position: relative;
		z-index: 1;
		height: calc(100% - 2px);
		box-sizing: border-box;
		overflow: hidden;
		background: var(--dip-bg);
		padding: 0.25rem 0.45rem;
	}
	.slot.in-progress .dip {
		background: var(--dip-bg-progress);
	}
	/* A dip we could not route: the same block, drawn on a hatch so it cannot
	   pass for one whose trip we measured. */
	.slot.unrouted .dip {
		background: repeating-linear-gradient(45deg, var(--dip-bg) 0 5px, var(--dip-bg-unrouted) 5px 10px);
	}
	/* Three levels, and they have to look like three. The old block set the
	   name at 13px, the clock at 12 and the trip at 11 — a step of one pixel
	   each, which the eye reads as one paragraph of slightly uneven type
	   rather than as a hierarchy, and left the block looking like a fragment
	   of a table. Now the steps are 14 / 12 / 11 carrying weight and colour
	   with them (600 ink → 500 dim → 400 grey), so each level is distinguished
	   three ways at once and one of them is enough.
	   Leading runs the other way, as it should: the big line is set tight
	   (1.15) because it is one phrase, the small ones looser (1.35) because
	   they are read as text. The gaps between the lines are the same 0.1rem
	   throughout, so the block has one rhythm rather than four margins. */
	.pool {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.005em;
		margin: 0;
		color: var(--ink);
	}
	.when,
	.trip,
	.variant {
		margin: 0.1rem 0 0;
		line-height: 1.35;
	}
	/* Proportional lining figures — the browser's default, said out loud
	   because the page used to override it. Tabular numerals are for columns
	   of figures you compare digit by digit; a clock time is a word, and set
	   in tabular the "11" in "11am" opens a gap you can park a bus in. Oldstyle
	   would be handsomer still, but no system-ui face in the wild ships the
	   glyphs and a webfont is a request this page does not need to make. */
	.clock {
		font-size: 0.75rem;
		font-weight: 500;
		font-variant-numeric: proportional-nums lining-nums;
		color: var(--ink-dim);
	}
	.trip {
		font-size: 0.6875rem;
		color: var(--gray-600);
	}
	.short,
	.until,
	.variant {
		font-size: 0.6875rem;
		color: var(--gray-500);
	}
	.approx {
		color: var(--gray-300);
	}
	/* One line, for a block too short to hold three. Name first — at a glance
	   the question is which pool, and the clock is already the y-axis. */
	.tight {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
		white-space: nowrap;
		overflow: hidden;
		margin: 0;
		line-height: 1.35;
	}
	.tight .pool {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tight .reach {
		font-size: 0.6875rem;
		color: var(--gray-600);
		margin-left: auto;
		flex: none;
	}
</style>
