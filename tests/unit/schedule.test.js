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
	it('keeps only adult lane swims and only the locations they use', () => {
		const { sessions, locations: locs } = buildSchedule(dropin, locations, geojson);
		expect(sessions).toEqual([
			{ location_id: 1, course_id: 10, title: 'Lane Swim', date: '2026-07-30', start_min: 540, end_min: 600 }
		]);
		// Pool 2 (leisure only) and Pool 3 (no sessions) are pruned from the payload
		expect(locs.map((l) => l.id)).toEqual([1]);
		expect(locs[0]).toMatchObject({ name: 'Pool 1', lat: 43.7, lng: -79.4 });
	});
});
