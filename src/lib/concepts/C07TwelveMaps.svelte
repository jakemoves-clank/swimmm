<script>
	// 07 — THE DAY IN TWELVE MAPS
	// Small multiples, Tufte's "at the heart of visual reasoning": the same
	// city, the same projection, the same scale, twelve times, so that the
	// only thing that varies is the one thing under study. Nothing to press.
	// Read left to right and the day's shape appears — a dense downtown
	// morning, a thin afternoon, an evening that spreads north and east.
	import { geoMercator, geoPath } from 'd3-geo';
	import { TORONTO_OUTLINE } from '$lib/geo/torontoOutline.js';
	import { fmtHour } from './model.js';

	let { day, kind, origin } = $props();

	const CITY = { type: 'Feature', geometry: TORONTO_OUTLINE, properties: {} };
	const START = 360; // 6 a.m.
	const SLICE = 90; // an hour and a half apiece
	const N = 12;

	let w = $state(0);

	const GAP = 10; // must match the grid's column-gap
	const CHROME = 8; // each cell's own 3 px padding + 1 px border, both sides

	const cols = $derived(w < 400 ? 2 : w < 620 ? 3 : 4);
	const cellW = $derived(
		Math.max(70, Math.floor(((w || 320) - (cols - 1) * GAP - cols * CHROME) / cols))
	);
	const cellH = $derived(Math.round(cellW * 0.52));

	const projection = $derived(
		geoMercator().fitExtent(
			[
				[2, 2],
				[cellW - 2, cellH - 2]
			],
			CITY
		)
	);
	const path = $derived(geoPath(projection));
	const cityPath = $derived(path(CITY));
	const here = $derived(origin ? projection([origin.lng, origin.lat]) : null);

	const placed = $derived(day.pools.filter((p) => p.placed));

	const slices = $derived.by(() =>
		Array.from({ length: N }, (_, i) => {
			const from = START + i * SLICE;
			const to = from + SLICE;
			const open = placed
				.filter((p) => p.sessions.some((s) => s.start_min < to && s.end_min > from))
				.map((p) => ({ id: p.id, xy: projection([p.lng, p.lat]) }));
			return { from, to, open, present: day.nowMin >= from && day.nowMin < to };
		})
	);

	const busiest = $derived(
		slices.reduce((a, b) => (b.open.length > a.open.length ? b : a), slices[0])
	);

	// The day wraps past noon, so a "6–7:30" range appears twice and the reader
	// cannot tell the morning panel from the evening one. Each panel is the same
	// ninety minutes wide, so the start alone — with its meridiem — says it all.
	const slot = (min) => {
		const m = ((min % 1440) + 1440) % 1440;
		return `${fmtHour(m)}${m < 720 ? 'a' : 'p'}`;
	};
</script>

<figure class="panel">
	<header class="head">
		<h3>Where the water is, hour by hour</h3>
		<p>
			{kind === 'lane' ? 'Lane' : 'Leisure'} swim from six in the morning, each panel covering
			the ninety minutes that follow its label. One dot is one pool with water in it during that
			slice; the cross is you. Busiest: <b>{slot(busiest.from)}</b>, {busiest.open.length} pools.
		</p>
	</header>

	<div class="grid" bind:clientWidth={w} style="grid-template-columns:repeat({cols},1fr)">
		{#if w > 0}
			{#each slices as s (s.from)}
				<figure class="cell" class:present={s.present}>
					<svg
						width={cellW}
						height={cellH}
						viewBox="0 0 {cellW} {cellH}"
						role="img"
						aria-label="{slot(s.from)} to {slot(s.to)}: {s.open.length} pools open"
					>
						<path class="city" d={cityPath} />
						{#each s.open as o (o.id)}
							<circle class="pool" cx={o.xy[0]} cy={o.xy[1]} r="1.9" />
						{/each}
						{#if here}
							<path
								class="you"
								d="M{here[0] - 3.5},{here[1]}H{here[0] + 3.5}M{here[0]},{here[1] -
									3.5}V{here[1] + 3.5}"
							/>
						{/if}
					</svg>
					<figcaption>
						<span class="when">{slot(s.from)}</span>
						<span class="count">{s.open.length}</span>
					</figcaption>
				</figure>
			{/each}
		{/if}
	</div>

	<p class="key">
		Same projection, same scale, same ink in all twelve — only the dots move. The framed panel is
		the slice you are living in. {placed.length} pools run
		{kind === 'lane' ? 'lane' : 'leisure'} swim today.
	</p>
</figure>

<style>
	/* Newspaper graphic: grey stock, black rule, red for now. Nothing else. */
	.panel {
		--paper: #f2f2ef;
		--ink: #1a1a18;
		--accent: #c02328;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 1rem;
		font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	}
	.head {
		border-bottom: 1.5px solid var(--ink);
		padding-bottom: 0.5rem;
		margin-bottom: 0.8rem;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
	}
	.head p {
		margin: 0.25rem 0 0;
		font-size: 0.78rem;
		color: #55534d;
		max-width: 44rem;
		line-height: 1.5;
	}
	.grid {
		display: grid;
		gap: 0.65rem 0.6rem;
	}
	.cell {
		margin: 0;
		padding: 3px;
		border: 1px solid transparent;
	}
	.cell.present {
		border-color: var(--accent);
		background: #fff;
	}
	svg {
		display: block;
	}
	.city {
		fill: #e2e1dc;
		stroke: #b9b7b0;
		stroke-width: 0.5;
	}
	.pool {
		fill: #1a1a18;
	}
	.you {
		stroke: var(--accent);
		stroke-width: 1.1;
	}
	.cell figcaption {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 1px;
		font-size: 0.66rem;
		color: #6d6a63;
		font-variant-numeric: tabular-nums;
	}
	.cell.present figcaption {
		color: var(--accent);
		font-weight: 700;
	}
	.count {
		font-weight: 700;
		color: #1a1a18;
	}
	.cell.present .count {
		color: var(--accent);
	}
	.key {
		margin: 0.9rem 0 0;
		padding-top: 0.5rem;
		border-top: 1px solid #d5d3cd;
		font-size: 0.7rem;
		color: #6d6a63;
		line-height: 1.5;
	}
</style>
