<script>
	// "Roughly where are you?"
	//
	// Every dip is measured from a point, so without one v3 has nothing to
	// say. When the browser won't give us a location we ask for one directly
	// rather than quietly measuring from somewhere you aren't: a precisely
	// routed trip from a place you are not standing is a worse lie than an
	// approximate one from where you actually are.
	//
	// Deliberately not a real map. No tiles, no zoom, no pan — one outline of
	// one city that fits on the screen, because the question is "which part of
	// town", not "which building". Coarse is honest here: the answer only has
	// to be good enough to rank a walk against a ride, and the point gets
	// snapped to a ~50 m grid before any routing provider sees it anyway.
	import { TORONTO_OUTLINE } from '$lib/geo/torontoOutline.js';
	import { TORONTO_CONTEXT } from '$lib/geo/torontoContext.js';
	import { cityBounds, makeProjection, outlinePath, linesPath } from './placemap.js';

	let { onplace } = $props();

	const BOX = { w: 320, h: 210 };
	const bounds = cityBounds(TORONTO_OUTLINE);
	const projection = makeProjection(bounds, BOX.w, BOX.h);
	const path = outlinePath(TORONTO_OUTLINE, projection);

	// What you actually navigate by. A bare silhouette is close to unusable as
	// an input device — almost nobody can point at their own neighbourhood on
	// one — so the map carries the water, the through-routes and the subway,
	// unlabelled and in three receding tones. (An earlier version marked the
	// pools instead, which raised the wrong question: a reader has no idea why
	// those particular dots are there, and they answer "where are the pools",
	// not "where am I".)
	const context = {
		water: linesPath(TORONTO_CONTEXT.water, projection),
		streets: linesPath(TORONTO_CONTEXT.streets, projection),
		subway: linesPath(TORONTO_CONTEXT.subway, projection)
	};

	// Starts in the middle of the city rather than nowhere, so the keyboard
	// route has something to move and the crosshair explains itself.
	let mark = $state({ x: BOX.w / 2, y: BOX.h / 2 });
	let placed = $state(false);

	// One arrow press moves about a kilometre — fine enough to pick a
	// neighbourhood, coarse enough to cross the city without wearing out a
	// thumb. Shift moves five times as far.
	const STEP_KM = 1;
	const stepPx = (STEP_KM / 111) * (projection.height / (bounds.north - bounds.south));

	function place(x, y) {
		mark = {
			x: Math.max(0, Math.min(BOX.w, x)),
			y: Math.max(0, Math.min(BOX.h, y))
		};
		placed = true;
	}

	function fromPointer(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		// The SVG scales to its container, so a client pixel is not a viewBox
		// unit; convert through the rendered size or every tap lands short.
		place(
			((event.clientX - rect.left) / rect.width) * BOX.w,
			((event.clientY - rect.top) / rect.height) * BOX.h
		);
	}

	function onKeydown(event) {
		const far = event.shiftKey ? 5 : 1;
		const moves = {
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0]
		};
		const move = moves[event.key];
		if (move) {
			event.preventDefault();
			place(mark.x + move[0] * stepPx * far, mark.y + move[1] * stepPx * far);
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			confirm();
		}
	}

	function confirm() {
		const { lng, lat } = projection.toLngLat(mark.x, mark.y);
		onplace({ lat, lng });
	}
</script>

<section class="place" aria-labelledby="place-heading">
	<h2 id="place-heading">Roughly where are you?</h2>
	<p class="why">
		Every dip is measured from somewhere, and your browser didn't say. Tap the map — anywhere near
		enough is fine.
	</p>

	<!-- A real button rather than a tabbable SVG: it is focusable, announced
	     and keyboard-operable for free, and nothing has to be re-implemented
	     to make it so. Placement listens for pointerdown (only a real pointer
	     carries coordinates) while the keyboard drives the marker with the
	     arrow keys, so the synthetic click a button fires on Enter is simply
	     never listened for. -->
	<button
		type="button"
		class="map"
		aria-label="Map of Toronto showing the lake, rivers, main roads and subway lines. Tap to place yourself, or use the arrow keys to move the marker and Enter to confirm."
		onpointerdown={fromPointer}
		onkeydown={onKeydown}
	>
		<svg viewBox="0 0 {BOX.w} {BOX.h}" class="canvas" aria-hidden="true">
			<path class="city" d={path} />
			<path class="streets" d={context.streets} />
			<path class="water" d={context.water} />
			<path class="subway" d={context.subway} />
			<g class="mark" class:on={placed} transform="translate({mark.x},{mark.y})">
				<circle class="halo" r="11" />
				<circle class="dot" r="4" />
			</g>
		</svg>
	</button>

	<div class="actions">
		<button class="primary" disabled={!placed} onclick={confirm}>
			{placed ? 'Show dips from here' : 'Tap the map first'}
		</button>
	</div>
	<p class="fine">
		Your location stays in this browser; only a point snapped to a ~50 m grid is sent to the routing
		services that work out travel times.
	</p>
</section>

<style>
	.place {
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 0.6rem;
		padding: 0.9rem;
		margin: 0.75rem 0;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.why {
		margin: 0.25rem 0 0.6rem;
		font-size: 0.85rem;
		color: #555;
	}
	.map {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: #eef2f6;
		border-radius: 0.4rem;
		touch-action: manipulation;
		cursor: crosshair;
	}
	.canvas {
		display: block;
		width: 100%;
		height: auto;
	}
	.map:focus-visible {
		outline: 3px solid #0b66e4;
		outline-offset: 2px;
	}
	/* Three tones under the marker, each quieter than the data on top of it.
	   None is labelled: you are meant to recognise the shape, not read it. */
	.city {
		fill: #f0f2f4;
		stroke: #dfe3e8;
		stroke-width: 0.6;
	}
	.streets {
		fill: none;
		stroke: #dce0e5;
		stroke-width: 0.5;
	}
	.water {
		fill: none;
		stroke: #c8d4dd;
		stroke-width: 0.7;
	}
	.subway {
		fill: none;
		stroke: #c3c8ce;
		stroke-width: 1.1;
		stroke-linecap: round;
	}
	.mark .halo {
		fill: rgb(11 102 228 / 0.18);
	}
	.mark .dot {
		fill: #0b66e4;
		stroke: #fff;
		stroke-width: 1.5;
	}
	/* Before the first tap the crosshair is a suggestion, not an answer. */
	.mark:not(.on) {
		opacity: 0.45;
	}
	.actions {
		margin-top: 0.6rem;
	}
	.primary {
		width: 100%;
		border: 0;
		border-radius: 999px;
		background: #0b66e4;
		color: #fff;
		font: 600 0.95rem/1 inherit;
		padding: 0.7rem 1rem;
		cursor: pointer;
	}
	.primary:disabled {
		background: #c8d2dd;
		cursor: default;
	}
	.fine {
		margin: 0.55rem 0 0;
		font-size: 0.72rem;
		color: #888;
	}
</style>
