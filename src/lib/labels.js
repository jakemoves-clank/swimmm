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
