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
// The clash that splits the column is a clash *in the water*, and only that.
// It used to be a clash of ink: the trip is drawn above its own block, so a
// 3:00 dip you leave for at 2:40 was held to overlap a 2:15–3:00 one, and the
// two were set half-width side by side. That paid the page's scarcest
// currency — the width the pool names are set in — for a collision the reader
// never sees, and it happened constantly, because most dips are twenty
// minutes' travel from most other dips.
//
// So the two stack, full width, and the later trip line stays on its own
// block's leading edge — where a line from a departure to a swim belongs, and
// the only place it can be read as belonging to that dip at all. The line used
// to flip to the far edge of the column instead, which put a tick and a mode
// icon in the middle of the page attached to a line running down the inside of
// somebody else's block: no collision, and no way to tell whose trip it was.
//
// Where a line does have an earlier block to get past, it simply passes in
// front of it — so this file has nothing left to say about it. It is a
// hairline and a 5px tick, running inside that block's own left margin, and
// the one thing that used to need room out there, the mode icon, is now set
// in its own block's trip line instead.
function water(dip) {
	return { start_min: dip.start_min, end_min: dip.end_min };
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
		const wet = water(dip);
		if (wet.start_min >= groupEnd) closeGroup();

		// First sub-column free at this time; a fresh one if they're all busy.
		let lane = 0;
		while (group.some((g) => g.lane === lane && overlaps(water(g.dip), wet))) lane++;

		const entry = { dip, lane, lanes: 1 };
		group.push(entry);
		laid.push(entry);
		groupEnd = Math.max(groupEnd, wet.end_min);
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
