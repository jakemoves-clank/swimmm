import { describe, it, expect } from 'vitest';
import { pickTopResult } from '../../src/lib/topResult.js';
import { TOP_RESULT, DEFAULT_MIN_SWIM_MIN } from '../../src/lib/config.js';

// Sessions as annotated by the page: travel = {walk, bike} minutes (or
// undefined when unknown). Transit comes from a separate provider because
// Mapbox has no transit routing; tests inject one.
const NOW = 600; // 10:00
const session = (over = {}) => ({
	location_id: 1,
	pool: 'Pool',
	start_min: 660, // 11:00 — within the 2h window
	end_min: 720,
	travel: { walk: 10, bike: 5 },
	...over
});
const opts = (over = {}) => ({
	nowMin: NOW,
	minSwim: DEFAULT_MIN_SWIM_MIN,
	config: TOP_RESULT,
	getTransit: () => null,
	...over
});

describe('pickTopResult', () => {
	it('prefers walking when a session is within 15 min on foot', () => {
		const top = pickTopResult([session()], opts());
		expect(top).toMatchObject({ mode: 'walk', minutes: 10 });
	});

	it('ignores sessions starting beyond the 2-hour window', () => {
		const top = pickTopResult([session({ start_min: NOW + 121, end_min: NOW + 200 })], opts());
		expect(top).toBeNull();
	});

	it('falls back to biking (max 20 min) when walking is too slow', () => {
		const top = pickTopResult([session({ travel: { walk: 40, bike: 18 } })], opts());
		expect(top).toMatchObject({ mode: 'bike', minutes: 18 });
	});

	it('falls back to transit (max 30 min, max 1 connection) when biking is too slow', () => {
		const top = pickTopResult(
			[session({ travel: { walk: 50, bike: 25 } })],
			opts({ getTransit: () => ({ minutes: 22, connections: 1 }) })
		);
		expect(top).toMatchObject({ mode: 'transit', minutes: 22 });
	});

	it('rejects transit routes with more than one connection', () => {
		const top = pickTopResult(
			[session({ travel: { walk: 50, bike: 25 } })],
			opts({ getTransit: () => ({ minutes: 22, connections: 2 }) })
		);
		expect(top).toBeNull();
	});

	it('returns null (desert time) when no tier works', () => {
		const top = pickTopResult(
			[session({ travel: { walk: 50, bike: 25 } })],
			opts() // transit unavailable
		);
		expect(top).toBeNull();
	});

	it('requires enough time left to swim: a tier that arrives too late is skipped', () => {
		// Walking 10 min arrives 10:10 but the session ends 10:35 → 25 min < 30.
		// Biking 5 min arrives 10:05 → 30 min ≥ 30, so bike wins despite walk
		// being within its own travel limit.
		const top = pickTopResult(
			[session({ start_min: 540, end_min: 635, travel: { walk: 10, bike: 5 } })],
			opts()
		);
		expect(top).toMatchObject({ mode: 'bike', minutes: 5 });
	});

	it('picks the session you can be swimming in soonest, then the shortest travel', () => {
		const a = session({ location_id: 1, start_min: 700, end_min: 760 }); // swim at 11:40
		const b = session({ location_id: 2, start_min: 615, end_min: 700 }); // swim at 10:15
		const top = pickTopResult([a, b], opts());
		expect(top.session.location_id).toBe(2);
	});

	it('sessions with no travel data are never the top pick', () => {
		expect(pickTopResult([session({ travel: undefined })], opts())).toBeNull();
	});
});
