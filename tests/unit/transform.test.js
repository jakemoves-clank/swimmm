import { describe, it, expect } from 'vitest';
import { isAdultLaneSwim, toSession, buildLocations } from '../../src/lib/server/transform.js';

// Rows mirror the exact field names of the city's Drop-in.json
function row(overrides = {}) {
	return {
		_id: 1,
		'Location ID': 1098,
		Course_ID: 158568,
		'Course Title': 'Lane Swim',
		Section: 'Swim - Drop-In',
		'Age Min': '7',
		'Age Max': 'None',
		'Date Range': '2026-07-24 to 2026-07-24',
		'Start Hour': 19,
		'Start Minute': 15,
		'End Hour': 21,
		'End Min': 0,
		'First Date': '2026-07-24',
		'Last Date': '2026-07-24',
		DayOftheWeek: 'Friday',
		...overrides
	};
}

describe('isAdultLaneSwim', () => {
	it('accepts a plain Lane Swim open to all ages', () => {
		expect(isAdultLaneSwim(row())).toBe(true);
	});

	it('accepts Lane Swim: Older Adult (adults can attend)', () => {
		expect(isAdultLaneSwim(row({ 'Course Title': 'Lane Swim: Older Adult', 'Age Min': '60' }))).toBe(true);
	});

	it('accepts course-length variants like Lane Swim: Long Course (50m)', () => {
		expect(isAdultLaneSwim(row({ 'Course Title': 'Lane Swim: Long Course (50m)' }))).toBe(true);
	});

	it('rejects non-lane swims', () => {
		expect(isAdultLaneSwim(row({ 'Course Title': 'Leisure Swim' }))).toBe(false);
		expect(isAdultLaneSwim(row({ 'Course Title': 'Aquatic Fitness: Shallow' }))).toBe(false);
	});

	it('rejects rows outside the swim drop-in section', () => {
		expect(isAdultLaneSwim(row({ Section: 'Sports - Drop-In', 'Course Title': 'Lane Swim' }))).toBe(false);
	});

	it('rejects family lane swim (not an adult session)', () => {
		expect(isAdultLaneSwim(row({ 'Course Title': 'Lane Swim: Family' }))).toBe(false);
	});

	it('rejects sessions with an age cap below adulthood', () => {
		expect(isAdultLaneSwim(row({ 'Age Max': '17' }))).toBe(false);
	});
});

describe('toSession', () => {
	it('converts a row into a flat session with minutes-since-midnight times', () => {
		expect(toSession(row())).toEqual({
			location_id: 1098,
			course_id: 158568,
			title: 'Lane Swim',
			date: '2026-07-24',
			start_min: 19 * 60 + 15,
			end_min: 21 * 60
		});
	});
});

describe('buildLocations', () => {
	const locations = [
		{
			'Location ID': 189,
			'Location Name': 'Some Community Centre',
			'Street No': '100',
			'Street No Suffix': 'None',
			'Street Name': 'Main',
			'Street Type': 'St',
			'Street Direction': 'None',
			District: 'Toronto and East York'
		},
		{
			'Location ID': 433,
			'Location Name': 'Sunnyside Gus Ryder Outdoor Pool',
			'Street No': '1755',
			'Street No Suffix': 'None',
			'Street Name': 'Lake Shore',
			'Street Type': 'Blvd',
			'Street Direction': 'W',
			District: 'Toronto and East York'
		},
		{
			'Location ID': 437,
			'Location Name': 'Donald D. Summerville Olympic Pools',
			'Street No': '1867',
			'Street No Suffix': 'None',
			'Street Name': 'Lake Shore',
			'Street Type': 'Blvd',
			'Street Direction': 'E',
			District: 'Toronto and East York'
		}
	];

	const geojson = {
		features: [
			{
				properties: { LOCATIONID: '189', ASSET_NAME: 'SOME CC', ADDRESS: '100 Main St' },
				geometry: { type: 'MultiPoint', coordinates: [[-79.4, 43.7]] }
			},
			{
				// no LOCATIONID match for 433, but same street address → fallback join
				properties: { LOCATIONID: '394', ASSET_NAME: 'SUNNYSIDE PARK', ADDRESS: '1755 Lake Shore Blvd W' },
				geometry: { type: 'MultiPoint', coordinates: [[-79.456, 43.6375]] }
			}
		]
	};

	it('joins coordinates by LOCATIONID', () => {
		const out = buildLocations(locations, geojson);
		const cc = out.find((l) => l.id === 189);
		expect(cc).toMatchObject({
			name: 'Some Community Centre',
			address: '100 Main St',
			lat: 43.7,
			lng: -79.4
		});
	});

	it('falls back to matching by street address when the ID is absent', () => {
		const out = buildLocations(locations, geojson);
		const sunnyside = out.find((l) => l.id === 433);
		expect(sunnyside.lat).toBeCloseTo(43.6375);
		expect(sunnyside.lng).toBeCloseTo(-79.456);
	});

	it('keeps locations with no geo match, with null coordinates', () => {
		const out = buildLocations(locations, geojson);
		const summerville = out.find((l) => l.id === 437);
		expect(summerville.name).toBe('Donald D. Summerville Olympic Pools');
		expect(summerville.address).toBe('1867 Lake Shore Blvd E');
		expect(summerville.lat).toBeNull();
		expect(summerville.lng).toBeNull();
	});
});
