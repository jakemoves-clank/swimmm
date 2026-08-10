<script>
	// 08 — THE ALMANAC
	// Tufte's table-graphic: a table where some of the columns happen to be
	// pictures. The strip is a sparkline of one pool's whole day; the numbers
	// beside it are the three you would actually say out loud — how far, when
	// you're in, how long you get. Highest data-ink density in the gallery,
	// and the only concept here you could read aloud down a phone.
	//
	// Laid out on a grid rather than in a <table> so it can reflow: five
	// columns will not fit a 390 px phone, and the sparkline is the column
	// that must not be the one that shrinks. Below 40 rem each entry becomes
	// two lines and the strip takes the full width.
	import { scaleLinear } from 'd3-scale';
	import { area, curveStepAfter } from 'd3-shape';
	import { availabilityCurve, fmtClock, fmtHour, MODE_LABEL, SWIM_SCALE_CAP } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const DAY = [360, 1440]; // 6 a.m. to midnight
	const ROWS = 14;
	const SORTS = [
		['soonest', 'Soonest'],
		['nearest', 'Nearest'],
		['longest', 'Longest swim']
	];
	const SCALE_TICKS = [360, 540, 720, 900, 1080, 1260, 1440];

	let stripW = $state(0);
	let sort = $state('soonest');

	const rows = $derived.by(() => {
		const list = day.pools
			.filter((p) => p.travelMin != null && p.sessions.some((s) => !s.over))
			.map((p) => {
				const c = p.sessions.find((s) => s.feasible) ?? null;
				return { pool: p, swim: c };
			});
		const cmp = {
			soonest: (a, b) =>
				(a.swim?.inWater ?? 1e9) - (b.swim?.inWater ?? 1e9) || a.pool.travelMin - b.pool.travelMin,
			nearest: (a, b) =>
				a.pool.travelMin - b.pool.travelMin || (a.swim?.inWater ?? 1e9) - (b.swim?.inWater ?? 1e9),
			longest: (a, b) => (b.swim?.swimMin ?? -1) - (a.swim?.swimMin ?? -1)
		};
		return list.sort(cmp[sort]);
	});
	const shown = $derived(rows.slice(0, ROWS));
	const hidden = $derived(rows.length - shown.length);

	// One measurement, taken from the header's strip cell, drives every strip
	// in the table — that is what keeps the city curve above aligned with the
	// pool strips below, which is the whole reason to draw them together.
	const x = $derived(scaleLinear().domain(DAY).range([0, Math.max(1, stripW)]));
	const maxTravel = $derived(Math.max(30, ...shown.map((r) => r.pool.travelMin)));
	const bar = (v, max) => `${Math.min(100, (v / max) * 100)}%`;

	const supply = $derived(
		availabilityCurve({ ...day, upcoming: day.sessions }, { step: 15, from: DAY[0], to: DAY[1] })
	);
	const supplyMax = $derived(Math.max(1, ...supply.map((d) => d.count)));
	const supplyY = $derived(scaleLinear().domain([0, supplyMax]).range([26, 2]));
	const supplyArea = $derived(
		area()
			.x((d) => x(d.minute))
			.y0(26)
			.y1((d) => supplyY(d.count))
			.curve(curveStepAfter)
	);

	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<div class="sorts" role="group" aria-label="Sort">
			{#each SORTS as [id, label] (id)}
				<button class:on={sort === id} aria-pressed={sort === id} onclick={() => (sort = id)}>
					{label}
				</button>
			{/each}
		</div>
	</div>

	<div class="table" role="table" aria-label="Pools by {sort}">
		<div class="row head" role="row">
			<span class="c-pool" role="columnheader">Pool</span>
			<div class="c-strip" role="columnheader" bind:clientWidth={stripW}>
				{#if stripW > 0}
					<svg width={stripW} height="28" viewBox="0 0 {stripW} 28" aria-hidden="true">
						<path class="supply" d={supplyArea(supply)} />
						<line class="nowline" x1={x(day.nowMin)} y1="0" x2={x(day.nowMin)} y2="28" />
					</svg>
					<div class="scale">
						{#each SCALE_TICKS as t (t)}
							<span style="left:{(x(t) / stripW) * 100}%">{fmtHour(t)}</span>
						{/each}
					</div>
				{/if}
				<span class="strip-note">every pool with water, all day</span>
			</div>
			<span class="c-num c-away" role="columnheader">Away</span>
			<span class="c-num c-inby" role="columnheader">In by</span>
			<span class="c-num c-swim" role="columnheader">Swim</span>
		</div>

		{#each shown as r, i (r.pool.id)}
			<div class="row" class:first={i === 0 && sort === 'soonest'} class:dry={!r.swim} role="row">
				<span class="c-pool" role="rowheader">
					<b>{shortName(r.pool.name)}</b>
					<em>{r.pool.address}</em>
				</span>
				<div class="c-strip" role="cell">
					{#if stripW > 0}
						<svg
							width={stripW}
							height="16"
							viewBox="0 0 {stripW} 16"
							role="img"
							aria-label="{r.pool.sessions.length} sessions today"
						>
							<line class="base" x1="0" y1="12.5" x2={stripW} y2="12.5" />
							{#each r.pool.sessions as s (s.course_id + '-' + s.start_min)}
								<rect
									class="blk"
									class:over={s.over}
									class:late={!s.over && !s.feasible}
									x={x(Math.max(DAY[0], s.start_min))}
									y="6"
									width={Math.max(1, x(s.end_min) - x(Math.max(DAY[0], s.start_min)))}
									height="7"
								/>
							{/each}
							<line class="nowtick" x1={x(day.nowMin)} y1="2" x2={x(day.nowMin)} y2="15" />
							{#if r.swim}
								<circle class="inwater" cx={x(r.swim.inWater)} cy="9.5" r="3" />
							{/if}
						</svg>
					{/if}
				</div>
				<span class="c-num c-away" role="cell">
					<span class="minibar" style="width:{bar(r.pool.travelMin, maxTravel)}"></span>
					<span class="v"><i>away</i>{r.pool.travelMin}</span>
				</span>
				<span class="c-num c-inby" role="cell">
					<span class="v"><i>in by</i>{r.swim ? fmtClock(r.swim.inWater) : '—'}</span>
				</span>
				<span class="c-num c-swim" role="cell">
					<span class="minibar swim" style="width:{bar(r.swim?.swimMin ?? 0, SWIM_SCALE_CAP)}"
					></span>
					<span class="v"><i>swim</i>{r.swim ? r.swim.swimMin : '—'}</span>
				</span>
			</div>
		{/each}
	</div>

	<figcaption>
		{#if shown[0]?.swim}
			<p class="verdict">
				Top of the table: <b>{shortName(shown[0].pool.name)}</b>, {shown[0].pool.travelMin} min
				{MODE_LABEL[shown[0].pool.mode]}, in the water by
				<b>{fmtClock(shown[0].swim.inWater)}</b> for {shown[0].swim.swimMin} minutes.
			</p>
		{/if}
		<p class="key">
			Strip runs 6 am to midnight. <span class="sw blk-key"></span> swim ·
			<span class="sw late-key"></span> can’t make it ·
			<span class="sw over-key"></span> over ·
			<span class="sw dot-key"></span> you’re in the water ·
			<span class="sw now-key"></span> now. Away and Swim in minutes; the swim bar fills at
			{SWIM_SCALE_CAP} minutes so one all-day outdoor pool can’t flatten the rest.
			{#if hidden > 0}{hidden} further pools not printed.{/if}
			Times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}.
		</p>
	</figcaption>
</figure>

<style>
	/* Almanac stock: ivory paper, a serif face, hairline rules, red for now. */
	.panel {
		--paper: #fbf9f2;
		--ink: #191713;
		--rule: #ddd7c6;
		--accent: #b4241d;
		margin: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 0.85rem 1rem 1rem;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.7rem;
	}
	.sorts {
		display: inline-flex;
		gap: 0.3rem;
	}
	.sorts button {
		border: 1px solid var(--rule);
		background: transparent;
		border-radius: 2px;
		padding: 0.25rem 0.6rem;
		font: 400 0.72rem/1.2 inherit;
		color: #6e6759;
		cursor: pointer;
	}
	.sorts button.on {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}

	.table {
		font-size: 0.8rem;
	}
	/* Phone: name and numbers on one line, the sparkline full width beneath. */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 3rem 4.2rem 3rem;
		grid-template-areas:
			'pool away inby swim'
			'strip strip strip strip';
		align-items: center;
		gap: 0.1rem 0.3rem;
		padding: 0.35rem 0.25rem 0.45rem;
		border-bottom: 1px solid var(--rule);
	}
	.row.head {
		grid-template-areas: 'strip strip strip strip';
		border-bottom: 1.5px solid var(--ink);
		padding-bottom: 0.15rem;
	}
	.row.head .c-pool,
	.row.head .c-num {
		display: none;
	}
	.row.first {
		background: #f4efdd;
	}
	.c-pool {
		grid-area: pool;
		min-width: 0;
	}
	.c-strip {
		grid-area: strip;
		min-width: 0;
	}
	.c-pool b {
		display: block;
		font-weight: 700;
		font-size: 0.82rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.c-pool em {
		display: block;
		font-style: normal;
		font-size: 0.66rem;
		color: #8a8272;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row.dry .c-pool b {
		color: #8a8272;
	}
	.c-num {
		position: relative;
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		padding-bottom: 4px;
	}
	.c-away {
		grid-area: away;
	}
	.c-inby {
		grid-area: inby;
	}
	.c-swim {
		grid-area: swim;
	}
	/* On a phone the header row is a scale, not labels, so each number says
	   what it is in a whisper above itself. */
	.c-num i {
		display: block;
		font-style: normal;
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #a9a294;
	}
	.minibar {
		position: absolute;
		right: 0;
		bottom: 0;
		height: 2px;
		background: #cfc7b2;
		max-width: 100%;
	}
	.minibar.swim {
		background: #9fb9a4;
	}
	.v {
		position: relative;
	}
	.row.first .v {
		font-weight: 700;
		color: var(--accent);
	}

	@media (min-width: 40rem) {
		.row {
			grid-template-columns: 11.5rem minmax(0, 1fr) 3.4rem 4.6rem 3.4rem;
			grid-template-areas: 'pool strip away inby swim';
			gap: 0 0.55rem;
			padding: 0.3rem 0.25rem;
		}
		.row.head {
			grid-template-areas: 'pool strip away inby swim';
			align-items: end;
			padding-bottom: 0.2rem;
		}
		.row.head .c-pool,
		.row.head .c-num {
			display: block;
			font-size: 0.62rem;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			color: #8a8272;
			font-weight: 400;
		}
		.c-num i {
			display: none;
		}
	}

	.scale {
		position: relative;
		height: 0.8rem;
	}
	.scale span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 0.58rem;
		color: #a9a294;
		font-variant-numeric: tabular-nums;
	}
	.strip-note {
		display: block;
		font-size: 0.55rem;
		color: #a9a294;
		letter-spacing: 0.06em;
	}

	svg {
		display: block;
	}
	.supply {
		fill: #ddd7c6;
	}
	.nowline {
		stroke: var(--accent);
		stroke-width: 1;
	}
	.base {
		stroke: #eae4d4;
		stroke-width: 1;
	}
	.blk {
		fill: #3f5f79;
	}
	.blk.late {
		fill: #b9c4cd;
	}
	.blk.over {
		fill: #e0dccf;
	}
	.nowtick {
		stroke: var(--accent);
		stroke-width: 1;
	}
	.inwater {
		fill: var(--accent);
		stroke: var(--paper);
		stroke-width: 1;
	}

	figcaption {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.25rem;
	}
	.verdict b {
		color: var(--accent);
	}
	.key {
		margin: 0;
		font-size: 0.68rem;
		color: #8a8272;
	}
	.sw {
		display: inline-block;
		width: 12px;
		height: 7px;
		margin-right: 1px;
	}
	.blk-key {
		background: #3f5f79;
	}
	.late-key {
		background: #b9c4cd;
	}
	.over-key {
		background: #e0dccf;
	}
	.dot-key {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #b4241d;
	}
	.now-key {
		width: 2px;
		height: 10px;
		background: #b4241d;
		vertical-align: -2px;
	}
</style>
