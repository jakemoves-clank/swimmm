import { describe, it, expect } from 'vitest';
import {
	chunkPools,
	matrixUrl,
	fetchTravelTimes,
	fetchTravelTimesFor,
	isReachable
} from '../../src/lib/travel.js';

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

	it('encodes query values so a token with reserved characters cannot break the url', () => {
		const url = matrixUrl('walking', origin, [pool(1, 43.7, -79.5)], 'pk.a+b&c=d');
		expect(new URL(url).searchParams.get('access_token')).toBe('pk.a+b&c=d');
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

	it('names the problem when Mapbox returns an unexpected shape', async () => {
		const fetchImpl = async () => ({ ok: true, json: async () => ({ code: 'Ok' }) });
		await expect(
			fetchTravelTimes(origin, [pool(1, 43.7, -79.5)], 'pk.test', fetchImpl)
		).rejects.toThrow(/durations/i);
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

describe('fetchTravelTimesFor', () => {
	// Each mode is one more round trip to Mapbox, so v3 asks for driving and
	// v1 — which has no use for it — must not start paying for it.
	const spyFetch = () => {
		const profiles = [];
		const fetchImpl = async (url) => {
			profiles.push(new URL(url).pathname.split('/')[4]);
			return { ok: true, json: async () => ({ code: 'Ok', durations: [[0, 600]] }) };
		};
		return { profiles, fetchImpl };
	};

	it('asks Mapbox only for the modes it was told to', async () => {
		const { profiles, fetchImpl } = spyFetch();
		const t = await fetchTravelTimesFor(origin, [pool(1, 43.7, -79.5)], 'pk.test', {
			modes: ['walk', 'drive'],
			fetchImpl
		});
		expect(profiles.sort()).toEqual(['driving', 'walking']);
		expect(t.get(1)).toEqual({ walk: 10, drive: 10 });
	});

	// 104 pools is five chunks of 24, and they used to go out one after
	// another — five round trips deep, per mode, with the page showing
	// nothing until the last one landed. They are independent requests to the
	// same endpoint; there is no reason for the second to wait on the first.
	it('asks for every chunk at once rather than a round trip at a time', async () => {
		const pools = Array.from({ length: 50 }, (_, i) => pool(i, 43.7, -79.5));
		let inflight = 0;
		let peak = 0;
		const fetchImpl = async () => {
			inflight++;
			peak = Math.max(peak, inflight);
			await Promise.resolve();
			inflight--;
			return { ok: true, json: async () => ({ code: 'Ok', durations: [[0, 600]] }) };
		};
		await fetchTravelTimesFor(origin, pools, 'pk.test', { modes: ['walk'], fetchImpl });
		expect(peak).toBe(3);
	});

	it('leaves the two-mode default alone, so /v1 makes no extra request', async () => {
		const { profiles, fetchImpl } = spyFetch();
		const t = await fetchTravelTimes(origin, [pool(1, 43.7, -79.5)], 'pk.test', fetchImpl);
		expect(profiles.sort()).toEqual(['cycling', 'walking']);
		expect(t.get(1)).toEqual({ walk: 10, bike: 10 });
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
