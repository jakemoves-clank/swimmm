<script>
	// Where are you? — asked without asking anything.
	//
	// Every dip is measured from a point, so without one v3 has nothing to
	// say. This is how it gets one, and it is the first thing the page shows:
	// no permission prompt fires until a reader presses for it, because a
	// prompt raised before anyone knows what the site is for is a question
	// about trust asked of a stranger. The map is the alternative, offered on
	// equal terms, and it can be answered without telling anyone anything.
	//
	// Deliberately not a real map. No tiles, no zoom, no pan — one outline of
	// one city that fits on the screen, because the question is "which part of
	// town", not "which building". Coarse is honest here: the answer only has
	// to be good enough to rank a walk against a ride, and the point gets
	// snapped to a ~50 m grid before any routing provider sees it anyway.
	import { TORONTO_OUTLINE } from '$lib/geo/torontoOutline.js';
	import { TORONTO_CONTEXT } from '$lib/geo/torontoContext.js';
	import { cityBounds, makeProjection, outlinePath, ringsPath, linesPath } from './placemap.js';

	// liveStatus: 'idle' — the button is there to be pressed; 'asking' — the
	// browser is deciding; 'denied' — it said no, and saying it again is not
	// something a page can make happen; 'off' — this browser has no
	// geolocation, or we are in a frame and won't raise a prompt a hostile
	// parent could dress up as its own.
	let { onplace, onlive, liveStatus = 'off' } = $props();

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
		// The lake is an area, not a line: it is what tells you that the bottom
		// of this shape is a coast rather than the edge of the drawing.
		lake: ringsPath(TORONTO_CONTEXT.lake, projection),
		water: linesPath(TORONTO_CONTEXT.water, projection),
		streets: linesPath(TORONTO_CONTEXT.streets, projection),
		subway: linesPath(TORONTO_CONTEXT.subway, projection)
	};

	// No marker until there is something to mark. One drawn on load would be a
	// claim about where the reader is, made before they have said anything —
	// and a wrong one, since it can only sit wherever the box happens to
	// centre. The keyboard route starts it in the middle at the first arrow
	// press, which is the moment it stops being a lie.
	let mark = $state(null);

	// One arrow press moves about a kilometre — fine enough to pick a
	// neighbourhood, coarse enough to cross the city without wearing out a
	// thumb. Shift moves five times as far. Measured off the projection rather
	// than recomputed from the bounds: the map is turned to the street grid,
	// so a degree of latitude is no longer a vertical distance on screen.
	const STEP_KM = 1;
	const stepPx = (() => {
		const mid = projection.toXY(bounds.west, bounds.south);
		const km = projection.toXY(bounds.west, bounds.south + STEP_KM / 111);
		return Math.hypot(km.x - mid.x, km.y - mid.y);
	})();

	function place(x, y) {
		mark = {
			x: Math.max(0, Math.min(BOX.w, x)),
			y: Math.max(0, Math.min(BOX.h, y))
		};
	}

	// A tap is the whole interaction. It used to place a marker and then wait
	// for a "Show dips from here" press, which asked the reader to confirm a
	// thing they had just done deliberately with their thumb — a second step
	// buys certainty only where a mistake is expensive, and this one is
	// undone by the pin in the header.
	function fromPointer(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		// The SVG scales to its container, so a client pixel is not a viewBox
		// unit; convert through the rendered size or every tap lands short.
		place(
			((event.clientX - rect.left) / rect.width) * BOX.w,
			((event.clientY - rect.top) / rect.height) * BOX.h
		);
		confirm();
	}

	// The keyboard cannot tap, so it gets the two-step version it needs:
	// arrows move, Enter commits. Without it this control would be a map only
	// a pointer can answer, and the page has no other way to say where you are.
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
			const from = mark ?? { x: BOX.w / 2, y: BOX.h / 2 };
			place(from.x + move[0] * stepPx * far, from.y + move[1] * stepPx * far);
			return;
		}
		// Enter on nothing is not a location, so it says nothing.
		if ((event.key === 'Enter' || event.key === ' ') && mark) {
			event.preventDefault();
			confirm();
		}
	}

	function confirm() {
		const { lng, lat } = projection.toLngLat(mark.x, mark.y);
		onplace({ lat, lng });
	}
