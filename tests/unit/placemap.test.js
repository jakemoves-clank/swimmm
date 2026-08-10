import { describe, it, expect } from 'vitest';
import { cityBounds, makeProjection, outlinePath } from '../../src/lib/v3/placemap.js';
import { TORONTO_OUTLINE } from '../../src/lib/geo/torontoOutline.js';

describe('cityBounds', () => {
	it('encloses every point of the city outline', () => {
		const b = cityBounds(TORONTO_OUTLINE);
		for (const poly of TORONTO_OUTLINE.coordinates) {
			for (const ring of poly) {
				for (const [lng, lat] of ring) {
					expect(lng).toBeGreaterThanOrEqual(b.west);
					expect(lng).toBeLessThanOrEqual(b.east);
					expect(lat).toBeGreaterThanOrEqual(b.south);
					expect(lat).toBeLessThanOrEqual(b.north);
				}
			}
		}
	});
});

describe('makeProjection', () => {
	const bounds = { west: -79.64, east: -79.11, south: 43.58, north: 43.86 };
	const p = makeProjection(bounds, 320, 200);

	it('puts the whole city inside the box it was given', () => {
		for (const [lng, lat] of [
			[bounds.west, bounds.south],
			[bounds.east, bounds.north],
			[bounds.west, bounds.north]
		]) {
			const { x, y } = p.toXY(lng, lat);
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(320);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(200);
		}
	});

	it('puts north at the top, which a map that reads wrongly would not', () => {
		expect(p.toXY(-79.4, bounds.north).y).toBeLessThan(p.toXY(-79.4, bounds.south).y);
	});

	// The map is the input device, so a tap has to land back on the ground it
	// was aimed at — within a metre or so, not merely nearby.
	it('turns a tap back into the coordinates it was aimed at', () => {
		for (const [lng, lat] of [
			[-79.3839, 43.6535],
			[-79.5, 43.75],
			[-79.2, 43.8]
		]) {
			const { x, y } = p.toXY(lng, lat);
			const back = p.toLngLat(x, y);
			expect(back.lng).toBeCloseTo(lng, 6);
			expect(back.lat).toBeCloseTo(lat, 6);
		}
	});

	// Toronto is ~43.7° north, where a degree of longitude is about 0.72 of a
	// degree of latitude. Ignoring that draws a city stretched half again as
	// wide as it is, and a tap in the middle of it lands in the lake.
	it('does not stretch the city sideways', () => {
		const kmPerDegLat = 111;
		const kmPerDegLng = 111 * Math.cos((43.72 * Math.PI) / 180);
		const wide = p.toXY(bounds.east, 43.72).x - p.toXY(bounds.west, 43.72).x;
		const tall = p.toXY(-79.4, bounds.south).y - p.toXY(-79.4, bounds.north).y;
		const drawn = wide / tall;
		const real =
			((bounds.east - bounds.west) * kmPerDegLng) / ((bounds.north - bounds.south) * kmPerDegLat);
		expect(drawn).toBeCloseTo(real, 1);
	});
});

describe('outlinePath', () => {
	it('draws every ring as a closed subpath', () => {
		const p = makeProjection(cityBounds(TORONTO_OUTLINE), 320, 200);
		const d = outlinePath(TORONTO_OUTLINE, p);
		const rings = TORONTO_OUTLINE.coordinates.flat().length;
		expect((d.match(/M/g) ?? []).length).toBe(rings);
		expect((d.match(/Z/g) ?? []).length).toBe(rings);
		expect(d).not.toMatch(/NaN/);
	});
});
