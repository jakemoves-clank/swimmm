// Regenerates src/lib/geo/torontoContext.js — the discreet geography drawn
// under the place map, so a reader can find themselves on it.
//
//   npm install --no-save topojson-server topojson-simplify topojson-client adm-zip shapefile
//   node scripts/build-city-context.mjs
//
// Hand-run, not part of the build: rivers, expressways and subway lines change
// about as often as the municipal boundary does.
//
// A bare silhouette of Toronto is almost unusable as an input device — very
// few people can point at their own neighbourhood on one. What orients a
// reader is the stuff they navigate by, and in Toronto that is: the water
// (the lake edge and the two river valleys that cut the city north to south),
// the expressway/arterial grid, and the subway. Everything here is drawn
// unlabelled and in a lighter tone than the data — context should be
// recognisable at a glance and invisible on inspection.
//
// Simplified hard on purpose. This is a 320-px-wide locator, not a map: past
// a certain point extra vertices are ink that says nothing (Tufte's
// erase-non-data-ink, applied to the basemap rather than the chart).
import { writeFileSync } from 'node:fs';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import AdmZip from 'adm-zip';
import * as shapefile from 'shapefile';

const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const SEARCH = `${CKAN}/api/3/action/datastore_search`;
const PAGE = 500;
const OUT = 'src/lib/geo/torontoContext.js';

// Datastore resource ids (see the packages named in the header of each block).
const WATER = '9ab8df98-9cff-4a12-97df-70f7a7cf94bf'; // topographic-mapping-waterbodies-and-rivers
const CENTRELINE = 'ad296ebf-fca6-4e67-b3ce-48040a20e6cd'; // toronto-centreline-tcl

const COORD_DECIMALS = 3; // ~110 m — the map is 320 px across a 45 km city
// The lake is one ring of 71,000 surveyed points and is drawn as a flat wash,
// so it can be cut harder than anything else here without losing a thing a
// reader would name.
const RETAIN = { lake: 0.005, water: 0.005, streets: 0.08, subway: 0.35 };
// How many named through-routes to keep, longest first. A uniform mesh of
// every arterial is a grey haze — indistinguishable lines carrying no
// information. Two dozen long streets give the grid its structure, and the
// expressways (always kept) give it its landmarks.
const STREET_COUNT = 24;

const dispatcher = new EnvHttpProxyAgent();
const get = async (url) => {
	const res = await undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(300_000) });
	if (!res.ok) throw new Error(`GET ${url.slice(0, 90)} -> ${res.status}`);
	return res;
};
const getJson = async (url) => (await get(url)).json();

