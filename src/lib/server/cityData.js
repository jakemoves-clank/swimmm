// Build-time city data loader. Runs inside the prerender `load` — the built
// site contains its output and never contacts the city at runtime.
//
// Politeness contract (the city refreshes weekly/monthly):
// - CI: the deploy workflow only rebuilds when the city's stamp changes.
// - Dev: responses are cached on disk for CACHE_MAX_AGE_MS, so repeated
//   `npm run dev` / `npm run build` don't re-download.
// - Tests: SWIMMM_DATA_FILE bypasses the network entirely.
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { buildSchedule } from './transform.js';

const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const URLS = {
	programsMeta: `${CKAN}/api/3/action/package_show?id=registered-programs-and-drop-in-courses-offering`,
	facilitiesMeta: `${CKAN}/api/3/action/package_show?id=parks-and-recreation-facilities`,
	dropin: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/drop-in.json`,
	locations: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/87f95a5a-184f-4df5-ad37-84bcc1ea99a9/download/locations.json`,
	geojson: `${CKAN}/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson`
};

const CACHE_MAX_AGE_MS = 20 * 3600_000;
const FETCH_TIMEOUT_MS = 120_000;

const dispatcher = new EnvHttpProxyAgent();
const defaultFetch = (url) =>
	undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

async function getJson(fetchImpl, url) {
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
	return res.json();
}

export async function loadSchedule({ cacheDir = '.city-cache', fetchImpl = defaultFetch } = {}) {
	if (process.env.SWIMMM_DATA_FILE) {
		return JSON.parse(readFileSync(process.env.SWIMMM_DATA_FILE, 'utf8'));
	}

	const cacheFile = join(cacheDir, 'schedule.json');
	try {
		if (Date.now() - statSync(cacheFile).mtimeMs < CACHE_MAX_AGE_MS) {
			return JSON.parse(readFileSync(cacheFile, 'utf8'));
		}
	} catch {
		// no cache yet
	}

	const [programsMeta, facilitiesMeta, dropin, locations, geojson] = await Promise.all([
		getJson(fetchImpl, URLS.programsMeta),
		getJson(fetchImpl, URLS.facilitiesMeta),
		getJson(fetchImpl, URLS.dropin),
		getJson(fetchImpl, URLS.locations),
		getJson(fetchImpl, URLS.geojson)
	]);

	const schedule = {
		programs_last_refreshed: String(programsMeta.result.last_refreshed),
		facilities_last_refreshed: String(facilitiesMeta.result.last_refreshed),
		generated_at: new Date().toISOString(),
		...buildSchedule(dropin, locations, geojson)
	};

	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(cacheFile, JSON.stringify(schedule));
	// One-line stamp the deploy workflow publishes and compares against CKAN
	// to decide whether a scheduled rebuild is needed at all.
	writeFileSync(
		join(cacheDir, 'stamp.txt'),
		`${schedule.programs_last_refreshed}|${schedule.facilities_last_refreshed}\n`
	);
	return schedule;
}
