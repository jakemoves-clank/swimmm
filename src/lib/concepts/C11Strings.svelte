<script>
	// 11 — STRINGS
	// A nomogram: three scales side by side and one thread per pool crossing
	// them. Every axis is turned the same way up — best at the top — so the
	// reading rule is a single sentence: the string that stays high all the way
	// across is the swim to take. The threads that cross are the trade-offs
	// (near but late, far but long), and you can see them cross.
	import { scaleLinear } from 'd3-scale';
	import { fmtClock, MODE_LABEL, SWIM_SCALE_CAP } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const M = { top: 46, right: 20, bottom: 42, left: 20 };

	let w = $state(0);
	let picked = $state(null);

	const height = $derived(w < 560 ? 340 : 420);

	const threads = $derived.by(() =>
		day.pools
			.filter((p) => p.travelMin != null)
			.map((p) => {
				const s = p.sessions.find((x) => x.feasible);
				return s ? { pool: p, swim: s } : null;
			})
			.filter(Boolean)
	);

	const maxAway = $derived(Math.max(20, ...threads.map((t) => t.pool.travelMin)));
	const lastIn = $derived(Math.max(day.nowMin + 60, ...threads.map((t) => t.swim.inWater)));
	// Capped and clamped: one eight-hour outdoor block would otherwise squash
	// every ordinary forty-five-minute swim into the bottom inch of the axis.
	const maxSwim = $derived(
		Math.min(SWIM_SCALE_CAP, Math.max(45, ...threads.map((t) => t.swim.swimMin)))
	);

	// Every axis best-at-the-top, so "good" is one shape and not three.
	const yAway = $derived(scaleLinear().domain([0, maxAway]).range([M.top, height - M.bottom]));
	const yWhen = $derived(
		scaleLinear().domain([day.nowMin, lastIn]).range([M.top, height - M.bottom])
	);
	const ySwim = $derived(
		scaleLinear().domain([maxSwim, 0]).range([M.top, height - M.bottom]).clamp(true)
	);

	const cols = $derived([M.left + 26, w / 2, w - M.right - 26]);

	const best = $derived.by(() => {
		let out = null;
		for (const t of threads) {
			if (
				!out ||
				t.swim.inWater < out.swim.inWater ||
				(t.swim.inWater === out.swim.inWater && t.pool.travelMin < out.pool.travelMin)
			)
				out = t;
		}
		return out;
	});
	const selected = $derived((picked ? threads.find((t) => t.pool.id === picked) : null) ?? best);

	const line = (t) =>
		`M${cols[0]},${yAway(t.pool.travelMin)}L${cols[1]},${yWhen(t.swim.inWater)}L${cols[2]},${ySwim(t.swim.swimMin)}`;

	const awayTicks = $derived(yAway.ticks(6));
	const whenTicks = $derived.by(() => {
		const out = [];
		for (let t = Math.ceil(day.nowMin / 30) * 30; t <= lastIn; t += 30) out.push(t);
		return out.length > 8 ? out.filter((_, i) => i % 2 === 0) : out;
	});
	const swimTicks = $derived(ySwim.ticks(6));

	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<span class="hint">High and flat is good · tap a string</span>
	</div>

	<div class="chart" bind:clientWidth={w}>
		{#if w > 0 && threads.length}
			<svg
				width={w}
				{height}
				viewBox="0 0 {w} {height}"
				role="img"
				aria-label="Parallel-coordinates nomogram of {threads.length} pools"
			>
				{#each ['How far', 'You’re in at', 'How long'] as label, i (label)}
					<line class="axis" x1={cols[i]} y1={M.top} x2={cols[i]} y2={height - M.bottom} />
					<text
						class="axis-title"
						x={cols[i]}
						y={M.top - 22}
						text-anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
					>
						{label}
					</text>
					<text
						class="axis-good"
						x={cols[i]}
						y={M.top - 10}
						text-anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
					>
						{['nearest', 'soonest', 'longest'][i]} ↑
					</text>
				{/each}

				{#each awayTicks as t (t)}
					<text class="tick" x={cols[0] - 6} y={yAway(t) + 3.5} text-anchor="end">{t}′</text>
					<line class="tickline" x1={cols[0] - 3} y1={yAway(t)} x2={cols[0]} y2={yAway(t)} />
				{/each}
				{#each whenTicks as t (t)}
					<text class="tick" x={cols[1] - 7} y={yWhen(t) + 3.5} text-anchor="end">{fmtClock(t)}</text>
					<line class="tickline" x1={cols[1] - 3} y1={yWhen(t)} x2={cols[1]} y2={yWhen(t)} />
				{/each}
				{#each swimTicks as t (t)}
					<text class="tick" x={cols[2] + 6} y={ySwim(t) + 3.5} text-anchor="start">{t}′</text>
					<line class="tickline" x1={cols[2]} y1={ySwim(t)} x2={cols[2] + 3} y2={ySwim(t)} />
				{/each}

				{#each threads as t (t.pool.id)}
					<path class="thread" d={line(t)} />
				{/each}

				{#if selected}
					<path class="thread on" d={line(selected)} />
					{#each [[cols[0], yAway(selected.pool.travelMin)], [cols[1], yWhen(selected.swim.inWater)], [cols[2], ySwim(selected.swim.swimMin)]] as [cx, cy], i (i)}
						<circle class="knot" {cx} {cy} r="4" />
					{/each}
					<text class="thread-label" x={cols[1]} y={height - 22} text-anchor="middle">
						{shortName(selected.pool.name)}
					</text>
				{/if}

				{#each threads as t (t.pool.id)}
					<path
						class="hit"
						d={line(t)}
						role="button"
						tabindex="0"
						aria-label="{t.pool.name}, {t.pool.travelMin} minutes away, in the water at {fmtClock(
							t.swim.inWater
						)}"
						onclick={() => (picked = t.pool.id)}
						onkeydown={(e) => e.key === 'Enter' && (picked = t.pool.id)}
					/>
				{/each}
			</svg>
		{:else if w > 0}
			<p class="empty">No swim left today you could get {day.minSwim} minutes out of.</p>
		{/if}
	</div>

	<figcaption>
		{#if selected}
			<p class="verdict">
				<b>{shortName(selected.pool.name)}</b> — {selected.pool.travelMin} min
				{MODE_LABEL[selected.pool.mode]}, in the water at
				<b>{fmtClock(selected.swim.inWater)}</b>, out at {fmtClock(selected.swim.end_min)} —
				{selected.swim.swimMin} minutes.
				{#if picked && best && picked !== best.pool.id}
					<button class="linklike" onclick={() => (picked = null)}>show the soonest</button>
				{/if}
			</p>
		{/if}
		<p class="key">
			{threads.length} strings, one per pool you could still make. A string that sags in the
			middle is a long wait; one that climbs at the right is a long swim. The right-hand scale
			stops at {SWIM_SCALE_CAP} minutes. Times
			{travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}.
		</p>
	</figcaption>
</figure>

<style>
	/* Drafting bond: bone paper, graphite threads, one magenta pencil. */
	.panel {
		--paper: #f7f6f2;
		--ink: #23252a;
		--rule: #d6d4cc;
		--accent: #c4187c;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1rem;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.4rem;
	}
	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #97958c;
	}
	svg {
		display: block;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
		color: #97958c;
	}

	.axis {
		stroke: var(--ink);
		stroke-width: 1;
	}
	.axis-title {
		font-size: 10.5px;
		font-weight: 700;
		fill: var(--ink);
		letter-spacing: 0.02em;
	}
	.axis-good {
		font-size: 8px;
		fill: #97958c;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/* Tick labels sit over sixty threads, so they carry their own paper. */
	.tick {
		font-size: 8.5px;
		fill: #77756d;
		font-variant-numeric: tabular-nums;
		paint-order: stroke;
		stroke: var(--paper);
		stroke-width: 3;
	}
	.tickline {
		stroke: #b8b6ad;
		stroke-width: 1;
	}
	.thread {
		fill: none;
		stroke: #4a4d55;
		stroke-width: 1;
		stroke-opacity: 0.32;
	}
	.thread.on {
		stroke: var(--accent);
		stroke-width: 2.2;
		stroke-opacity: 1;
	}
	.knot {
		fill: var(--accent);
		stroke: var(--paper);
		stroke-width: 1.2;
	}
	.thread-label {
		font-size: 11px;
		font-weight: 700;
		fill: var(--accent);
	}
	.hit {
		fill: none;
		stroke: transparent;
		stroke-width: 9;
		cursor: pointer;
	}

	figcaption {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		line-height: 1.55;
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
		font-size: 0.68rem;
		color: #97958c;
	}
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		margin-left: 0.35rem;
		font: inherit;
		font-size: 0.76rem;
		color: #6b6963;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
