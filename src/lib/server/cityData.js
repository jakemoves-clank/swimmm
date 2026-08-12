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
import { buildSchedule, trimSchedule } from './transform.js';
import { torontoNow } from '../time.js';

const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
export const URLS = {
	programsMeta: `${CKAN}/api/3/action/package_show?id=registered-programs-and-drop-in-courses-offering`,
	facilitiesMeta: `${CKAN}/api/3/action/package_show?id=parks-and-recreation-facilities`,
	dropin: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/drop-in.json`,
	locations: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/87f95a5a-184f-4df5-ad37-84bcc1ea99a9/download/locations.json`,
	geojson: `${CKAN}/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson`
};

const CACHE_MAX_AGE_MS = 20 * 3600_000;
const FETCH_TIMEOUT_MS = 120_000;
// The largest city file is ~13 MB. A runaway upstream shouldn't be able to
// exhaust the build's memory, so the cap is enforced while streaming rather
// than trusting content-length, which can be absent or wrong.
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

const dispatcher = new EnvHttpProxyAgent();
const defaultFetch = (url) =>
	undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

export async function readJsonCapped(res, url, maxBytes = MAX_RESPONSE_BYTES) {
	const chunks = [];
	let total = 0;
	for await (const chunk of res.body) {
		total += chunk.length;
		if (total > maxBytes) throw new Error(`GET ${url} -> response exceeds ${maxBytes} byte cap`);
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function getJson(fetchImpl, url) {
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
	return readJsonCapped(res, url);
}

// Fetches the five CKAN payloads a schedule is built from, or reuses them
// from disk if they're under CACHE_MAX_AGE_MS old.
//
// The cache holds these *raw* responses, not buildSchedule's output. It used
// to hold the transformed schedule, which meant a cache hit returned exactly
// what a previous run's transform.js had produced and skipped calling it
// again — so editing transform.js had no effect on a local build until the
// 20 h cache happened to expire, and the build succeeded while quietly
// serving stale output. Caching the inputs instead means buildSchedule runs
// on every call, cache hit or not, so its output always matches the code
// that's actually on disk.
async function loadRaw(cacheDir, fetchImpl) {
	const cacheFile = join(cacheDir, 'raw.json');
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
	const raw = { programsMeta, facilitiesMeta, dropin, locations, geojson };

	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(cacheFile, JSON.stringify(raw));
	// One-line stamp the deploy workflow publishes and compares against CKAN
	// to decide whether a scheduled rebuild is needed at all.
	writeFileSync(
		join(cacheDir, 'stamp.txt'),
		`${String(programsMeta.result.last_refreshed)}|${String(facilitiesMeta.result.last_refreshed)}\n`
	);
	return raw;
}

export async function loadSchedule({
	// A shared, absolute cacheDir lets several builds in the same deploy run
	// (the root build plus each PR preview — see deploy.yml) reuse one
	// on-disk fetch of the city's raw data while each still runs its own
	// transform.js/buildSchedule over it.
	cacheDir = process.env.SWIMMM_CACHE_DIR || '.city-cache',
	fetchImpl = defaultFetch
} = {}) {
	if (process.env.SWIMMM_DATA_FILE) {
		return JSON.parse(readFileSync(process.env.SWIMMM_DATA_FILE, 'utf8'));
	}

	const { programsMeta, facilitiesMeta, dropin, locations, geojson } = await loadRaw(
		cacheDir,
		fetchImpl
	);

	// Trimmed to the window the page can actually use — see trimSchedule. The
	// city's six weeks are its business; what ships in the HTML is ours.
	return {
		programs_last_refreshed: String(programsMeta.result.last_refreshed),
		facilities_last_refreshed: String(facilitiesMeta.result.last_refreshed),
		generated_at: new Date().toISOString(),
		...trimSchedule(buildSchedule(dropin, locations, geojson), { today: torontoNow().date })
	};
}
