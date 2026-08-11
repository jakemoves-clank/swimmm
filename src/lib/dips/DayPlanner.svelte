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
	import { reachPhrase } from '$lib/labels.js';

	// nowMin is null when the planner is showing a day that isn't today: there
	// is no "now" on tomorrow, and nothing on it is in progress or late.
	let { dips, nowMin, fmtTime } = $props();

	// The scale floor. Below about this, a 30-minute dip is too short to hold
	// its own name and the planner stops being readable — so past this point
	// it keeps the scale and lets the column scroll instead of shrinking into
	// illegibility. A day that busy is a good problem.
	const MIN_PX_PER_MIN = 0.55;
	const MAX_PX_PER_MIN = 3;
	// Below this a block holds one line, not four.
	const TERSE_PX = 40;

	let boxHeight = $state(0);

	const span = $derived(planSpan(dips, nowMin));
	const minutes = $derived(Math.max(1, span[1] - span[0]));
	const scale = $derived(
		Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, (boxHeight || 480) / minutes))
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

	function fmtHour(min) {
		const h = Math.floor(min / 60) % 24;
		return `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
	}
</script>

<div class="planner" bind:clientHeight={boxHeight}>
	<div class="canvas" style="height: {height}px">
		<div class="axis" aria-hidden="true">
			{#each hours as t (t)}
				<div class="hour" style="top: {y(t)}px">
					<span class="hlabel">{fmtHour(t)}</span>
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
						<span
							class="trip-rule"
							style="top: {(dip.leaveBy - dip.start_min) * scale}px; height: {(dip.start_min -
								dip.leaveBy) * scale}px"
							aria-hidden="true"
						></span>
					{/if}

					<article class="dip">
						{#if terse}
							<p class="tight">
								<span class="clock">{fmtTime(dip.start_min)}</span>
								<span class="pool">{dip.location.name}</span>
								<span class="reach">{reachPhrase(dip)}</span>
							</p>
						{:else}
							<h3 class="pool">{dip.location.name}</h3>
							<p class="when">
								<span class="clock">{fmtTime(dip.start_min)}–{fmtTime(dip.end_min)}</span>
								{#if dip.shortfallMin > 0}
									<span class="short">{dip.durationMin} min, not {dip.preferredMin}</span>
								{/if}
							</p>
							<p class="trip">
								{#if dip.routed}
									{nowMin != null && dip.leaveBy <= nowMin
										? 'leave now'
										: `leave ${fmtTime(dip.leaveBy)}`}&nbsp;·
								{/if}
								{reachPhrase(dip)}{#if dip.location.approx}
									<span class="approx" title="The city publishes no location for this pool, so the trip is measured to the complex it sits in">≈</span>
								{/if}
							</p>
							{#if dip.session.variant && h > 74}
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
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.01em;
	}
	.hlabel {
		color: #9aa0a6;
	}
	.hrule {
		flex: 1;
		border-top: 1px solid #ececee;
	}
	/* The one accent on the page, spent on the one thing that moves. */
	.now {
		z-index: 2;
		pointer-events: none;
	}
	.nowlabel {
		color: #0b66e4;
		font-weight: 600;
	}
	.nowrule {
		flex: 1;
		border-top: 1px solid #0b66e4;
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
		border-left: 1px solid #b9c0c7;
		z-index: 0;
	}
	.trip-rule::before {
		/* The departure itself: a tick you can put a finger on. */
		content: '';
		position: absolute;
		top: 0;
		left: -2px;
		width: 5px;
		border-top: 1px solid #b9c0c7;
	}
	/* No border, no radius, no shadow: a pale ground is all it takes to read
	   as a block against the rules, and the rest was decoration. */
	.dip {
		position: relative;
		z-index: 1;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
		background: #eef1f4;
		padding: 0.15rem 0.4rem;
	}
	.slot.in-progress .dip {
		background: #e6ebf1;
	}
	/* A dip we could not route: the same block, drawn on a hatch so it cannot
	   pass for one whose trip we measured. */
	.slot.unrouted .dip {
		background: repeating-linear-gradient(45deg, #eef1f4 0 5px, #e7eaee 5px 10px);
	}
	.pool {
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.25;
		margin: 0;
		color: #1a1d21;
	}
	.when,
	.trip,
	.variant,
	.tight {
		margin: 0;
		line-height: 1.35;
	}
	.clock {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: #33383d;
	}
	.trip {
		font-size: 0.6875rem;
		color: #5f666d;
	}
	.short,
	.variant {
		font-size: 0.6875rem;
		color: #7c838a;
	}
	.approx {
		color: #9aa0a6;
	}
	/* One line, for a block too short to hold four. Name first — at a glance
	   the question is which pool, and the clock is already the y-axis. */
	.tight {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
		white-space: nowrap;
		overflow: hidden;
	}
	.tight .pool {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tight .reach {
		font-size: 0.6875rem;
		color: #5f666d;
		margin-left: auto;
		flex: none;
	}
</style>