</script>

<section class="place">
	{#if liveStatus !== 'off'}
		<button
			class="live"
			type="button"
			onclick={onlive}
			disabled={liveStatus !== 'idle'}
			aria-busy={liveStatus === 'asking'}
		>
			use live location
		</button>
	{/if}

	<!-- The whole instruction, and the whole affordance. A crosshair, a
	     pulsing target or a pin glyph would each be a second way of saying the
	     same four words, drawn on top of the geography a reader is trying to
	     read. -->
	<p class="hint">or tap the map</p>

	<!-- A real button rather than a tabbable SVG: it is focusable, announced
	     and keyboard-operable for free, and nothing has to be re-implemented
	     to make it so. Placement listens for pointerdown (only a real pointer
	     carries coordinates) while the keyboard drives the marker with the
	     arrow keys, so the synthetic click a button fires on Enter is simply
	     never listened for. -->
	<button
		type="button"
		class="map"
		aria-label="Map of Toronto showing the lake, rivers, main roads and subway lines. Tap where you are, or use the arrow keys to move the marker and Enter to confirm."
		onpointerdown={fromPointer}
		onkeydown={onKeydown}
	>
		<svg viewBox="0 0 {BOX.w} {BOX.h}" class="canvas" aria-hidden="true">
			<path class="lake" d={context.lake} />
			<path class="city" d={path} />
			<path class="streets" d={context.streets} />
			<path class="water" d={context.water} />
			<path class="subway" d={context.subway} />
			{#if mark}
				<g class="mark" transform="translate({mark.x},{mark.y})">
					<circle class="halo" r="11" />
					<circle class="dot" r="4" />
				</g>
			{/if}
		</svg>
	</button>
</section>

<style>
	/* Not a card. The panel, the border and the radius drew a box around the
	   only thing on the screen, which is a frame around a frame — the map and
	   its two controls sit on the page like everything else. */
	.place {
		margin: 0.75rem 0;
	}
	/* The live route is offered first because it is the better answer when it
	   is available — precise, and one press. It is a button and not a link, so
	   it is painted in the one colour this site spends on pressable things. */
	.live {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 999px;
		background: var(--interactive);
		color: var(--paper);
		font: 600 0.95rem/1 inherit;
		padding: 0.7rem 1rem;
		cursor: pointer;
	}
	/* Pressed, and either waiting on the browser or refused by it. A refusal
	   is sticky per origin — pressing again raises nothing — so the button
	   stops offering. */
	.live:disabled {
		background: var(--dip-bg);
		color: var(--gray-500);
		cursor: default;
	}
	.hint {
		margin: 0.5rem 0;
		font-size: 0.8125rem;
		color: var(--gray-500);
	}
	.map {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		touch-action: manipulation;
		cursor: crosshair;
	}
	.canvas {
		display: block;
		width: 100%;
		height: auto;
	}
	.map:focus-visible {
		outline: 3px solid var(--interactive);
		outline-offset: 2px;
	}
	/* Four tones under the marker, each quieter than the data on top of it.
	   None is labelled: you are meant to recognise the shape, not read it.
	   Land is the page itself and water is the one tinted field, so the coast
	   reads as a coast — the city keeps a darker edge than anything else here
	   so its boundary stays findable where it meets the lake. */
	.lake {
		fill: var(--dip-bg);
		stroke: none;
	}
	.city {
		fill: var(--paper);
		stroke: var(--trip-rule);
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
		fill: color-mix(in srgb, var(--interactive) 18%, transparent);
	}
	.mark .dot {
		fill: var(--interactive);
		stroke: var(--paper);
		stroke-width: 1.5;
	}
</style>
