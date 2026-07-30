// User-tunable settings — the single place a future settings UI should
// read/write. Until then each can be overridden per-visit via URL params.
//
// DEFAULT_MAX_TRAVEL_MIN: hide swims farther than this by bike or on foot.
// DEFAULT_MIN_SWIM_MIN: hide swims you couldn't be in the water for at
// least this long after travelling there.
export const DEFAULT_MAX_TRAVEL_MIN = 60;
export const DEFAULT_MIN_SWIM_MIN = 30;

function positive(searchParams, key, fallback) {
	const v = Number(searchParams?.get?.(key));
	return Number.isFinite(v) && v > 0 ? v : fallback;
}

// ?max=45 → 45-minute travel cutoff
export function maxTravelMin(searchParams) {
	return positive(searchParams, 'max', DEFAULT_MAX_TRAVEL_MIN);
}

// ?swim=20 → require at least 20 minutes in the pool
export function minSwimMin(searchParams) {
	return positive(searchParams, 'swim', DEFAULT_MIN_SWIM_MIN);
}
