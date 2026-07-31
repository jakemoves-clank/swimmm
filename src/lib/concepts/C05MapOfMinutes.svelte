<script>
	// 05 — A MAP OF MINUTES
	// Toronto redrawn so that distance from the centre is not kilometres but
	// minutes. Every pool keeps its true compass bearing from you; only the
	// radius is rewritten. Switch from walking to cycling and the whole city
	// contracts towards you — which is exactly what a bicycle does to a city,
	// and which no ordinary map will ever show you.
	import { interpolateYlGnBu } from 'd3-scale-chromatic';
	import { fmtClock, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const RINGS = [10, 20, 30, 40, 50, 60];
	const MAX = 62;
	const COMPASS = [
		['N', 0],
		['E', 90],
		['S', 180],
		['W', 270]
	];

	let w = $state(0);
	let mode = $state('bike');
	let picked = $state(null);

	const size = $derived(Math.max(260, Math.min(w || 0, 560)));
	const R = $derived(size / 2 - 26);
	const scale = $derived((min) => (Math.min(min, MAX) / MAX) * R);

	// Pools with something left today and a place on the earth.
	const dots = $derived.by(() =>
		day.pools
			.filter((p) => p.bearing != null && p[mode] != null && p.sessions.some((s) => !s.over))
			.map((p) => {
				const next = p.sessions.find((s) => !s.over);
				const arrive = day.nowMin + p[mode];
				const catchable = p.sessions.find(
					(s) => !s.over && s.end_min - Math.max(arrive, s.start_min) >= day.minSwim
				);
				const inWater = catchable ? Math.max(arrive, catchable.start_min) : null;
				const a = ((p.bearing - 90) * Math.PI) / 180;
				const r = scale(p[mode]);
				return {
					pool: p,
					next,
					catchable,
					inWater,
					wait: inWater == null ? null : inWater - day.nowMin,
					off: p[mode] > MAX,
					x: Math.cos(a) * r,
					y: Math.sin(a) * r
				};
			})
	);

	// Pale where you'd be swimming soon, deeper where you'd be waiting — but
	// stopped well short of the ramp's black end, which would disappear into
	// this background, and square-rooted so the first useful hour gets most of
	// the range instead of most pools landing on the same dark blue.
	const colour = (min) =>
		interpolateYlGnBu(0.05 + 0.72 * Math.sqrt(Math.min(min, 240) / 240));

	const best = $derived.by(() => {
		let out = null;
		for (const d of dots) {
			if (d.wait == null) continue;
			if (!out || d.wait < out.wait || (d.wait === out.wait && d.pool[mode] < out.pool[mode]))
				out = d;
		}
		return out;
	});
	const selected = $derived((picked ? dots.find((d) => d.pool.id === picked) : null) ?? best);
	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
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

	<div class="map" bind:clientWidth={w}>
		{#if w > 0}
			<svg
				width={size}
				height={size}
				viewBox="{-size / 2} {-size / 2} {size} {size}"
				role="img"
				aria-label="Radial map: {dots.length} pools placed by compass bearing and travel minutes"
			>
				<defs>
					<radialGradient id="mm-glow">
						<stop offset="0%" stop-color="#1a3a4a" stop-opacity="0.9" />
						<stop offset="100%" stop-color="#0b1a24" stop-opacity="0" />
					</radialGradient>
				</defs>
				<circle r={R} fill="url(#mm-glow)" />

				{#each RINGS as t (t)}
					<circle class="ring" r={scale(t)} />
					<text class="ringlabel" x="3" y={-scale(t) - 3}>{t}′</text>
				{/each}

				{#each COMPASS as [letter, deg] (letter)}
					{@const a = ((deg - 90) * Math.PI) / 180}
					<line
						class="spoke"
						x1={Math.cos(a) * 14}
						y1={Math.sin(a) * 14}
						x2={Math.cos(a) * R}
						y2={Math.sin(a) * R}
					/>
					<text class="compass" x={Math.cos(a) * (R + 14)} y={Math.sin(a) * (R + 14) + 4}>
						{letter}
					</text>
				{/each}

				{#each dots as d (d.pool.id)}
					<g class="dot" class:off={d.off} transform="translate({d.x},{d.y})">
						<circle
							class="mark"
							class:dead={d.wait == null}
							r={d.pool.id === selected?.pool.id ? 7 : 4.5}
							fill={d.wait == null ? '#33455a' : colour(d.wait)}
						/>
						{#if d.pool.id === selected?.pool.id}
							<circle class="halo" r="11" />
						{/if}
					</g>
				{/each}

				{#each dots as d (d.pool.id)}
					<circle
						class="hit"
						cx={d.x}
						cy={d.y}
						r="11"
						role="button"
						tabindex="0"
						aria-label="{d.pool.name}, {d.pool[mode]} minutes {mode === 'walk' ? 'on foot' : 'by bike'}"
						onclick={() => (picked = d.pool.id)}
						onkeydown={(e) => e.key === 'Enter' && (picked = d.pool.id)}
					/>
				{/each}

				<circle class="you" r="4" />
				<!-- below the origin, where the lake is and nothing can collide -->
				<text class="youlabel" y="17">you</text>
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if selected}
			<p class="verdict">
				<b>{shortName(selected.pool.name)}</b> — {selected.pool[mode]} min {MODE_LABEL[mode]},
				{#if selected.catchable}
					in the water by <b>{fmtClock(selected.inWater)}</b> ({selected.wait} min from now)
				{:else}
					nothing left there you could get {day.minSwim} minutes out of
				{/if}
			</p>
		{/if}
		<p class="key">
			<span class="ramp"></span>
			<span class="ends">in the water now → in four hours</span> ·
			<span class="sw dead"></span> can’t make it · {dots.length} pools. Bearings are true, so
			an empty quadrant is real: from here that is the lake. Faded dots on the rim are further
			than an hour. Times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}.
		</p>
	</figcaption>
</figure>

<style>
	/* A chart room at night: everything is measured from you and glows. */
	.panel {
		--paper: #081218;
		--ink: #d9e6ec;
		--rule: #1e3442;
		--accent: #ffd166;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1.1rem;
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
		border-radius: 999px;
	}
	.modes button {
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--ink);
		opacity: 0.55;
		padding: 0.3rem 0.8rem;
		font: 600 0.7rem/1.2 inherit;
		cursor: pointer;
	}
	.modes button.on {
		background: var(--accent);
		color: #081218;
		opacity: 1;
	}
	.map {
		display: flex;
		justify-content: center;
	}
	svg {
		display: block;
		overflow: visible;
	}

	.ring {
		fill: none;
		stroke: #1e3442;
		stroke-width: 0.8;
	}
	.ringlabel {
		font-size: 8.5px;
		fill: #557084;
	}
	.spoke {
		stroke: #162a36;
		stroke-width: 0.8;
	}
	.compass {
		font-size: 10px;
		fill: #6d8798;
		text-anchor: middle;
	}
	/* The whole point of the mode switch: watch the city move. */
	.dot {
		transition: transform 700ms cubic-bezier(0.33, 1, 0.68, 1);
	}
	.dot.off {
		opacity: 0.35;
	}
	.mark {
		stroke: #081218;
		stroke-width: 1;
		transition: r 250ms ease;
	}
	.mark.dead {
		opacity: 0.55;
	}
	.halo {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.4;
	}
	.hit {
		fill: transparent;
		cursor: pointer;
	}
	.you {
		fill: var(--accent);
	}
	.youlabel {
		font-size: 8px;
		fill: var(--accent);
		text-anchor: middle;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	figcaption {
		margin-top: 0.7rem;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.3rem;
		font-family: 'Helvetica Neue', system-ui, sans-serif;
		font-size: 0.82rem;
	}
	.verdict b {
		color: var(--accent);
	}
	.key {
		margin: 0;
		font-size: 0.66rem;
		color: #6d8798;
	}
	.ramp {
		display: inline-block;
		width: 66px;
		height: 8px;
		vertical-align: 0;
		background: linear-gradient(90deg, #f3f9c0, #a4dcb6, #41b6c4, #245ea8);
	}
	.ends {
		letter-spacing: 0.01em;
	}
	.sw.dead {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #33455a;
		margin-right: 2px;
	}
</style>
