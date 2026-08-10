<script>
	// 10 — WORTH THE TRIP
	// The energy question. Across: the round trip you'd spend getting there and
	// back, in minutes of your own body. Up: the minutes you'd actually be
	// swimming. The diagonal is the line where the two are equal — travel as
	// long as you swim — and it does all the arguing without a word. Anything
	// above it earns its trip; the top-left corner is the best deal in the city.
	import { scaleLinear } from 'd3-scale';
	import { fmtClock, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const M = { top: 20, right: 18, bottom: 40, left: 46 };

	let w = $state(0);
	let mode = $state('bike');

	const height = $derived(w < 560 ? 330 : 400);

	const points = $derived.by(() =>
		day.pools
			.filter((p) => p[mode] != null)
			.map((p) => {
				const arrive = day.nowMin + p[mode];
				const s = p.sessions.find(
					(x) => !x.over && x.end_min - Math.max(arrive, x.start_min) >= day.minSwim
				);
				if (!s) return null;
				const inWater = Math.max(arrive, s.start_min);
				return {
					pool: p,
					swim: s,
					inWater,
					trip: p[mode] * 2,
					water: s.end_min - inWater,
					// The honest surplus: water you get, less the legs it costs.
					net: s.end_min - inWater - p[mode] * 2
				};
			})
			.filter(Boolean)
	);

	const maxTrip = $derived(Math.max(40, ...points.map((p) => p.trip)));
	// The one all-day outdoor pool would otherwise own the top two-thirds of
	// the frame on its own. Clamp the axis and mark whatever climbs off it —
	// both scales stay linear, so the break-even diagonal stays a straight line.
	const CEILING = 180;
	const maxWater = $derived(
		Math.min(CEILING, Math.max(60, ...points.map((p) => p.water)))
	);

	const x = $derived(
		scaleLinear()
			.domain([0, maxTrip * 1.05])
			.range([M.left, Math.max(M.left + 1, w - M.right)])
	);
	const y = $derived(
		scaleLinear()
			.domain([0, maxWater * 1.08])
			.range([height - M.bottom, M.top])
			.clamp(true)
	);
	const overTop = $derived(points.filter((p) => p.water > maxWater).length);

	const best = $derived(points.reduce((a, b) => (!a || b.net > a.net ? b : a), null));
	const soonest = $derived(
		points.reduce((a, b) => (!a || b.inWater < a.inWater ? b : a), null)
	);
	const worthIt = $derived(points.filter((p) => p.net > 0).length);

	// Where the break-even diagonal can actually be drawn inside the frame.
	const diag = $derived.by(() => {
		const t = Math.min(x.domain()[1], y.domain()[1]);
		return { x1: x(0), y1: y(0), x2: x(t), y2: y(t) };
	});

	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
	// The best deal is often also the soonest; label the pool once either way.
	const named = $derived(
		[best, soonest].filter((p, i, all) => p && all.findIndex((q) => q?.pool.id === p.pool.id) === i)
	);
	const xTicks = $derived(x.ticks(6));
	const yTicks = $derived(y.ticks(5));
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<div class="modes" role="group" aria-label="Travel mode">
			{#each ['walk', 'bike'] as m (m)}
				<button class:on={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}>
					{m === 'walk' ? 'On foot' : 'By bike'}
				</button>
			{/each}
		</div>
	</div>

	<div class="chart" bind:clientWidth={w}>
		{#if w > 0}
			<svg
				width={w}
				{height}
				viewBox="0 0 {w} {height}"
				role="img"
				aria-label="Round-trip minutes against minutes of swim, with a break-even diagonal"
			>
				<!-- everything under the diagonal costs more than it gives -->
				<polygon
					class="poor"
					points="{x(0)},{y(0)} {diag.x2},{diag.y2} {x(x.domain()[1])},{y(0)}"
				/>

				{#each xTicks as t (t)}
					<line class="grid" x1={x(t)} y1={y(0)} x2={x(t)} y2={M.top} />
					<text class="tick" x={x(t)} y={height - M.bottom + 14}>{t}</text>
				{/each}
				{#each yTicks as t (t)}
					<line class="grid" x1={M.left} y1={y(t)} x2={w - M.right} y2={y(t)} />
					<text class="tick left" x={M.left - 7} y={y(t) + 3.5}>{t}</text>
				{/each}

				<line class="diag" x1={diag.x1} y1={diag.y1} x2={diag.x2} y2={diag.y2} />
				<text
					class="diag-label"
					transform="translate({(diag.x1 + diag.x2) / 2 + 6},{(diag.y1 + diag.y2) / 2 - 6})"
				>
					you travel as long as you swim
				</text>

				{#each points as p (p.pool.id)}
					{#if p.water > maxWater}
						<polygon
							class="pt over-top"
							points="{x(p.trip)},{y(maxWater) - 5} {x(p.trip) - 4.5},{y(maxWater) + 2} {x(
								p.trip
							) + 4.5},{y(maxWater) + 2}"
						>
							<title>{p.pool.name} — {p.trip} min round trip, {p.water} min of swim</title>
						</polygon>
					{:else}
						<circle class="pt" class:poorpt={p.net <= 0} cx={x(p.trip)} cy={y(p.water)} r="4">
							<title>{p.pool.name} — {p.trip} min round trip, {p.water} min of swim</title>
						</circle>
					{/if}
				{/each}

				{#each named as p, i (p.pool.id)}
					<circle class="pt marked" class:second={i === 1} cx={x(p.trip)} cy={y(p.water)} r="6" />
					<!-- Both marks can be clamped to the ceiling at once, in which case
					     they would otherwise be written on the same line. -->
					<text
						class="mark-label"
						class:second={i === 1}
						x={x(p.trip) + (x(p.trip) > w - 160 ? -10 : 10)}
						text-anchor={x(p.trip) > w - 160 ? 'end' : 'start'}
						y={y(p.water) + 4 + (p.water > maxWater ? i * 14 : 0)}
					>
						{shortName(p.pool.name)}{p.water > maxWater ? ` · ${p.water}′` : ''}
					</text>
				{/each}

				<text class="axis-x" x={w - M.right} y={height - 8}>round trip, minutes →</text>
				<text class="axis-y" transform="translate(12,{height - M.bottom}) rotate(-90)">
					minutes in the water →
				</text>
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if best}
			<p class="verdict">
				Best deal: <b>{shortName(best.pool.name)}</b> — {best.pool[mode]} min
				{MODE_LABEL[mode]} each way buys {best.water} minutes of water. That is
				<b>{best.net} minutes to the good</b>, in at {fmtClock(best.inWater)}.
			</p>
		{/if}
		<p class="key">
			{worthIt} of {points.length} pools sit above the line
			{mode === 'walk' ? 'on foot' : 'by bike'} — swap the mode and watch the cloud slide
			{mode === 'walk' ? 'left' : 'right'}. Points below it cost more legs than they give water.
			{#if overTop > 0}The axis stops at {maxWater} minutes; {overTop === 1
					? 'one pool runs'
					: `${overTop} pools run`} past the top and {overTop === 1 ? 'is' : 'are'} drawn as a
				triangle.{/if}
			Times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}.
		</p>
	</figcaption>
</figure>

<style>
	/* Field notebook: kraft paper, olive ink, ochre for the good news. */
	.panel {
		--paper: #f2ead8;
		--ink: #2f2a1d;
		--rule: #d3c7a9;
		--accent: #b3651a;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1rem;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.5rem;
	}
	.modes {
		display: inline-flex;
		gap: 1px;
		padding: 1px;
		border: 1px solid var(--rule);
		border-radius: 2px;
	}
	.modes button {
		border: 0;
		background: transparent;
		color: var(--ink);
		opacity: 0.6;
		padding: 0.3rem 0.75rem;
		font: 600 0.7rem/1.2 inherit;
		cursor: pointer;
	}
	.modes button.on {
		background: var(--ink);
		color: var(--paper);
		opacity: 1;
	}
	svg {
		display: block;
	}

	.poor {
		fill: #e2d5b7;
		opacity: 0.7;
	}
	.grid {
		stroke: #ddd0b1;
		stroke-width: 0.7;
	}
	.tick {
		font-size: 9px;
		fill: #8a7f63;
		text-anchor: middle;
	}
	.tick.left {
		text-anchor: end;
	}
	.diag {
		stroke: #6b6041;
		stroke-width: 1.2;
		stroke-dasharray: 5 3;
	}
	.diag-label {
		font-size: 8.5px;
		fill: #6b6041;
		letter-spacing: 0.04em;
	}
	.pt {
		fill: #4f5d2f;
		fill-opacity: 0.8;
		stroke: var(--paper);
		stroke-width: 1;
	}
	.pt.poorpt {
		fill: #a89c7c;
		fill-opacity: 0.75;
	}
	.pt.marked {
		fill: var(--accent);
		fill-opacity: 1;
		stroke: var(--paper);
		stroke-width: 1.5;
	}
	.pt.marked.second {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.mark-label {
		font-size: 10px;
		font-weight: 700;
		fill: var(--accent);
		paint-order: stroke;
		stroke: var(--paper);
		stroke-width: 3;
	}
	.mark-label.second {
		font-weight: 400;
	}
	.axis-x {
		font-size: 8.5px;
		fill: #8a7f63;
		text-anchor: end;
		letter-spacing: 0.06em;
	}
	.axis-y {
		font-size: 8.5px;
		fill: #8a7f63;
		letter-spacing: 0.06em;
	}
	.pt.over-top {
		fill: #4f5d2f;
		fill-opacity: 0.85;
		stroke: var(--paper);
		stroke-width: 1;
	}

	figcaption {
		margin-top: 0.6rem;
		font-size: 0.78rem;
		line-height: 1.55;
	}
	.verdict {
		margin: 0 0 0.3rem;
		font-family: 'Helvetica Neue', system-ui, sans-serif;
		font-size: 0.82rem;
	}
	.verdict b {
		color: #8a4a10;
	}
	.key {
		margin: 0;
		font-size: 0.68rem;
		color: #8a7f63;
	}
</style>
