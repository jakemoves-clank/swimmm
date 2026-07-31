<script>
	// 04 — SWIM PERMITTED BETWEEN
	// Not a chart. The municipal sign — the one form of public information
	// design everybody in the city has already been trained to read at a
	// glance, standing up, in the rain. Nikki Sylianteng's parking-sign
	// redesign supplies the strip along the bottom: the whole day as blocks,
	// green for yes, and a tick where you are standing in it.
	import { scaleLinear } from 'd3-scale';
	import { fmtClock, MODE_LABEL } from './model.js';
	import KindToggle from './ui/KindToggle.svelte';

	let { day, kind, setKind, travelSource } = $props();

	const SIGNS = 9;
	const STRIP = [360, 1440]; // 6 a.m. to midnight — the day a pool is open in
	// A sign is an instruction, and no plausible sign tells you to cycle for two
	// hours. Beyond an hour the board stops posting and says how many it dropped.
	const MAX_TRAVEL = 60;

	const signs = $derived(
		day.pools
			.filter(
				(p) => p.travelMin != null && p.travelMin <= MAX_TRAVEL && p.sessions.some((s) => !s.over)
			)
			.map((p) => ({ ...p, catch: p.sessions.find((s) => s.feasible) ?? null }))
			.sort(
				(a, b) =>
					(a.catch?.inWater ?? 1e9) - (b.catch?.inWater ?? 1e9) || a.travelMin - b.travelMin
			)
	);
	const shown = $derived(signs.slice(0, SIGNS));
	const hidden = $derived(signs.length - shown.length);

	const x = scaleLinear().domain(STRIP).range([0, 100]);
	const pct = (min) => Math.max(0, Math.min(100, x(min)));

	const shortName = (n) =>
		n.replace(/\s+(Community Recreation Centre|Recreation Centre|Community Centre)$/i, '');
	const ARROW = { walk: '↑', bike: '↗' };
</script>

