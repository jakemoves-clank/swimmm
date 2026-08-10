// A Dip: the thing Swimmm offers you.
//
// v1 listed swims — rows in a schedule, which you then had to do arithmetic
// on ("it starts at 2, I'd need twenty minutes to get there, so I'd have to
// leave at…"). A dip is that arithmetic already done, in the shape of an
// appointment you could accept:
//
//     leave at 1:40, walk 20 minutes, in the water 2:00–2:45 at Regent Park
//
// So a dip is a location, a mode of travel, a one-way travel time, and a
// booked window in the water. It is deliberately *narrower* than the session
// it comes from: a session that runs 1–4 p.m. yields one 45-minute dip, not
// three hours of open water, because a three-hour block is a listing again
// and the reader is back to doing the arithmetic.
//
// Everything a presentation could need is on the dip — v2's concepts drew day
// planners, clock faces and maps from the same numbers, and a dip carries all
// of them (leaveBy, start, end, duration, travel, coordinates, the source
// session) so a new picture never has to reach back into the schedule.

import {
	DEFAULT_DIP_DURATION_MIN,
	DIP_DURATION_OPTIONS,
	DIP_START_STEP_MIN
} from './config.js';
import { pickReach, rankDips, selectDips } from './appeal.js';
import { haversineKm } from './geo/distance.js';
import { variantLabel } from './labels.js';

// The longest offerable length that is no longer than `preferred` and fits
// in `windowMin`. Null when even the shortest option doesn't fit — that's a
// session too nearly over to be worth a trip, not a dip.
//
// Preference is a ceiling, not a target: asking for 45 and being handed 60
// would be a different appointment than the one you agreed to.
export function fitDuration(windowMin, preferred) {
	const options = DIP_DURATION_OPTIONS.filter((d) => d <= preferred && d <= windowMin);
	return options.length ? Math.max(...options) : null;
}

function roundUpTo(min, step) {
	return Math.ceil(min / step) * step;
}

/**
 * Build the dip a session would give you, or null if it can't give you one.
 *
 * @param session    an annotated session ({ start_min, end_min, kind, … })
 * @param location   the pool ({ id, name, address, lat, lng })
 * @param reach      how you'd get there, from appeal.js pickReach:
 *                   { routed: true, mode, minutes } — a routed trip, or
 *                   { routed: false, km } — a straight line and nothing more
 * @param opts.nowMin     minutes since midnight, Toronto
 * @param opts.preferredMin  the user's chosen dip length
 */
export function buildDip(
	session,
	location,
	reach,
	{ nowMin, preferredMin = DEFAULT_DIP_DURATION_MIN }
) {
	if (!reach) return null;
	const routed = reach.routed === true;
	if (routed && reach.minutes == null) return null;
	if (!routed && reach.km == null) return null;

	// The earliest you could be wet: either the water opens and you're already
	// there, or you're still travelling when it does.
	//
	// With no routed trip there is no "still travelling" to reckon with — we
	// don't know how long you'd take and won't guess — so the dip is simply
	// the front of the water you could still use. The reader does the last
	// step themselves, which is the honest division of labour when we can't
	// do it for them.
	const earliest = routed
		? Math.max(nowMin + reach.minutes, session.start_min)
		: Math.max(nowMin, session.start_min);
	const start = roundUpTo(earliest, DIP_START_STEP_MIN);
	const durationMin = fitDuration(session.end_min - start, preferredMin);
	if (durationMin == null) return null;

	return {
		// Stable across re-renders and unique per offer: one session at one
		// pool yields at most one dip, but a pool can appear several times a
		// day and a course id repeats across dates.
		id: `${location.id}-${session.course_id}-${session.start_min}`,
		location: {
			id: location.id,
			name: location.name,
			address: location.address,
			lat: location.lat,
			lng: location.lng
		},
		// True when a routing provider worked this out; false when all we have
		// is the straight line. Every consumer has to face the difference —
		// hence a flag rather than a null to overlook.
		routed,
		mode: routed ? reach.mode : null,
		travelMin: routed ? reach.minutes : null,
		km: routed ? (reach.km ?? null) : reach.km,
		// The number that turns a listing into an appointment. Can be in the
		// past when the session is already running and you're close enough to
		// have made it — the UI reads that as "leave now". Null with no routed
		// trip: we will not put a time on a journey we haven't measured.
		leaveBy: routed ? start - reach.minutes : null,
		start_min: start,
		end_min: start + durationMin,
		durationMin,
		preferredMin,
		// How much shorter than asked for. Costs appeal; never hides the dip.
		shortfallMin: preferredMin - durationMin,
		// What the water is doing around your window, so a picture can draw
		// the dip inside its session rather than floating in the day.
		session: {
			course_id: session.course_id,
			kind: session.kind,
			title: session.title,
			variant: variantLabel(session),
			start_min: session.start_min,
			end_min: session.end_min
		},
		// True when the session is already running — you'd be getting into
		// water that already has people in it.
		inProgress: session.start_min <= nowMin
	};
}

