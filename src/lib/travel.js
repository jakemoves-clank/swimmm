// Travel times via the Mapbox Matrix API, called directly from the browser so
// the user's location goes to Mapbox only — never to the Swimmm server.
// https://docs.mapbox.com/api/navigation/matrix/

// Matrix API allows 25 coordinates per request for walking/cycling profiles:
// 1 origin + 24 destinations.
const MAX_DESTINATIONS = 24;

export function chunkPools(pools, size = MAX_DESTINATIONS) {
	const chunks = [];
	for (let i = 0; i < pools.length; i += size) chunks.push(pools.slice(i, i + size));
	return chunks;
}

export function matrixUrl(profile, origin, pools, token) {
	const coords = [origin, ...pools].map((p) => `${p.lng},${p.lat}`).join(';');
	return (
		`https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coords}` +
		`?sources=0&annotations=duration&access_token=${token}`
	);
}

async function profileDurations(profile, origin, pools, token, fetchImpl) {
	const out = new Map(); // pool id -> minutes | null
	for (const chunk of chunkPools(pools)) {
		const res = await fetchImpl(matrixUrl(profile, origin, chunk, token));
		if (!res.ok) throw new Error(`Mapbox ${profile} matrix -> ${res.status}`);
		const body = await res.json();
		if (body.code !== 'Ok') throw new Error(`Mapbox ${profile} matrix -> ${body.code}`);
		const durations = body.durations[0]; // from origin; index 0 is origin itself
		chunk.forEach((pool, i) => {
			const sec = durations[i + 1];
			out.set(pool.id, sec == null ? null : Math.round(sec / 60));
		});
	}
	return out;
}

// Returns Map<pool id, { walk: minutes|null, bike: minutes|null }>.
export async function fetchTravelTimes(origin, pools, token, fetchImpl = fetch) {
	const [walk, bike] = await Promise.all([
		profileDurations('walking', origin, pools, token, fetchImpl),
		profileDurations('cycling', origin, pools, token, fetchImpl)
	]);
	return new Map(pools.map((p) => [p.id, { walk: walk.get(p.id) ?? null, bike: bike.get(p.id) ?? null }]));
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
