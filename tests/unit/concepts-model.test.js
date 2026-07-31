import { describe, it, expect } from 'vitest';
import {
	availabilityCurve,
	bestBet,
	buildDay,
	clockOverride,
	estimateTravelMin,
	fastest,
	fmtClock,
	fmtHour,
	fmtMinutes
} from '../../src/lib/concepts/model.js';

const TODAY = '2026-07-31';
const NOON = { date: TODAY, minutes: 720 };

// City Hall, and a pool put exactly 1 km due north of it, so the distance
// arithmetic in these tests is checkable by hand.
const ORIGIN = { lat: 43.6535, lng: -79.3839 };
const KM_NORTH = 1 / 111.19;

function schedule({ locations, sessions }) {
	return { locations, sessions };
}

const pool = (id, name, extra = {}) => ({
	id,
	name,
	address: `${id} Test St`,
	lat: ORIGIN.lat + KM_NORTH,
	lng: ORIGIN.lng,
	...extra
});

const session = (location_id, start_min, end_min, extra = {}) => ({
	location_id,
	course_id: `${location_id}-${start_min}`,
	kind: 'lane',
	title: 'Lane Swim',
	date: TODAY,
	start_min,
	end_min,
	...extra
});

describe('estimateTravelMin', () => {
	it('applies the 4/π grid detour to both modes', () => {
		// 1 km straight line → 1.273 km of streets → 15.9 min at 4.8 km/h,
		// 5.1 min at 15 km/h.
		expect(estimateTravelMin(1)).toEqual({ walk: 16, bike: 5 });
	});

	it('scales linearly and never returns a negative', () => {
		expect(estimateTravelMin(10).bike).toBe(51);
		expect(estimateTravelMin(0)).toEqual({ walk: 0, bike: 0 });
	});
});

describe('fastest', () => {
	it('picks the smaller mode and names it', () => {
		expect(fastest({ walk: 30, bike: 9 })).toEqual({ mode: 'bike', minutes: 9 });
		expect(fastest({ walk: 4, bike: 6 })).toEqual({ mode: 'walk', minutes: 4 });
	});

	it('ignores modes with no time, and returns null when neither is known', () => {
		expect(fastest({ walk: 12, bike: null })).toEqual({ mode: 'walk', minutes: 12 });
		expect(fastest({ walk: null, bike: null })).toBe(null);
	});
});

describe('buildDay', () => {
	const base = schedule({
		locations: [pool(1, 'Near Pool')],
		sessions: [session(1, 780, 840)] // 1:00–2:00 pm
	});

	it('measures in-water time from arrival, not from the session start', () => {
		const travel = new Map([[1, { walk: 40, bike: 20 }]]);
		const [s] = buildDay(base, { now: NOON, origin: ORIGIN, travel }).sessions;

		expect(s.travelMin).toBe(20);
		expect(s.mode).toBe('bike');
		expect(s.arrive).toBe(740); // noon + 20
		expect(s.inWater).toBe(780); // but the session hasn't started yet
		expect(s.wait).toBe(40); // so you'd wait 40 minutes on the deck
		expect(s.swimMin).toBe(60);
	});

	it('starts the clock at arrival once a session is already under way', () => {
		const day = buildDay(schedule({ ...base, sessions: [session(1, 600, 780)] }), {
			now: NOON,
			origin: ORIGIN,
			travel: new Map([[1, { walk: 40, bike: 20 }]])
		});
		const [s] = day.sessions;

		expect(s.inProgress).toBe(true);
		expect(s.inWater).toBe(740); // you get in when you get there
		expect(s.wait).toBe(0);
		expect(s.swimMin).toBe(40);
	});

	it('marks a session infeasible when arriving leaves under the minimum swim', () => {
		const travel = new Map([[1, { walk: 100, bike: 95 }]]);
		const day = buildDay(base, { now: NOON, origin: ORIGIN, travel, minSwim: 30 });

		expect(day.sessions[0].swimMin).toBe(25); // in at 815, out at 840
		expect(day.sessions[0].feasible).toBe(false);
		expect(day.feasible).toEqual([]);
	});

	// The city leaves two pools out of its geo data. They stay on the list —
	// the product never hides a swim it can't assess — but they can never be
	// the answer to "which is closest", because we do not know.
	it('never calls a session at an unplaced pool feasible', () => {
		const day = buildDay(
			schedule({
				locations: [pool(9, 'Nowhere Pool', { lat: null, lng: null })],
				sessions: [session(9, 780, 900)]
			}),
			{ now: NOON, origin: ORIGIN }
		);

		expect(day.sessions).toHaveLength(1);
		expect(day.sessions[0].travelMin).toBe(null);
		expect(day.sessions[0].feasible).toBe(false);
		expect(day.upcoming).toHaveLength(1);
		expect(day.feasible).toEqual([]);
	});

	it('falls back to straight-line estimates when there are no routed times', () => {
		const [s] = buildDay(base, { now: NOON, origin: ORIGIN }).sessions;
		expect(s).toMatchObject({ walk: 16, bike: 5, travelMin: 5, mode: 'bike' });
	});

	it('leaves every travel time unknown when there is no origin', () => {
		const [s] = buildDay(base, { now: NOON }).sessions;
		expect(s.km).toBe(null);
		expect(s.travelMin).toBe(null);
		expect(s.feasible).toBe(false);
	});

	it('keeps only today, and separates what is over from what is upcoming', () => {
		const day = buildDay(
			schedule({
				locations: [pool(1, 'Near Pool')],
				sessions: [
					session(1, 480, 600), // 8–10 am, over
					session(1, 780, 840), // this afternoon
					session(1, 780, 840, { date: '2026-08-01' }) // tomorrow
				]
			}),
			{ now: NOON, origin: ORIGIN }
		);

		expect(day.sessions).toHaveLength(2);
		expect(day.sessions.map((s) => s.over)).toEqual([true, false]);
		expect(day.upcoming).toHaveLength(1);
	});

	it('drops sessions whose pool the city never listed', () => {
		const day = buildDay(schedule({ locations: [], sessions: [session(1, 780, 840)] }), {
			now: NOON,
			origin: ORIGIN
		});
		expect(day.sessions).toEqual([]);
		expect(day.pools).toEqual([]);
	});

	it('orders pools by travel time and gives each its own next swim', () => {
		const far = pool(2, 'Far Pool', { lat: ORIGIN.lat + KM_NORTH * 6, lng: ORIGIN.lng });
		const day = buildDay(
			schedule({
				locations: [far, pool(1, 'Near Pool')],
				sessions: [session(2, 800, 900), session(1, 840, 900), session(1, 780, 810)]
			}),
			{ now: NOON, origin: ORIGIN }
		);

		expect(day.pools.map((p) => p.name)).toEqual(['Near Pool', 'Far Pool']);
		expect(day.pools[0].next.start_min).toBe(780);
		expect(day.pools[0].sessions.map((s) => s.start_min)).toEqual([780, 840]);
	});
});

