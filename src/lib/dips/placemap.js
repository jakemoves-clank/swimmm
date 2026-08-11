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

// Toronto is drawn to *grid* north, not true north.
//
// Nobody here navigates by the pole. Bloor runs "east", Yonge runs "north",
// and the concession grid those follow sits about a sixth of a right angle off
// the meridian — so a true-north map of Toronto is a map every local reads at
// a tilt. Squaring the grid to the screen costs nothing (the map carries no
// compass and never claimed one) and buys the one thing this map is for:
// recognising your own neighbourhood fast enough to point at it.
//
// The angle is measured, not eyeballed. Over all 16,939 centreline records the
// map's own build script pulls (expressway, major/minor arterial, collector),
// the length-weighted circular mean of segment bearings — folded into a 90°
// period, since a grid has no head or tail, and re-estimated within ±15° of
// the peak so the diagonals and the ravine roads don't drag it — comes out at
// 73.9° east of north for the east–west family. Its perpendicular is grid
// north: 16.1° west of true north. The sub-grids agree closely enough for one
// number to serve (Bloor and the old city: 17.3°; the arterials north of
// Eglinton: 15.5°), and disagree enough that a rounder-looking 15 or 20 would
// be a guess dressed as a fact.
export const GRID_NORTH_DEG = -16.1;
const GRID_COS = Math.cos((GRID_NORTH_DEG * Math.PI) / 180);
const GRID_SIN = Math.sin((GRID_NORTH_DEG * Math.PI) / 180);

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
	const flatX = (lng) => (lng - bounds.west) * LNG_SQUEEZE;
	const flatY = (lat) => lat - bounds.south;
	// …then turn that space so grid north is up. Rotation is the whole trick:
	// it is a rigid transform, so shapes, proportions and the inverse all
	// survive it — which they must, because a tap has to come back out as the
	// ground it was aimed at.
	const gridU = (u, v) => u * GRID_COS - v * GRID_SIN;
	const gridV = (u, v) => u * GRID_SIN + v * GRID_COS;

	// The box has to hold the *turned* city, so it is fitted to the rotated
	// corners of the bounds rather than to the lat/lng box itself. A rotated
	// rectangle's bounding box is the bounding box of its corners, so nothing
	// inside the bounds can fall outside the fit.
	const corners = [
		[bounds.west, bounds.south],
		[bounds.west, bounds.north],
		[bounds.east, bounds.south],
		[bounds.east, bounds.north]
	].map(([lng, lat]) => [gridU(flatX(lng), flatY(lat)), gridV(flatX(lng), flatY(lat))]);
	const minU = Math.min(...corners.map((c) => c[0]));
	const maxU = Math.max(...corners.map((c) => c[0]));
	const minV = Math.min(...corners.map((c) => c[1]));
	const maxV = Math.max(...corners.map((c) => c[1]));

	const scale = Math.min(boxW / (maxU - minU), boxH / (maxV - minV));
	const drawnW = (maxU - minU) * scale;
	const drawnH = (maxV - minV) * scale;
	const offsetX = (boxW - drawnW) / 2;
	const offsetY = (boxH - drawnH) / 2;

	return {
		width: drawnW,
		height: drawnH,
		toXY(lng, lat) {
			const u = flatX(lng);
			const v = flatY(lat);
			return {
				x: offsetX + (gridU(u, v) - minU) * scale,
				// Screens count downwards and the world counts north upwards.
				y: offsetY + (maxV - gridV(u, v)) * scale
			};
		},
		toLngLat(x, y) {
			const U = minU + (x - offsetX) / scale;
			const V = maxV - (y - offsetY) / scale;
			// The transpose of a rotation is its inverse — no matrix solve, no
			// drift, and the round trip is exact to the last decimal place.
			const u = U * GRID_COS + V * GRID_SIN;
			const v = -U * GRID_SIN + V * GRID_COS;
			return {
				lng: bounds.west + u / LNG_SQUEEZE,
				lat: bounds.south + v
			};
		}
	};
}

// Closed rings as one SVG path — the city, and the lake it sits on. Every
// ring closed, so the shape fills cleanly and the holes (islands, and the
// islands' lagoons) punch through under fill-rule: evenodd.
export function ringsPath(rings, projection) {
	const parts = [];
	for (const ring of rings) {
		const points = ring.map(([lng, lat]) => {
			const { x, y } = projection.toXY(lng, lat);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		});
		if (points.length) parts.push(`M${points.join('L')}Z`);
	}
	return parts.join('');
}

// The city as one SVG path, from a MultiPolygon's every ring.
export function outlinePath(outline, projection) {
	return ringsPath(outline.coordinates.flat(), projection);
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
