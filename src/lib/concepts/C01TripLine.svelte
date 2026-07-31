<script>
	// 01 — THE TRIP LINE
	// Marey's train schedule graph, with pools instead of stations. Time runs
	// across; the vertical axis is not kilometres but *minutes of travel*, so a
	// journey that begins at one moment and takes as long as it takes is a
	// single straight rake across the plate. Everything the rake has already
	// swept past is gone; the first bar it lands on is your swim.
	import { scaleLinear } from 'd3-scale';
	import { fmtClock, fmtHour, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const MAX_TRAVEL = 60; // minutes; beyond this the plate is all gutter
	const M = { top: 14, right: 16, bottom: 30, left: 46 };

	let w = $state(0);
	let depart = $state(null);
	let dragging = $state(false);
	let svgEl = $state(null);

	const height = $derived(w < 560 ? 300 : 400);
	const shown = $derived(
		day.sessions.filter((s) => !s.over && s.travelMin != null && s.travelMin <= MAX_TRAVEL)
	);
	const hidden = $derived(day.upcoming.length - shown.length);

	// Leaving now is the default; the reader drags forward to plan.
	const departure = $derived(depart ?? day.nowMin);

	const domain = $derived.by(() => {
		const lastEnd = shown.length ? Math.max(...shown.map((s) => s.end_min)) : day.nowMin + 120;
		const t0 = Math.floor(day.nowMin / 30) * 30;
		return [t0, Math.max(t0 + 90, Math.ceil(lastEnd / 30) * 30)];
	});

	const x = $derived(scaleLinear().domain(domain).range([M.left, Math.max(M.left + 1, w - M.right)]));
	const y = $derived(scaleLinear().domain([0, MAX_TRAVEL]).range([M.top, height - M.bottom]));

	// Hour rules only; half-hours would double the ink for nothing.
	const hourTicks = $derived.by(() => {
		const out = [];
		for (let t = Math.ceil(domain[0] / 60) * 60; t <= domain[1]; t += 60) out.push(t);
		return out;
	});

	// One faint lane per pool, at its own height. Two pools twelve minutes away
	// share a line — which is true, and worth seeing.
	const lanes = $derived([...new Set(shown.map((s) => s.travelMin))].sort((a, b) => a - b));

	// Given a departure, the earliest swim you could actually be in.
	const caught = $derived.by(() => {
		let best = null;
		for (const s of shown) {
			const inWater = Math.max(departure + s.travelMin, s.start_min);
			if (s.end_min - inWater < day.minSwim) continue;
			if (!best || inWater < best.inWater || (inWater === best.inWater && s.travelMin < best.s.travelMin))
				best = { s, inWater };
		}
		return best;
	});

	function setFromPointer(event) {
		if (!svgEl) return;
		const box = svgEl.getBoundingClientRect();
		const t = x.invert(event.clientX - box.left);
		depart = Math.min(domain[1], Math.max(day.nowMin, Math.round(t / 5) * 5));
	}

	function onDown(event) {
		dragging = true;
		svgEl?.setPointerCapture?.(event.pointerId);
		setFromPointer(event);
	}
	function onMove(event) {
		if (dragging) setFromPointer(event);
	}
	function onUp() {
		dragging = false;
	}
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<label class="departure">
			<span>Leave at</span>
			<input
				type="range"
				min={domain[0]}
				max={domain[1]}
				step="5"
				value={departure}
				aria-label="Departure time"
				oninput={(e) => (depart = Math.max(day.nowMin, +e.currentTarget.value))}
			/>
			<b>{fmtClock(departure)}</b>
		</label>
	</div>

	<div class="chart" bind:clientWidth={w}>
		{#if w > 0}
			<svg
				bind:this={svgEl}
				width={w}
				{height}
				viewBox="0 0 {w} {height}"
				role="img"
				aria-label="Marey diagram: {shown.length} swims plotted against travel time from you"
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
			>
				<defs>
					<pattern id="tl-hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
						<line x1="0" y1="0" x2="0" y2="4" stroke="#2a2622" stroke-width="1.2" opacity="0.34" />
					</pattern>
				</defs>

				<!-- everything the rake has already swept: too late to matter -->
				<polygon
					class="gone"
					points="{x(domain[0])},{y(0)} {x(departure)},{y(0)} {x(Math.min(domain[1], departure + MAX_TRAVEL))},{y(
						Math.min(MAX_TRAVEL, domain[1] - departure)
					)} {x(domain[0])},{y(MAX_TRAVEL)}"
				/>

				{#each hourTicks as t (t)}
					<line class="rule" x1={x(t)} y1={y(0)} x2={x(t)} y2={y(MAX_TRAVEL)} />
					<text class="hour" x={x(t)} y={height - 12}>
						{fmtHour(t)}{#if t === hourTicks[0] || t % 720 === 0}<tspan class="ampm"
								>{t % 1440 < 720 ? 'am' : 'pm'}</tspan
							>{/if}
					</text>
				{/each}

				{#each [10, 20, 30, 40, 50, 60] as t (t)}
					<line class="rule faint" x1={M.left} y1={y(t)} x2={w - M.right} y2={y(t)} />
					<text class="ymark" x={M.left - 8} y={y(t) + 3}>{t}</text>
				{/each}
				<text class="yunit" x={M.left - 8} y={y(0) - 4}>min away</text>

				{#each lanes as t (t)}
					<line class="lane" x1={M.left} y1={y(t)} x2={w - M.right} y2={y(t)} />
				{/each}

				<!-- Each swim twice: the solid bar is "get in here and you still get
				     a full swim", the hatched whisker is the dregs. Sessions already
				     under way are clipped to the left edge — the plate starts now. -->
				{#each shown as s (s.course_id + '-' + s.poolId + '-' + s.start_min)}
					{@const from = Math.max(s.start_min, domain[0])}
					{@const full = Math.max(from, s.end_min - day.minSwim)}
					<rect
						class="tail"
						x={x(full)}
						y={y(s.travelMin) - 2}
						width={Math.max(0.5, x(s.end_min) - x(full))}
						height="4"
					/>
					{#if full > from}
						<rect
							class="bar"
							class:live={s.inProgress}
							x={x(from)}
							y={y(s.travelMin) - 3.5}
							width={Math.max(0.5, x(full) - x(from))}
							height="7"
						/>
					{/if}
				{/each}

				<line class="now" x1={x(day.nowMin)} y1={y(0)} x2={x(day.nowMin)} y2={y(MAX_TRAVEL)} />

				<!-- the rake: leave at `departure`, arrive everywhere in order -->
				<line
					class="rake"
					x1={x(departure)}
					y1={y(0)}
					x2={x(Math.min(domain[1], departure + MAX_TRAVEL))}
					y2={y(Math.min(MAX_TRAVEL, domain[1] - departure))}
				/>
				<polygon
					class="rake-head"
					points="{x(departure)},{y(0) - 2} {x(departure) - 5},{y(0) - 10} {x(departure) + 5},{y(0) - 10}"
				/>

				{#if caught}
					{@const cx = x(caught.inWater)}
					{@const cy = y(caught.s.travelMin)}
					{@const right = cx < w - 190}
					<circle class="hit" {cx} {cy} r="5.5" />
					<line class="hit-lead" x1={cx} y1={cy + 6} x2={cx} y2={cy + 22} />
					<text
						class="hit-label"
						x={right ? cx + 5 : cx - 5}
						text-anchor={right ? 'start' : 'end'}
						y={cy + 30}>{caught.s.pool}</text
					>
				{/if}
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if caught}
			<p class="verdict">
				Leave at <b>{fmtClock(departure)}</b> and the first water you can be in is
				<b>{caught.s.pool}</b> — {caught.s.travelMin} min {MODE_LABEL[caught.s.mode]}, in at
				<b>{fmtClock(caught.inWater)}</b>, open until {fmtClock(caught.s.end_min)}.
			</p>
		{:else}
			<p class="verdict">
				Leave at <b>{fmtClock(departure)}</b> and the rake clears every bar — nothing left within
				an hour of you that gives you {day.minSwim} minutes in the water.
			</p>
		{/if}
		<p class="key">
			<span class="sw bar-key"></span> arrive here for a full swim ·
			<span class="sw live-key"></span> already open ·
			<span class="sw tail-key"></span> under {day.minSwim} min left ·
			<span class="sw rake-key"></span> your trip
			{#if hidden > 0}· {hidden} swims further than {MAX_TRAVEL} min away, off the plate{/if}
			· times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Marey engraved on paper: cream stock, sepia rules, one vermilion line. */
	.panel {
		--paper: #f7f2e6;
		--ink: #2a2622;
		--rule: #cbb99a;
		--accent: #c8462c;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1rem;
		font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
		margin-bottom: 0.6rem;
	}
	.departure {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		flex: 1 1 15rem;
	}
	.departure span {
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-size: 0.62rem;
		opacity: 0.6;
	}
	.departure b {
		font-variant-numeric: tabular-nums;
		min-width: 4.6rem;
		color: var(--accent);
	}
	input[type='range'] {
		flex: 1;
		min-width: 6rem;
		accent-color: var(--accent);
	}
	.chart {
		touch-action: pan-y;
		cursor: ew-resize;
	}
	svg {
		display: block;
		user-select: none;
	}

	.gone {
		fill: #2a2622;
		opacity: 0.055;
	}
	.rule {
		stroke: var(--rule);
		stroke-width: 0.6;
		opacity: 0.75;
	}
	.rule.faint {
		opacity: 0.35;
		stroke-dasharray: 2 4;
	}
	.lane {
		stroke: var(--ink);
		stroke-width: 0.5;
		opacity: 0.1;
	}
	.bar {
		fill: var(--ink);
	}
	.bar.live {
		fill: #1f6f5c;
	}
	.tail {
		fill: url(#tl-hatch);
	}
	.now {
		stroke: var(--ink);
		stroke-width: 0.8;
		stroke-dasharray: 3 3;
		opacity: 0.5;
	}
	.rake {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.rake-head {
		fill: var(--accent);
	}
	.hit {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.hit-lead {
		stroke: var(--accent);
		stroke-width: 1;
	}
	/* The callout lands on top of sixty bars, so it carries its own paper. */
	.hit-label {
		font-size: 11px;
		font-weight: 700;
		fill: var(--accent);
		paint-order: stroke;
		stroke: var(--paper);
		stroke-width: 3.5;
	}
	.hour,
	.ymark,
	.yunit {
		font-size: 10px;
		fill: var(--ink);
		opacity: 0.55;
		font-variant-numeric: tabular-nums;
	}
	.hour {
		text-anchor: middle;
	}
	.ampm {
		font-size: 7px;
		opacity: 0.8;
	}
	.ymark,
	.yunit {
		text-anchor: end;
	}
	.yunit {
		opacity: 0.4;
	}

	figcaption {
		margin-top: 0.5rem;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.35rem;
	}
	.verdict b {
		color: var(--accent);
	}
	.key {
		margin: 0;
		font-size: 0.7rem;
		opacity: 0.65;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 6px;
		vertical-align: 1px;
		margin-right: 2px;
	}
	.bar-key {
		background: var(--ink);
	}
	.live-key {
		background: #1f6f5c;
	}
	.tail-key {
		height: 4px;
		background: repeating-linear-gradient(45deg, rgb(42 38 34 / 0.4) 0 1.2px, transparent 1.2px 3px);
	}
	.rake-key {
		height: 2px;
		background: var(--accent);
	}
</style>
