import { describe, it, expect } from 'vitest';
import { snapToGrid, maxTravelMin, minSwimMin, LOCATION_GRID_DEG } from '../../src/lib/config.js';
import { buildLocations } from '../../src/lib/server/transform.js';

describe('snapToGrid', () => {
	it('snaps coordinates to a ~50 m grid so precise location never leaves the device', () => {
		const snapped = snapToGrid({ lat: 43.653226, lng: -79.383184 });
		// nearest 0.0005° steps, not decimal rounding
		expect(snapped).toEqual({ lat: 43.653, lng: -79.383 });
	});

	it('grid-aligned coordinates pass through unchanged', () => {
		expect(snapToGrid({ lat: 43.66, lng: -79.4 })).toEqual({ lat: 43.66, lng: -79.4 });
	});

	it('honours a finer grid instead of rounding back to a fixed precision', () => {
		expect(snapToGrid({ lat: 43.653226, lng: -79.383184 }, 0.00005)).toEqual({
			lat: 43.65325,
			lng: -79.38320
		});
	});

	it('grid size is ~50 m (0.0005° of latitude ≈ 55 m)', () => {
		expect(LOCATION_GRID_DEG * 111_320).toBeLessThan(60);
		expect(LOCATION_GRID_DEG * 111_320).toBeGreaterThan(40);
	});
});

describe('URL param caps', () => {
	it('rejects absurd values and falls back to defaults', () => {
		expect(maxTravelMin(new URLSearchParams('max=99999'))).toBe(60);
		expect(minSwimMin(new URLSearchParams('swim=-5'))).toBe(30);
		expect(maxTravelMin(new URLSearchParams('max=Infinity'))).toBe(60);
	});

	it('accepts sane overrides', () => {
		expect(maxTravelMin(new URLSearchParams('max=45'))).toBe(45);
		expect(minSwimMin(new URLSearchParams('swim=20'))).toBe(20);
	});
});

describe('buildLocations coordinate validation', () => {
	const loc = {
		'Location ID': 1,
		'Location Name': 'Pool',
		'Street No': '1',
		'Street No Suffix': 'None',
		'Street Name': 'A',
		'Street Type': 'St',
		'Street Direction': 'None'
	};

	it('drops non-numeric coordinates from upstream data instead of storing them', () => {
		const geojson = {
			features: [
				{
					properties: { LOCATIONID: '1' },
					geometry: { type: 'MultiPoint', coordinates: [['evil;string', '43.7']] }
				}
			]
		};
		const [out] = buildLocations([loc], geojson);
		expect(out.lat).toBeNull();
		expect(out.lng).toBeNull();
	});
});
