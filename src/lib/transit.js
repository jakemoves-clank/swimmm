// Transit travel times from Transitous (https://transitous.org) — a free,
// community-run MOTIS instance routing over transit agencies' official GTFS
// feeds (for Toronto: the TTC's published schedule data). Called from the
// browser like Mapbox, so the user's location never touches the Swimmm
// server. No API key; be a polite guest and keep request counts low.
import { TRANSIT_PROVIDER } from './config.js';

export function transitPlanUrl(origin, pool, timeIso) {
	const q = new URLSearchParams({
		fromPlace: `${origin.lat},${origin.lng}`,
		toPlace: `${pool.lat},${pool.lng}`,
		time: timeIso
	});
	return `${TRANSIT_PROVIDER.PLAN_URL}?${q}`;
}

// Best itinerary = fastest among those within the connection limit.
// MOTIS reports duration in seconds and transfers per itinerary.
export function parseTransitItineraries(body, maxConnections) {
	const ok = (body.itineraries || []).filter((it) => it.transfers <= maxConnections);
	if (!ok.length) return null;
	const best = ok.reduce((a, b) => (b.duration < a.duration ? b : a));
	return { minutes: Math.round(best.duration / 60), connections: best.transfers };
}

function haversineKm(a, b) {
	const R = 6371;
	const rad = (d) => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

// One plan request per pool, so cap at the `limit` nearest pools to stay
// respectful of the free service. Individual failures yield no entry rather
// than failing the whole lookup.
export async function fetchTransitTimes(
	origin,
	pools,
	{ fetchImpl = fetch, maxConnections, limit = TRANSIT_PROVIDER.LOOKUP_LIMIT, now = () => new Date().toISOString() }
) {
	const nearest = [...pools]
		.sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b))
		.slice(0, limit);
	const out = new Map();
	await Promise.all(
		nearest.map(async (pool) => {
			try {
				const res = await fetchImpl(transitPlanUrl(origin, pool, now()));
				if (!res.ok) return;
				const parsed = parseTransitItineraries(await res.json(), maxConnections);
				if (parsed) out.set(pool.id, parsed);
			} catch {
				// unreachable/errored lookup → this pool simply has no transit time
			}
		})
	);
	return out;
}
