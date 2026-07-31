<script>
	// 06 — YOUR POOL
	// The city cut into territories: every point in Toronto belongs to the pool
	// it is nearest to, and every territory is shaded by how long you'd wait
	// for water there. This is the choropleth argument — find yourself on the
	// map and the answer is the ground you're standing on — run over a
	// Dirichlet tessellation instead of wards, because a pool's catchment is
	// not a ward.
	import { geoMercator, geoPath } from 'd3-geo';
	import { Delaunay } from 'd3-delaunay';
	import { scaleSequentialSqrt } from 'd3-scale';
	import { interpolateYlGnBu } from 'd3-scale-chromatic';
	import { TORONTO_OUTLINE } from '$lib/geo/torontoOutline.js';
	import { fmtClock, fmtMinutes, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';
	import { onActivate } from './ui/activate.js';

	let { day, kind, setKind, origin, travelSource } = $props();

	const CITY = { type: 'Feature', geometry: TORONTO_OUTLINE, properties: {} };

	let w = $state(0);
	let picked = $state(null);

	const width = $derived(Math.max(240, Math.min(w || 0, 900)));
	// Toronto is a wide, shallow rectangle: 44 km across, 21 km deep.
	const height = $derived(Math.round(width * 0.52));

	const projection = $derived(
		geoMercator().fitExtent(
			[
				[6, 6],
				[width - 6, height - 6]
			],
			CITY
		)
	);
	const path = $derived(geoPath(projection));
	const cityPath = $derived(path(CITY));

	const sites = $derived(
		day.pools.filter((p) => p.placed && p.sessions.some((s) => !s.over))
	);

	const points = $derived(sites.map((p) => projection([p.lng, p.lat])));

	const cells = $derived.by(() => {
		if (points.length < 2) return [];
		const d = Delaunay.from(points);
		const v = d.voronoi([0, 0, width, height]);
		return sites.map((p, i) => ({ pool: p, d: v.renderCell(i) }));
	});

	const here = $derived(origin ? projection([origin.lng, origin.lat]) : null);

	// Which territory you are standing in — the answer, geometrically.
	const yours = $derived.by(() => {
		if (!here || !points.length) return null;
		let bestI = 0;
		let bestD = Infinity;
		points.forEach(([x, y], i) => {
			const dd = (x - here[0]) ** 2 + (y - here[1]) ** 2;
			if (dd < bestD) {
				bestD = dd;
				bestI = i;
			}
		});
		return sites[bestI];
	});

	const selected = $derived((picked ? sites.find((p) => p.id === picked) : null) ?? yours);
	const selectedSwim = $derived(
		selected ? (selected.sessions.find((s) => s.feasible) ?? selected.next) : null
	);

	// Shade: minutes from now until you could be in that pool's water. Square
	// rooted, because most of the city is waiting for the evening block and a
	// linear ramp paints two-thirds of Toronto the same navy.
	const colour = scaleSequentialSqrt(interpolateYlGnBu).domain([0, 420]).clamp(true);
	const wait = (p) => {
		const s = p.sessions.find((x) => x.feasible);
		return s ? s.inWater - day.nowMin : null;
	};

	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<span class="hint">Every point belongs to its nearest pool · tap a territory</span>
	</div>

	<div class="map" bind:clientWidth={w}>
		{#if w > 0 && cells.length}
			<svg
				{width}
				{height}
				viewBox="0 0 {width} {height}"
				role="img"
				aria-label="Toronto divided into {cells.length} pool territories, shaded by wait"
			>
				<defs>
					<clipPath id="yp-city"><path d={cityPath} /></clipPath>
				</defs>

				<path class="lake" d={cityPath} />

				<g clip-path="url(#yp-city)">
					{#each cells as c (c.pool.id)}
						{@const m = wait(c.pool)}
						<path
							class="cell"
							class:dry={m == null}
							class:on={selected && c.pool.id === selected.id}
							d={c.d}
							fill={m == null ? '#e7e5df' : colour(m)}
						/>
					{/each}
				</g>

				<path class="border" d={cityPath} />

				{#each cells as c (c.pool.id)}
					{@const pt = projection([c.pool.lng, c.pool.lat])}
					<circle class="site" class:on={selected && c.pool.id === selected.id} cx={pt[0]} cy={pt[1]} r="2" />
				{/each}

				{#if here}
					<g class="here" transform="translate({here[0]},{here[1]})">
						<circle class="here-halo" r="9" />
						<circle class="here-dot" r="3.5" />
					</g>
				{/if}

				{#if selected}
					{@const pt = projection([selected.lng, selected.lat])}
					<text
						class="label"
						x={pt[0]}
						y={pt[1] - 14}
						text-anchor={pt[0] > width - 110 ? 'end' : pt[0] < 110 ? 'start' : 'middle'}
					>
						{shortName(selected.name)}
					</text>
				{/if}

				{#each cells as c (c.pool.id)}
					<path
						class="hit"
						d={c.d}
						role="button"
						tabindex="0"
						aria-label={c.pool.name}
						onclick={() => (picked = c.pool.id)}
						onkeydown={onActivate(() => (picked = c.pool.id))}
					/>
				{/each}
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if selected && selectedSwim}
			<p class="verdict">
				{#if yours && selected.id === yours.id}<span class="tag">Your territory</span>{/if}
				<b>{shortName(selected.name)}</b> — {selected.travelMin} min {MODE_LABEL[selected.mode]} ·
				{fmtClock(selectedSwim.start_min)}–{fmtClock(selectedSwim.end_min)}
				{#if selectedSwim.feasible}
					· in the water by <b>{fmtClock(selectedSwim.inWater)}</b>, a
					{fmtMinutes(selectedSwim.inWater - day.nowMin)} wait
				{:else}
					· nothing here you could get {day.minSwim} minutes out of
				{/if}
			</p>
		{/if}
		<p class="key">
			<span class="ramp"></span>
			<span>in the water now → in seven hours</span> ·
			<span class="sw dry"></span> nothing you could make · {cells.length} territories · times
			{travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Survey drawing: warm paper, hairline ink, one red survey peg for you. */
	.panel {
		--paper: #faf8f3;
		--ink: #23211d;
		--rule: #cbc6ba;
		--accent: #cc3d2e;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 0.5rem 1.1rem;
		border-top: 1px solid #e3ded2;
		border-bottom: 1px solid #e3ded2;
		font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	}
	/* Toronto is 44 km across and 21 deep, so on a phone every pixel of width
	   is a pixel of map. The prose gets the padding back. */
	.toolbar,
	figcaption {
		padding: 0 0.5rem;
	}
	@media (min-width: 34rem) {
		.panel {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.toolbar,
		figcaption {
			padding: 0;
		}
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.55rem;
	}
	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #8c8578;
	}
	.map {
		display: flex;
		justify-content: center;
	}
	svg {
		display: block;
	}

	.lake {
		fill: #eeeae0;
	}
	.cell {
		stroke: #faf8f3;
		stroke-width: 0.7;
	}
	.cell.on {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.border {
		fill: none;
		stroke: #23211d;
		stroke-width: 1;
	}
	.site {
		fill: #23211d;
		opacity: 0.55;
	}
	.site.on {
		fill: var(--accent);
		opacity: 1;
	}
	.here-halo {
		fill: var(--accent);
		opacity: 0.2;
	}
	.here-dot {
		fill: var(--accent);
		stroke: #fff;
		stroke-width: 1.2;
	}
	.label {
		font-size: 11px;
		font-weight: 700;
		fill: #23211d;
		paint-order: stroke;
		stroke: #faf8f3;
		stroke-width: 3;
	}
	.hit {
		fill: transparent;
		cursor: pointer;
	}

	figcaption {
		margin-top: 0.65rem;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.3rem;
	}
	.verdict b {
		color: #7a1f16;
	}
	.tag {
		display: inline-block;
		background: var(--accent);
		color: #fff;
		font-size: 0.6rem;
		font-family: 'Helvetica Neue', system-ui, sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.1rem 0.35rem;
		border-radius: 2px;
		margin-right: 0.3rem;
		vertical-align: 1px;
	}
	.key {
		margin: 0;
		font-size: 0.68rem;
		color: #8c8578;
	}
	.ramp {
		display: inline-block;
		width: 66px;
		height: 8px;
		background: linear-gradient(90deg, #ffffd9, #7fcdbb, #225ea8, #081d58);
		margin-right: 3px;
	}
	.sw.dry {
		display: inline-block;
		width: 12px;
		height: 8px;
		background: #e7e5df;
		border: 1px solid #cbc6ba;
		margin-right: 2px;
	}
</style>