// The datastore hands geometry back as a string per row, Python-quoted
// ({'type': 'Polygon', …}). Only the geometry field comes through this way and
// it contains no free text, so swapping the quotes is safe here — it would not
// be for a column holding names.
function parseGeometry(raw) {
	try {
		return JSON.parse(String(raw).replace(/'/g, '"'));
	} catch {
		return null;
	}
}

// datastore_search_sql is disabled on this CKAN, so page through
// datastore_search instead. `filters` takes a field → list of allowed values.
async function queryRecords(resourceId, filters, fields = []) {
	const out = [];
	for (let offset = 0; ; offset += PAGE) {
		const q = new URLSearchParams({ resource_id: resourceId, limit: String(PAGE), offset: String(offset) });
		if (filters) q.set('filters', JSON.stringify(filters));
		const body = await getJson(`${SEARCH}?${q}`);
		if (!body.success) throw new Error(`datastore: ${JSON.stringify(body.error).slice(0, 200)}`);
		const records = body.result.records;
		for (const r of records) {
			const g = parseGeometry(r.geometry);
			if (g) out.push({ geometry: g, ...Object.fromEntries(fields.map((f) => [f, r[f]])) });
		}
		if (records.length < PAGE || offset + PAGE >= body.result.total) break;
	}
	return out;
}

const queryGeometries = async (id, filters) => (await queryRecords(id, filters)).map((r) => r.geometry);

// Every point of a geometry, flattened.
function pointsOf(geom) {
	const out = [];
	const visit = (c) => (typeof c[0] === 'number' ? out.push(c) : c.forEach(visit));
	visit(geom.coordinates);
	return out;
}

// The centreline splits a street into a segment per block — 7,000 stubs that
// simplify to nothing but their endpoints. Chain each street back into one
// polyline instead: collect its points, decide whether it runs mostly
// north-south or east-west, and sort along that axis. Streets bend, and a few
// share a name across town, so this is an approximation — but it is an
// approximation of a hairline drawn 200 px long, under the data, unlabelled.
function chainByName(records) {
	const byName = new Map();
	for (const r of records) {
		const name = r.LINEAR_NAME_FULL;
		if (!name) continue;
		if (!byName.has(name)) byName.set(name, []);
		byName.get(name).push(...pointsOf(r.geometry));
	}
	const lines = [];
	for (const [name, pts] of byName) {
		if (pts.length < 4) continue;
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		const spanX = (Math.max(...xs) - Math.min(...xs)) * LNG_SQUEEZE;
		const spanY = Math.max(...ys) - Math.min(...ys);
		const axis = spanX >= spanY ? 0 : 1;
		lines.push({ name, extent: Math.max(spanX, spanY), line: [...pts].sort((a, b) => a[axis] - b[axis]) });
	}
	return lines;
}

// A degree of longitude is ~0.72 of a degree of latitude at Toronto's
// latitude, so comparing raw spans would call every street east-west.
const LNG_SQUEEZE = Math.cos((43.72 * Math.PI) / 180);

// Visvalingam via topojson, the same treatment the municipal outline gets.
function simplifyGeometries(geometries, retain) {
	const fc = { type: 'FeatureCollection', features: geometries.map((g) => ({ type: 'Feature', geometry: g, properties: {} })) };
	const topo = presimplify(topology({ g: fc }, 1e5));
	return simplify(topo, quantile(topo, retain));
}

const round = (v) => Number(v.toFixed(COORD_DECIMALS));

// Every geometry flattened to plain polylines: one array of [lng, lat] pairs
// per stroke. Polygons become their rings — at this scale a river's bank and
// its centreline are the same two hairlines, and a fill would shout.
const { feature: topoFeature } = await import('topojson-client');

function linesFrom(topo, minPoints) {
	const fc = topoFeature(topo, topo.objects.g);
	const out = [];
	const push = (coords) => {
		const line = coords.map(([x, y]) => [round(x), round(y)]);
		// Drop anything that survived simplification as a stub.
		if (line.length >= minPoints) out.push(line);
	};
	const walk = (geom) => {
		if (!geom) return;
		if (geom.type === 'LineString') push(geom.coordinates);
		else if (geom.type === 'MultiLineString') geom.coordinates.forEach(push);
		else if (geom.type === 'Polygon') geom.coordinates.forEach(push);
		else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p) => p.forEach(push));
		else if (geom.type === 'GeometryCollection') geom.geometries.forEach(walk);
	};
	for (const f of fc.features) walk(f.geometry);
	return out;
}

// ── water ────────────────────────────────────────────────────────────────
// Rivers and waterbodies, minus the ponds: below a hectare or so a feature is
// a dot at this scale, and a hundred dots read as noise. What survives is the
// Humber, Don and Rouge valleys — the orienting set. The lake is pulled out of
// this layer and handled below, because it is an area and they are lines.
console.log('fetching water…');
// Below roughly a hectare a feature is a dot at this scale, and a hundred
// dots read as noise, so the small ponds are dropped by bounding-box extent.
const MIN_WATER_EXTENT = 8e-5; // square degrees ≈ 80 ha — the valleys, nothing smaller
const waterRecords = await queryRecords(WATER, null, ['WATERBODY_NAME']);
const water = waterRecords
	.filter((r) => r.WATERBODY_NAME !== 'Lake Ontario')
	.map((r) => r.geometry)
	.filter((g) => bboxArea(g) > MIN_WATER_EXTENT);
console.log(`  ${water.length} features`);

