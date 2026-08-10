import { describe, it, expect } from 'vitest';
import { dipSummary, travelPhrase, variantLabel } from '../../src/lib/labels.js';

// Titles below are real values from the city's Drop-in.json.
const s = (kind, title) => ({ kind, title });

describe('variantLabel', () => {
	it('is empty for a session whose title is just the base kind', () => {
		expect(variantLabel(s('lane', 'Lane Swim'))).toBe('');
		expect(variantLabel(s('leisure', 'Leisure Swim'))).toBe('');
	});

	it('keeps only what a colon-suffixed title adds', () => {
		expect(variantLabel(s('lane', 'Lane Swim: Short Course (25m)'))).toBe('Short Course (25m)');
		expect(variantLabel(s('lane', 'Lane Swim: Long Course (50m)'))).toBe('Long Course (50m)');
		expect(variantLabel(s('leisure', 'Leisure Swim: Older Adult'))).toBe('Older Adult');
	});

	it('keeps parenthesised qualifiers', () => {
		expect(variantLabel(s('lane', 'Lane Swim (Women)'))).toBe('(Women)');
		expect(variantLabel(s('leisure', 'Leisure Swim (Giovanni Caboto)'))).toBe('(Giovanni Caboto)');
	});

	it('handles a dash separator', () => {
		expect(variantLabel(s('leisure', 'Leisure Swim - Outdoor Pool'))).toBe('Outdoor Pool');
	});

	it('handles a title that qualifies the base name rather than suffixing it', () => {
		expect(variantLabel(s('leisure', 'Adapted Leisure Swim'))).toBe('Adapted');
	});

	it('returns empty rather than throwing on an unknown or missing kind', () => {
		expect(variantLabel(s(undefined, 'Lane Swim'))).toBe('');
		expect(variantLabel(s('cannonball', 'Lane Swim'))).toBe('');
	});
});

describe('travelPhrase', () => {
	it('names each way of getting there the way a person would say it', () => {
		expect(travelPhrase('walk', 10)).toBe('10-min walk');
		expect(travelPhrase('bike', 12)).toBe('12-min ride');
		expect(travelPhrase('transit', 18)).toBe('18-min transit trip');
		expect(travelPhrase('drive', 9)).toBe('9-min drive');
	});

	it('says nothing rather than something wrong when the mode is unknown', () => {
		expect(travelPhrase(null, 10)).toBe('');
		expect(travelPhrase('walk', null)).toBe('');
	});
});

describe('dipSummary', () => {
	// The one line that has to carry the whole offer on a small screen.
	it('reads as an appointment, with lowercase "dip"', () => {
		expect(dipSummary({ mode: 'walk', travelMin: 10, durationMin: 45 })).toBe(
			'45-min dip, 10-min walk away'
		);
	});
});
