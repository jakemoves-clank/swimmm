import { describe, it, expect } from 'vitest';
import { buildDip, buildDips, fitDuration, offerDips } from '../../src/lib/dip.js';
import { DEFAULT_DIP_DURATION_MIN, DIP_SELECTION } from '../../src/lib/config.js';

const POOL = { id: 1, name: 'Regent Park', address: '640 Dundas St E', lat: 43.66, lng: -79.36 };
const NOW = 780; // 1:00 p.m.

const session = (over = {}) => ({
	course_id: 7,
	kind: 'lane',
	title: 'Lane Swim',
	start_min: 840, // 2:00 p.m.
	end_min: 960, // 4:00 p.m.
	...over
});

const dip = (session_, travel, over = {}) =>
	buildDip(session_, POOL, travel, { nowMin: NOW, preferredMin: 45, ...over });

describe('fitDuration', () => {
	it('gives you the length you asked for when the session has room', () => {
		expect(fitDuration(120, 45)).toBe(45);
	});

	it('shortens to the next option down when the window is tighter', () => {
		expect(fitDuration(40, 45)).toBe(30);
	});

	it('never hands you longer than you asked for, however much water there is', () => {
		expect(fitDuration(300, 30)).toBe(30);
	});

	it('has nothing to offer when even the shortest dip will not fit', () => {
		expect(fitDuration(25, 60)).toBeNull();
	});
});

describe('buildDip', () => {
	it('starts the dip when the water opens, if you can be there by then', () => {
		const d = dip(session(), { mode: 'walk', minutes: 20 });
		expect(d).toMatchObject({ start_min: 840, end_min: 885, durationMin: 45, shortfallMin: 0 });
	});

	it('tells you when to leave, which is the point of the whole thing', () => {
		const d = dip(session(), { mode: 'walk', minutes: 20 });
		expect(d.leaveBy).toBe(820); // 1:40 p.m. — twenty minutes before the water
	});

	it('starts the dip when you would arrive, if the session is already running', () => {
		const d = dip(session({ start_min: 700, end_min: 960 }), { mode: 'bike', minutes: 10 });
		expect(d).toMatchObject({ start_min: 790, durationMin: 45, inProgress: true });
	});

	// 1:00 + 22 minutes is 1:22, which is nobody's idea of an appointment.
	it('rounds an awkward arrival up to a time you could say out loud', () => {
		const d = dip(session({ start_min: 700, end_min: 960 }), { mode: 'bike', minutes: 22 });
		expect(d.start_min).toBe(805); // 1:25, not 1:22
		expect(d.leaveBy).toBe(783);
	});

	it('shortens the dip rather than dropping it when the session is nearly over', () => {
		const d = dip(session({ start_min: 700, end_min: 820 }), { mode: 'walk', minutes: 5 });
		expect(d).toMatchObject({ durationMin: 30, shortfallMin: 15, preferredMin: 45 });
	});

	it('offers nothing when the water closes before a dip could fit', () => {
		expect(dip(session({ start_min: 700, end_min: 800 }), { mode: 'walk', minutes: 5 })).toBeNull();
	});

	it('offers nothing when we have no travel time to the pool', () => {
		expect(dip(session(), { mode: 'walk', minutes: null })).toBeNull();
		expect(dip(session(), null)).toBeNull();
	});

	it('carries the session it came from, so a picture can draw the dip inside it', () => {
		const d = dip(session({ title: 'Lane Swim: Long Course (50m)' }), {
			mode: 'walk',
			minutes: 20
		});
		expect(d.session).toMatchObject({
			kind: 'lane',
			variant: 'Long Course (50m)',
			start_min: 840,
			end_min: 960
		});
	});

	it('defaults to the configured dip length', () => {
		const d = buildDip(session(), POOL, { mode: 'walk', minutes: 20 }, { nowMin: NOW });
		expect(d.preferredMin).toBe(DEFAULT_DIP_DURATION_MIN);
	});
});

