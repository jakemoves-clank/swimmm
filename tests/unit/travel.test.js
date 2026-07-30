import { describe, it, expect } from 'vitest';
import { chunkPools, matrixUrl, fetchTravelTimes, isReachable } from '../../src/lib/travel.js';

const origin = { lat: 43.66, lng: -79.4 };
const pool = (id, lat, lng) => ({ id, lat, lng });

describe('chunkPools', () => {
	it('splits pools into Matrix-API-sized chunks (24 destinations + 1 origin = 25 coords)', () => {
		const pools = Array.from({ length: 50 }, (_, i) => pool(i, 43, -79));
		const chunks = chunkPools(pools);
		expect(chunks.map((c) => c.length)).toEqual([24, 24, 2]);
	});
});

describe('matrixUrl', () => {
	it('builds a Matrix API url with origin first, lng,lat order, durations only', () => {
		const url = matrixUrl('cycling', origin, [pool(1, 43.7, -79.5)], 'pk.test');
		expect(url).toContain('directions-matrix/v1/mapbox/cycling/');
		expect(url).toContain('-79.4,43.66;-79.5,43.7');
		expect(url).toContain('sources=0');
		expect(url).toContain('annotations=duration');
		expect(url).toContain('access_token=pk.test');
	});
});

describe('fetchTravelTimes', () => {
	it('returns per-pool walk and bike minutes from matrix durations (seconds)', async () => {
		const pools = [pool(1, 43.7, -79.5), pool(2, 43.8, -79.2)];
		const fetchImpl = async (url) => ({
			ok: true,
			json: async () => ({
				code: 'Ok',
				// durations[0] = from origin: [origin→origin, origin→pool1, origin→pool2]
				durations: [url.includes('/walking/') ? [0, 1200, 6000] : [0, 480, 2400]]
			})
		});
		const t = await fetchTravelTimes(origin, pools, 'pk.test', fetchImpl);
		expect(t.get(1)).toEqual({ walk: 20, bike: 8 });
		expect(t.get(2)).toEqual({ walk: 100, bike: 40 });
	});

	it('skips null durations (unroutable pools)', async () => {
		const pools = [pool(1, 43.7, -79.5)];
		const fetchImpl = async () => ({
			ok: true,
			json: async () => ({ code: 'Ok', durations: [[0, null]] })
		});
		const t = await fetchTravelTimes(origin, pools, 'pk.test', fetchImpl);
		expect(t.get(1)).toEqual({ walk: null, bike: null });
	});
});

describe('isReachable', () => {
	const travel = { walk: 50, bike: 15 };
	const limits = { maxTravel: 60, minSwim: 30 };

	it('reachable when the faster mode arrives in time for a full-enough swim', () => {
		// now 10:00 (600), session 10:30–11:30, bike 15 min → arrive 10:15,
		// swim 10:30–11:30 = 60 min ≥ 30
		expect(isReachable({ start_min: 630, end_min: 690 }, travel, 600, limits)).toBe(true);
	});

	it('reachable when arriving mid-session with at least minSwim left', () => {
		// now 10:00, session 9:00–11:40, arrive 10:15 → 85 min left
		expect(isReachable({ start_min: 540, end_min: 700 }, travel, 600, limits)).toBe(true);
	});

	it('not reachable when even the faster mode exceeds the max travel time', () => {
		expect(isReachable({ start_min: 630, end_min: 690 }, { walk: 90, bike: 75 }, 600, limits)).toBe(false);
	});

	it('not reachable when arrival leaves less than minSwim in the water', () => {
		// now 10:00, session ends 10:40, arrive 10:15 → only 25 min left
		expect(isReachable({ start_min: 540, end_min: 640 }, travel, 600, limits)).toBe(false);
	});

	it('sessions with unknown travel times are kept (never silently hidden)', () => {
		expect(isReachable({ start_min: 630, end_min: 690 }, undefined, 600, limits)).toBe(true);
		expect(isReachable({ start_min: 630, end_min: 690 }, { walk: null, bike: null }, 600, limits)).toBe(true);
	});
});
