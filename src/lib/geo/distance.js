// Great-circle distance in kilometres between two {lat, lng} points.
export function haversineKm(a, b) {
	const R = 6371;
	const toRad = (d) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass bearing from `a` to `b`, in degrees clockwise from north. Used by
// the concepts that place a pool by its true direction but at a radius of
// travel minutes rather than kilometres.
export function bearingDeg(a, b) {
	const toRad = (d) => (d * Math.PI) / 180;
	const φ1 = toRad(a.lat);
	const φ2 = toRad(b.lat);
	const Δλ = toRad(b.lng - a.lng);
	const y = Math.sin(Δλ) * Math.cos(φ2);
	const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
	return (Math.atan2(y, x) * 180) / Math.PI;
}
