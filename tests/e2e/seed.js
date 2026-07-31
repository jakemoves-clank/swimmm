// Writes a schedule fixture with two pools and both kinds of swim "today"
// (Toronto time). The build consumes it via SWIMMM_DATA_FILE, so e2e runs
// are deterministic and never contact the city.
//
// Session times are offsets from a fixed midday anchor rather than from the
// real clock; the tests pin the browser to the same instant. See
// fixture-time.js for why.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { torontoNow } from '../../src/lib/time.js';
import { ANCHOR_FILE, ANCHOR_MIN, anchorInstant } from './fixture-time.js';

const OUT = 'tests/e2e/.tmp/schedule.json';

rmSync('tests/e2e/.tmp', { recursive: true, force: true });
mkdirSync('tests/e2e/.tmp', { recursive: true });

const { date } = torontoNow();
const at = (offset) => ANCHOR_MIN + offset;

// The test user (see e2e tests) is at 43.6600, -79.4000 — right beside Nearby
// Pool. Faraway Pool is ~19 km away but its session starts sooner.
const schedule = {
	programs_last_refreshed: '2026-07-23 21:38:47 (seeded)',
	facilities_last_refreshed: '2026-07-01 20:25:15 (seeded)',
	generated_at: new Date().toISOString(),
	locations: [
		{ id: 9001, name: 'Nearby Pool', address: '1 Close St', lat: 43.66, lng: -79.4 },
		{ id: 9002, name: 'Faraway Pool', address: '99 Distant Ave', lat: 43.805, lng: -79.19 }
	],
	sessions: [
		{
			location_id: 9001,
			course_id: 1,
			kind: 'lane',
			title: 'Lane Swim',
			date,
			start_min: at(120),
			end_min: at(180)
		},
		{
			location_id: 9002,
			course_id: 2,
			kind: 'lane',
			title: 'Lane Swim',
			date,
			start_min: at(30),
			end_min: at(90)
		},
		// Leisure only at Nearby Pool, so the toggle visibly changes the list
		// rather than just reordering it.
		{
			location_id: 9001,
			course_id: 3,
			kind: 'leisure',
			title: 'Leisure Swim',
			date,
			start_min: at(60),
			end_min: at(150)
		}
	]
};

writeFileSync(OUT, JSON.stringify(schedule));
writeFileSync(ANCHOR_FILE, JSON.stringify({ date, instant: anchorInstant(date).toISOString() }));
console.log(`seeded ${OUT} for ${date} at anchor ${ANCHOR_MIN} min`);
