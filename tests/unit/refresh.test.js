import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, getMeta, sessionsForDate } from '../../src/lib/server/db.js';
import { maybeRefresh } from '../../src/lib/server/refresh.js';

// A fake fetch that serves CKAN metadata and data files, and counts hits per URL.
function fakeCity({ lastRefreshed }) {
	const hits = {};
	const dropin = [
		{
			_id: 1,
			'Location ID': 1,
			Course_ID: 10,
			'Course Title': 'Lane Swim',
			Section: 'Swim - Drop-In',
			'Age Min': '7',
			'Age Max': 'None',
			'Start Hour': 9,
			'Start Minute': 0,
			'End Hour': 10,
			'End Min': 0,
			'First Date': '2026-07-30',
			'Last Date': '2026-07-30'
		}
	];
	const locations = [
		{
			'Location ID': 1,
			'Location Name': 'Pool A',
			'Street No': '1',
			'Street No Suffix': 'None',
			'Street Name': 'A',
			'Street Type': 'St',
			'Street Direction': 'None'
		}
	];
	const geojson = {
		features: [
			{
				properties: { LOCATIONID: '1', ADDRESS: '1 A St' },
				geometry: { type: 'MultiPoint', coordinates: [[-79.4, 43.7]] }
			}
		]
	};
	const fetchImpl = async (url) => {
		hits[url] = (hits[url] || 0) + 1;
		let body;
		if (url.includes('package_show')) {
			body = { result: { last_refreshed: lastRefreshed.value, resources: [] } };
		} else if (url.includes('drop-in')) body = dropin;
		else if (url.includes('locations')) body = locations;
		else if (url.includes('geojson')) body = geojson;
		else throw new Error('unexpected url ' + url);
		return { ok: true, json: async () => body };
	};
	return { fetchImpl, hits, metaHits: () => Object.entries(hits).filter(([u]) => u.includes('package_show')).reduce((n, [, c]) => n + c, 0), fileHits: () => Object.entries(hits).filter(([u]) => !u.includes('package_show')).reduce((n, [, c]) => n + c, 0) };
}

let db;
beforeEach(() => {
	db = openDb(':memory:');
});

describe('maybeRefresh', () => {
	it('downloads and stores data on first run', async () => {
		const city = fakeCity({ lastRefreshed: { value: '2026-07-23 21:38:47' } });
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => Date.parse('2026-07-30T12:00:00Z') });
		expect(sessionsForDate(db, '2026-07-30')).toHaveLength(1);
		expect(city.fileHits()).toBeGreaterThan(0);
	});

	it('does not even check metadata again within the check interval', async () => {
		const city = fakeCity({ lastRefreshed: { value: '2026-07-23 21:38:47' } });
		const t0 = Date.parse('2026-07-30T12:00:00Z');
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 });
		const metaAfterFirst = city.metaHits();
		// 6 hours later — under the ~20h check interval
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 + 6 * 3600_000 });
		expect(city.metaHits()).toBe(metaAfterFirst);
	});

	it('checks metadata after the interval but skips downloads when city data unchanged', async () => {
		const city = fakeCity({ lastRefreshed: { value: '2026-07-23 21:38:47' } });
		const t0 = Date.parse('2026-07-30T12:00:00Z');
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 });
		const filesAfterFirst = city.fileHits();
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 + 25 * 3600_000 });
		expect(city.metaHits()).toBeGreaterThan(1);
		expect(city.fileHits()).toBe(filesAfterFirst);
	});

	it('re-downloads when the city publishes a new refresh', async () => {
		const lastRefreshed = { value: '2026-07-23 21:38:47' };
		const city = fakeCity({ lastRefreshed });
		const t0 = Date.parse('2026-07-30T12:00:00Z');
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 });
		const filesAfterFirst = city.fileHits();
		lastRefreshed.value = '2026-07-30 21:38:47';
		await maybeRefresh(db, { fetchImpl: city.fetchImpl, now: () => t0 + 25 * 3600_000 });
		expect(city.fileHits()).toBeGreaterThan(filesAfterFirst);
		expect(getMeta(db, 'programs_last_refreshed')).toBe('2026-07-30 21:38:47');
	});
});
