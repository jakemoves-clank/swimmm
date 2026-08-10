// User-tunable settings — the single place a future settings UI should
// read/write. Until then each can be overridden per-visit via URL params.
//
// DEFAULT_MAX_TRAVEL_MIN: hide swims farther than this by bike or on foot.
// DEFAULT_MIN_SWIM_MIN: hide swims you couldn't be in the water for at
// least this long after travelling there.
// LOCATION_GRID_DEG: location precision shared with routing providers
// (Mapbox, Transitous). Coordinates are snapped to this grid before leaving
// the device: 0.0005° ≈ 55 m of latitude (~40 m of longitude in Toronto).
// Coarser (larger) values share less; travel times are unaffected until
// roughly 0.005° (~500 m).
export const DEFAULT_MAX_TRAVEL_MIN = 60;
export const DEFAULT_MIN_SWIM_MIN = 30;
export const LOCATION_GRID_DEG = 0.0005;

// A dip is an appointment, not a listing: a trip to a pool plus a booked
// window in the water. How long that window is, is the user's call.
//
// DIP_DURATION_OPTIONS: the lengths a dip can be offered at, longest last.
// DEFAULT_DIP_DURATION_MIN: what we offer until someone says otherwise
// (`?dip=30`). A dip takes this length whenever the session it sits in has
// room for it, and shortens to the next option down when it doesn't — a
// shortened dip is still worth offering, but it scores worse (see appeal).
// DIP_START_STEP_MIN: offered starts are rounded up to this many minutes.
// "2:15 to 3:00" reads like something you could put in a calendar; "2:13 to
// 2:58" reads like arithmetic. Rounding up never invents time you don't
// have — it only ever delays getting in.
export const DIP_DURATION_OPTIONS = [30, 45, 60];
export const DEFAULT_DIP_DURATION_MIN = 45;
export const DIP_START_STEP_MIN = 5;

// The two kinds of swim the city runs that an adult can just turn up to:
// lane swim (lengths, in a lane) and leisure swim (open/unstructured). Also
// the source of truth for `swimKind` in server/transform.js, so the payload
// and the toggle can never drift apart.
export const SWIM_KINDS = ['lane', 'leisure'];
export const DEFAULT_SWIM_KIND = 'lane';

export const SWIM_KIND_LABELS = { lane: 'Lane', leisure: 'Leisure' };

// Used in prose ("No more adult lane swims today"), so lowercase.
export const SWIM_KIND_NOUNS = { lane: 'lane swim', leisure: 'leisure swim' };

export function snapToGrid(coords, grid = LOCATION_GRID_DEG) {
	// Trim binary-float noise (43.653000000000006) at the grid's own
	// precision, so a finer grid still lands on its own steps.
	const decimals = Math.max(0, Math.ceil(-Math.log10(grid)) + 1);
	const snap = (v) => Number((Math.round(v / grid) * grid).toFixed(decimals));
	return { lat: snap(coords.lat), lng: snap(coords.lng) };
}

// Where to send people when we have no data to show: the city's own public
// drop-in schedule listing, which it publishes per swim kind.
export const CITY_SWIM_URLS = {
	lane: 'https://www.toronto.ca/data/parks/prd/swimming/dropin/lane/index.html',
	leisure: 'https://www.toronto.ca/data/parks/prd/swimming/dropin/leisure/index.html'
};

// Transit routing source: Transitous, a free community-run MOTIS API over
// official agency GTFS feeds (TTC for Toronto). LOOKUP_LIMIT caps how many
// pools we query per search (one request each) out of respect for the free
// service — only the nearest pools are considered.
export const TRANSIT_PROVIDER = {
	PLAN_URL: 'https://api.transitous.org/api/v1/plan',
	LOOKUP_LIMIT: 8
};

// What makes a dip appealing. The algorithm lives in src/lib/appeal.js; this
// is every number it uses, so tuning the concierge's taste never means
// editing the code that applies it.
//
// MODES is both the admission test and the preference order: a dip is
// appealing when its mode gets you there inside that mode's MAX_MIN, and
// walking beats cycling beats transit beats driving.
//
// BASE is spaced 40 apart to make that ordering a guarantee rather than a
// tendency. The other terms can swing a dip by at most 33 — the full
// PROXIMITY_WEIGHT (15) plus the worst possible shortfall (asking for 60 and
// being handed 30, at 0.6 a minute, is 18) — so the sweetest drive in
// Toronto still loses to the worst qualifying transit trip. Anything added
// below has to fit in the remaining headroom, or the spacing goes up too.
export const APPEAL = {
	MODES: [
		{ mode: 'walk', MAX_MIN: 15, BASE: 160 },
		{ mode: 'bike', MAX_MIN: 20, BASE: 120 },
		{ mode: 'transit', MAX_MIN: 20, BASE: 80, MAX_CONNECTIONS: 1 },
		{ mode: 'drive', MAX_MIN: 20, BASE: 40 }
	],
	// A trip at the very edge of its threshold scores 0 here; an on-your-
	// doorstep one scores the full PROXIMITY_WEIGHT.
	PROXIMITY_WEIGHT: 15,
	// Per minute short of the dip length you asked for. A 45 cut to 30 costs
	// 9 points — enough to lose to a closer pool of the same mode, never
	// enough to lose to a slower mode.
	SHORTFALL_PENALTY_PER_MIN: 0.6
};

// Turning a ranked list of dips into the handful actually offered.
//
// COUNT: "a handful". Enough that the day has shape, few enough to read.
// MAX_OVERLAP_MIN: two dips clash when their windows in the water overlap by
// more than this. Offering four dips that all run 2:00–2:45 answers one
// question four times; spreading them lets the reader answer "I'm free
// between 2 and 4 — what are my options?". A clash only pushes a dip down
// the list, never off it: if the day genuinely has nothing else, an
// overlapping dip beats an empty afternoon, and the UI draws it.
// MAX_PER_POOL: the nearest pool often runs four sessions in a day, and a
// concierge that answers "Regent Park, Regent Park, Regent Park" is a
// directory with extra steps.
export const DIP_SELECTION = {
	COUNT: 5,
	MAX_OVERLAP_MIN: 10,
	MAX_PER_POOL: 2
};

// "Top pick" tiers, tried in order. A session qualifies for a tier when it
// starts within WINDOW_MIN of now, the tier's mode gets you there within its
// max, and you'd still get DEFAULT_MIN_SWIM_MIN in the water. If no tier
// yields a result, the UI shows the desert.
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

// ?dip=30 → offer 30-minute dips. Unlike the other knobs this one is a
// choice from a fixed set rather than any positive number: the whole point of
// DIP_DURATION_OPTIONS is that the UI offers three lengths, so an arbitrary
// 37 would have no control to show it in.
export function dipDurationMin(searchParams) {
	const v = Number(searchParams?.get?.('dip'));
	return DIP_DURATION_OPTIONS.includes(v) ? v : DEFAULT_DIP_DURATION_MIN;
}

// ?kind=leisure → open on the leisure tab. Anything else falls back to lane
// rather than erroring: a bad param should never cost someone the page.
export function swimKindParam(searchParams) {
	const v = searchParams?.get?.('kind');
	return SWIM_KINDS.includes(v) ? v : DEFAULT_SWIM_KIND;
}
