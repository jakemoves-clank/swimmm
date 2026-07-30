import { loadSchedule } from '$lib/server/cityData.js';

// Runs once, at build time (the whole site is prerendered): the city's
// schedule is baked into the page, and the public Mapbox token — if the
// build has one — rides along with it.
export async function load() {
	return {
		schedule: await loadSchedule(),
		mapboxToken: process.env.PUBLIC_MAPBOX_TOKEN || null
	};
}
