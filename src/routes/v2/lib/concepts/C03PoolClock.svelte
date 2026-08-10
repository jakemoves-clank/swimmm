<script>
	// 03 — THE POOL CLOCK
	// A 24-hour dial: midnight at the top, noon at the bottom, one ring per
	// pool with the nearest on the inside. The hand is now. Ahead of it each
	// ring carries a wedge as long as that pool's journey — so the wedges'
	// leading edge sweeps outward into a curve, and any swim arc still clear
	// of that curve is a swim you can get to.
	import { arc } from 'd3-shape';
	import { fmtClock, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';
	import { onActivate } from './ui/activate.js';

	let { day, kind, setKind, travelSource } = $props();

	const RINGS = 16;
	const TAU = Math.PI * 2;
	const angle = (min) => (min / 1440) * TAU;

	let w = $state(0);
	let picked = $state(null);

	const size = $derived(Math.max(240, Math.min(w || 0, 540)));
	const R = $derived(size / 2 - 30);
	const R0 = $derived(R * 0.3);

	const reachable = $derived(
		day.pools.filter((p) => p.travelMin != null && p.sessions.some((s) => !s.over))
	);
	const rings = $derived(reachable.slice(0, RINGS));
	const hidden = $derived(reachable.length - rings.length);

	const band = $derived(rings.length ? (R - R0) / rings.length : 0);
	const radius = (i) => R0 + band * (i + 0.5);
	const thick = $derived(Math.max(3, band * 0.62));

	const ring = $derived(
		arc()
			.innerRadius((d) => radius(d.i) - thick / 2)
			.outerRadius((d) => radius(d.i) + thick / 2)
			.startAngle((d) => angle(d.from))
			.endAngle((d) => angle(d.to))
	);

	const best = $derived.by(() => {
		let out = null;
		for (const s of day.feasible) {
			if (
				!out ||
				s.inWater < out.inWater ||
				(s.inWater === out.inWater && s.travelMin < out.travelMin)
			)
				out = s;
		}
		return out;
	});
	const selected = $derived(picked ?? (best ? rings.find((p) => p.id === best.poolId) : null));
	const selectedSwim = $derived(
		selected ? (selected.sessions.find((s) => s.feasible) ?? selected.next) : null
	);

	// Where each ring's wedge ends: the frontier of "you have arrived". It
	// curves outward because the far rings take longer to reach — the single
	// most useful line on the dial.
	const frontierPath = $derived.by(() => {
		if (!rings.length) return '';
		const pts = [[Math.sin(angle(day.nowMin)) * R0, -Math.cos(angle(day.nowMin)) * R0]];
		rings.forEach((p, i) => {
			const a = angle(Math.min(1440, day.nowMin + p.travelMin));
			const r = radius(i);
			pts.push([Math.sin(a) * r, -Math.cos(a) * r]);
		});
		return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
	});

	const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
	const label = (h) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);
	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre|Pool)$/i, '');
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<span class="hint">Innermost ring = nearest pool · tap a ring</span>
	</div>

	<div class="dial" bind:clientWidth={w}>
		{#if w > 0 && rings.length}
			<svg
				width={size}
				height={size}
				viewBox="{-size / 2} {-size / 2} {size} {size}"
				role="img"
				aria-label="24-hour dial of {rings.length} pools, nearest on the inside"
			>
				<circle class="face" r={R + 14} />

				{#each HOURS as h (h)}
					{@const a = angle(h * 60)}
					<line
						class="spoke"
						x1={Math.sin(a) * R0}
						y1={-Math.cos(a) * R0}
						x2={Math.sin(a) * (R + 8)}
						y2={-Math.cos(a) * (R + 8)}
					/>
					<text class="hour" x={Math.sin(a) * (R + 21)} y={-Math.cos(a) * (R + 21) + 3.5}>
						{label(h)}
					</text>
				{/each}

				{#each rings as p, i (p.id)}
					<circle class="track" r={radius(i)} stroke-width={thick} />
				{/each}

				{#each rings as p, i (p.id)}
					{#each p.sessions as s (s.course_id + '-' + s.start_min)}
						<path
							class="swim"
							class:over={s.over}
							class:missed={!s.over && !s.feasible}
							class:live={s.inProgress}
							d={ring({ i, from: s.start_min, to: s.end_min })}
						/>
					{/each}
				{/each}

				{#each rings as p, i (p.id)}
					<path
						class="wedge"
						d={ring({ i, from: day.nowMin, to: Math.min(1440, day.nowMin + p.travelMin) })}
					/>
				{/each}
				<path class="frontier" d={frontierPath} />

				{#if selected}
					<circle class="halo" r={radius(rings.indexOf(selected))} stroke-width={thick + 5} />
				{/if}

				<line
					class="hand"
					x1="0"
					y1="0"
					x2={Math.sin(angle(day.nowMin)) * (R + 6)}
					y2={-Math.cos(angle(day.nowMin)) * (R + 6)}
				/>
				<circle class="hub" r="3.5" />

				{#each rings as p, i (p.id)}
					<circle
						class="hit"
						r={radius(i)}
						stroke-width={Math.max(band, 9)}
						role="button"
						tabindex="0"
						aria-label="{p.name}, {p.travelMin} minutes away"
						onclick={() => (picked = p)}
						onkeydown={onActivate(() => (picked = p))}
					/>
				{/each}

				<text class="centre-time" y="-1">{fmtClock(day.nowMin)}</text>
				<text class="centre-label" y="11">now</text>
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if selected && selectedSwim}
			<p class="verdict">
				<b>{shortName(selected.name)}</b> — ring {rings.indexOf(selected) + 1} of {rings.length},
				{selected.travelMin} min {MODE_LABEL[selected.mode]} ·
				{fmtClock(selectedSwim.start_min)}–{fmtClock(selectedSwim.end_min)}
				{#if selectedSwim.feasible}
					· in the water by <b>{fmtClock(selectedSwim.inWater)}</b>
				{:else}
					· the wedge has already swept past it
				{/if}
			</p>
		{:else}
			<p class="verdict">Nothing left today you could reach in time.</p>
		{/if}
		<p class="key">
			<span class="sw swim-key"></span> swim ·
			<span class="sw live-key"></span> open now ·
			<span class="sw wedge-key"></span> your journey ·
			<span class="sw over-key"></span> gone
			{#if hidden > 0}· {hidden} pools beyond the outermost ring{/if}
			· times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Night dial: navy enamel, chalk numerals, one brass hand. */
	.panel {
		--paper: #0e1520;
		--ink: #e8e4d9;
		--rule: #26344a;
		--accent: #d7a537;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1.1rem;
		font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.5rem;
	}
	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.45;
	}
	.dial {
		display: flex;
		justify-content: center;
	}
	svg {
		display: block;
		overflow: visible;
	}

	.face {
		fill: #0a1018;
		stroke: #1c2838;
		stroke-width: 1;
	}
	.spoke {
		stroke: #26344a;
		stroke-width: 0.8;
	}
	.hour {
		font-size: 9.5px;
		fill: #7d8ba0;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.track {
		fill: none;
		stroke: #17222f;
	}
	.swim {
		fill: #4fb3c8;
	}
	.swim.live {
		fill: #74e3c2;
	}
	.swim.missed {
		fill: #365a6c;
	}
	.swim.over {
		fill: #26394c;
	}
	.wedge {
		fill: var(--accent);
		opacity: 0.5;
	}
	.frontier {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.2;
		stroke-dasharray: 3 2.5;
		opacity: 0.9;
	}
	.halo {
		fill: none;
		stroke: #e8e4d9;
		stroke-opacity: 0.16;
	}
	.hand {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.hub {
		fill: var(--accent);
	}
	.hit {
		fill: none;
		stroke: transparent;
		cursor: pointer;
	}
	.centre-time {
		font-size: 13px;
		fill: var(--ink);
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.centre-label {
		font-size: 7.5px;
		fill: #7d8ba0;
		text-anchor: middle;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	figcaption {
		margin-top: 0.7rem;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.3rem;
	}
	.verdict b {
		color: var(--accent);
	}
	.key {
		margin: 0;
		font-size: 0.7rem;
		opacity: 0.5;
	}
	.sw {
		display: inline-block;
		width: 13px;
		height: 7px;
		border-radius: 2px;
		margin-right: 2px;
	}
	.swim-key {
		background: #4fb3c8;
	}
	.live-key {
		background: #74e3c2;
	}
	.wedge-key {
		background: #d7a537;
		opacity: 0.6;
	}
	.over-key {
		background: #26394c;
	}
</style>
