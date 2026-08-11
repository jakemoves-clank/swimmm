import { describe, it, expect } from 'vitest';
import {
	clockLabel,
	clockRange,
	dayLabel,
	departurePhrase,
	dipSummary,
	freshnessLabel,
	reachPhrase,
	travelPhrase,
	variantLabel
} from '../../src/lib/labels.js';
import { roundForDisplay } from '../../src/lib/config.js';

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

// Lives in config.js, beside the other user-facing settings, because the
// step is a taste rather than a fact — but every caller is a label, so it is
// exercised here with them.
describe('roundForDisplay', () => {
	it('rounds a displayed minute up to the next five', () => {
		expect(roundForDisplay(722)).toBe(725); // 12:02 → 12:05
		expect(roundForDisplay(723)).toBe(725); // 12:03 → 12:05
	});

	// One minute over is the exception: rounding 12:01 up to 12:05 spends four
	// of the five minutes the reader has, and a minute is inside the noise of
	// any routed trip anyway.
	it('rounds back down when it is only one minute over', () => {
		expect(roundForDisplay(721)).toBe(720); // 12:01 → 12:00
	});

	it('leaves a time already on the step alone', () => {
		expect(roundForDisplay(720)).toBe(720);
		expect(roundForDisplay(725)).toBe(725);
	});
});

describe('clockLabel', () => {
	// A time you'd say out loud: no minutes on the hour, no dots, no space.
	it('drops the minutes and the punctuation from an exact hour', () => {
		expect(clockLabel(720)).toBe('12pm');
		expect(clockLabel(840)).toBe('2pm');
		expect(clockLabel(0)).toBe('12am');
		expect(clockLabel(540)).toBe('9am');
	});

	it('keeps the minutes when there are any', () => {
		expect(clockLabel(885)).toBe('2:45pm');
		expect(clockLabel(555)).toBe('9:15am');
	});
});

describe('clockRange', () => {
	// "2pm–2:45pm" says the meridiem twice for one range. The second says it
	// for both, the way a person writing it down would.
	it('says the meridiem once when both ends share it', () => {
		expect(clockRange(840, 885)).toBe('2–2:45pm');
		expect(clockRange(780, 825)).toBe('1–1:45pm');
	});

	it('says it twice when the range crosses noon or midnight', () => {
		expect(clockRange(690, 735)).toBe('11:30am–12:15pm');
	});
});

describe('departurePhrase', () => {
	// Near enough to act on, and a countdown is what you'd act on: "in 15
	// mins" needs no clock and no subtraction.
	it('counts down when the departure is within the hour', () => {
		expect(departurePhrase(735, 720)).toBe('leave in 15 mins');
		expect(departurePhrase(722, 720)).toBe('leave in 5 mins');
	});

	it('gives a clock time when the departure is further off', () => {
		expect(departurePhrase(830, 720)).toBe('leave 1:50pm');
		// Rounded to 60 minutes, "in 60 mins" is a clock time said the long
		// way round.
		expect(departurePhrase(778, 720)).toBe('leave 1pm');
	});

	// The departure has passed and the dip is still on: you're close enough to
	// a session already in the water to make it if you go.
	it('says to go now once the departure has passed', () => {
		expect(departurePhrase(715, 720)).toBe('leave now');
		expect(departurePhrase(721, 720)).toBe('leave now');
	});

	// A planner showing tomorrow has no "now" to count down from.
	it('gives a clock time when there is no now', () => {
		expect(departurePhrase(535, null)).toBe('leave 8:55am');
	});
});

describe('travelPhrase', () => {
	// Minutes are rounded for display like every other time on the page — an
	// 18-minute trip offered as "20-min" is a promise you can keep.
	it('names each way of getting there the way a person would say it', () => {
		expect(travelPhrase('walk', 10)).toBe('10-min walk');
		expect(travelPhrase('bike', 12)).toBe('15-min ride');
		expect(travelPhrase('transit', 18)).toBe('20-min transit trip');
		expect(travelPhrase('drive', 9)).toBe('10-min drive');
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

describe('dayLabel', () => {
	it('names the near days the way a person would', () => {
		expect(dayLabel('2026-08-10', '2026-08-10')).toBe('today');
		expect(dayLabel('2026-08-11', '2026-08-10')).toBe('tomorrow');
	});

	it('falls back to the weekday once "tomorrow" stops being useful', () => {
		expect(dayLabel('2026-08-13', '2026-08-10')).toBe('Thursday');
	});

	// Six days out there is only one Sunday to mean. A week out the weekday
	// has come round to today's again, so it has to carry a date.
	it('adds the date once the weekday alone would be ambiguous', () => {
		expect(dayLabel('2026-08-16', '2026-08-10')).toBe('Sunday');
		expect(dayLabel('2026-08-17', '2026-08-10')).toBe('Monday 17 August');
	});

	// The city's dates are already Toronto days; a browser in Auckland must
	// not read them as the day before.
	it('names the day the date string means, whatever zone the browser is in', () => {
		expect(dayLabel('2026-08-09', '2026-08-09')).toBe('today');
		expect(dayLabel('2026-08-15', '2026-08-10')).toBe('Saturday');
	});
});

describe('freshnessLabel', () => {
	it('formats a bare date, abbreviated month and no comma', () => {
		expect(freshnessLabel('2026-08-29')).toBe('Aug 29 2026');
	});

	// The city's stamp carries a time, and fixtures append a note of their
	// own — the leading date is the only part that has to parse.
	it('tolerates a time and a trailing note the city or a fixture appends', () => {
		expect(freshnessLabel('2026-07-23 21:38:47 (seeded)')).toBe('Jul 23 2026');
	});

	it('returns empty rather than throwing on a missing or unparseable stamp', () => {
		expect(freshnessLabel(undefined)).toBe('');
		expect(freshnessLabel('not a date')).toBe('');
	});
});

describe('reachPhrase', () => {
	it('names the trip when we routed one', () => {
		expect(reachPhrase({ routed: true, mode: 'bike', travelMin: 12 })).toBe('15-min ride');
	});

	// No routed trip: say how far, and let the reader judge the trip. Never
	// dress a straight line up as a journey time.
	it('gives the distance, as the crow flies, when we did not', () => {
		expect(reachPhrase({ routed: false, km: 2.34 })).toBe('2.3 km away');
		expect(reachPhrase({ routed: false, km: 12.4 })).toBe('12 km away');
	});
});
