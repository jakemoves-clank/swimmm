// What makes a dip appealing, and which handful to offer.
//
// This is the concierge's taste, kept in one file on purpose. Every number it
// uses lives in config.js APPEAL / DIP_SELECTION, so the two things you'd
// want to do to it later — retune it, or teach it a new consideration — are
// each a small edit in a known place:
//
//   retune  → change a number in config.js, touch nothing here
//   expand  → add a term to TERMS below (weather, water temperature, a
//             facility rating, a pool's length) and it joins the score,
//             the breakdown, and the tests without touching anything else
//
// Scoring is deliberately additive and explained: scoreDip returns the terms
// alongside the total, so a dip can always answer "why were you offered?"
// and a tester can assert on one term rather than on a magic number.
//
// The one invariant worth protecting: mode dominates. Walking beats cycling
// beats transit beats driving, and no combination of the other terms can
// overturn that (see the BASE spacing note in config.js). A concierge that
// offered a drive over a walk because the drive was to a marginally nicer
// pool would be answering a question nobody asked.

import { APPEAL, DIP_SELECTION } from './config.js';

const RULES = new Map(APPEAL.MODES.map((m) => [m.mode, m]));

// In preference order, best first — the order of APPEAL.MODES is the
// preference itself, not an accident of how it's written down.
export const MODES = APPEAL.MODES.map((m) => m.mode);

export function modeRule(mode) {
	return RULES.get(mode) ?? null;
}

// How long this mode's trip takes, or null when we can't make the trip at
// all. Transit arrives shaped differently from the Mapbox modes because it
// carries connections, and a trip with two changes isn't one we'll offer
// however quick the clock says it is.
function minutesFor(mode, times) {
	const rule = RULES.get(mode);
	const value = times?.[mode];
	if (value == null) return null;
	if (mode === 'transit') {
		if (value.minutes == null) return null;
		if (rule.MAX_CONNECTIONS != null && value.connections > rule.MAX_CONNECTIONS) return null;
		return value.minutes;
	}
	return value;
}

/**
 * The mode we'd offer for this pool: the most appealing one that gets you
 * there inside its own threshold. Null when none does — that pool is not on
 * offer today, which is a normal answer and not an error.
 *
 * Note this is a preference, not a race: a 12-minute walk beats a 4-minute
 * ride, because the walk is the nicer way to go to a swim.
 */
export function pickMode(times) {
	for (const { mode, MAX_MIN } of APPEAL.MODES) {
		const minutes = minutesFor(mode, times);
		if (minutes != null && minutes <= MAX_MIN) return { mode, minutes };
	}
	return null;
}

/**
 * How you'd reach this pool, if we can offer it at all.
 *
 * A routed trip whenever we have one; otherwise the straight-line distance,
 * which is honest about being a distance rather than dressing itself up as a
 * departure time. Null when neither is good enough to offer.
 *
 * @param times  { walk, bike, drive, transit } minutes, any of them null
 * @param km     straight-line distance from the origin, or null
 */
export function pickReach(times, km) {
	const routed = pickMode(times);
	if (routed) return { routed: true, ...routed };
	if (km != null && km <= APPEAL.DISTANCE.MAX_KM) return { routed: false, km };
	return null;
}

