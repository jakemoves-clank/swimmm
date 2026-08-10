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
		if (dip.start_min >= groupEnd) closeGroup();

		// First sub-column free at this time; a fresh one if they're all busy.
		let lane = 0;
		while (group.some((g) => g.lane === lane && overlaps(g.dip, dip))) lane++;

		const entry = { dip, lane, lanes: 1 };
		group.push(entry);
		laid.push(entry);
		groupEnd = Math.max(groupEnd, dip.end_min);
	}
	closeGroup();

	return laid;
}

// The stretch of day the planner draws, rounded out to whole hours so the
// axis labels land on the hour. Starts at the earliest thing the reader has
// to act on — the first departure, or now — and ends when the last dip does.
export function planSpan(dips, nowMin) {
	const starts = dips.map((d) => Math.min(d.leaveBy, d.start_min));
	const from = Math.floor(Math.min(nowMin, ...starts) / 60) * 60;
	if (!dips.length) return [from, from + 60];
	return [from, Math.ceil(Math.max(...dips.map((d) => d.end_min)) / 60) * 60];
}
