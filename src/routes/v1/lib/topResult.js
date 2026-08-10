// The "top pick": the single swim to surface above the list, chosen by a
// tiered cascade — walk, then bike, then transit — using the limits in
// config.js TOP_RESULT. Returns { session, mode, minutes } or null (desert).

// Mapbox has no transit routing, so transit comes from a pluggable provider:
// getTransit(location_id) -> { minutes, connections } | null. The live
// implementation is src/lib/transit.js (Transitous over official GTFS).

function tierCandidates(sessions, mode, maxMin, { nowMin, minSwim, config, getTransit }) {
	const out = [];
	for (const s of sessions) {
		if (s.start_min - nowMin > config.WINDOW_MIN) continue;
		let minutes;
		if (mode === 'transit') {
			const t = getTransit(s.location_id);
			if (!t || t.connections > config.TRANSIT_MAX_CONNECTIONS) continue;
			minutes = t.minutes;
		} else {
			minutes = s.travel?.[mode];
		}
		if (minutes == null || minutes > maxMin) continue;
		const swimStart = Math.max(nowMin + minutes, s.start_min);
		if (s.end_min - swimStart < minSwim) continue;
		out.push({ session: s, mode, minutes, swimStart });
	}
	return out;
}

export function pickTopResult(sessions, opts) {
	const { config } = opts;
	const tiers = [
		['walk', config.WALK_MAX_MIN],
		['bike', config.BIKE_MAX_MIN],
		['transit', config.TRANSIT_MAX_MIN]
	];
	for (const [mode, maxMin] of tiers) {
		const candidates = tierCandidates(sessions, mode, maxMin, opts);
		if (candidates.length) {
			candidates.sort((a, b) => a.swimStart - b.swimStart || a.minutes - b.minutes);
			const { session, minutes } = candidates[0];
			return { session, mode, minutes };
		}
	}
	return null;
}
