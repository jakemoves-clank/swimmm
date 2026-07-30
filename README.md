# Swimmm

One-screen mobile site answering: **which City of Toronto pools have adult lane
swim today, and which are closest to me and soonest?**

Proof of concept. SvelteKit (Svelte 5) + SQLite (better-sqlite3), no accounts,
no map, grayscale UI with one accent color.

## Data — official City of Toronto only

| What | Dataset | City refresh cadence |
| --- | --- | --- |
| Drop-in schedules + pool names/addresses | [Registered Programs and Drop In Courses Offering](https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/) | Weekly |
| Pool coordinates | [Parks and Recreation Facilities](https://open.toronto.ca/dataset/parks-and-recreation-facilities/) | Monthly |

The server polls only the lightweight CKAN `package_show` metadata, at most
about once a day, and downloads the actual data files **only when the city's
`last_refreshed` stamp changes** — so downloads happen roughly weekly, matching
the city's own schedule. Data lands in a local SQLite DB (`data/swimmm.db`).

Coordinates are joined by the shared Location ID, with a street-address
fallback; one pool currently has no match in the city's geo data and is shown
without a distance.

"Adult lane swim" = drop-in swim rows whose title starts with "Lane Swim",
excluding family sessions and anything with an age cap below 18.

## Travel times (optional)

With a Mapbox public token set (`PUBLIC_MAPBOX_TOKEN`), the page fetches
walking and cycling times from the [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/)
and only shows swims you can actually get to: within
`DEFAULT_MAX_TRAVEL_MIN` (60) minutes by the faster mode, arriving with at
least `DEFAULT_MIN_SWIM_MIN` (30) minutes left to swim. Both knobs live in
`src/lib/config.js` — the single place a future settings UI should read and
write — and can be overridden per-visit with `?max=45&swim=20`.

The browser calls Mapbox directly, so the user's location is shared with
Mapbox (necessary to compute travel times) but still never reaches the Swimmm
server. Without a token, or if Mapbox is unreachable, the page falls back to
straight-line distances and hides nothing.

## Privacy

The browser asks for your location and uses it **only in the page** to compute
distances. It is never sent to the server, never logged, never stored.
`/api/today` takes no input at all. There is no other user data.

## Develop

```sh
npm install
npm run dev        # boots server; fetches city data on first run
npm test           # backend unit tests (vitest)
npm run test:e2e   # Playwright happy path (seeded DB, no city traffic)
npm run build && npm run preview   # production-ish
```

Environment variables:

- `DB_PATH` — SQLite file (default `data/swimmm.db`)
- `PUBLIC_MAPBOX_TOKEN` — Mapbox public (pk.) token enabling travel-time
  filtering; omit to run without it
- `SKIP_REFRESH=1` — never contact the city (used by e2e tests)
- `PW_CHROMIUM_PATH` — use a preinstalled Chromium for Playwright instead of a
  downloaded one (e.g. `/opt/pw-browsers/chromium` in CI sandboxes)

Outbound fetches honour `HTTPS_PROXY`/`NO_PROXY` (via undici's
`EnvHttpProxyAgent`), which matters in sandboxed/CI environments; with no proxy
configured it behaves like plain `fetch`.
