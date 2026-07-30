// User-tunable settings — the single place a future settings UI should
// read/write. Until then each can be overridden per-visit via URL params.
//
// DEFAULT_MAX_TRAVEL_MIN: hide swims farther than this by bike or on foot.
// DEFAULT_MIN_SWIM_MIN: hide swims you couldn't be in the water for at
// least this long after travelling there.
export const DEFAULT_MAX_TRAVEL_MIN = 60;
export const DEFAULT_MIN_SWIM_MIN = 30;

// "Top pick" tiers, tried in order. A session qualifies for a tier when it
// starts within WINDOW_MIN of now, the tier's mode gets you there within its
// max, and you'd still get DEFAULT_MIN_SWIM_MIN in the water. If no tier
// yields a result, the UI shows the desert.
// Coordinates shared with routing providers (Mapbox, Transitous) are snapped
// to this grid first: 0.0005° ≈ 55 m of latitude (~40 m of longitude in
// Toronto), so the precise position never leaves the device. Travel times are
// unaffected at this scale.
export const LOCATION_GRID_DEG = 0.0005;

export function snapToGrid(coords, grid = LOCATION_GRID_DEG) {
	const snap = (v) => Number((Math.round(v / grid) * grid).toFixed(4));
	return { lat: snap(coords.lat), lng: snap(coords.lng) };
}

// Where to send people when we have no data to show: the city's own public
// lane swim schedule listing.
export const CITY_LANE_SWIM_URL =
	'https://www.toronto.ca/data/parks/prd/swimming/dropin/lane/index.html';

// Transit routing source: Transitous, a free community-run MOTIS API over
// official agency GTFS feeds (TTC for Toronto). LOOKUP_LIMIT caps how many
// pools we query per search (one request each) out of respect for the free
// service — only the nearest pools are considered.
export const TRANSIT_PROVIDER = {
	PLAN_URL: 'https://api.transitous.org/api/v1/plan',
	LOOKUP_LIMIT: 8
};

export const TOP_RESULT = {
	WINDOW_MIN: 120, // only consider sessions starting within 2 hours
	WALK_MAX_MIN: 15,
	BIKE_MAX_MIN: 20,
	TRANSIT_MAX_MIN: 30,
	TRANSIT_MAX_CONNECTIONS: 1 // at most one mode change, e.g. subway → bus
};

// URL overrides outside (0, PARAM_CAP_MIN] fall back to the default.
const PARAM_CAP_MIN = 1440;

function positive(searchParams, key, fallback) {
	const v = Number(searchParams?.get?.(key));
	return Number.isFinite(v) && v > 0 && v <= PARAM_CAP_MIN ? v : fallback;
}

// ?max=45 → 45-minute travel cutoff
export function maxTravelMin(searchParams) {
	return positive(searchParams, 'max', DEFAULT_MAX_TRAVEL_MIN);
}

// ?swim=20 → require at least 20 minutes in the pool
export function minSwimMin(searchParams) {
	return positive(searchParams, 'swim', DEFAULT_MIN_SWIM_MIN);
}
