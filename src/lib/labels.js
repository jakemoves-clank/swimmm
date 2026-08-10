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
	return `${minutes}-min ${noun}`;
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

// How far away the pool is, in whichever terms we can honestly offer: the
// routed trip if we have one, otherwise the straight-line distance, said as
// a distance. A dip that couldn't be routed has no journey time and must
// never look as though it does.
export function reachPhrase(dip) {
	if (dip.routed) return travelPhrase(dip.mode, dip.travelMin);
	if (dip.km == null) return '';
	return `${dip.km < 10 ? dip.km.toFixed(1) : Math.round(dip.km)} km away`;
}
