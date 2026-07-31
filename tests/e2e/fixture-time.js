// Shared clock anchor for the e2e suite.
//
// Sessions used to be seeded relative to the real "now", which meant the
// scenario stopped fitting inside the day after ~21:00 Toronto: a session two
// or three hours out ran past midnight, hit the seed's clamp at 23:59 and
// collapsed to zero length, so `isReachable` correctly dropped it for failing
// the 30-minute minimum. The suite passed by day and failed by night — and
// "by night" in UTC is exactly when CI is likely to run.
//
// Instead the fixture pins a fixed Toronto wall-clock time and the tests pin
// the browser clock to the same instant, so the suite behaves identically
// whenever it runs.
import { readFileSync } from 'node:fs';
import { torontoNow } from '../../src/lib/time.js';

export const ANCHOR_FILE = 'tests/e2e/.tmp/anchor.json';

// Noon, so every seeded session has hours of room on either side.
export const ANCHOR_MIN = 12 * 60;

// The instant at which Toronto's wall clock reads ANCHOR_MIN on `date`.
// Derived from the formatter rather than hardcoding UTC-4/-5 so it stays
// correct either side of a DST change.
export function anchorInstant(date) {
	const guess = new Date(`${date}T12:00:00Z`);
	const drift = ANCHOR_MIN - torontoNow(guess).minutes;
	return new Date(guess.getTime() + drift * 60_000);
}

// Written by seed.js, read by the tests — so both agree on the date even if
// the run straddles midnight in Toronto.
export function readAnchor() {
	return JSON.parse(readFileSync(ANCHOR_FILE, 'utf8'));
}

// Pin the page's clock to the seeded anchor. Must run before the first
// navigation, since the page reads the clock once on mount.
export async function pinClock(page) {
	await page.clock.setFixedTime(new Date(readAnchor().instant));
}
