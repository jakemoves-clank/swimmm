import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { env } from '$env/dynamic/private';
import { openDb } from './db.js';
import { maybeRefresh } from './refresh.js';

// Honours HTTP(S)_PROXY / NO_PROXY env vars (no-op when unset), which Node's
// global fetch ignores. Needed wherever egress goes through a proxy.
const proxyDispatcher = new EnvHttpProxyAgent();
const fetchImpl = (url) => undiciFetch(url, { dispatcher: proxyDispatcher });

// Every 6h we *consider* a refresh; maybeRefresh itself only hits the city's
// lightweight metadata endpoint at most ~once a day, and downloads data files
// only when the city publishes new data (weekly for programs, monthly for geo).
const TICK_MS = 6 * 3600_000;

let db;

export function getDb() {
	if (!db) {
		const path = env.DB_PATH || 'data/swimmm.db';
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		db = openDb(path);
		if (env.SKIP_REFRESH !== '1') {
			const tick = () =>
				maybeRefresh(db, { fetchImpl }).then(
					(r) => r.downloaded && console.log(`[swimmm] refreshed city data: ${r.sessions} adult lane swim sessions`),
					(e) => console.error('[swimmm] refresh failed:', e.message)
				);
			tick();
			setInterval(tick, TICK_MS).unref();
		}
	}
	return db;
}

export function torontoNow(date = new Date()) {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Toronto',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}