describe('bestBet', () => {
	const near = pool(1, 'Near Pool');
	const far = pool(2, 'Far Pool', { lat: ORIGIN.lat + KM_NORTH * 4, lng: ORIGIN.lng });

	it('takes the earliest moment you could be swimming, not the earliest start', () => {
		// Far Pool starts sooner, but you cannot get there before Near Pool's
		// later session has already let you in.
		const day = buildDay(
			schedule({
				locations: [near, far],
				sessions: [session(2, 725, 900), session(1, 730, 900)]
			}),
			{ now: NOON, origin: ORIGIN }
		);

		expect(day.sessions[0].poolId).toBe(2); // sorted by start time
		expect(bestBet(day).pool).toBe('Near Pool');
	});

	it('breaks a tie on the shorter trip', () => {
		const day = buildDay(
			schedule({ locations: [near, far], sessions: [session(1, 800, 900), session(2, 800, 900)] }),
			{ now: NOON, origin: ORIGIN }
		);

		const best = bestBet(day);
		expect(best.inWater).toBe(800); // both are waits, so both tie on time
		expect(best.pool).toBe('Near Pool');
	});

	it('is null when nothing is reachable in time', () => {
		const day = buildDay(schedule({ locations: [near], sessions: [session(1, 480, 600)] }), {
			now: NOON,
			origin: ORIGIN
		});
		expect(bestBet(day)).toBe(null);
	});
});

describe('availabilityCurve', () => {
	it('counts the sessions in the water at each step', () => {
		const day = buildDay(
			schedule({
				locations: [pool(1, 'A'), pool(2, 'B')],
				sessions: [session(1, 720, 780), session(2, 750, 900)]
			}),
			{ now: NOON, origin: ORIGIN }
		);

		expect(availabilityCurve(day, { step: 30, from: 720, to: 900 })).toEqual([
			{ minute: 720, count: 1 },
			{ minute: 750, count: 2 },
			{ minute: 780, count: 1 }, // the first session ends exactly here
			{ minute: 810, count: 1 },
			{ minute: 840, count: 1 },
			{ minute: 870, count: 1 },
			{ minute: 900, count: 0 }
		]);
	});
});

describe('clockOverride', () => {
	const params = (v) => new URLSearchParams(v === undefined ? '' : `at=${v}`);

	it('reads both hh:mm and a plain minute count', () => {
		expect(clockOverride(params('13:00'))).toBe(780);
		expect(clockOverride(params('7:05'))).toBe(425);
		expect(clockOverride(params('780'))).toBe(780);
		expect(clockOverride(params('0'))).toBe(0);
	});

	it('refuses anything outside a day rather than moving the reader somewhere odd', () => {
		expect(clockOverride(params('1440'))).toBe(null);
		expect(clockOverride(params('-1'))).toBe(null);
		expect(clockOverride(params('lunchtime'))).toBe(null);
		expect(clockOverride(params())).toBe(null);
		expect(clockOverride(undefined)).toBe(null);
	});
});

describe('formatting', () => {
	it('writes clock times the way a person says them', () => {
		expect(fmtClock(0)).toBe('12:00 am');
		expect(fmtClock(720)).toBe('12:00 pm');
		expect(fmtClock(785)).toBe('1:05 pm');
		expect(fmtClock(1439)).toBe('11:59 pm');
	});

	it('wraps rather than printing a 25th hour', () => {
		expect(fmtClock(1440)).toBe('12:00 am');
		expect(fmtClock(1500)).toBe('1:00 am');
	});

	it('drops the minutes on the hour, for axes', () => {
		expect(fmtHour(780)).toBe('1');
		expect(fmtHour(795)).toBe('1:15');
		expect(fmtHour(720)).toBe('12');
	});

	it('spells durations in hours once they pass one', () => {
		expect(fmtMinutes(45)).toBe('45 min');
		expect(fmtMinutes(60)).toBe('1 h');
		expect(fmtMinutes(135)).toBe('2 h 15 min');
		expect(fmtMinutes(null)).toBe('—');
	});
});
