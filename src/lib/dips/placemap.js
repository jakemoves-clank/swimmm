// The projection behind the place-yourself map.
//
// When the browser won't say where you are, v3 asks you instead: here is
// Toronto, roughly where are you? That map is an *input device*, so the
// arithmetic has to run both ways — coordinates to pixels to draw the city,
// and pixels back to coordinates when a thumb lands on it — and a tap has to
// return the ground it was aimed at, not somewhere plausible nearby.
//
// Deliberately no d3-geo: this is one rectangle of one city that never
// rotates, pans or zooms, and the whole projection is four multiplications.
// The map concepts in v2 pull in d3 for far more than this; the root page
// shouldn't pay for it.

// Toronto sits near 43.7° north, where a degree of longitude is about 0.72 of
// a degree of latitude. A projection that ignored that would draw the city
// half again as wide as it is, and a tap aimed at downtown would land in the
// lake — which for an input device is not a cosmetic problem.
const REFERENCE_LAT = 43.72;
const LNG_SQUEEZE = Math.cos((REFERENCE_LAT * Math.PI) / 180);

export function cityBounds(outline) {
	let west = Infinity;
	let east = -Infinity;
	let south = Infinity;
	let north = -Infinity;
	for (const poly of outline.coordinates) {
		for (const ring of poly) {
			for (const [lng, lat] of ring) {
				if (lng < west) west = lng;
				if (lng > east) east = lng;
				if (lat < south) south = lat;
				if (lat > north) north = lat;
			}
		}
	}
	return { west, east, south, north };
}

/**
 * An equirectangular projection fitted to a box, centred, preserving shape.
 *
 * @returns { toXY(lng, lat), toLngLat(x, y), width, height } — width/height
 * are what the city actually fills, which is usually less than the box in one
 * axis; the caller centres it with the returned offsets baked in.
 */
export function makeProjection(bounds, boxW, boxH) {
	// Work in a flat space where one unit is one degree of latitude, so the
	// city keeps its proportions whatever the box is shaped like.
	const spanX = (bounds.east - bounds.west) * LNG_SQUEEZE;
	const spanY = bounds.north - bounds.south;
	const scale = Math.min(boxW / spanX, boxH / spanY);
	const drawnW = spanX * scale;
	const drawnH = spanY * scale;
	const offsetX = (boxW - drawnW) / 2;
	const offsetY = (boxH - drawnH) / 2;

	return {
		width: drawnW,
		height: drawnH,
		toXY(lng, lat) {
			return {
				x: offsetX + (lng - bounds.west) * LNG_SQUEEZE * scale,
				// Screens count downwards and the world counts north upwards.
				y: offsetY + (bounds.north - lat) * scale
			};
		},
		toLngLat(x, y) {
			return {
				lng: bounds.west + (x - offsetX) / (LNG_SQUEEZE * scale),
				lat: bounds.north - (y - offsetY) / scale
			};
		}
	};
}

// The city as one SVG path. Every ring closed, so the shape fills cleanly
// and the islands read as islands.
export function outlinePath(outline, projection) {
	const parts = [];
	for (const poly of outline.coordinates) {
		for (const ring of poly) {
			const points = ring.map(([lng, lat]) => {
				const { x, y } = projection.toXY(lng, lat);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			});
			if (points.length) parts.push(`M${points.join('L')}Z`);
		}
	}
	return parts.join('');
}

// The context layers (water, through-routes, subway) as one path each. Open
// polylines, not closed rings: a river drawn as an outline reads as a lake.
export function linesPath(lines, projection) {
	return lines
		.map((line) =>
			line
				.map(([lng, lat], i) => {
					const { x, y } = projection.toXY(lng, lat);
					return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
				})
				.join('')
		)
		.join('');
}