// The whole pipeline the page runs: a baked city payload plus travel times
// in, a handful of offers out.
describe('buildDips', () => {
	const schedule = {
		locations: [
			{ id: 1, name: 'Regent Park', address: '640 Dundas St E', lat: 43.66, lng: -79.36 },
			{ id: 2, name: 'Alex Duff', address: '779 Crawford St', lat: 43.66, lng: -79.42 },
			{ id: 3, name: 'Nowhere', address: 'Unknown', lat: null, lng: null }
		],
		sessions: [
			{ location_id: 1, course_id: 1, kind: 'lane', title: 'Lane Swim', date: 'today', start_min: 840, end_min: 960 },
			{ location_id: 2, course_id: 2, kind: 'leisure', title: 'Leisure Swim', date: 'today', start_min: 840, end_min: 960 },
			{ location_id: 1, course_id: 3, kind: 'lane', title: 'Lane Swim', date: 'tomorrow', start_min: 840, end_min: 960 },
			{ location_id: 1, course_id: 4, kind: 'lane', title: 'Lane Swim', date: 'today', start_min: 480, end_min: 600 },
			{ location_id: 3, course_id: 5, kind: 'lane', title: 'Lane Swim', date: 'today', start_min: 840, end_min: 960 }
		]
	};
	const travel = new Map([
		[1, { walk: 10, bike: 4, drive: 6 }],
		[2, { walk: 50, bike: 30, drive: 25 }]
	]);
	const opts = (over = {}) => ({
		now: { date: 'today', minutes: NOW },
		travel,
		kind: 'lane',
		preferredMin: 45,
		...over
	});

	it('offers the sessions of the chosen kind, today, that are still to come', () => {
		const dips = buildDips(schedule, opts());
		expect(dips.map((d) => d.session.course_id)).toEqual([1]);
	});

	it('follows the kind toggle', () => {
		const dips = buildDips(schedule, opts({ kind: 'leisure' }));
		expect(dips).toEqual([]); // Alex Duff is beyond every threshold
	});

	it('offers nothing at a pool no mode can reach in time', () => {
		const dips = buildDips(schedule, opts({ kind: 'leisure', travel: new Map([[2, { walk: 50, bike: 30, drive: 12 }]]) }));
		expect(dips.map((d) => d.mode)).toEqual(['drive']);
	});

	// v1's rule was to list a swim it couldn't assess rather than hide it. A
	// concierge can't: "leave at 1:40" is a promise, and an ungeocoded pool
	// is one we can't make it for.
	it('cannot offer a pool the city never geocoded', () => {
		const dips = buildDips(schedule, opts());
		expect(dips.some((d) => d.location.id === 3)).toBe(false);
	});
});

describe('offerDips', () => {
	const pools = Array.from({ length: 8 }, (_, i) => ({
		id: i,
		name: `Pool ${i}`,
		address: `${i} Test St`,
		lat: 43.66,
		lng: -79.4
	}));
	const schedule = {
		locations: pools,
		sessions: pools.map((p, i) => ({
			location_id: p.id,
			course_id: i,
			kind: 'lane',
			title: 'Lane Swim',
			date: 'today',
			start_min: 840 + i * 60,
			end_min: 840 + i * 60 + 90
		}))
	};
	const travel = new Map(pools.map((p, i) => [p.id, { walk: 5 + i, bike: 3, drive: 3 }]));

	it('offers a handful, in the order the day runs, each scored', () => {
		const offered = offerDips(schedule, {
			now: { date: 'today', minutes: NOW },
			travel,
			kind: 'lane',
			preferredMin: 45
		});
		expect(offered).toHaveLength(DIP_SELECTION.COUNT);
		expect(offered.map((d) => d.start_min)).toEqual([...offered.map((d) => d.start_min)].sort((a, b) => a - b));
		expect(offered[0].appeal.score).toBeGreaterThan(0);
	});
});
