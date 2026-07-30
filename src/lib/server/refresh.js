import { getMeta, setMeta, replaceData } from './db.js';
import { isAdultLaneSwim, toSession, buildLocations } from './transform.js';

const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';

// The city refreshes "Registered Programs and Drop In Courses Offering" weekly
// and "Parks and Recreation Facilities" monthly. We poll only the lightweight
// package_show metadata — at most once per CHECK_INTERVAL — and download the
// actual files only when the city's last_refreshed stamp changes.
const CHECK_INTERVAL_MS = 20 * 3600_000;

const PROGRAMS_PKG = 'registered-programs-and-drop-in-courses-offering';
const FACILITIES_PKG = 'parks-and-recreation-facilities';

const URLS = {
	programsMeta: `${CKAN}/api/3/action/package_show?id=${PROGRAMS_PKG}`,
	facilitiesMeta: `${CKAN}/api/3/action/package_show?id=${FACILITIES_PKG}`,
	dropin: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/drop-in.json`,
	locations: `${CKAN}/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/87f95a5a-184f-4df5-ad37-84bcc1ea99a9/download/locations.json`,
	geojson: `${CKAN}/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson`
};

// The biggest city file is ~13 MB; a hung or absurdly large response should
// fail the refresh (and be retried next tick) rather than stall it forever.
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

async function getJson(fetchImpl, url) {
	const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
	// Cheap early-out only: a response without a trustworthy content-length
	// isn't checked here. The abort timeout above is the real backstop.
	const length = Number(res.headers?.get?.('content-length'));
	if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
		throw new Error(`GET ${url} -> ${length} bytes exceeds cap`);
	}
	return res.json();
}

export async function maybeRefresh(db, { fetchImpl = fetch, now = Date.now } = {}) {
	const lastCheck = Number(getMeta(db, 'last_metadata_check') || 0);
	const hasData = getMeta(db, 'programs_last_refreshed') !== undefined;
	if (hasData && now() - lastCheck < CHECK_INTERVAL_MS) return { checked: false, downloaded: false };

	const [programsMeta, facilitiesMeta] = await Promise.all([
		getJson(fetchImpl, URLS.programsMeta),
		getJson(fetchImpl, URLS.facilitiesMeta)
	]);
	// Only update last_metadata_check once we know the refresh attempt completed (or data is unchanged),
	// so transient download/DB failures don't delay retries for CHECK_INTERVAL_MS.
	const programsStamp = String(programsMeta.result.last_refreshed);
	const facilitiesStamp = String(facilitiesMeta.result.last_refreshed);
	const unchanged =
		getMeta(db, 'programs_last_refreshed') === programsStamp &&
		getMeta(db, 'facilities_last_refreshed') === facilitiesStamp;
	if (unchanged) {
		setMeta(db, 'last_metadata_check', String(now()));
		return { checked: true, downloaded: false };
	}

	const [dropinRows, locationRows, geojson] = await Promise.all([
		getJson(fetchImpl, URLS.dropin),
		getJson(fetchImpl, URLS.locations),
		getJson(fetchImpl, URLS.geojson)
	]);

	const sessions = dropinRows.filter(isAdultLaneSwim).map(toSession);
	const locations = buildLocations(locationRows, geojson);
	replaceData(db, { locations, sessions });
	setMeta(db, 'programs_last_refreshed', programsStamp);
	setMeta(db, 'facilities_last_refreshed', facilitiesStamp);
	setMeta(db, 'data_loaded_at', new Date(now()).toISOString());
	setMeta(db, 'last_metadata_check', String(now()));
	return { checked: true, downloaded: true, sessions: sessions.length };
}
