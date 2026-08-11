import { describe, it, expect } from 'vitest';
import { layoutDips, planSpan } from '../../src/lib/dips/layout.js';

let seq = 0;
const dip = (start, end, over = {}) => ({
	id: `d${seq++}`,
	start_min: start,
	end_min: end,
	leaveBy: start - 15,
	...over
});

describe('layoutDips', () => {
	// The common case, and the one the appeal algorithm's spread rule works
	// to produce: a column of dips that each own their slice of the day.
	it('gives a dip the full width when nothing else is in the water with it', () => {
		const laid = layoutDips([dip(600, 645), dip(720, 765)]);
		expect(laid.map((l) => [l.lane, l.lanes])).toEqual([
			[0, 1],
			[0, 1]
		]);
	});

	// Uncommon — but the appeal algorithm is allowed to return overlapping
	// dips when the day offers nothing else, so the planner has to draw them.
	it('sets two dips that clash side by side', () => {
		const laid = layoutDips([dip(600, 645), dip(620, 665)]);
		expect(laid.map((l) => l.lane)).toEqual([0, 1]);
		expect(laid.every((l) => l.lanes === 2)).toBe(true);
	});

	// A(10–11) and C(11:15–12) don't touch, but B(10:30–11:30) touches both,
	// so all three share a width or the column would jump about mid-chain.
	it('keeps a chain of overlaps to one shared width', () => {
		const laid = layoutDips([dip(600, 660), dip(630, 690), dip(675, 720)]);
		expect(laid.map((l) => l.lane)).toEqual([0, 1, 0]);
		expect(laid.every((l) => l.lanes === 2)).toBe(true);
	});

	// The trip is drawn above its own block, in its own column, so a dip's ink
	// begins when you would leave rather than when you get in. Judged on the
	// water alone these two never meet; judged on the ink, the earlier block
	// is sitting on top of the later one's trip line and hiding it.
	it('counts an earlier block covering a later block’s trip line as a clash', () => {
		const laid = layoutDips([dip(600, 645), dip(660, 705, { leaveBy: 640 })]);
		expect(laid.map((l) => l.lane)).toEqual([0, 1]);
		expect(laid.every((l) => l.lanes === 2)).toBe(true);
	});

	it('leaves both at full width when the trip starts after the earlier block ends', () => {
		const laid = layoutDips([dip(600, 645), dip(660, 705, { leaveBy: 650 })]);
		expect(laid.map((l) => [l.lane, l.lanes])).toEqual([
			[0, 1],
			[0, 1]
		]);
	});

	// A dip we couldn't route has no departure time and so draws no trip line
	// — it must not claim the time before it as though it had one.
	it('claims no time before the water for a dip with no routed trip', () => {
		const laid = layoutDips([dip(600, 645), dip(650, 695, { leaveBy: null })]);
		expect(laid.map((l) => [l.lane, l.lanes])).toEqual([
			[0, 1],
			[0, 1]
		]);
	});

	it('reads the day in order however the dips arrived', () => {
		const laid = layoutDips([dip(720, 765), dip(600, 645)]);
		expect(laid.map((l) => l.dip.start_min)).toEqual([600, 720]);
	});

	it('has nothing to lay out when there are no dips', () => {
		expect(layoutDips([])).toEqual([]);
	});
});

describe('planSpan', () => {
	it('runs from the hour you would set off to the hour the last dip ends', () => {
		expect(planSpan([dip(620, 665), dip(800, 845)], 600)).toEqual([600, 900]);
	});

	// The morning you slept through is not an option you can take, and on a
	// screen that has to hold the whole offer at once it is the first thing
	// that should go. A departure already behind you starts at now instead.
	it('never draws the part of the day that has already gone', () => {
		const running = dip(560, 605, { leaveBy: 545 });
		expect(planSpan([running, dip(800, 845)], 600)[0]).toBe(600);
	});

	it('starts at now when now is nearly time to set off', () => {
		expect(planSpan([dip(800, 845)], 750)).toEqual([720, 900]);
	});

	// Asked at 2 a.m. about a 2 p.m. swim, an axis anchored on "now" would be
	// twelve hours of empty page. It leads in by an hour and no more.
	it('does not draw half a night of empty axis to reach the first dip', () => {
		expect(planSpan([dip(840, 885)], 120)).toEqual([720, 900]);
	});

	// A planner showing tomorrow has no "now" on it at all.
	it('spans the dips alone when the day being shown is not today', () => {
		expect(planSpan([dip(600, 645), dip(800, 845)], null)).toEqual([540, 900]);
	});

	// A planner with no height is a broken-looking page, so an empty day
	// still gets an hour of axis to draw the "now" line against.
	it('gives an empty day an hour of its own', () => {
		expect(planSpan([], 610)).toEqual([600, 660]);
	});
});
