import { describe, it, expect } from 'vitest';
import { buildSchedule, trimSchedule, SCHEDULE_HORIZON_DAYS } from '../../src/lib/server/transform.js';

// Raw shapes as the city publishes them.
const dropin = [
	{
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
	},
	{
		'Location ID': 2,
		Course_ID: 11,
		'Course Title': 'Leisure Swim',
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

const locations = [1, 2, 3].map((id) => ({
	'Location ID': id,
	'Location Name': `Pool ${id}`,
	'Street No': String(id),
	'Street No Suffix': 'None',
	'Street Name': 'A',
	'Street Type': 'St',
	'Street Direction': 'None'
}));

const geojson = {
	features: [
		{
			properties: { LOCATIONID: '1' },
			geometry: { type: 'MultiPoint', coordinates: [[-79.4, 43.7]] }
		}
	]
};

describe('buildSchedule', () => {
	it('keeps adult lane and leisure swims, tagged with their kind', () => {
		const { sessions } = buildSchedule(dropin, locations, geojson);
		expect(sessions).toEqual([
			{
				location_id: 1,
				course_id: 10,
				kind: 'lane',
				title: 'Lane Swim',
				date: '2026-07-30',
				start_min: 540,
				end_min: 600
			},
			{
				location_id: 2,
				course_id: 11,
				kind: 'leisure',
				title: 'Leisure Swim',
				date: '2026-07-30',
				start_min: 540,
				end_min: 600
			}
		]);
	});

	it('keeps only the locations some session actually uses', () => {
		const { locations: locs } = buildSchedule(dropin, locations, geojson);
		// Pool 3 has no sessions of either kind, so it never reaches the client
		expect(locs.map((l) => l.id)).toEqual([1, 2]);
		expect(locs[0]).toMatchObject({ name: 'Pool 1', lat: 43.7, lng: -79.4 });
	});

	it('drops a location whose only sessions are filtered out', () => {
		const preschoolOnly = [{ ...dropin[1], 'Course Title': 'Leisure Swim: Preschool', 'Age Max': '5' }];
		const { sessions, locations: locs } = buildSchedule(preschoolOnly, locations, geojson);
		expect(sessions).toEqual([]);
		expect(locs).toEqual([]);
	});
});

// The city publishes about six weeks of swims and the whole lot used to be
// baked into the page: a megabyte of JSON in the HTML, a third of it days
// that had already happened or that the planner will never look at. It is
// parsed before anything can be drawn, on a phone, every visit.
describe('trimSchedule', () => {
	const session = (date) => ({ location_id: 1, course_id: 10, kind: 'lane', title: 'Lane Swim', date, start_min: 540, end_min: 600 });
	const schedule = {
		locations: [
			{ id: 1, name: 'Pool 1', lat: 43.7, lng: -79.4 },
			{ id: 2, name: 'Pool 2', lat: 43.7, lng: -79.4 }
		],
		sessions: [
			{ ...session('2026-08-09'), location_id: 2 }, // gone
			session('2026-08-11'), // yesterday, gone
			session('2026-08-12'), // today
			session('2026-08-26'),
			session('2026-10-01') // past the horizon
		]
	};
	const trimmed = trimSchedule(schedule, { today: '2026-08-12' });

	// A build can only ever be read *after* it was made, so a day already
	// behind the build is a day nobody will ever ask about.
	it('drops the days that had already happened when the site was built', () => {
		expect(trimmed.sessions.map((s) => s.date)).not.toContain('2026-08-11');
		expect(trimmed.sessions.map((s) => s.date)).toContain('2026-08-12');
	});

	// planDay looks a week ahead at most. The horizon is several times that,
	// so a build left stale by a quiet week at the city still answers a full
	// week — but it is not the city's whole publishing window.
	it('keeps well past what the planner can reach, and no further', () => {
		expect(SCHEDULE_HORIZON_DAYS).toBeGreaterThanOrEqual(21);
		expect(trimmed.sessions.map((s) => s.date)).toContain('2026-08-26');
		expect(trimmed.sessions.map((s) => s.date)).not.toContain('2026-10-01');
	});

	// A pool whose only swims were yesterday is a pool the page can say
	// nothing about — including in the count of ones the city never placed.
	it('drops a pool left with no sessions at all', () => {
		expect(trimmed.locations.map((l) => l.id)).toEqual([1]);
	});

	it('leaves a schedule inside the window exactly as it found it', () => {
		const inside = { locations: schedule.locations, sessions: [session('2026-08-12')] };
		expect(trimSchedule(inside, { today: '2026-08-12' }).sessions).toEqual(inside.sessions);
	});
});