// ── the lake ─────────────────────────────────────────────────────────────
// Toronto's southern edge is not an edge, it is a coast, and a map that stops
// drawing at the city line says the opposite: the reader sees a boundary and
// has no way to know which side of it is water. So the lake is drawn as a
// filled area under the city — the one piece of geography on this map that
// everyone can already find.
//
// What the city publishes under "Lake Ontario" is not the lake, though: it is
// Toronto's *water lot*. The polygon follows the real shore and then closes
// itself with three jurisdictional runs in open water — south down 79°W (the
// Durham line), west along 43.5°N, and back up the Mississauga border. Two of
// those cut across the frame this map draws, and a straight line through open
// water reads as a shore that isn't there.
//
// So keep the surveyed shoreline and throw the water lot away. Everything on
// the shore satisfies both tests below (its southernmost point is the mouth of
// Etobicoke Creek at 43.5830, its easternmost the Pickering shore at 79.005°W)
// and every point of the three straight runs fails one of them, so the survivor
// is a single unbroken coast from Etobicoke to Pickering.
const SHORE_SOUTH = 43.583; // south of this is water lot, not coast
const SHORE_EAST = -79.005; // east of this is the Durham line
const lakeRing = (() => {
	const published = waterRecords.find((r) => r.WATERBODY_NAME === 'Lake Ontario');
	// The outer ring only. Its holes are the Toronto Islands and the spit's
	// lagoons, which the city outline already draws — as land, on top of this.
	// Two shapes for one piece of ground is how they end up disagreeing.
	const ring = published.geometry.coordinates[0];
	const shore = ring.filter(([lng, lat]) => lat >= SHORE_SOUTH && lng <= SHORE_EAST);

	// Then close it off the map rather than on it. The lake does not end where
	// Toronto's jurisdiction does, and neither does the coast: at both ends the
	// shore is continued along its own last bearing until it is past any frame
	// this map could draw, and the ring is closed far out in the water. An
	// extrapolated coast is a guess, but it is a guess about the two corners of
	// Mississauga and Ajax that the frame clips anyway — and it is the only way
	// the water reaches the corners of a rotated map without a hard edge.
	const RUN_DEG = 0.5; // ~55 km — past the frame at any plausible box shape
	const FAR_SOUTH = 43.3; // below the frame's deepest corner (~43.48)
	// The bearing is taken over the last 5 km of coast, not the last few
	// vertices: this survey carries a point every couple of metres, so a short
	// chord measures one bay wall rather than the way the shore is heading.
	const CHORD_DEG = 0.045;
	const flatDist = (a, b) => Math.hypot((a[0] - b[0]) * LNG_SQUEEZE, a[1] - b[1]);
	const outward = (end, step) => {
		const from = shore[end];
		let toward = from;
		for (let i = end; i >= 0 && i < shore.length; i += step) {
			toward = shore[i];
			if (flatDist(from, toward) >= CHORD_DEG) break;
		}
		const dx = (from[0] - toward[0]) * LNG_SQUEEZE;
		const dy = from[1] - toward[1];
		const len = Math.hypot(dx, dy) || 1;
		return [from[0] + ((dx / len) * RUN_DEG) / LNG_SQUEEZE, from[1] + (dy / len) * RUN_DEG];
	};
	const west = outward(0, 1);
	const east = outward(shore.length - 1, -1);
	return [west, ...shore, east, [east[0], FAR_SOUTH], [west[0], FAR_SOUTH]];
})();
console.log(`  lake: ${lakeRing.length} shoreline points before simplifying`);

function bboxArea(geom) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	const visit = (c) => {
		if (typeof c[0] === 'number') {
			minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
			minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
		} else c.forEach(visit);
	};
	visit(geom.coordinates);
	return (maxX - minX) * (maxY - minY);
}

// ── streets ──────────────────────────────────────────────────────────────
// Expressways and major arterials only. The full centreline is 64,000
// segments of every laneway in the city; what a reader steers by is Bloor,
// Yonge, the 401 and the Gardiner.
console.log('fetching arterials…');
const streetRecords = await queryRecords(
	CENTRELINE,
	{ FEATURE_CODE_DESC: ['Expressway', 'Major Arterial'] },
	['LINEAR_NAME_FULL', 'FEATURE_CODE_DESC']
);
const expressways = chainByName(streetRecords.filter((r) => r.FEATURE_CODE_DESC === 'Expressway'));
const arterials = chainByName(streetRecords.filter((r) => r.FEATURE_CODE_DESC !== 'Expressway'))
	.sort((a, b) => b.extent - a.extent)
	.slice(0, STREET_COUNT);
const streets = [...expressways, ...arterials].map((s) => ({ type: 'LineString', coordinates: s.line }));
console.log(`  ${streetRecords.length} segments → ${streets.length} through-routes`);
console.log(`  grid bearing ${gridBearing(streetRecords).toFixed(2)}° east of north`);

