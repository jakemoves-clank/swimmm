// Writes a schedule fixture with two pools and lane swim sessions "today"
// (Toronto time). The build consumes it via SWIMMM_DATA_FILE, so e2e runs
// are deterministic and never contact the city.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { torontoNow } from '../../src/lib/time.js';

const OUT = 'tests/e2e/.tmp/schedule.json';

rmSync('tests/e2e/.tmp', { recursive: true, force: true });
mkdirSync('tests/e2e/.tmp', { recursive: true });

const { date, minutes } = torontoNow();
const clamp = (m) => Math.min(m, 1439);

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
			title: 'Lane Swim',
			date,
			start_min: clamp(minutes + 120),
			end_min: clamp(minutes + 180)
		},
		{
			location_id: 9002,
			course_id: 2,
			title: 'Lane Swim',
			date,
			start_min: clamp(minutes + 30),
			end_min: clamp(minutes + 90)
		}
	]
};

writeFileSync(OUT, JSON.stringify(schedule));
console.log(`seeded ${OUT} for ${date}`);
