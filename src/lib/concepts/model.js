// The one data model behind all eleven concepts.
//
// Everything a concept needs is derived here, once, so that eleven very
// different pictures are provably drawing the same numbers — which is the
// whole point of a comparison gallery. A concept that computed its own
// "soonest" could quietly disagree with its neighbour, and the reader would
// have no way to tell the design apart from the arithmetic.
//
// The quantity the user story actually turns on isn't distance and isn't
// start time — it's the moment you could be *in the water*:
//
//     inWater = max(now + travel, session start)
//     swimMin = session end - inWater
//
// Every concept is a different projection of those two numbers.

import { haversineKm, bearingDeg } from '$lib/geo/distance.js';
import { variantLabel } from '$lib/labels.js';

// Straight-line fallback speeds, used when the build has no Mapbox token.
// 4.8 km/h walking and 15 km/h cycling are the usual planning figures; the
// detour factor is 4/π ≈ 1.27, the average ratio of grid distance to
// straight-line distance over uniformly distributed bearings. Toronto is a
// grid, so this is a fair guess — but it is a guess, and every concept says
// so rather than dressing an estimate up as a routed time.
const WALK_KMH = 4.8;
const BIKE_KMH = 15;
const GRID_DETOUR = 4 / Math.PI;

export function estimateTravelMin(km) {
	const road = km * GRID_DETOUR;
	return { walk: Math.round((road / WALK_KMH) * 60), bike: Math.round((road / BIKE_KMH) * 60) };
}

// A design gallery has to be legible at 2 a.m., when every pool in Toronto is
// shut and all eleven concepts would draw an empty city. `?at=13:00` (or
// `?at=780`) moves the reader's clock so the pictures have something in them.
// Anything the shell does with this is announced on the page — a viewer must
// never mistake a rehearsal for the real time.
export const DEMO_MIN = 13 * 60;

export function clockOverride(searchParams) {
	const raw = searchParams?.get?.('at');
	if (!raw) return null;
	const hhmm = /^(\d{1,2}):(\d{2})$/.exec(raw);
	const minutes = hhmm ? Number(hhmm[1]) * 60 + Number(hhmm[2]) : Number(raw);
	return Number.isFinite(minutes) && minutes >= 0 && minutes < 1440 ? Math.floor(minutes) : null;
}

// Outdoor pools run one unbroken block — Harrison is open ten to six — so a
// single session can be five times longer than every indoor one. Scales that
// encode minutes-of-swim cap here and clamp, or that one bar flattens the
// other sixty. The printed numbers are never capped.
export const SWIM_SCALE_CAP = 120;

export const MODES = ['walk', 'bike'];
export const MODE_LABEL = { walk: 'on foot', bike: 'by bike' };

// Fastest of the modes we know, and which one it was.
export function fastest(times, modes = MODES) {
	let best = null;
	for (const m of modes) {
		const v = times?.[m];
		if (v != null && (best === null || v < best.minutes)) best = { mode: m, minutes: v };
	}
	return best;
}

export function fmtClock(min) {
	const m = ((Math.round(min) % 1440) + 1440) % 1440;
	let h = Math.floor(m / 60);
	const mm = String(m % 60).padStart(2, '0');
	const ampm = h >= 12 ? 'pm' : 'am';
	h = h % 12 || 12;
	return `${h}:${mm} ${ampm}`;
}

// "7:30" — no meridiem, for axes where the am/pm is carried by the axis itself.
export function fmtHour(min) {
	const m = ((Math.round(min) % 1440) + 1440) % 1440;
	const h = Math.floor(m / 60) % 12 || 12;
	return m % 60 === 0 ? `${h}` : `${h}:${String(m % 60).padStart(2, '0')}`;
}

