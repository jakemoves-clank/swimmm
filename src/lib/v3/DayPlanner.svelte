<script>
	// The day planner, after v2's Concept 02 — but turned through ninety
	// degrees in what it's about. The concept put one column per pool and
	// asked you to compare fourteen of them; this asks nothing of the sort.
	// There is one column, it is your afternoon, and the blocks on it are the
	// dips you've been offered.
	//
	// The axis is real: distance down the page is time, at a fixed scale, so
	// "I'm free between 2 and 4" is answered by looking at one band of the
	// page rather than by reading five cards. That's the whole reason it's a
	// planner and not a list.
	//
	// Built in HTML and CSS rather than SVG, unlike the concept: every dip
	// here is real text a screen reader can read and a thumb can hit, and
	// there are five of them, not sixty.
	import { layoutDips, planSpan } from './layout.js';
	import { reachPhrase } from '$lib/labels.js';

	// nowMin is null when the planner is showing a day that isn't today: there
	// is no "now" on tomorrow, and nothing on it is in progress or late.
	let { dips, nowMin, fmtTime } = $props();

	// Two pixels a minute: a 30-minute dip — the shortest we offer — is 60px,
	// which is two lines of text, so no block is ever too small to read and
	// the scale never has to lie about a short dip to make it legible.
	const PX_PER_MIN = 2;

	const span = $derived(planSpan(dips, nowMin));
	const laid = $derived(layoutDips(dips));
	const height = $derived((span[1] - span[0]) * PX_PER_MIN);
	const y = (min) => (min - span[0]) * PX_PER_MIN;

	// An hour label sitting under the "now" label would print one on top of
	// the other, and "now" is the more useful of the two — so the hour it
	// lands on gives way. A label is about 12 minutes tall at this scale.
	const LABEL_CLEARANCE_MIN = 12;

	const hours = $derived.by(() => {
		const out = [];
		for (let t = span[0]; t <= span[1]; t += 60) {
			if (nowMin != null && Math.abs(t - nowMin) < LABEL_CLEARANCE_MIN) continue;
			out.push(t);
		}
		return out;
	});

	// Hour labels only need the hour: the axis carries the rest.
	function fmtHour(min) {
		const h = Math.floor(min / 60) % 24;
		const ampm = h >= 12 ? 'pm' : 'am';
		return `${h % 12 || 12}${ampm}`;
	}
</script>

<div class="planner" style="--h: {height}px">
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
			<li
				class="slot"
				class:in-progress={dip.inProgress}
				class:unrouted={!dip.routed}
				style="top: {y(dip.start_min)}px; height: {(dip.end_min - dip.start_min) *
					PX_PER_MIN}px; left: calc({(lane / lanes) * 100}% + {lane ? 0.25 : 0}rem); width: calc({(1 /
					lanes) *
					100}% - {lanes > 1 ? 0.25 : 0}rem)"
			>
				<!-- The trip, drawn where it actually happens: the hatched run
				     from when you'd leave to when you'd be in the water. It is
				     the thing a wall calendar can't tell you, and the reason a
				     dip is an appointment rather than an opening time. -->
				{#if dip.routed}
					<span
						class="shadow"
						style="top: {(dip.leaveBy - dip.start_min) * PX_PER_MIN}px; height: {(dip.start_min -
							dip.leaveBy) *
							PX_PER_MIN}px"
						aria-hidden="true"
					></span>
				{/if}

				<article class="dip">
					<h3>{dip.location.name}</h3>
					<p class="when">
						{fmtTime(dip.start_min)}–{fmtTime(dip.end_min)}
						<span class="dur">{dip.durationMin} min</span>
					</p>
					<p class="trip">
						{#if dip.routed}
							{nowMin != null && dip.leaveBy <= nowMin
								? 'leave now'
								: `leave ${fmtTime(dip.leaveBy)}`} ·
						{/if}
						{reachPhrase(dip)}
					</p>
					{#if dip.session.variant || dip.shortfallMin > 0}
						<p class="aside">
							{#if dip.session.variant}<span class="variant">{dip.session.variant}</span>{/if}
							{#if dip.shortfallMin > 0}
								<span class="short"
									>{dip.durationMin} min, not {dip.preferredMin} — the water goes at {fmtTime(
										dip.session.end_min
									)}</span
								>
							{/if}
						</p>
					{/if}
				</article>
			</li>
		{/each}
	</ol>
</div>

<style>
	.planner {
		position: relative;
		height: var(--h);
		margin: 0.5rem 0 1rem;
		padding-left: 2.75rem;
	}
	.axis {
		position: absolute;
		inset: 0;
	}
	.hour {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.hlabel {
		width: 2.4rem;
		text-align: right;
		font-size: 0.7rem;
		color: #999;
		font-variant-numeric: tabular-nums;
		flex: none;
	}
	.hrule {
		flex: 1;
		border-top: 1px solid #e4e4e4;
	}
	/* Laid out like an hour row so "now" reads as one more label on the same
	   axis, rather than a floating tag that can run off the right edge. */
	.now {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		z-index: 2;
		pointer-events: none;
	}
	.nowlabel {
		width: 2.4rem;
		text-align: right;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #0b66e4;
		flex: none;
	}
	.nowrule {
		flex: 1;
		border-top: 2px solid #0b66e4;
	}
	.blocks {
		position: absolute;
		inset: 0 0 0 2.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.slot {
		position: absolute;
	}
	/* The trip sits above its block, outside it, so the block's own height
	   stays honest about how long you'd be in the water. It can reach back
	   over the dip before it — you would be leaving while that one is still
	   in the water, which is true and worth seeing — so it paints *under*
	   the cards rather than across them. */
	.shadow {
		position: absolute;
		left: 0;
		right: 0;
		z-index: 0;
		border-left: 2px solid #c9d4e2;
		background: repeating-linear-gradient(
			45deg,
			#dbe3ec 0 1px,
			transparent 1px 5px
		);
	}
	/* No routed trip: a dashed edge and a muted rule, so a distance-only dip
	   never passes for one we worked the journey out for. */
	.slot.unrouted .dip {
		border-left-style: dashed;
		border-left-color: #9bb0c7;
	}
	.slot.unrouted .trip {
		color: #5d6b7a;
	}
	.dip {
		position: relative;
		z-index: 1;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
		background: #fff;
		border: 1px solid #cfd8e3;
		border-left: 4px solid #0b66e4;
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
	}
	.slot.in-progress .dip {
		background: #f2f7ff;
	}
	h3 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.2;
	}
	.when {
		margin: 0.1rem 0 0;
		font-size: 0.8rem;
		color: #333;
	}
	.dur {
		color: #888;
		font-size: 0.72rem;
	}
	.trip {
		margin: 0.1rem 0 0;
		font-size: 0.75rem;
		color: #0b66e4;
	}
	.aside {
		margin: 0.15rem 0 0;
		font-size: 0.7rem;
		color: #777;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.variant {
		background: #eee;
		border-radius: 0.3rem;
		padding: 0 0.3rem;
		color: #555;
	}
</style>
