import { describe, it, expect } from 'vitest';
import { buildSchedule } from '../../src/lib/server/transform.js';

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