// Each term reads a dip and returns points. Add one here to teach the
// concierge a new consideration; everything downstream picks it up.
const TERMS = [
	// Which way you'd get there. The dominant term by design. A dip with no
	// routed trip scores the DISTANCE base, which sits below every mode.
	{
		name: 'mode',
		points: (dip) => (dip.routed ? (modeRule(dip.mode)?.BASE ?? 0) : APPEAL.DISTANCE.BASE)
	},
	// Where in its range the trip falls: at the limit this is worth nothing,
	// on your doorstep it's worth the full weight. The limit is the mode's
	// threshold in minutes, or — with no routed trip — MAX_KM of straight line.
	{
		name: 'proximity',
		points: (dip) => {
			if (!dip.routed) {
				if (dip.km == null) return 0;
				const room = Math.max(0, APPEAL.DISTANCE.MAX_KM - dip.km);
				return (room / APPEAL.DISTANCE.MAX_KM) * APPEAL.DISTANCE.PROXIMITY_WEIGHT;
			}
			const rule = modeRule(dip.mode);
			if (!rule || dip.travelMin == null) return 0;
			const room = Math.max(0, rule.MAX_MIN - dip.travelMin);
			return (room / rule.MAX_MIN) * APPEAL.PROXIMITY_WEIGHT;
		}
	},
	// Being handed 30 minutes when you asked for 45 is a worse offer, and
	// the score should say so out loud rather than pretending otherwise.
	{
		name: 'shortfall',
		points: (dip) => -(dip.shortfallMin ?? 0) * APPEAL.SHORTFALL_PENALTY_PER_MIN
	}
];

export function scoreDip(dip) {
	const terms = TERMS.map((t) => ({ name: t.name, points: t.points(dip) }));
	return { score: terms.reduce((sum, t) => sum + t.points, 0), terms };
}

// Appealing dips, best first, with their scoring attached. A dip we could
// neither route nor measure isn't ranked low — it isn't on offer at all.
export function rankDips(dips) {
	return dips
		.filter((d) => (d.routed ? modeRule(d.mode) : d.km != null))
		.map((d) => ({ ...d, appeal: scoreDip(d) }))
		.sort((a, b) => b.appeal.score - a.appeal.score || a.start_min - b.start_min);
}

function overlapMin(a, b) {
	return Math.min(a.end_min, b.end_min) - Math.max(a.start_min, b.start_min);
}

/**
 * The handful actually offered, in the order the day runs.
 *
 * Two passes. The first is fussy: it takes the best dips that answer
 * *different* questions — no two overlapping in the water by more than
 * MAX_OVERLAP_MIN, no more than MAX_PER_POOL at any one pool — so that a
 * reader with a free afternoon can see what each part of it holds. The
 * second pass fills any remaining room with the best of what's left,
 * clashes and all, because "here are two options at 2 p.m." is a better
 * answer than a half-empty page.
 *
 * Both passes stop at MAX_CONCURRENT dips in the water at once, so callers
 * still have to draw overlapping dips — but never more of them side by side
 * than a single column can set type in. A reader only wants another option
 * if it answers a different question, and a sixth pool open at five past
 * five does not.
 */
export function selectDips(ranked, { count = DIP_SELECTION.COUNT } = {}) {
	const picked = [];
	const perPool = new Map();

	const roomAtPool = (dip) => (perPool.get(dip.location?.id) ?? 0) < DIP_SELECTION.MAX_PER_POOL;
	// How many of the picked dips this one would share water with. Counted
	// against the candidate rather than across the day: three dips in an
	// evening that overlap only their neighbours are three separate answers,
	// and the column packs them two abreast at worst.
	const roomInTheWater = (dip) =>
		picked.filter((p) => overlapMin(p, dip) > 0).length < DIP_SELECTION.MAX_CONCURRENT;
	const take = (dip) => {
		picked.push(dip);
		perPool.set(dip.location?.id, (perPool.get(dip.location?.id) ?? 0) + 1);
	};

	for (const dip of ranked) {
		if (picked.length >= count) break;
		const clashes = picked.some((p) => overlapMin(p, dip) > DIP_SELECTION.MAX_OVERLAP_MIN);
		if (!clashes && roomAtPool(dip) && roomInTheWater(dip)) take(dip);
	}

	if (picked.length < count) {
		for (const dip of ranked) {
			if (picked.length >= count) break;
			if (!picked.includes(dip) && roomAtPool(dip) && roomInTheWater(dip)) take(dip);
		}
	}

	// Offered as a day, not as a leaderboard: the reader is scanning for a
	// time they're free, so the running order is the useful one. The score
	// rides along on each dip for anything that wants to say "best".
	return picked.sort((a, b) => a.start_min - b.start_min || b.appeal.score - a.appeal.score);
}
