// Seeds a throwaway SQLite DB with two pools and lane swim sessions "today"
// (Toronto time) so the e2e test is deterministic and hits no city endpoints.
import { mkdirSync, rmSync } from 'node:fs';
import { openDb, replaceData, setMeta } from '../../src/lib/server/db.js';

const DB_PATH = 'tests/e2e/.tmp/e2e.db';

function torontoNow() {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Toronto',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

rmSync('tests/e2e/.tmp', { recursive: true, force: true });
mkdirSync('tests/e2e/.tmp', { recursive: true });

const db = openDb(DB_PATH);
const { date, minutes } = torontoNow();
const clamp = (m) => Math.min(m, 1439);

// The test user (see e2e test) is at 43.6600, -79.4000 — right beside Nearby
// Pool. Faraway Pool is ~19 km away but its session starts sooner.
replaceData(db, {
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
});
setMeta(db, 'programs_last_refreshed', '2026-07-23 21:38:47 (seeded)');
console.log(`seeded ${DB_PATH} for ${date}`);