/**
 * Every dip today's schedule could offer, unranked.
 *
 * One dip per session: the mode is whichever the appeal order prefers among
 * those that qualify, and a session that no mode reaches in time simply
 * yields nothing.
 *
 * Note what this does *not* do, because it's a deliberate break with v1. The
 * old page listed a swim whose pool the city never geocoded, on the
 * principle that it should never hide a swim it couldn't assess. A dip can't
 * be built that way: "leave at 1:40, walk 20 minutes" is a promise, and an
 * unplaced pool is one we can't make it for. Those pools are counted and
 * reported by the page rather than silently dropped.
 *
 * @param schedule   the baked city payload ({ locations, sessions })
 * @param opts.now   { date, minutes } in Toronto time
 * @param opts.travel Map<location_id, { walk, bike, drive, transit }>
 * @param opts.kind  'lane' | 'leisure'
 * @param opts.preferredMin  the user's chosen dip length
 */
export function buildDips(schedule, { now, travel, origin, kind, preferredMin }) {
	const pools = new Map((schedule.locations ?? []).map((l) => [l.id, l]));
	const dips = [];
	// One haversine per pool rather than one per session: a pool with six
	// sessions is the same distance away all six times.
	const distances = new Map();
	const kmTo = (pool) => {
		if (!origin || !Number.isFinite(pool.lat) || !Number.isFinite(pool.lng)) return null;
		if (!distances.has(pool.id)) distances.set(pool.id, haversineKm(origin, pool));
		return distances.get(pool.id);
	};

	for (const session of schedule.sessions ?? []) {
		if (session.date !== now.date) continue;
		if (kind && session.kind !== kind) continue;
		if (session.end_min <= now.minutes) continue;

		const pool = pools.get(session.location_id);
		if (!pool) continue;

		const reach = pickReach(travel?.get(session.location_id), kmTo(pool));
		if (!reach) continue;

		const dip = buildDip(session, pool, reach, { nowMin: now.minutes, preferredMin });
		if (dip) dips.push(dip);
	}
	return dips;
}

// The whole offer, end to end: what the day holds, ranked by appeal, then
// thinned to the handful worth showing. The page is a presentation of this
// list and nothing more.
export function offerDips(schedule, opts) {
	return selectDips(rankDips(buildDips(schedule, opts)), opts);
}

// How many days ahead the concierge will look before admitting defeat. The
// city publishes a rolling window of a few weeks, and an offer eight days
// out isn't an offer — but a long weekend can shut the pools for three days
// running, so a week is the honest reach.
const DEFAULT_MAX_DAYS_AHEAD = 7;

function daysBetween(fromDate, toDate) {
	const day = 86_400_000;
	return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / day);
}

/**
 * The day the planner should be showing, and its dips.
 *
 * Today, whenever today still has water you could get to. Otherwise the next
 * day that does — which covers the three cases that all look the same to a
 * reader and quite different to the code:
 *
 *   11 p.m.  today's swims are over → offer tomorrow's
 *    2 a.m.  today's swims haven't happened yet → offer today's
 *   holiday  the city runs nothing at all → skip the day entirely
 *
 * A day whose swims exist but are all out of reach is skipped too: from the
 * reader's side, a pool they can't get to and a pool that's shut are the
 * same day off.
 *
 * @returns { date, nowMin, dips, isToday, daysAhead }
 */
export function planDay(schedule, opts) {
	const { now, maxDaysAhead = DEFAULT_MAX_DAYS_AHEAD } = opts;

	const dates = [...new Set((schedule.sessions ?? []).map((s) => s.date))]
		.filter((d) => d >= now.date && daysBetween(now.date, d) <= maxDaysAhead)
		.sort();

	for (const date of dates) {
		const isToday = date === now.date;
		// On a later day nothing has happened yet, so the whole day is ahead
		// of you and the clock starts at midnight.
		const nowMin = isToday ? now.minutes : 0;
		const dips = offerDips(schedule, { ...opts, now: { date, minutes: nowMin } });
		if (dips.length) {
			return { date, nowMin, dips, isToday, daysAhead: daysBetween(now.date, date) };
		}
	}

	// Nothing within reach all week. The page says so; it doesn't pretend.
	return { date: now.date, nowMin: now.minutes, dips: [], isToday: true, daysAhead: 0 };
}