// Where GRID_NORTH_DEG in src/lib/dips/placemap.js comes from, printed here so
// the map's rotation can be checked against the city's own street data rather
// than taken on faith.
//
// Segment bearings, length-weighted, folded into a 90° period because a grid
// has no head or tail: a north-south street and an east-west one are the same
// grid. Averaged as a circular mean of 4θ (the standard trick for axial data —
// arithmetic means are meaningless on a wrapped quantity), then re-estimated
// within ±15° of the running estimate so the diagonals, the ravine roads and
// the expressway curves can't drag it.
//
// These records — expressway and major arterial — give 74.49°. Widening the
// same query to every centreline class (16,939 records, including the minor
// arterials and collectors that make up the residential grid) gives 73.86°,
// which is the number placemap.js uses: grid north is its perpendicular,
// 16.1° west of true north. Downtown alone is 17.3° (Bloor), the arterials
// north of Eglinton 15.5° — one grid to a rounding, three to a surveyor.
function gridBearing(records) {
	const segs = [];
	for (const r of records) {
		const lines =
			r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates;
		for (const line of lines) {
			for (let i = 1; i < line.length; i++) {
				const dx = (line[i][0] - line[i - 1][0]) * LNG_SQUEEZE;
				const dy = line[i][1] - line[i - 1][1];
				const len = Math.hypot(dx, dy);
				if (!len) continue;
				const th = (Math.atan2(dx, dy) * 180) / Math.PI;
				segs.push([((th % 90) + 90) % 90, len]);
			}
		}
	}
	let est = 45; // no prior: start halfway and let the trimming find the grid
	for (let pass = 0; pass < 12; pass++) {
		let sx = 0;
		let sy = 0;
		for (const [th, len] of segs) {
			// Nearest representative of θ to the current estimate, since 89° and
			// 1° are one degree apart on a 90° circle.
			let d = th - est;
			d = ((((d + 45) % 90) + 90) % 90) - 45;
			if (pass > 1 && Math.abs(d) > 15) continue;
			sx += len * Math.cos((4 * (est + d) * Math.PI) / 180);
			sy += len * Math.sin((4 * (est + d) * Math.PI) / 180);
		}
		est = ((((Math.atan2(sy, sx) * 180) / Math.PI / 4) % 90) + 90) % 90;
	}
	return est;
}

// ── subway ───────────────────────────────────────────────────────────────
// Published as a shapefile only, so unzip it in memory and read the polylines
// out. One distinctive shape — the Yonge–University horseshoe crossed by
// Bloor–Danforth — that locates a reader faster than any street can.
console.log('fetching subway…');
const subwayPkg = await getJson(`${CKAN}/api/3/action/package_show?id=ttc-subway-shapefiles`);
const zipUrl = subwayPkg.result.resources.find((r) => r.format === 'SHP').url;
const zip = new AdmZip(Buffer.from(await (await get(zipUrl)).arrayBuffer()));
const shpEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.shp'));
const subwayFc = await shapefile.read(shpEntry.getData());
const subway = subwayFc.features.map((f) => f.geometry).filter(Boolean);
console.log(`  ${subway.length} lines`);

// ── emit ─────────────────────────────────────────────────────────────────
// The lake first, because it is drawn first: a wash under everything, with the
// city sitting on it.
const layers = {
	lake: linesFrom(simplifyGeometries([{ type: 'Polygon', coordinates: [lakeRing] }], RETAIN.lake), 4),
	water: linesFrom(simplifyGeometries(water, RETAIN.water), 4),
	streets: linesFrom(simplifyGeometries(streets, RETAIN.streets), 2),
	subway: linesFrom(simplifyGeometries(subway, RETAIN.subway), 2)
};

const counts = Object.fromEntries(
	Object.entries(layers).map(([k, v]) => [k, v.flat().length])
);
const total = Object.values(counts).reduce((a, b) => a + b, 0);

writeFileSync(
	OUT,
	`// GENERATED by scripts/build-city-context.mjs — do not edit by hand.
// City of Toronto Open Data: topographic-mapping-waterbodies-and-rivers,
// toronto-centreline-tcl (expressways and major arterials only), and
// ttc-subway-shapefiles. Simplified to ${total} points
// (lake ${counts.lake}, water ${counts.water}, streets ${counts.streets}, subway ${counts.subway}).
//
// \`lake\` is a closed ring meant to be filled; the rest are open polylines.
//
// Drawn unlabelled and under the data on the place map: enough geography to
// find yourself by, not a map to read.
export const TORONTO_CONTEXT = ${JSON.stringify(layers)};
`
);
console.log(`wrote ${OUT} — ${total} points`);
