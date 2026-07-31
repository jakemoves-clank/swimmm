<script>
	// 02 — THE DAY PLANNER
	// The form everybody already knows: time down the side, one column per
	// pool. The one thing a wall calendar can't tell you is how long it takes
	// to get to the meeting — so each column carries a hatched "travel shadow"
	// from now until you'd arrive. A block under the shadow you have missed;
	// the first block clear of it is your swim.
	import { scaleLinear } from 'd3-scale';
	import { fmtClock, fmtHour, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	// The right margin is the room the last column's diagonal label needs.
	const M = { top: 104, right: 52, bottom: 16, left: 40 };
	const MAX_COLS = 14;

	let w = $state(0);
	let order = $state('nearest'); // nearest | soonest
	let picked = $state(null);

	const height = $derived(w < 560 ? 500 : 620);
	const colCount = $derived(w < 420 ? 5 : w < 560 ? 7 : w < 760 ? 10 : MAX_COLS);

	const candidates = $derived(
		day.pools.filter((p) => p.sessions.some((s) => !s.over) && p.travelMin != null)
	);

	const columns = $derived.by(() => {
		const sorted = [...candidates].sort((a, b) =>
			order === 'nearest'
				? a.travelMin - b.travelMin
				: (a.soonestInWater ?? 1e9) - (b.soonestInWater ?? 1e9) || a.travelMin - b.travelMin
		);
		return sorted.slice(0, colCount);
	});
	const hidden = $derived(candidates.length - columns.length);

	// Six in the morning to whenever the last of these pools shuts. Mornings
	// matter: the grey band above `now` is the swim you slept through.
	const span = $derived.by(() => {
		const starts = columns.flatMap((p) => p.sessions.map((s) => s.start_min));
		const ends = columns.flatMap((p) => p.sessions.map((s) => s.end_min));
		const t0 = Math.min(360, starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 360);
		const t1 = Math.max(day.nowMin + 90, ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 0);
		return [t0, Math.min(1440, t1)];
	});

	const y = $derived(scaleLinear().domain(span).range([M.top, height - M.bottom]));
	const colW = $derived(columns.length ? (Math.max(160, w) - M.left - M.right) / columns.length : 0);
	const barW = $derived(Math.max(8, colW - 6));

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

	const detail = $derived(picked ?? best);

	const hours = $derived.by(() => {
		const step = height < 500 ? 120 : 60;
		const out = [];
		for (let t = Math.ceil(span[0] / step) * step; t <= span[1]; t += step) out.push(t);
		return out;
	});

	// Community rec centres all end in the same four words; the diagonal above
	// a column holds about eighteen characters, and the telling part is at the
	// front ("Jimmie Simpson", not "Community Recreation Centre").
	const shortName = (n) => {
		const s = n.replace(
			/\s+(Community Recreation Centre|Recreation Centre|Community Centre|Pool)$/i,
			''
		);
		return s.length > 18 ? s.slice(0, 17).trimEnd() + '…' : s;
	};
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<div class="sort" role="group" aria-label="Column order">
			<span>Columns</span>
			<button class:on={order === 'nearest'} onclick={() => (order = 'nearest')}>Nearest</button>
			<button class:on={order === 'soonest'} onclick={() => (order = 'soonest')}>Soonest</button>
		</div>
	</div>

	<div class="chart" bind:clientWidth={w}>
		{#if w > 0 && columns.length}
			<svg
				width={w}
				{height}
				viewBox="0 0 {w} {height}"
				role="img"
				aria-label="Day planner: {columns.length} pools as columns, time down the side"
			>
				<defs>
					<pattern
						id="dp-shadow"
						width="5"
						height="5"
						patternTransform="rotate(45)"
						patternUnits="userSpaceOnUse"
					>
						<rect width="5" height="5" fill="#eef1f4" />
						<line x1="0" y1="0" x2="0" y2="5" stroke="#b6bec9" stroke-width="1" />
					</pattern>
				</defs>

				<rect
					class="past"
					x={M.left}
					y={y(span[0])}
					width={w - M.left - M.right}
					height={Math.max(0, y(day.nowMin) - y(span[0]))}
				/>

				{#each hours as t (t)}
					<line class="hrule" x1={M.left} y1={y(t)} x2={w - M.right} y2={y(t)} />
					<text class="hlabel" x={M.left - 6} y={y(t) + 3}>
						{fmtHour(t)}{#if t === hours[0] || t === 720}<tspan class="ampm"
								>{t < 720 ? 'a' : 'p'}</tspan
							>{/if}
					</text>
				{/each}

				{#each columns as p, i (p.id)}
					{@const cx = M.left + i * colW + 3}
					{@const isBest = best && p.id === best.poolId}
					{@const isPicked = detail && p.id === detail.poolId}

					<!-- Rotated like a real timetable: pool names are long, columns
					     are 60 px, and truncation would hide the useful half. -->
					<text
						class="pool"
						class:accent={isPicked}
						transform="translate({cx + barW / 2 - 2},{M.top - 22}) rotate(-52)"
					>
						{shortName(p.name)}
					</text>
					<line class="travelbar" x1={cx} y1={M.top - 14} x2={cx + barW} y2={M.top - 14} />
					<line
						class="travelbar fill"
						class:accent={isPicked}
						x1={cx}
						y1={M.top - 14}
						x2={cx + Math.min(barW, (barW * p.travelMin) / 45)}
						y2={M.top - 14}
					/>
					<text class="mins" class:accent={isPicked} x={cx + barW / 2} y={M.top - 4}>
						{p.travelMin}′
					</text>

					<rect
						class="shadow"
						x={cx}
						y={y(day.nowMin)}
						width={barW}
						height={Math.max(
							0,
							y(Math.min(span[1], day.nowMin + p.travelMin)) - y(day.nowMin)
						)}
					/>

					{#each p.sessions as s (s.course_id + '-' + s.start_min)}
						{@const top = y(Math.max(s.start_min, span[0]))}
						{@const h = Math.max(2, y(Math.min(s.end_min, span[1])) - top)}
						<rect
							class="block"
							class:over={s.over}
							class:missed={!s.over && !s.feasible}
							class:best={isBest && best.start_min === s.start_min}
							x={cx}
							y={top}
							width={barW}
							height={h}
							rx="2"
						/>
						{#if h > 22 && barW > 64}
							<text class="blocktime" class:over={s.over} x={cx + 4} y={top + 13}>
								{fmtHour(s.start_min)}–{fmtHour(s.end_min)}
							</text>
						{/if}
					{/each}

					<!-- Three minutes of walking is a pixel and a half on a 17-hour
					     axis, so the shadow alone would be invisible. The tick is the
					     mark that actually carries it: "leave now, you're in at here". -->
					{@const arriveY = y(Math.min(span[1], day.nowMin + p.travelMin))}
					<line class="arrive" x1={cx} y1={arriveY} x2={cx + barW} y2={arriveY} />
					<polygon
						class="arrive-head"
						points="{cx},{arriveY - 3.5} {cx},{arriveY + 3.5} {cx + 5},{arriveY}"
					/>

					<rect
						class="hit"
						x={M.left + i * colW}
						y={M.top}
						width={colW}
						height={height - M.top - M.bottom}
						role="button"
						tabindex="0"
						aria-label="{p.name}, {p.travelMin} minutes away"
						onclick={() => (picked = p.next ?? null)}
						onkeydown={(e) => e.key === 'Enter' && (picked = p.next ?? null)}
					/>
				{/each}

				<line class="now" x1={M.left - 6} y1={y(day.nowMin)} x2={w - M.right} y2={y(day.nowMin)} />
				<text class="nowlabel" x={M.left - 6} y={y(day.nowMin) - 4}>{fmtClock(day.nowMin)}</text>
			</svg>
		{/if}
	</div>

	<figcaption>
		{#if detail}
			<p class="verdict">
				<b>{detail.pool}</b> · {detail.travelMin} min {MODE_LABEL[detail.mode]} ·
				{fmtClock(detail.start_min)}–{fmtClock(detail.end_min)} ·
				{#if detail.feasible}in the water by <b>{fmtClock(detail.inWater)}</b>{:else}too far to
					get {day.minSwim} minutes of swim out of it{/if}
				{#if picked && best && picked.poolId !== best.poolId}
					<button class="linklike" onclick={() => (picked = null)}>back to the soonest</button>
				{/if}
			</p>
		{:else}
			<p class="verdict">Nothing left today you could reach in time.</p>
		{/if}
		<p class="key">
			<span class="sw block-key"></span> swim ·
			<span class="sw shadow-key"></span> getting there ·
			<span class="sw past-key"></span> already gone
			{#if hidden > 0}· {hidden} pools too far down the order to fit{/if}
			· times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Office stationery: paper white, cool rules, one pool blue, one red pen. */
	.panel {
		--paper: #ffffff;
		--ink: #1b2027;
		--rule: #d7dce3;
		--accent: #e2593f;
		--water: #2f7fb8;
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
		gap: 0.6rem 1.25rem;
		align-items: center;
		margin-bottom: 0.6rem;
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.sort span {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #8b939e;
		margin-right: 0.15rem;
	}
	.sort button {
		border: 1px solid var(--rule);
		background: #fff;
		border-radius: 999px;
		padding: 0.28rem 0.7rem;
		font: 600 0.72rem/1.2 inherit;
		color: #566070;
		cursor: pointer;
	}
	.sort button.on {
		background: var(--ink);
		border-color: var(--ink);
		color: #fff;
	}
	svg {
		display: block;
	}

	.past {
		fill: #f4f6f8;
	}
	.hrule {
		stroke: var(--rule);
		stroke-width: 0.7;
	}
	.hlabel {
		font-size: 9.5px;
		fill: #8b939e;
		text-anchor: end;
		font-variant-numeric: tabular-nums;
	}
	.pool {
		font-size: 9.5px;
		fill: #566070;
		text-anchor: start;
	}
	.pool.accent {
		fill: var(--ink);
		font-weight: 700;
	}
	.travelbar {
		stroke: #e7eaee;
		stroke-width: 3;
	}
	.travelbar.fill {
		stroke: #a9b6c4;
	}
	.travelbar.fill.accent {
		stroke: var(--accent);
	}
	.mins {
		font-size: 8.5px;
		fill: #8b939e;
		text-anchor: middle;
		font-variant-numeric: tabular-nums;
	}
	.mins.accent {
		fill: var(--accent);
		font-weight: 700;
	}
	.shadow {
		fill: url(#dp-shadow);
		opacity: 0.9;
	}
	.block {
		fill: var(--water);
		opacity: 0.9;
	}
	.block.missed {
		fill: #9fb6c7;
		opacity: 0.5;
	}
	.block.over {
		fill: #ccd3da;
		opacity: 0.7;
	}
	.block.best {
		fill: #14618f;
		stroke: var(--accent);
		stroke-width: 1.5;
		opacity: 1;
	}
	.blocktime {
		font-size: 8.5px;
		fill: #fff;
		font-variant-numeric: tabular-nums;
	}
	.blocktime.over {
		fill: #7d868f;
	}
	.arrive {
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 2 2;
		opacity: 0.9;
	}
	.arrive-head {
		fill: var(--accent);
	}
	.hit {
		fill: transparent;
		cursor: pointer;
	}
	.ampm {
		font-size: 7px;
	}
	.now {
		stroke: var(--accent);
		stroke-width: 1.5;
	}
	.nowlabel {
		font-size: 9px;
		font-weight: 700;
		fill: var(--accent);
		text-anchor: start;
	}

	figcaption {
		margin-top: 0.55rem;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.verdict {
		margin: 0 0 0.3rem;
	}
	.key {
		margin: 0;
		font-size: 0.7rem;
		color: #8b939e;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 8px;
		border-radius: 2px;
		margin-right: 2px;
	}
	.block-key {
		background: var(--water);
	}
	.shadow-key {
		background: repeating-linear-gradient(45deg, #b6bec9 0 1px, #eef1f4 1px 4px);
	}
	.past-key {
		background: #ccd3da;
	}
	.linklike {
		border: 0;
		background: none;
		padding: 0;
		margin-left: 0.35rem;
		font: inherit;
		font-size: 0.78rem;
		color: #566070;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
