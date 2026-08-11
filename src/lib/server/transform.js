// Pure transforms over the City of Toronto open data shapes.
// Drop-in rows come from Drop-in.json; locations from Locations.json;
// geojson from the Parks and Recreation Facilities dataset (EPSG:4326).

function ageOrNull(v) {
	if (v === null || v === undefined || v === 'None' || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

const MIN_GENERAL_ADULT_AGE = 18;

// A session an adult of any age can simply turn up to. That needs both
// bounds, and for a while this only checked one.
//
// No Age Max means nobody is too old: the rows that set it are age-bracketed
// programmes ("Leisure Swim: Preschool" at 5, "Leisure Swim: Youth" 13–23) an
// adult can't drop into. But an absent cap says nothing about the *floor*,
// and "Lane Swim: Older Adult" sets Age Min 60 with no Max — so it sailed
// through, and the site offered a 60+ swim to everyone. A door you'd be
// turned away at is a worse promise than no offer at all.
//
// Measured against the live feed: of the swim rows with no Age Max, Age Min
// is only ever 0, 7, 13, 17, 18 or 60. The gap between 18 and 60 is why this
// threshold is safe — it drops exactly the 401 "Older Adult" rows and nothing
// else. If the city ever publishes a 19+ adult swim, this rule would wrongly
// drop that too, and would want revisiting rather than nudging.
//
// Family swims are excluded by name: a different session type, not an adult one.
function isAdultSession(row, title) {
	if (/family/i.test(title)) return false;
	const ageMax = ageOrNull(row['Age Max']);
	const ageMin = ageOrNull(row['Age Min']);
	return ageMax === null && (ageMin === null || ageMin <= MIN_GENERAL_ADULT_AGE);
}

// Which kind of swim a drop-in row is, or null if it isn't one we list.
//
// There is no "kind" column — the section plus the course title is all the
// city gives us. Lane titles are consistently prefixed ("Lane Swim: Long
// Course (50m)", "Lane Swim (Women)"), so an anchored test is right for them
// and keeps "Youth Lifeguard Club" and "Aquatic Fitness: *" out. Leisure is
// prefixed too, except for "Adapted Leisure Swim", which qualifies the noun
// instead — hence the unanchored test on that side.
export function swimKind(row) {
	if (row.Section !== 'Swim - Drop-In') return null;
	const title = String(row['Course Title'] || '');
	if (!isAdultSession(row, title)) return null;
	if (/^Lane Swim/.test(title)) return 'lane';
	if (/Leisure Swim/.test(title)) return 'leisure';
	return null;
}

export function toSession(row, kind = swimKind(row)) {
	return {
		location_id: row['Location ID'],
		course_id: row.Course_ID,
		kind,
		title: row['Course Title'],
		date: row['First Date'],
		start_min: row['Start Hour'] * 60 + (row['Start Minute'] || 0),
		end_min: row['End Hour'] * 60 + (row['End Min'] || 0)
	};
}

function part(v) {
	return v && v !== 'None' ? String(v).trim() : '';
}

function formatAddress(loc) {
	return [
		part(loc['Street No']) + part(loc['Street No Suffix']),
		part(loc['Street Name']),
		part(loc['Street Type']),
		part(loc['Street Direction'])
	]
		.filter(Boolean)
		.join(' ');
}

// Key used for the address-fallback join: street number + first word of street name.
function addressKey(address) {
	const words = address.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
	return words.length >= 2 ? words[0] + ' ' + words[1] : null;
}

function firstPoint(geometry) {
	if (!geometry) return null;
	if (geometry.type === 'Point') return geometry.coordinates;
	if (geometry.type === 'MultiPoint') return geometry.coordinates[0];
	return null;
}

// The whole publishable dataset in one shot: adult lane and leisure swim
// sessions plus the locations they reference. This is what gets baked into
// the static site. Both kinds ship together — the toggle is a client-side
// filter over one payload, so switching tabs costs no round trip.
export function buildSchedule(dropinRows, locationRows, geojson) {
	const sessions = [];
	for (const row of dropinRows) {
		const kind = swimKind(row);
		if (kind) sessions.push(toSession(row, kind));
	}
	const used = new Set(sessions.map((s) => s.location_id));
	const locations = buildLocations(locationRows, geojson).filter((l) => used.has(l.id));
	return { locations, sessions };
}

export function buildLocations(locationsJson, geojson) {
	const byId = new Map();
	const byAddress = new Map();
	for (const f of geojson.features || []) {
		const p = f.properties || {};
		const coords = firstPoint(f.geometry);
		if (!coords) continue;
		// Coordinates end up interpolated into routing-API URLs client-side,
		// so never store anything that isn't a plain finite number.
		if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
		const entry = { lng: coords[0], lat: coords[1] };
		if (p.LOCATIONID) byId.set(String(p.LOCATIONID), entry);
		const key = p.ADDRESS ? addressKey(p.ADDRESS) : null;
		if (key && !byAddress.has(key)) byAddress.set(key, entry);
	}
	// The city's own row for each location, so a pool can look up the complex
	// it belongs to when it has no geo entry of its own.
	const rowsById = new Map(locationsJson.map((loc) => [String(loc['Location ID']), loc]));

	// A pool's own point, by shared ID and then by street address.
	function ownPoint(loc) {
		const key = addressKey(formatAddress(loc));
		return byId.get(String(loc['Location ID'])) || (key && byAddress.get(key)) || null;
	}

	return locationsJson.map((loc) => {
		const id = loc['Location ID'];
		const address = formatAddress(loc);
		let geo = ownPoint(loc);
		let approx = false;

		// Last resort: the parent facility. Two pools in the live data —
		// Kidstown Water Park and Donald D. Summerville Olympic Pools — are in
		// the city's location list but absent from its facilities geo data
		// under any name or address, while the complex each sits inside is
		// mapped. Borrowing the parent's point puts them within a few hundred
		// metres of the truth, which is worth far more to a reader than being
		// left off the map entirely — as long as everything downstream knows
		// the point is approximate, hence the flag.
		const parentId = loc['Parent Location ID'];
		if (!geo && parentId != null && String(parentId) !== String(id)) {
			const parent = rowsById.get(String(parentId));
			const parentGeo =
				byId.get(String(parentId)) || (parent ? ownPoint(parent) : null) || null;
			if (parentGeo) {
				geo = parentGeo;
				approx = true;
			}
		}

		return {
			id,
			name: part(loc['Location Name']),
			address,
			lat: geo ? geo.lat : null,
			lng: geo ? geo.lng : null,
			// True when the point is the parent complex's rather than the
			// pool's own. Never true for an unplaced pool: there is no point
			// to be approximate about.
			approx
		};
	});
}
