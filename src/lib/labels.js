import { roundForDisplay } from './config.js';

// The base course title the city uses for each kind. Everything else in a
// title is a qualifier: "Lane Swim: Short Course (25m)", "Leisure Swim
// (Women)", "Leisure Swim - Outdoor Pool", "Adapted Leisure Swim".
const BASE_TITLES = { lane: 'Lane Swim', leisure: 'Leisure Swim' };

// What a session's title says beyond its kind, for the chip on each card.
// The tab already tells you it's a lane or leisure swim, so repeating that
// would be noise — a plain "Leisure Swim" gets no chip at all.
export function variantLabel(session) {
	const base = BASE_TITLES[session?.kind];
	if (!base) return '';
	return String(session.title ?? '')
		.replace(base, '')
		.replace(/^\s*[:–—-]\s*/, '')
		.trim();
}

// How a person says each way of getting to a pool. "bike" is a verb the
// interface uses elsewhere, but "12-min bike" isn't English — the noun for
// the trip is a ride.
const TRAVEL_NOUNS = {
	walk: 'walk',
	bike: 'ride',
	transit: 'transit trip',
	drive: 'drive'
};

export function travelPhrase(mode, minutes) {
	const noun = TRAVEL_NOUNS[mode];
	if (!noun || minutes == null) return '';
	return `${roundForDisplay(minutes)}-min ${noun}`;
}

// The clock, as a person says it: "12pm", not "12:00 p.m.". Minutes on the
// hour are silence, the meridiem is two letters, and there is no space
// between them — a time is one word out loud and should be one on the page.
//
// Intl rather than arithmetic (and rather than a dependency, per #27): the
// only fiddly part of a 12-hour clock is what noon and midnight are called,
// and the platform already knows. Formatted in UTC from a throwaway date so
// the minutes-since-midnight it is given are the minutes it prints.
const CLOCK = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: 'numeric',
	hourCycle: 'h12',
	timeZone: 'UTC'
});

export function clockLabel(min) {
	const parts = Object.fromEntries(
		CLOCK.formatToParts(new Date(Date.UTC(2000, 0, 1, 0, Math.round(min))))
			.filter((p) => p.type !== 'literal')
			.map((p) => [p.type, p.value])
	);
	const period = parts.dayPeriod.toLowerCase().replace(/[^a-z]/g, '');
	return parts.minute === '00' ? `${parts.hour}${period}` : `${parts.hour}:${parts.minute}${period}`;
}

// A window in the water, which is one thing and so says its meridiem once:
// "2–2:45pm". A range that crosses noon or midnight has to say both, because
// then the two halves genuinely differ.
export function clockRange(startMin, endMin) {
	const from = clockLabel(startMin);
	const to = clockLabel(endMin);
	const period = to.slice(-2);
	return from.endsWith(period) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`;
}

// Inside this many minutes, a departure is something you are about to do
// rather than something on your calendar — and a countdown is what you'd act
// on, with no clock and no subtraction.
const COUNTDOWN_WINDOW_MIN = 60;

/**
 * When to set off, in whichever form is least work to read.
 *
 * @param leaveByMin  minutes since midnight, from the dip
 * @param nowMin      minutes since midnight, or null on a day that isn't
 *                    today — which has no "now" to count down from
 */
export function departurePhrase(leaveByMin, nowMin) {
	if (nowMin == null) return `leave ${clockLabel(roundForDisplay(leaveByMin))}`;
	const away = roundForDisplay(leaveByMin - nowMin);
	// Past, or as near as makes no difference: the dip is one you'd have to
	// move for, and the session is already in the water.
	if (away <= 0) return 'leave now';
	// "in 60 mins" is a clock time said the long way round.
	if (away < COUNTDOWN_WINDOW_MIN) return `leave in ${away} mins`;
	return `leave ${clockLabel(roundForDisplay(leaveByMin))}`;
}

// The offer in one line, for where there's only room for one. Lowercase
// "dip" throughout: it's a swim, not a product name.
export function dipSummary(dip) {
	return `${dip.durationMin}-min dip, ${travelPhrase(dip.mode, dip.travelMin)} away`;
}

// Which day the planner is showing, as a person would say it. Dates are the
// city's own 'YYYY-MM-DD' strings; they're parsed as UTC and formatted as
// UTC so the label names the day the string means, whatever zone the
// browser is in — the string is already a Toronto day.
export function dayLabel(date, today) {
	const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
	if (days <= 0) return 'today';
	if (days === 1) return 'tomorrow';
	const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));
	// Inside the week a weekday is unambiguous and reads best; beyond it,
	// "Sunday" could be either of two Sundays, so the date comes too.
	return days < 7 ? fmt({ weekday: 'long' }) : fmt({ weekday: 'long', day: 'numeric', month: 'long' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The one date in the footer that has to tell the truth about staleness, so
// it has to be the city's own stamp, not ours — and the city's stamp isn't
// always bare: fixtures and seeded data append a note ("2026-07-23
// 21:38:47 (seeded)"), so only the leading date is trusted and the rest is
// ignored rather than tripping the parse.
export function freshnessLabel(stamp) {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(stamp ?? ''));
	if (!m) return '';
	const [, year, month, day] = m;
	const name = MONTHS[Number(month) - 1];
	return name ? `${name} ${Number(day)} ${year}` : '';
}

// How far away the pool is, in whichever terms we can honestly offer: the
// routed trip if we have one, otherwise the straight-line distance, said as
// a distance. A dip that couldn't be routed has no journey time and must
// never look as though it does.
export function reachPhrase(dip) {
	if (dip.routed) return travelPhrase(dip.mode, dip.travelMin);
	if (dip.km == null) return '';
	return `${dip.km < 10 ? dip.km.toFixed(1) : Math.round(dip.km)} km away`;
}
