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