export function fmtMinutes(min) {
	if (min == null) return '—';
	const n = Math.round(min);
	if (n < 60) return `${n} min`;
	const h = Math.floor(n / 60);
	const m = n % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

// Coordinates the city never geocoded would poison every distance sort with
// NaN, so a pool is only "placed" when both halves are finite.
function placed(p) {
	return Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
}

/**
 * Annotate today's schedule for one origin.
 *
 * @param schedule  the baked city payload ({ locations, sessions })
 * @param opts.now  { date, minutes } in Toronto time
 * @param opts.origin  { lat, lng } | null
 * @param opts.travel  Map<location_id, {walk, bike}> from Mapbox, or null
 * @param opts.minSwim minutes in the water below which a swim isn't worth the trip
 */
export function buildDay(schedule, { now, origin = null, travel = null, minSwim = 30 } = {}) {
	const nowMin = now.minutes;
	const pools = new Map();

	for (const loc of schedule.locations ?? []) {
		const km = origin && placed(loc) ? haversineKm(origin, loc) : null;
		const routed = travel?.get(loc.id) ?? null;
		const times = routed ?? (km != null ? estimateTravelMin(km) : { walk: null, bike: null });
		const best = fastest(times);
		pools.set(loc.id, {
			id: loc.id,
			name: loc.name,
			address: loc.address,
			lat: loc.lat,
			lng: loc.lng,
			placed: placed(loc),
			km,
			bearing: origin && placed(loc) ? bearingDeg(origin, loc) : null,
			walk: times.walk,
			bike: times.bike,
			travelMin: best?.minutes ?? null,
			mode: best?.mode ?? null,
			sessions: []
		});
	}

	const sessions = [];
	for (const s of schedule.sessions ?? []) {
		if (s.date !== now.date) continue;
		const pool = pools.get(s.location_id);
		if (!pool) continue;
		const arrive = pool.travelMin == null ? null : nowMin + pool.travelMin;
		const inWater = arrive == null ? s.start_min : Math.max(arrive, s.start_min);
		const annotated = {
			...s,
			poolId: s.location_id,
			pool: pool.name,
			address: pool.address,
			lat: pool.lat,
			lng: pool.lng,
			placed: pool.placed,
			km: pool.km,
			bearing: pool.bearing,
			walk: pool.walk,
			bike: pool.bike,
			travelMin: pool.travelMin,
			mode: pool.mode,
			variant: variantLabel(s),
			over: s.end_min <= nowMin,
			inProgress: s.start_min <= nowMin && s.end_min > nowMin,
			arrive,
			inWater,
			// How long you'd wait on the deck if you left right now.
			wait: arrive == null ? null : Math.max(0, s.start_min - arrive),
			swimMin: s.end_min - inWater
		};
		// A pool the city never geocoded still gets listed — the main app's rule
		// is that we never hide a swim we can't assess — but it can never be the
		// answer to "which is closest and soonest", because we don't know.
		annotated.feasible =
			!annotated.over && annotated.travelMin != null && annotated.swimMin >= minSwim;
		sessions.push(annotated);
		pool.sessions.push(annotated);
	}

	sessions.sort((a, b) => a.start_min - b.start_min || (a.travelMin ?? 1e9) - (b.travelMin ?? 1e9));
	for (const pool of pools.values()) {
		pool.sessions.sort((a, b) => a.start_min - b.start_min);
		const live = pool.sessions.filter((s) => !s.over);
		pool.next = live[0] ?? null;
		pool.soonestInWater = live.length ? Math.min(...live.map((s) => s.inWater)) : null;
		pool.open = pool.sessions.some((s) => s.inProgress);
	}

	const withSwims = [...pools.values()].filter((p) => p.sessions.length);
	return {
		date: now.date,
		nowMin,
		minSwim,
		origin,
		pools: withSwims.sort(
			(a, b) => (a.travelMin ?? 1e9) - (b.travelMin ?? 1e9) || a.name.localeCompare(b.name)
		),
		sessions,
		upcoming: sessions.filter((s) => !s.over),
		feasible: sessions.filter((s) => s.feasible)
	};
}

// The single swim this whole gallery is arguing about: soonest in the water,
// ties broken by the shorter trip. Concepts highlight it so the reader can
// check each picture against the same answer.
export function bestBet(day) {
	let best = null;
	for (const s of day.feasible) {
		if (
			!best ||
			s.inWater < best.inWater ||
			(s.inWater === best.inWater && (s.travelMin ?? 1e9) < (best.travelMin ?? 1e9))
		) {
			best = s;
		}
	}
	return best;
}

// How many swims you could be in the water at, minute by minute, if you left
// now — the "supply of swim" curve a couple of the concepts draw.
export function availabilityCurve(day, { step = 15, from = day.nowMin, to = 1440 } = {}) {
	const out = [];
	for (let t = Math.floor(from / step) * step; t <= to; t += step) {
		let n = 0;
		for (const s of day.upcoming) if (s.start_min <= t && s.end_min > t) n++;
		out.push({ minute: t, count: n });
	}
	return out;
}
