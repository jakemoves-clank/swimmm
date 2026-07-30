import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, replaceData, sessionsForDate, getMeta, setMeta } from '../../src/lib/server/db.js';

let db;
beforeEach(() => {
	db = openDb(':memory:');
});

const locations = [
	{ id: 1, name: 'Pool A', address: '1 A St', lat: 43.7, lng: -79.4 },
	{ id: 2, name: 'Pool B', address: '2 B St', lat: null, lng: null }
];

const sessions = [
	{ location_id: 1, course_id: 10, title: 'Lane Swim', date: '2026-07-30', start_min: 540, end_min: 600 },
	{ location_id: 1, course_id: 11, title: 'Lane Swim', date: '2026-07-30', start_min: 1140, end_min: 1230 },
	{ location_id: 2, course_id: 12, title: 'Lane Swim: Older Adult', date: '2026-07-30', start_min: 600, end_min: 660 },
	{ location_id: 1, course_id: 13, title: 'Lane Swim', date: '2026-07-31', start_min: 540, end_min: 600 }
];

describe('db', () => {
	it('stores and returns sessions for a given date joined with pool info, ordered by start time', () => {
		replaceData(db, { locations, sessions });
		const out = sessionsForDate(db, '2026-07-30');
		expect(out).toHaveLength(3);
		expect(out.map((s) => s.course_id)).toEqual([10, 12, 11]);
		expect(out[0]).toMatchObject({
			pool: 'Pool A',
			address: '1 A St',
			lat: 43.7,
			lng: -79.4,
			start_min: 540,
			end_min: 600
		});
		expect(out[1].lat).toBeNull();
	});

	it('replaceData is idempotent — a second load replaces, not appends', () => {
		replaceData(db, { locations, sessions });
		replaceData(db, { locations, sessions });
		expect(sessionsForDate(db, '2026-07-30')).toHaveLength(3);
	});

	it('meta key/value roundtrips', () => {
		expect(getMeta(db, 'nope')).toBeUndefined();
		setMeta(db, 'k', 'v1');
		setMeta(db, 'k', 'v2');
		expect(getMeta(db, 'k')).toBe('v2');
	});
});
