import { loadSchedule } from '$lib/server/cityData.js';

// Same build-time payload as the main page — the concepts are eleven readings
// of one dataset, not eleven fetches. `loadSchedule` is disk-cached, so
// prerendering both routes costs the city one download, not two.
export async function load() {
	return {
		schedule: await loadSchedule(),
		mapboxToken: process.env.PUBLIC_MAPBOX_TOKEN || null
	};
}
