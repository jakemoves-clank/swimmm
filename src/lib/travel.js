// Travel times via the Mapbox Matrix API, called directly from the browser so
// the user's location goes to Mapbox only — never to the Swimmm server.
// https://docs.mapbox.com/api/navigation/matrix/

// Matrix API allows 25 coordinates per request for the walking, cycling and
// driving profiles: 1 origin + 24 destinations. (driving-traffic allows only
// 10, which is why we use plain driving: a dip is planned around a session
// that starts later anyway, so live congestion would be false precision.)
const MAX_DESTINATIONS = 24;

// Our mode names → Mapbox's profile names.
export const PROFILES = { walk: 'walking', bike: 'cycling', drive: 'driving' };

// What v1 has always asked for. v3 adds 'drive' (see appeal.js MODES) — each
// mode is another round trip, so callers name the ones they'll actually use.
const DEFAULT_MODES = ['walk', 'bike'];

export function chunkPools(pools, size = MAX_DESTINATIONS) {
	const chunks = [];
	for (let i = 0; i < pools.length; i += size) chunks.push(pools.slice(i, i + size));
	return chunks;
}

export function matrixUrl(profile, origin, pools, token) {
	// Coordinates are a path segment in Mapbox's own `lng,lat;lng,lat` format,
	// so they stay literal; everything user- or config-supplied goes through
	// URLSearchParams.
	const coords = [origin, ...pools].map((p) => `${p.lng},${p.lat}`).join(';');
	const query = new URLSearchParams({
		sources: '0',
		annotations: 'duration',
		access_token: token
	});
	return `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coords}?${query}`;
}

async function profileDurations(profile, origin, pools, token, fetchImpl) {
	const out = new Map(); // pool id -> minutes | null
	for (const chunk of chunkPools(pools)) {
		const res = await fetchImpl(matrixUrl(profile, origin, chunk, token));
		if (!res.ok) throw new Error(`Mapbox ${profile} matrix -> ${res.status}`);
		const body = await res.json();
		if (body.code !== 'Ok') throw new Error(`Mapbox ${profile} matrix -> ${body.code}`);
		const durations = body.durations?.[0]; // from origin; index 0 is origin itself
		if (!Array.isArray(durations)) {
			throw new Error(`Mapbox ${profile} matrix -> missing durations in response`);
		}
		chunk.forEach((pool, i) => {
			const sec = durations[i + 1];
			out.set(pool.id, sec == null ? null : Math.round(sec / 60));
		});
	}
	return out;
}

/**
 * Travel times for the named modes.
 *
 * Returns Map<pool id, { [mode]: minutes|null }> — one key per requested
 * mode, so a caller can hand the value straight to appeal.js pickMode.
 */
export async function fetchTravelTimesFor(
	origin,
	pools,
	token,
	{ modes = DEFAULT_MODES, fetchImpl = fetch } = {}
) {
	const results = await Promise.all(
		modes.map((mode) => profileDurations(PROFILES[mode], origin, pools, token, fetchImpl))
	);
	return new Map(
		pools.map((p) => [
			p.id,
			Object.fromEntries(modes.map((mode, i) => [mode, results[i].get(p.id) ?? null]))
		])
	);
}

// Returns Map<pool id, { walk: minutes|null, bike: minutes|null }>.
export async function fetchTravelTimes(origin, pools, token, fetchImpl = fetch) {
	return fetchTravelTimesFor(origin, pools, token, { modes: DEFAULT_MODES, fetchImpl });
}

// A session is "one you can actually get to" when the faster mode gets you
// there within maxTravel minutes AND leaves at least minSwim minutes in the
// water (you swim from whichever is later — your arrival or the session start
// — until it ends). Sessions with unknown travel times are kept — we never
// hide a swim we can't assess.
export function isReachable(session, travel, nowMin, { maxTravel, minSwim }) {
	const modes = [travel?.walk, travel?.bike].filter((m) => m != null);
	if (!modes.length) return true;
	const fastest = Math.min(...modes);
	if (fastest > maxTravel) return false;
	const arrival = Math.max(nowMin + fastest, session.start_min);
	return session.end_min - arrival >= minSwim;
}
