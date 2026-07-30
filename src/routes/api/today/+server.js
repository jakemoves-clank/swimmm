import { json } from '@sveltejs/kit';
import { getDb, torontoNow } from '$lib/server/state.js';
import { sessionsForDate, getMeta } from '$lib/server/db.js';

// Today's adult lane swim sessions (Toronto time), ended ones excluded.
// Takes no user input at all — location handling stays on the client.
export function GET() {
	const db = getDb();
	const { date, minutes } = torontoNow();
	const sessions = sessionsForDate(db, date).filter((s) => s.end_min > minutes);
	return json({
		date,
		now_min: minutes,
		data_from: getMeta(db, 'programs_last_refreshed') ?? null,
		sessions
	});
}
