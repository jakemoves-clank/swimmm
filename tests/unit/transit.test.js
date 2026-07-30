import { describe, it, expect } from 'vitest';
import { transitPlanUrl, parseTransitItineraries, fetchTransitTimes } from '../../src/lib/transit.js';

const origin = { lat: 43.6532, lng: -79.3832 };
const pool = (id, lat, lng) => ({ id, lat, lng });

describe('transitPlanUrl', () => {
	it('builds a Transitous plan URL with lat,lng places and a departure time', () => {
		const url = transitPlanUrl(origin, pool(1, 43.7068, -79.3986), '2026-07-30T22:00:00Z');
		expect(url).toContain('api.transitous.org/api/v1/plan');
		expect(url).toContain('fromPlace=43.6532%2C-79.3832');
		expect(url).toContain('toPlace=43.7068%2C-79.3986');
		expect(url).toContain('time=2026-07-30T22%3A00%3A00Z');
	});
});

describe('parseTransitItineraries', () => {
	const body = {
		itineraries: [
			{ duration: 2400, transfers: 2 }, // fastest but too many connections
			{ duration: 2700, transfers: 1 },
			{ duration: 3300, transfers: 0 }
		]
	};

	it('returns the fastest itinerary within the connection limit, in minutes', () => {
		expect(parseTransitItineraries(body, 1)).toEqual({ minutes: 45, connections: 1 });
	});

	it('honours a stricter connection limit', () => {
		expect(parseTransitItineraries(body, 0)).toEqual({ minutes: 55, connections: 0 });
	});

	it('returns null when nothing qualifies or there are no itineraries', () => {
		expect(parseTransitItineraries({ itineraries: [{ duration: 2400, transfers: 2 }] }, 1)).toBeNull();
		expect(parseTransitItineraries({ itineraries: [] }, 1)).toBeNull();
		expect(parseTransitItineraries({}, 1)).toBeNull();
	});
});

describe('fetchTransitTimes', () => {
	const pools = [
		pool(1, 43.66, -79.39), // ~1 km away
		pool(2, 43.7, -79.42), // ~6 km
		pool(3, 43.8, -79.2) // ~21 km
	];

	it('queries only the nearest pools up to the limit and maps results', async () => {
		const hit = [];
		const fetchImpl = async (url) => {
			hit.push(url);
			return {
				ok: true,
				json: async () => ({ itineraries: [{ duration: 1320, transfers: 0 }] })
			};
		};
		const out = await fetchTransitTimes(origin, pools, {
			fetchImpl,
			maxConnections: 1,
			limit: 2,
			now: () => '2026-07-30T22:00:00Z'
		});
		expect(hit).toHaveLength(2);
		expect(out.get(1)).toEqual({ minutes: 22, connections: 0 });
		expect(out.get(2)).toEqual({ minutes: 22, connections: 0 });
		expect(out.has(3)).toBe(false); // farthest pool skipped by the limit
	});

	it('tolerates individual failures — a failing lookup just yields no entry', async () => {
		const fetchImpl = async (url) => {
			if (url.includes('43.66')) throw new Error('boom');
			return { ok: true, json: async () => ({ itineraries: [{ duration: 600, transfers: 0 }] }) };
		};
		const out = await fetchTransitTimes(origin, pools, {
			fetchImpl,
			maxConnections: 1,
			limit: 2,
			now: () => '2026-07-30T22:00:00Z'
		});
		expect(out.has(1)).toBe(false);
		expect(out.get(2)).toEqual({ minutes: 10, connections: 0 });
	});
});