<figure class="panel">
	<div class="toolbar">
		<KindToggle {kind} {setKind} />
		<span class="hint">Soonest you could be in the water, first</span>
	</div>

	<div class="signs">
		{#each shown as p (p.id)}
			<article class="sign" class:closed={!p.catch}>
				<header class="band" class:no={!p.catch}>
					{p.catch ? 'Swim permitted between' : 'No swim you can make'}
				</header>

				<div class="body">
					{#if p.catch}
						<p class="window">
							{fmtClock(p.catch.start_min)}<span class="dash">—</span>{fmtClock(p.catch.end_min)}
						</p>
						<p class="sub">
							In the water by <b>{fmtClock(p.catch.inWater)}</b>
							{#if p.catch.inProgress}· already open{/if}
						</p>
					{:else}
						<p class="window closed-window">— —</p>
						<p class="sub">Everything left today ends before you could get {day.minSwim} min in</p>
					{/if}

					<!-- Sylianteng's strip: the whole day, six to midnight -->
					<div
						class="strip"
						role="img"
						aria-label="Today at {p.name}: {p.sessions.length} sessions"
					>
						{#each p.sessions as s (s.course_id + '-' + s.start_min)}
							<span
								class="blk"
								class:gone={s.over}
								class:late={!s.over && !s.feasible}
								style="left:{pct(s.start_min)}%;width:{Math.max(
									0.8,
									pct(s.end_min) - pct(s.start_min)
								)}%"
							></span>
						{/each}
						<span class="tick" style="left:{pct(day.nowMin)}%"></span>
					</div>
					<div class="strip-scale"><span>6 am</span><span>noon</span><span>6 pm</span><span>12</span></div>
				</div>

				<footer class="foot">
					<span class="arrow">{ARROW[p.mode] ?? '↑'}</span>
					<span class="dist"><b>{p.travelMin} min</b> {MODE_LABEL[p.mode]}</span>
					<span class="place">
						<b>{shortName(p.name)}</b>
						<em>{p.address}</em>
					</span>
				</footer>
			</article>
		{/each}
	</div>

	<figcaption>
		<p class="key">
			<span class="sw ok"></span> you can make it ·
			<span class="sw late"></span> too late to be worth the trip ·
			<span class="sw gone"></span> over ·
			<span class="sw now"></span> now
			{#if hidden > 0}· {hidden} more pools within the hour{/if}
			· times {travelSource === 'routed' ? 'routed by Mapbox' : 'estimated'}
		</p>
	</figcaption>
</figure>

<style>
	/* Municipal enamel: white plate, deep green ink, red for the prohibition,
	   and the heaviest condensed face the device will give us. */
	.panel {
		--paper: #ffffff;
		--ink: #17181a;
		--rule: #c9cdd1;
		--accent: #0a6b3d;
		--no: #b3242a;
		margin: 0;
		background: #dfe2e5;
		color: var(--ink);
		padding: 1rem;
		font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin-bottom: 0.8rem;
		--paper: #fff;
		--ink: #17181a;
		--rule: #b6bbc0;
	}
	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6a7078;
	}

	.signs {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr;
	}
	@media (min-width: 34rem) {
		.signs {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (min-width: 54rem) {
		.signs {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.sign {
		background: #fff;
		border: 3px solid var(--ink);
		border-radius: 6px;
		overflow: hidden;
		box-shadow: 0 1px 0 rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
	}
	.band {
		background: var(--accent);
		color: #fff;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		padding: 0.3rem 0.6rem;
	}
	.band.no {
		background: var(--no);
	}
	.body {
		padding: 0.6rem 0.7rem 0.55rem;
		flex: 1;
	}
	.window {
		margin: 0;
		font-size: clamp(1.05rem, 4.4vw, 1.45rem);
		font-weight: 700;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.dash {
		padding: 0 0.15em;
		color: #8b9098;
	}
	.closed-window {
		color: #b5babf;
	}
	.sub {
		margin: 0.1rem 0 0.6rem;
		font-size: 0.76rem;
		color: #4b5158;
	}
	.sub b {
		color: var(--accent);
	}
	.closed .sub b {
		color: inherit;
	}

	.strip {
		position: relative;
		height: 13px;
		background: #eceef0;
		border: 1px solid #cfd3d7;
	}
	.blk {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent);
	}
	.blk.late {
		background: #e0a41f;
	}
	.blk.gone {
		background: #b8bdc2;
	}
	.tick {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: var(--ink);
	}
	.strip-scale {
		display: flex;
		justify-content: space-between;
		font-size: 0.58rem;
		color: #9aa0a6;
		letter-spacing: 0.04em;
		margin-top: 1px;
	}

	.foot {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0 0.5rem;
		border-top: 3px solid var(--ink);
		padding: 0.45rem 0.7rem 0.5rem;
	}
	.arrow {
		font-size: 1.5rem;
		line-height: 1;
		color: var(--accent);
		font-weight: 700;
	}
	.closed .arrow {
		color: #9aa0a6;
	}
	.dist {
		font-size: 0.76rem;
		white-space: nowrap;
	}
	.dist b {
		font-size: 0.92rem;
	}
	.place {
		text-align: right;
		line-height: 1.15;
		min-width: 0;
	}
	.place b {
		display: block;
		font-size: 0.74rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.place em {
		font-style: normal;
		font-size: 0.66rem;
		color: #7b8188;
	}

	figcaption {
		margin-top: 0.7rem;
	}
	.key {
		margin: 0;
		font-size: 0.7rem;
		color: #5c6268;
	}
	.sw {
		display: inline-block;
		width: 13px;
		height: 8px;
		margin-right: 2px;
	}
	.sw.ok {
		background: #0a6b3d;
	}
	.sw.late {
		background: #e0a41f;
	}
	.sw.gone {
		background: #b8bdc2;
	}
	.sw.now {
		width: 3px;
		height: 11px;
		background: #17181a;
		vertical-align: -2px;
	}
</style>
