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
import { pickMode, rankDips, selectDips } from './appeal.js';
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
 * @param travel     { mode, minutes } — one-way, from a routing provider
 * @param opts.nowMin     minutes since midnight, Toronto
 * @param opts.preferredMin  the user's chosen dip length
 */
export function buildDip(
	session,
	location,
	travel,
	{ nowMin, preferredMin = DEFAULT_DIP_DURATION_MIN }
) {
	if (!travel || travel.minutes == null) return null;

	// The earliest you could be wet: either the water opens and you're already
	// there, or you're still walking when it does.
	const earliest = Math.max(nowMin + travel.minutes, session.start_min);
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
		mode: travel.mode,
		travelMin: travel.minutes,
		// The number that turns a listing into an appointment. Can be in the
		// past when the session is already running and you're close enough to
		// have made it — the UI reads that as "leave now".
		leaveBy: start - travel.minutes,
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
export function buildDips(schedule, { now, travel, kind, preferredMin }) {
	const pools = new Map((schedule.locations ?? []).map((l) => [l.id, l]));
	const dips = [];

	for (const session of schedule.sessions ?? []) {
		if (session.date !== now.date) continue;
		if (kind && session.kind !== kind) continue;
		if (session.end_min <= now.minutes) continue;

		const pool = pools.get(session.location_id);
		if (!pool) continue;

		const chosen = pickMode(travel?.get(session.location_id));
		if (!chosen) continue;

		const dip = buildDip(session, pool, chosen, { nowMin: now.minutes, preferredMin });
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
