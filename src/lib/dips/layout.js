// Where each dip sits on the day planner.
//
// The planner is one column with a real time axis: a dip's distance down the
// page *is* when it happens, so the reader can answer "I'm free between 2 and
// 4 — what are my options?" by looking at one band of the page. Kept separate
// from the component because it's arithmetic, and arithmetic should be
// testable without a browser.

// A calendar's column-packing rule, for the uncommon case. selectDips spreads
// the handful so that dips rarely share a time, but it is allowed to return
// overlapping ones when the day offers nothing else — so the planner has to
// draw them, side by side, rather than stacking them on top of each other.
//
// What a dip occupies is not its window in the water but its ink: the trip is
// drawn above the block, in the block's own column, so the dip claims the
// page from when you would leave. Judged on the water alone, a 3:00 dip you
// leave for at 2:40 does not clash with a 2:15–3:00 one — and then the
// earlier block is drawn straight over the later one's trip line, and the
// number that makes a dip an appointment is the one thing you cannot see.
// A dip we could not route has no departure and draws no line, so it claims
// nothing before the water.
function occupies(dip) {
	const from = dip.leaveBy != null ? Math.min(dip.leaveBy, dip.start_min) : dip.start_min;
	return { start_min: from, end_min: dip.end_min };
}

function overlaps(a, b) {
	return a.start_min < b.end_min && b.start_min < a.end_min;
}

/**
 * @returns [{ dip, lane, lanes }] in the order the day runs — `lane` is which
 * sub-column to draw in, `lanes` how many the group needs (so a dip with no
 * clash gets the full width).
 */
export function layoutDips(dips) {
	const ordered = [...dips].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
	const laid = [];

	// A group is a run of dips connected by overlap: A may not touch C, but if
	// B touches both then all three share a width, or the column would change
	// shape halfway down a chain and read as three unrelated layouts.
	let group = [];
	let groupEnd = -Infinity;

	const closeGroup = () => {
		const lanes = group.length ? Math.max(...group.map((g) => g.lane)) + 1 : 0;
		for (const entry of group) entry.lanes = lanes;
		group = [];
	};

	for (const dip of ordered) {
		const ink = occupies(dip);
		if (ink.start_min >= groupEnd) closeGroup();

		// First sub-column free at this time; a fresh one if they're all busy.
		let lane = 0;
		while (group.some((g) => g.lane === lane && overlaps(occupies(g.dip), ink))) lane++;

		const entry = { dip, lane, lanes: 1 };
		group.push(entry);
		laid.push(entry);
		groupEnd = Math.max(groupEnd, ink.end_min);
	}
	closeGroup();

	return laid;
}

/**
 * The stretch of day the planner draws, rounded out to whole hours so the
 * axis labels land on the hour.
 *
 * @param nowMin  minutes since midnight, or null when the planner is showing
 *                a day that isn't today and so has no "now" on it.
 */
// At most this much empty axis before the first departure. Asked at 3 a.m.
// about a 2 p.m. swim, an axis anchored on now would be eleven hours of blank
// page — context past an hour is just scrolling.
const LEAD_IN_MIN = 60;

export function planSpan(dips, nowMin) {
	if (!dips.length) {
		const from = Math.floor((nowMin ?? 0) / 60) * 60;
		return [from, from + 60];
	}
	const first = Math.min(...dips.map((d) => Math.min(d.leaveBy ?? d.start_min, d.start_min)));
	// Never before now: the part of the day you have already slept through is
	// not an option, and on a screen that has to hold the whole offer at once
	// it is the first ink worth erasing. (A dip whose departure has passed —
	// you're close enough to a running session to still make it — therefore
	// starts at now, and the card says "leave now".)
	const from = nowMin == null ? first : Math.max(nowMin, first - LEAD_IN_MIN);
	return [
		Math.floor(from / 60) * 60,
		Math.ceil(Math.max(...dips.map((d) => d.end_min)) / 60) * 60
	];
}
