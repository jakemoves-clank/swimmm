<script>
	// 09 — SOONEST SPLASH
	// One axis, one question. "Closest" and "soonest" are not two facts to be
	// weighed against each other — they resolve into a single number, the
	// minute you could be in the water, and that number has an axis. Each pool
	// is a dot at its own answer; the leftmost dot wins. Size is how long you'd
	// get once you're in, so a big dot on the left is the whole story.
	import { scaleLinear } from 'd3-scale';
	import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force';
	import { fmtClock, fmtHour, MODE_LABEL, SWIM_SCALE_CAP } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const M = { top: 18, right: 18, bottom: 34, left: 18 };
	const BANDS = [
		[10, '#12354f', 'under 10 min away'],
		[20, '#33718f', '10–20'],
		[35, '#77a7bd', '20–35'],
		[Infinity, '#adc8d6', 'over 35']
	];

	let w = $state(0);

	const height = $derived(w < 560 ? 210 : 250);

	const candidates = $derived(
		day.pools
			.filter((p) => p.travelMin != null)
			.map((p) => {
				const s = p.sessions.find((x) => x.feasible);
				return s ? { pool: p, swim: s } : null;
			})
			.filter(Boolean)
	);

	const domain = $derived.by(() => {
		const last = candidates.length ? Math.max(...candidates.map((c) => c.swim.inWater)) : day.nowMin + 120;
		return [day.nowMin, Math.max(day.nowMin + 60, Math.ceil(last / 30) * 30)];
	});
	const x = $derived(
		scaleLinear().domain(domain).range([M.left, Math.max(M.left + 1, w - M.right)])
	);
	const r = $derived(
		scaleLinear()
			.domain([0, SWIM_SCALE_CAP])
			.range([3, w < 560 ? 9 : 12])
			.clamp(true)
	);
	const band = (min) => BANDS.find(([hi]) => min < hi)[1];

	const ticks = $derived.by(() => {
		const step = domain[1] - domain[0] > 240 ? 60 : 30;
		const out = [];
		for (let t = Math.ceil(domain[0] / step) * step; t <= domain[1]; t += step) out.push(t);
		return out;
	});

	// A beeswarm has to solve its collisions before anything can be drawn, so
	// the simulation is run to completion here rather than animated. It needs
	// no DOM, so it derives like any other value — no effect, no ordering.
	const nodes = $derived.by(() => {
		if (!w || !candidates.length) return [];
		const mid = M.top + (height - M.top - M.bottom) * 0.46;
		const sim = forceSimulation(candidates.map((c) => ({ ...c, x: x(c.swim.inWater), y: mid })))
			.force('x', forceX((d) => x(d.swim.inWater)).strength(1))
			.force('y', forceY(mid).strength(0.06))
			.force(
				'collide',
				forceCollide((d) => r(d.swim.swimMin) + 1.2).iterations(3)
			)
			.stop();
		for (let i = 0; i < 180; i++) sim.tick();
		return sim.nodes();
	});

	const best = $derived.by(() => {
		let out = null;
		for (const c of candidates) {
			if (
				!out ||
				c.swim.inWater < out.swim.inWater ||
				(c.swim.inWater === out.swim.inWater && c.pool.travelMin < out.pool.travelMin)
			)
				out = c;
		}
		return out;
	});
	const leaders = $derived(
		[...candidates].sort((a, b) => a.swim.inWater - b.swim.inWater).slice(0, 3)
	);
	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<span class="hint">Leftmost wins · dot size = minutes you’d get</span>
	</div>

	<div class="swarm" bind:clientWidth={w}>
		{#if w > 0 && nodes.length}
			<svg
				width={w}
				{height}
				viewBox="0 0 {w} {height}"
				role="img"
				aria-label="{nodes.length} pools placed by the minute you could be in the water"
			>
				{#each ticks as t (t)}
					<line class="rule" x1={x(t)} y1={M.top} x2={x(t)} y2={height - M.bottom} />
					<text class="tick" x={x(t)} y={height - 16}>
						{fmtHour(t)}{#if t === ticks[0] || t % 720 === 0}<tspan class="ampm"
								>{t % 1440 < 720 ? 'am' : 'pm'}</tspan
							>{/if}
					</text>
				{/each}

				<line class="axis" x1={M.left} y1={height - M.bottom} x2={w - M.right} y2={height - M.bottom} />
				<text class="axis-label" x={M.left} y={height - 3}>the minute you could be swimming →</text>

				{#each nodes as n (n.pool.id)}
					<circle
						class="dot"
						class:best={best && n.pool.id === best.pool.id}
						cx={n.x}
						cy={n.y}
						r={r(n.swim.swimMin)}
						fill={band(n.pool.travelMin)}
					>
						<title>{n.pool.name} — in at {fmtClock(n.swim.inWater)}, {n.swim.swimMin} min</title>
					</circle>
				{/each}

				{#if best}
					{@const bn = nodes.find((n) => n.pool.id === best.pool.id)}
					{#if bn}
						<line class="lead" x1={bn.x} y1={bn.y - r(bn.swim.swimMin) - 3} x2={bn.x} y2={M.top + 8} />
						<text class="lead-label" x={bn.x + 5} y={M.top + 10}>
							{shortName(best.pool.name)} · {fmtClock(best.swim.inWater)}
						</text>
					{/if}
				{/if}
			</svg>
		{:else if w > 0}
			<p class="empty">No swim left today you could get {day.minSwim} minutes out of.</p>
		{/if}
	</div>

	<figcaption>
		{#if leaders.length}
			<ol class="podium">
				{#each leaders as l, i (l.pool.id)}
					<li>
						<span class="rank">{i + 1}</span>
						<span class="who"><b>{shortName(l.pool.name)}</b>
							<em>{l.pool.travelMin} min {MODE_LABEL[l.pool.mode]}</em></span
						>
						<span class="when">in at <b>{fmtClock(l.swim.inWater)}</b><em>{l.swim.swimMin} min of swim</em></span>
					</li>
				{/each}
			</ol>
		{/if}
		<p class="key">
			{#each BANDS as [, colour, label] (label)}
				<span class="sw" style="background:{colour}"></span>{label}{' '}
			{/each}
			· {candidates.length} pools you could still make · dots stop growing at
			{SWIM_SCALE_CAP} min · times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Poster-plain: warm paper, one blue ramp, no rules you don't need. */
	.panel {
		--paper: #fffdf8;
		--ink: #14181c;
		--rule: #e3ded3;
		--accent: #e0533b;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1rem;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-family: 'Helvetica Neue', Inter, system-ui, sans-serif;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.3rem;
	}
	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #9a9385;
	}
	svg {
		display: block;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
		color: #9a9385;
	}

	.rule {
		stroke: #efe9dd;
		stroke-width: 1;
	}
	.axis {
		stroke: var(--ink);
		stroke-width: 1;
	}
	.tick {
		font-size: 10px;
		fill: #9a9385;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.ampm {
		font-size: 7.5px;
	}
	.axis-label {
		font-size: 9px;
		fill: #9a9385;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.dot {
		stroke: #fffdf8;
		stroke-width: 1;
	}
	.dot.best {
		stroke: var(--accent);
		stroke-width: 2.5;
	}
	.lead {
		stroke: var(--accent);
		stroke-width: 1;
	}
	.lead-label {
		font-size: 11px;
		font-weight: 700;
		fill: var(--accent);
	}

	figcaption {
		margin-top: 0.4rem;
	}
	.podium {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	@media (min-width: 44rem) {
		.podium {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
		}
	}
	.podium li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		background: #f7f2e7;
		border-radius: 3px;
		font-size: 0.78rem;
	}
	.podium li:first-child {
		background: #fdeae4;
	}
	.rank {
		font-weight: 700;
		color: #b9b0a0;
		font-variant-numeric: tabular-nums;
	}
	.who,
	.when {
		min-width: 0;
	}
	.who b,
	.when b {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		text-align: right;
		white-space: nowrap;
	}
	.who em,
	.when em {
		display: block;
		font-style: normal;
		font-size: 0.66rem;
		color: #9a9385;
	}
	.key {
		margin: 0;
		font-size: 0.68rem;
		color: #9a9385;
	}
	.sw {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		margin: 0 3px 0 6px;
		vertical-align: -1px;
	}
</style>
