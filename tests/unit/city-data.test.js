import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// buildSchedule is mocked so these tests exercise loadSchedule's caching
// behaviour in isolation from transform.js's actual logic (that's
// transform.test.js's job) — and so a test can swap what it returns between
// two loadSchedule() calls to stand in for "transform.js changed on disk".
// trimSchedule is a pure window over the result (tested in schedule.test.js);
// here it passes through so these tests stay about caching and fetching.
vi.mock('../../src/lib/server/transform.js', () => ({
	buildSchedule: vi.fn(),
	trimSchedule: (schedule) => schedule
}));

import { readJsonCapped, loadSchedule, URLS } from '../../src/lib/server/cityData.js';
import { buildSchedule } from '../../src/lib/server/transform.js';

function response(...buffers) {
	return {
		body: new ReadableStream({
			start(controller) {
				for (const b of buffers) controller.enqueue(b);
				controller.close();
			}
		})
	};
}

const bytes = (s) => new TextEncoder().encode(s);

describe('readJsonCapped', () => {
	it('parses a body that fits under the cap', async () => {
		const out = await readJsonCapped(response(bytes('{"a":'), bytes('1}')), 'url', 1000);
		expect(out).toEqual({ a: 1 });
	});

	it('stops as soon as the stream exceeds the cap', async () => {
		const kb = new Uint8Array(1024);
		await expect(readJsonCapped(response(kb, kb, kb), 'url', 2048)).rejects.toThrow(/byte cap/);
	});
});

// CKAN payloads keyed the same as cityData's URLS, so a fetchImpl can route
// on the requested URL rather than assume call order.
function ckanPayloads({ programs = '2024-01-01', facilities = '2024-01-02' } = {}) {
	return {
		programsMeta: { result: { last_refreshed: programs } },
		facilitiesMeta: { result: { last_refreshed: facilities } },
		dropin: [{ row: 'dropin' }],
		locations: [{ row: 'locations' }],
		geojson: { features: [] }
	};
}

function fetchFor(payloads) {
	const urlToKey = Object.fromEntries(Object.entries(URLS).map(([k, v]) => [v, k]));
	return vi.fn(async (url) => {
		const key = urlToKey[url];
		if (!key) throw new Error(`unexpected fetch: ${url}`);
		return { ok: true, ...response(bytes(JSON.stringify(payloads[key]))) };
	});
}

describe('loadSchedule', () => {
	let cacheDir;

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), 'swimmm-city-cache-'));
		buildSchedule.mockReset();
		buildSchedule.mockReturnValue({ locations: [], sessions: [] });
	});

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true });
	});

	it('bypasses the network and cache entirely when SWIMMM_DATA_FILE is set', async () => {
		const dataFile = join(cacheDir, 'fixture.json');
		const fixture = { programs_last_refreshed: 'x', facilities_last_refreshed: 'y', sessions: [] };
		writeFileSync(dataFile, JSON.stringify(fixture));
		process.env.SWIMMM_DATA_FILE = dataFile;
		try {
			const fetchImpl = vi.fn();
			const out = await loadSchedule({ cacheDir, fetchImpl });
			expect(out).toEqual(fixture);
			expect(fetchImpl).not.toHaveBeenCalled();
		} finally {
			delete process.env.SWIMMM_DATA_FILE;
		}
	});

	it('fetches each of the five CKAN URLs once and writes the raw payloads to disk', async () => {
		const fetchImpl = fetchFor(ckanPayloads());
		const out = await loadSchedule({ cacheDir, fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(5);
		expect(out.programs_last_refreshed).toBe('2024-01-01');
		expect(out.facilities_last_refreshed).toBe('2024-01-02');
		expect(buildSchedule).toHaveBeenCalledWith([{ row: 'dropin' }], [{ row: 'locations' }], {
			features: []
		});
	});

	it('writes stamp.txt as `programs|facilities` on a fresh fetch', async () => {
		const fetchImpl = fetchFor(ckanPayloads({ programs: 'P', facilities: 'F' }));
		await loadSchedule({ cacheDir, fetchImpl });

		const { readFileSync } = await import('node:fs');
		expect(readFileSync(join(cacheDir, 'stamp.txt'), 'utf8')).toBe('P|F\n');
	});

	it('reuses the cached raw payloads on a second call instead of refetching', async () => {
		const fetchImpl = fetchFor(ckanPayloads());
		await loadSchedule({ cacheDir, fetchImpl });
		await loadSchedule({ cacheDir, fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(5);
	});

	// The bug this fix closes: the old cache stored buildSchedule's *output*,
	// so a cache hit returned a previous run's transform result even after
	// transform.js changed on disk. Caching the raw inputs means a cache hit
	// still calls today's buildSchedule — so a code change takes effect on
	// the very next build, cached fetch or not.
	it('reruns buildSchedule on a cache hit, so a transform.js change takes effect immediately', async () => {
		const fetchImpl = fetchFor(ckanPayloads());

		buildSchedule.mockReturnValueOnce({ locations: [], sessions: ['old-transform'] });
		const first = await loadSchedule({ cacheDir, fetchImpl });
		expect(first.sessions).toEqual(['old-transform']);

		// Cache hit this time — no new network calls — but buildSchedule's
		// current behaviour (simulating an edited transform.js) still applies.
		buildSchedule.mockReturnValueOnce({ locations: [], sessions: ['new-transform'] });
		const second = await loadSchedule({ cacheDir, fetchImpl });
		expect(second.sessions).toEqual(['new-transform']);

		expect(fetchImpl).toHaveBeenCalledTimes(5); // still one download total
	});

	it('refetches once the cache exceeds CACHE_MAX_AGE_MS', async () => {
		const fetchImpl = fetchFor(ckanPayloads());
		await loadSchedule({ cacheDir, fetchImpl });
		expect(fetchImpl).toHaveBeenCalledTimes(5);

		const stale = new Date(Date.now() - 21 * 3600_000);
		utimesSync(join(cacheDir, 'raw.json'), stale, stale);

		await loadSchedule({ cacheDir, fetchImpl });
		expect(fetchImpl).toHaveBeenCalledTimes(10);
	});

	it('defaults cacheDir to SWIMMM_CACHE_DIR when set, so builds sharing that env var share a cache', async () => {
		const shared = join(cacheDir, 'shared');
		process.env.SWIMMM_CACHE_DIR = shared;
		try {
			const fetchImpl = fetchFor(ckanPayloads());
			await loadSchedule({ fetchImpl });

			const { existsSync } = await import('node:fs');
			expect(existsSync(join(shared, 'raw.json'))).toBe(true);
		} finally {
			delete process.env.SWIMMM_CACHE_DIR;
		}
	});
});
