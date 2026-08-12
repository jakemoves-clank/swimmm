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
	//
	// closing is the day's full stop, or '' when there isn't one to draw: see
	// dayTail. A planner that just runs out of blocks is saying "that was the
	// last swim" and "that was the last one I picked" in the same silence.
	let { dips, nowMin, transitVia = new Map(), closing = '' } = $props();

	// This script settles two things and hands the rest to CSS: which day is
	// being drawn, and how many pixels a minute is worth. Everything that
	// follows from those — where a block sits, how tall it is, which column it
	// takes, where its trip line starts, and how much of what it has to say will
	// fit — is arithmetic on the dip's own minutes, done in the style block
	// against custom properties carrying those minutes. So the markup below sets
	// `--start: 780` and never a pixel: a block is positioned by the time it
	// happens at, which is the chart's whole claim, said in CSS.
	//
	// The two numbers that decide what a block can say are declared there too,
	// beside the type they were measured against, and read back here for the
	// one place the script needs them:
	//
	//   --terse-px   padding + one line of clock
	//   --full-px    padding + name + window in the water + trip
	//
	// A block is never given a level it hasn't the height for, and never has a
	// line sliced in half by its own bottom edge — which is what a threshold
	// that is merely close does. (The old one was 54 against a three-line block
	// that needs 60, so every block between the two drew its trip and then cut
	// it in half.) Keeping them in the stylesheet is what stops that gap
	// reopening the next time the type moves.
	const MAX_PX_PER_MIN = 3;
	// How far past the screen the planner may run to keep its blocks full
	// rather than terse. The one-screen rule is worth a great deal — you cannot
	// see the shape of a day a screenful at a time — but not the block's own
	// legibility, and between those two there is a middle the page used to fall
	// through: a scale that fits the day on the screen and leaves every block
	// too short to hold what it is trying to say. So a day that is *nearly*
	// there gets the scale it needs and a short scroll, and a day that is
	// nowhere near stops asking and sets one line per dip instead.
	const OVERSHOOT = 1.35;
	// What sits below the planner: the footer line, the page's bottom padding,
	// and any note about pools the city never placed. Erring generous costs a
	// few pixels of scale; erring mean costs a scrollbar.
	const BELOW_PX = 52;
	const CLOSING_PX = 20;

	let el = $state(null);
	let avail = $state(0);
	// Read from the stylesheet rather than repeated here: see above.
	let tersePx = $state(28);
	let fullPx = $state(64);

	// The planner used to measure its own box and scroll inside it, which put a
	// second scrollable region inside a scrollable page — two places to be
	// lost, and the outer one showing no sign that the inner one had more in
	// it. So the box it fits into is now the screen: the viewport, less
	// everything above it. That measurement has to come from something other
	// than the planner's own height, or setting the height would change the
	// measurement that set it.
	// Both readings are deliberately *layout* quantities, not visual ones,
	// because pull-to-refresh moves every visual one. Rubber-banding slides
	// the page under the viewport — so getBoundingClientRect().top grows,
	// scrollY goes negative, and innerHeight jumps as iOS collapses its
	// toolbars. Sizing the day from any of those rescaled the whole planner
	// for the length of the pull. These two don't move for a gesture that
	// changes no layout:
	//
	//   offsetTop            the element's position in the document
	//   clientHeight         the layout viewport — the same height `100vh`
	//                        resolves to, which iOS holds still across a
	//                        toolbar collapse
	//
	// The cost is that the fit is to the *large* viewport, so a little of the
	// last dip can sit under a shown toolbar; BELOW_PX absorbs most of it, and
	// a page that scrolls is the honest answer to the rest.
	function measure(..._deps) {
		if (!el) return;
		const css = getComputedStyle(el);
		const px = (name, fallback) => parseFloat(css.getPropertyValue(name)) || fallback;
		tersePx = px('--terse-px', tersePx);
		fullPx = px('--full-px', fullPx);
		let top = 0;
		for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
		const below = BELOW_PX + (closing ? CLOSING_PX : 0);
		avail = Math.max(0, document.documentElement.clientHeight - top - below);
	}

	// The offer is passed in rather than read inside so the dependency can't be
	// tidied away by someone who can't see why a value is mentioned and unused:
	// when it changes, so do the notes the planner sits under. A real viewport
	// change comes through `resize` — which fires for an iOS toolbar collapse
	// too, but re-reading clientHeight then simply gives the same number.
	$effect(() => {
		measure(dips, closing);
		const onResize = () => measure(dips, closing);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	const span = $derived(planSpan(dips, nowMin));
	const minutes = $derived(Math.max(1, span[1] - span[0]));

	// The dips at the length the reader actually asked for are what the scale
	// is set to hold: a dip shortened by a tight session is the exception, and
	// letting one of those decide would set the other four as table rows to buy
	// the exception a headline it has no room for either way.
	const durations = $derived(dips.map((d) => d.end_min - d.start_min));
	const longestMin = $derived(durations.length ? Math.max(...durations) : 45);
	const shortestMin = $derived(durations.length ? Math.min(...durations) : 45);

	// Fit the day on the screen if the blocks can take it; stretch past the
	// screen if a short scroll is what it costs to keep them full; give up and
	// set one line per dip if it would cost more than that. Three outcomes from
	// one comparison, and the reader never sees the fourth — a day that fits on
	// the screen and cannot be read on it.
	const scale = $derived.by(() => {
		const box = avail || 480;
		const fit = box / minutes;
		const full = fullPx / longestMin;
		if (fit >= full) return Math.min(MAX_PX_PER_MIN, fit);
		if (full * minutes <= box * OVERSHOOT) return full;
		return Math.max(tersePx / shortestMin, fit);
	});

	const laid = $derived(layoutDips(dips));

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
		width="12"
		height="12"
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

<!-- Every custom property below is a *time*, in minutes since midnight, or a
     count of columns. The one pixel quantity on the page is --scale, the worth
     of a minute, and the style block multiplies by it. -->
<div class="planner" bind:this={el} style="--span0: {span[0]}; --span1: {span[1]}">
	<div class="canvas" style="--scale: {scale}px">
		<div class="axis" aria-hidden="true">
			{#each hours as t (t)}
				<div class="hour" style="--t: {t}">
					<span class="hlabel">{clockLabel(t)}</span>
					<span class="hrule"></span>
				</div>
			{/each}
		</div>

		{#if nowMin != null && nowMin >= span[0] && nowMin <= span[1]}
			<div class="now" style="--t: {nowMin}" aria-hidden="true">
				<span class="nowlabel">now</span>
				<span class="nowrule"></span>
			</div>
		{/if}

		<ol class="blocks">
			{#each laid as { dip, lane, lanes } (dip.id)}
				<li
					class="slot"
					class:in-progress={dip.inProgress}
					class:unrouted={!dip.routed}
					style="--start: {dip.start_min}; --end: {dip.end_min}; --lane: {lane}; --lanes: {lanes}"
				>
					<!-- The trip, drawn where it happens: a rule down the block's own
					     leading edge, from when you would leave to when you would be in
					     the water, ending at the corner of the block it delivers you
					     to. Its length is the travel time and nothing else — it used to
					     run on down the side of the block as well, which read as one
					     appointment at the cost of a line that measured something for
					     part of its run and nothing for the rest. The concept hatched
					     this band; a hairline and a tick say the same thing with a
					     twentieth of the ink.
					     What keeps it plainly this dip's, where it runs past the block
					     above, is the paper it carries with it: the line, its tick and
					     its icon all sit in a hairline of their own white space, so
					     they read as something crossing that block rather than
					     something drawn on it. -->
					{#if dip.routed && dip.leaveBy < dip.start_min}
						<span class="trip-rule" style="--leave: {dip.leaveBy}" aria-hidden="true">
							{@render modeIcon(iconFor(dip))}
						</span>
					{/if}

					<article class="dip">
						<!-- Both levels are written; the block shows the one it has the
						     height for. Which that is, is a question about the box, so
						     the box answers it — see the container queries below. -->
						<p class="tight">
							<span class="clock">{clockLabel(dip.start_min)}</span>
							<span class="pool">{dip.location.name}</span>
							<!-- No mode icon on this level: "10-min walk" is already the
							     mode in words, and the row is short of width, not of
							     ways to say the same thing. -->
							<span class="reach">{reachPhrase(dip)}</span>
						</p>
						<div class="full">
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
									{departurePhrase(dip.leaveBy, nowMin)}<span class="reach">
										&nbsp;· {reachPhrase(dip)}</span
									>
								{:else}
									{reachPhrase(dip)}
								{/if}{#if dip.location.approx}
									<span class="approx" title="The city publishes no location for this pool, so the trip is measured to the complex it sits in">≈</span>
								{/if}
							</p>
							{#if dip.session.variant}
								<p class="variant">{dip.session.variant}</p>
							{/if}
						</div>
					</article>
				</li>
			{/each}
		</ol>
	</div>
	<!-- The day's full stop. Only ever drawn when it can be checked: see
	     dayTail, and the two sentences the page builds from it. -->
	{#if closing}
		<p class="closing">{closing}</p>
	{/if}
</div>

<style>
	/* The two heights a block is measured against, declared here beside the type
	   they were measured from, and read back by the script for the one decision
	   it has to make (see measure()). A change to the type is a change to these
	   two lines and to nothing else.

	     --terse-px  0.5rem of padding + one 0.75rem line at 1.35
	     --full-px   ...+ a 0.875rem name at 1.15 and a 0.6875rem trip, and the
	                 two 0.1rem gaps between the three

	   Rounded up to the next whole pixel each, because a block that is a
	   fraction short of its own content clips it, and a block a fraction over
	   costs nothing. */
	.planner {
		--terse-px: 28px;
		--full-px: 64px;
		/* Between two dips drawn side by side. */
		--lane-gap: 0.4rem;
		/* The axis gutter. Times are right-aligned into it so the hour column
		   and the block column each have one edge. */
		padding-left: 2.1rem;
	}
	/* Everything from here down is `time × --scale`. --scale is the only pixel
	   value the script computes, and --span0, --start, --end, --leave and --t
	   are all minutes since midnight, so each rule below says in CSS the thing
	   the chart claims in prose: where this sits on the page is when it
	   happens. */
	.canvas {
		position: relative;
		height: calc((var(--span1) - var(--span0)) * var(--scale));
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
		top: calc((var(--t) - var(--span0)) * var(--scale));
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
		/* One column of the group, and the gap between columns taken out of
		   them rather than added to the page: two lanes are each half the
		   width less half a gap, and the second starts a whole gap along. */
		--col: calc((100% - (var(--lanes) - 1) * var(--lane-gap)) / var(--lanes));
		--h: calc((var(--end) - var(--start)) * var(--scale));
		position: absolute;
		top: calc((var(--start) - var(--span0)) * var(--scale));
		height: var(--h);
		left: calc(var(--lane) * (var(--col) + var(--lane-gap)));
		width: var(--col);
		/* So the block's own type can answer to the box it actually got, in
		   both directions: two dips at once halves the column, and a line that
		   fits at full width sets four words to a line at half of it. Both
		   sizes are settled from the outside — the width from the lane, the
		   height from the clock — so the slot can be a size container at no
		   cost, and the queries below can do what a script would otherwise be
		   doing with a second copy of the numbers above. */
		container-type: size;
	}
	/* Down the block's own leading edge, from the departure to the water — the
	   only place a line between the two can be read as belonging to that dip.
	   A hairline and a 5px tick, and nothing else: at that weight the run where
	   it passes an earlier block in the same column falls inside that block's
	   own margin, so it costs no word and needs no room made for it. Everything
	   that used to need room out here — the mode, as an icon — is now set in
	   the block's own trip line, where whose trip it is was never in question.
	   Above the blocks, so the passing run is not lost under a pale ground. */
	.trip-rule {
		/* Clamped to the axis: a departure already behind you is drawn from
		   now, which is where the block says to leave. */
		--trip: calc((var(--start) - max(var(--leave), var(--span0))) * var(--scale));
		--halo: 4px;
		position: absolute;
		/* One shape for the whole trip — the line, its tick and its icon on a
		   single plate of paper, flat across the top. They used to carry a halo
		   each, which met in a step: a two-pixel ledge at the tick and a wider
		   patch below it for the icon, drawn in the one colour on the page that
		   is supposed to be nothing at all. Where the line runs past an earlier
		   block in the same column, this is the whole difference between a line
		   crossing that block and a line drawn on it — and so between a trip
		   that reads as the next dip's and one that reads as that block's. */
		left: calc(-1 * var(--halo));
		top: calc(-1 * (var(--trip) + var(--halo)));
		/* Halo, hairline, icon, halo. */
		width: calc(var(--halo) * 2 + 14px);
		/* Stopping level with the block it arrives at, never over it: parting
		   the trip from the swim it is a trip to is the one join on this page
		   that has to hold. */
		height: calc(var(--trip) + var(--halo));
		background: var(--paper);
		z-index: 2;
		container-type: size;
	}
	/* The rule itself, from the departure down to the water. */
	.trip-rule::before {
		content: '';
		position: absolute;
		left: var(--halo);
		top: var(--halo);
		bottom: 0;
		width: 0;
		border-left: 1px solid var(--trip-rule);
	}
	/* The departure itself: a tick you can put a finger on. It starts at the
	   rule rather than crossing it, so the two make a corner and not a T — a
	   crossbar reads as a mark *on* a line that carries on through it, which
	   is the one thing this end of the line does not do. */
	.trip-rule::after {
		content: '';
		position: absolute;
		left: var(--halo);
		top: var(--halo);
		width: 6px;
		border-top: 1px solid var(--trip-rule);
	}
	/* Tucked into the corner the tick and the line make, at the departure end.
	   It labels the moment the trip starts and leaves the line's length — the
	   travel time, which is the number here — unbroken. (Sitting *on* the line,
	   centred, it cut the rule in two and made a short trip look like a long
	   one with a gap in it.) It goes when the corner is too shallow to hold it,
	   which is now only a trip of five minutes or so: at those lengths the icon
	   would be longer than the journey it is labelling. */
	.mode {
		position: absolute;
		left: calc(var(--halo) + 2px);
		top: calc(var(--halo) + 1.5px);
		display: none;
		color: var(--gray-500);
	}
	@container (min-height: 18px) {
		.mode {
			display: block;
		}
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
	/* The name is the one line here long enough to turn, and half a column is
	   about ten rems: "Ethennonnhawahstihnen' Community Recreation Centre and
	   Library" wants four lines of it and used to take them, pushing the window
	   and the trip out through the bottom of the block. It gets the lines the
	   block was measured for and an ellipsis for the rest — a name cut short
	   still says which pool, where a block with no times on it says nothing. */
	h3.pool {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		overflow: hidden;
	}
	/* A second line, once the block is tall enough to hold one — and sooner in
	   a half column, where the name is set a step smaller and needs the line
	   far more. The two heights are the same block measured twice: name, water
	   and trip, at the size each column sets them in, plus one name again. */
	@container (min-height: 82px) {
		h3.pool {
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}
	@container (max-width: 12rem) and (min-height: 74px) {
		h3.pool {
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}
	.when,
	.trip,
	.variant {
		margin: 0.1rem 0 0;
		line-height: 1.35;
		/* Sized on the paragraph, not only on the spans inside it. The clock
		   was set to 12px in a paragraph still inheriting the body's 16, so the
		   line box it sat in was 21.6px tall for 16.2px of type: five pixels of
		   leading that belonged to a size nothing on the page was set in. It
		   opened the gap under the name — the "same 0.1rem throughout" was
		   never the gap the reader saw — and it is what pushed the trip through
		   the bottom of a block otherwise tall enough to hold it. */
		font-size: 0.75rem;
		/* One line each, always, or the block's height is a guess. A qualifier
		   that has to be cut is cut at its own end; the clock and the departure
		   are at the head of their lines, where the measure never reaches. */
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
	/* Which of the two levels a block shows, decided by the block: it is written
	   both ways and keeps the one it has the height for. A container query's
	   condition is the one place a custom property cannot be read, so this 64px
	   is --full-px spelled out — the two are declared together at the top of
	   this block for that reason, and move together. */
	.dip > .full {
		display: none;
	}
	@container (min-height: 64px) {
		.dip > .tight {
			display: none;
		}
		.dip > .full {
			display: block;
		}
	}
	/* One line, for a day too long to hold three. The clock leads, because it
	   lines the rows up under the axis they are read against; the name takes
	   whatever the row has left, because at a glance the question is which
	   pool. The trip goes last and is the first thing dropped — the line
	   beside the row is already carrying the mode as an icon.
	   The order the three shrink in is the whole of this rule: the row used to
	   let the clock and the trip hold their full width and take it out of the
	   name, so at half a column on a small phone a dip could be offered as
	   "7pm · 15-min drive" with the pool it is at cut to nothing. */
	.tight {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
		white-space: nowrap;
		overflow: hidden;
		margin: 0;
		line-height: 1.35;
		/* As with .when above: the row's own line box, not the body's. */
		font-size: 0.75rem;
	}
	.tight .clock {
		flex: none;
	}
	.tight .pool {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tight .reach {
		font-size: 0.6875rem;
		color: var(--gray-600);
		margin-left: auto;
		padding-left: 0.35rem;
		flex: none;
	}
	/* Half a column is about ten rems on a phone. At that width the qualifiers
	   stop being read and start being cut: the name, the window and the trip
	   are the appointment, and everything else is commentary — which is what a
	   narrow measure gives up first. What is left is set a step smaller so it
	   still fits on its line rather than ending in an ellipsis. */
	@container (max-width: 12rem) {
		.until,
		.tight .reach {
			display: none;
		}
		/* The trip's words, for a trip we routed: the icon leading the line
		   already says the mode and the line's own length is the travel time,
		   so at half a column "· 15-min drive" is the one part of the block
		   that is drawn twice. The departure stays — it is the number you act
		   on — and an unrouted dip keeps its distance, which nothing else on
		   the page is carrying. */
		.slot:not(.unrouted) .trip .reach {
			display: none;
		}
		.dip {
			padding-left: 0.35rem;
			padding-right: 0.35rem;
		}
		h3.pool {
			font-size: 0.8125rem;
		}
		.clock {
			font-size: 0.6875rem;
		}
		.trip {
			font-size: 0.625rem;
		}
	}
	/* The variant qualifies the swim rather than describing the appointment,
	   so it is the first line to go and the last to come back: only a block
	   with room for a two-line name and a line under it gets one. */
	.variant {
		display: none;
	}
	@container (min-width: 12.0625rem) and (min-height: 102px) {
		.variant {
			display: block;
		}
	}
	/* The end of the day, level with the end of the axis. Grey, small, and one
	   line: it is a fact about the schedule, not a heading. */
	.closing {
		margin: 0.35rem 0 0;
		font-size: 0.6875rem;
		line-height: 1.35;
		color: var(--gray-400);
	}
</style>
