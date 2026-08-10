import { describe, it, expect } from 'vitest';
import { modeRule, pickMode, scoreDip, rankDips, selectDips } from '../../src/lib/appeal.js';
import { DIP_SELECTION } from '../../src/lib/config.js';

// Travel times as the page has them: minutes per mode, transit carrying its
// connection count because a three-transfer trip is not a 20-minute trip in
// any sense the reader cares about.
const times = (over = {}) => ({ walk: null, bike: null, drive: null, transit: null, ...over });

let seq = 0;
const dip = (over = {}) => ({
	id: `d${seq++}`,
	location: { id: 1, name: 'Regent Park' },
	mode: 'walk',
	travelMin: 10,
	start_min: 840,
	end_min: 885,
	durationMin: 45,
	preferredMin: 45,
	shortfallMin: 0,
	...over
});

describe('pickMode', () => {
	it('walks you there even when cycling would be quicker', () => {
		expect(pickMode(times({ walk: 12, bike: 4 }))).toEqual({ mode: 'walk', minutes: 12 });
	});

	it('falls to cycling when the walk is beyond 15 minutes', () => {
		expect(pickMode(times({ walk: 25, bike: 12 }))).toEqual({ mode: 'bike', minutes: 12 });
	});

	it('falls to transit when the ride is beyond 20 minutes', () => {
		const t = times({ walk: 40, bike: 30, transit: { minutes: 18, connections: 1 } });
		expect(pickMode(t)).toEqual({ mode: 'transit', minutes: 18 });
	});

	it('will not send you through two connections to save a few minutes', () => {
		const t = times({ walk: 40, bike: 30, transit: { minutes: 12, connections: 2 }, drive: 15 });
		expect(pickMode(t)).toEqual({ mode: 'drive', minutes: 15 });
	});

	it('drives you there only when nothing else qualifies', () => {
		expect(pickMode(times({ walk: 40, bike: 30, drive: 15 }))).toEqual({
			mode: 'drive',
			minutes: 15
		});
	});

	it('gives up when every mode is beyond its threshold', () => {
		expect(pickMode(times({ walk: 60, bike: 40, drive: 25 }))).toBeNull();
	});

	it('gives up when we know no travel times at all', () => {
		expect(pickMode(times())).toBeNull();
	});
});

describe('scoreDip', () => {
	// The ordering the whole concierge rests on: a mode never loses to a
	// slower one, however flattering the rest of the numbers.
	// The worst a dip of a given mode can look: right at the mode's threshold
	// and cut from the longest option to the shortest. The best a dip can
	// look: on the doorstep, full length. Even at those extremes the mode
	// order must hold, or the concierge is offering drives over walks.
	const worst = (mode) =>
		dip({ mode, travelMin: modeRule(mode).MAX_MIN, preferredMin: 60, durationMin: 30, shortfallMin: 30 });
	const best = (mode) => dip({ mode, travelMin: 0, preferredMin: 60, durationMin: 60, shortfallMin: 0 });

	it('ranks the worst qualifying walk above the sweetest possible ride', () => {
		expect(scoreDip(worst('walk')).score).toBeGreaterThan(scoreDip(best('bike')).score);
	});

	it('ranks the worst qualifying ride above the sweetest transit trip', () => {
		expect(scoreDip(worst('bike')).score).toBeGreaterThan(scoreDip(best('transit')).score);
	});

	it('ranks the sweetest drive below the worst qualifying transit trip', () => {
		expect(scoreDip(worst('transit')).score).toBeGreaterThan(scoreDip(best('drive')).score);
	});

	it('prefers the closer of two pools reached the same way', () => {
		const near = scoreDip(dip({ travelMin: 4 }));
		const far = scoreDip(dip({ travelMin: 14 }));
		expect(near.score).toBeGreaterThan(far.score);
	});

	it('marks down a dip that could not give you the length you asked for', () => {
		const full = scoreDip(dip());
		const short = scoreDip(dip({ durationMin: 30, shortfallMin: 15 }));
		expect(short.score).toBeLessThan(full.score);
	});

	it('shows its working, so the taste can be argued with', () => {
		const { score, terms } = scoreDip(dip({ travelMin: 5, shortfallMin: 15 }));
		expect(terms.map((t) => t.name)).toEqual(['mode', 'proximity', 'shortfall']);
		expect(terms.reduce((sum, t) => sum + t.points, 0)).toBeCloseTo(score);
	});
});

describe('rankDips', () => {
	it('drops dips whose mode never qualified and sorts the rest by appeal', () => {
		const ranked = rankDips([
			dip({ id: 'far-drive', mode: 'drive', travelMin: 5 }),
			dip({ id: 'close-walk', mode: 'walk', travelMin: 3 }),
			dip({ id: 'unreachable', mode: null, travelMin: null })
		]);
		expect(ranked.map((d) => d.id)).toEqual(['close-walk', 'far-drive']);
		expect(ranked[0].appeal.score).toBeGreaterThan(ranked[1].appeal.score);
	});
});

describe('selectDips', () => {
	const at = (start, over = {}) =>
		dip({ start_min: start, end_min: start + 45, location: { id: start, name: `Pool ${start}` }, ...over });

	it('offers a handful, not the whole day', () => {
		const many = Array.from({ length: 20 }, (_, i) => at(600 + i * 60));
		expect(selectDips(rankDips(many))).toHaveLength(DIP_SELECTION.COUNT);
	});

	it('spreads them through the day rather than answering one hour five times', () => {
		// Five dips all at 2 p.m., one at 5. The 5 p.m. one is a worse trip,
		// but it is the only one that answers a different question.
		const clashing = Array.from({ length: 5 }, (_, i) => at(840, { travelMin: 3 + i }));
		const later = at(1020, { travelMin: 14 });
		const picked = selectDips(rankDips([...clashing, later]));
		expect(picked.map((d) => d.start_min)).toContain(1020);
	});

	it('still fills the handful with overlapping dips when the day offers nothing else', () => {
		const clashing = Array.from({ length: 6 }, (_, i) =>
			at(840, { travelMin: 3 + i, location: { id: i, name: `Pool ${i}` } })
		);
		const picked = selectDips(rankDips(clashing));
		expect(picked).toHaveLength(DIP_SELECTION.COUNT);
	});

	it('does not offer the same pool over and over', () => {
		const sameRoof = Array.from({ length: 5 }, (_, i) =>
			at(600 + i * 90, { location: { id: 9, name: 'Regent Park' } })
		);
		const elsewhere = [at(660, { location: { id: 2, name: 'Alex Duff' }, travelMin: 12 })];
		const picked = selectDips(rankDips([...sameRoof, ...elsewhere]));
		const atRegent = picked.filter((d) => d.location.id === 9);
		expect(atRegent.length).toBeLessThanOrEqual(DIP_SELECTION.MAX_PER_POOL);
	});

	it('hands back the dips in the order the day runs, not in score order', () => {
		const picked = selectDips(rankDips([at(1020, { travelMin: 3 }), at(600, { travelMin: 12 })]));
		expect(picked.map((d) => d.start_min)).toEqual([600, 1020]);
	});
});
