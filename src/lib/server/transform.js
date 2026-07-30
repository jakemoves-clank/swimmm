// Pure transforms over the City of Toronto open data shapes.
// Drop-in rows come from Drop-in.json; locations from Locations.json;
// geojson from the Parks and Recreation Facilities dataset (EPSG:4326).

function ageOrNull(v) {
	if (v === null || v === undefined || v === 'None' || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

export function isAdultLaneSwim(row) {
	if (row.Section !== 'Swim - Drop-In') return false;
	const title = String(row['Course Title'] || '');
	if (!title.startsWith('Lane Swim')) return false;
	if (/family/i.test(title)) return false;
	const ageMax = ageOrNull(row['Age Max']);
	if (ageMax !== null && ageMax < 18) return false;
	return true;
}

export function toSession(row) {
	return {
		location_id: row['Location ID'],
		course_id: row.Course_ID,
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

export function buildLocations(locationsJson, geojson) {
	const byId = new Map();
	const byAddress = new Map();
	for (const f of geojson.features || []) {
		const p = f.properties || {};
		const coords = firstPoint(f.geometry);
		if (!coords) continue;
		const entry = { lng: coords[0], lat: coords[1] };
		if (p.LOCATIONID) byId.set(String(p.LOCATIONID), entry);
		const key = p.ADDRESS ? addressKey(p.ADDRESS) : null;
		if (key && !byAddress.has(key)) byAddress.set(key, entry);
	}
	return locationsJson.map((loc) => {
		const id = loc['Location ID'];
		const address = formatAddress(loc);
		const geo = byId.get(String(id)) || (addressKey(address) && byAddress.get(addressKey(address))) || null;
		return {
			id,
			name: part(loc['Location Name']),
			address,
			lat: geo ? geo.lat : null,
			lng: geo ? geo.lng : null
		};
	});
}
