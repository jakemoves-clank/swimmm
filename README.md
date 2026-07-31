# Swimmm

One-screen mobile site answering: **which City of Toronto pools have adult lane
swim today, and which are closest to me and soonest?**

Proof of concept. SvelteKit (Svelte 5), fully static — city data is fetched at
build time and baked into the prerendered page (~30 KB gzipped). No accounts,
no map, no runtime backend; grayscale UI with one accent color.

## Data — official City of Toronto only

| What | Dataset | City refresh cadence |
| --- | --- | --- |
| Drop-in schedules + pool names/addresses | [Registered Programs and Drop In Courses Offering](https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/) | Weekly |
| Pool coordinates | [Parks and Recreation Facilities](https://open.toronto.ca/dataset/parks-and-recreation-facilities/) | Monthly |

The site is rebuilt **only when the city's `last_refreshed` stamp changes**:
a daily scheduled workflow compares the CKAN stamp against the deployed
`stamp.txt` and skips the rebuild otherwise (see `.github/workflows/deploy.yml`
and `DEPLOYMENT.md`). Local builds cache city downloads for ~20 h in
`.city-cache/`; tests never contact the city (`SWIMMM_DATA_FILE`).

Coordinates are joined by the shared Location ID, with a street-address
fallback; one pool currently has no match in the city's geo data and is shown
without a distance.

Swimmm lists two kinds of drop-in swim, switchable with the Lane/Leisure
toggle (`?kind=leisure` deep-links to it). Both are baked into the same
payload, so switching is a client-side filter and costs no request.

The city publishes no "kind" column, so `swimKind` in
`src/lib/server/transform.js` reads the section plus the course title: lane
titles are consistently prefixed ("Lane Swim: Long Course (50m)"), while
leisure is prefixed too except for "Adapted Leisure Swim", which qualifies the
noun instead.

"Adult" = no upper age bound, excluding family sessions. Every session the
city leaves open to adults has no `Age Max`; the ones that set it are
age-bracketed programs ("Leisure Swim: Preschool" at 5, "Leisure Swim: Youth"
at 13–23) that an adult can't drop into.

## Travel times (optional)

With a Mapbox public token set (`PUBLIC_MAPBOX_TOKEN`), the page fetches
walking and cycling times from the [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/)
and only shows swims you can actually get to: within
`DEFAULT_MAX_TRAVEL_MIN` (60) minutes by the faster mode, arriving with at
least `DEFAULT_MIN_SWIM_MIN` (30) minutes left to swim. Both knobs live in
`src/lib/config.js` — the single place a future settings UI should read and
write — and can be overridden per-visit with `?max=45&swim=20`.

The browser calls Mapbox directly, so the user's location is shared with
Mapbox (necessary to compute travel times) — there is no Swimmm server for it
to reach. Without a token, or if Mapbox is unreachable, the page falls back
to straight-line distances and hides nothing.

A **top pick** is surfaced above the list via the tier cascade in
`config.js` `TOP_RESULT`: a swim starting within 2 hours that's ≤ 15 min on
foot, else ≤ 20 min by bike, else ≤ 30 min by transit with at most one
connection. Transit times come from [Transitous](https://transitous.org)
(`TRANSIT_PROVIDER` in `config.js`) — a free, community-run MOTIS routing
API over transit agencies' official GTFS feeds (the TTC's, for Toronto).
It's only queried when walking and biking both fail, capped at the
`LOOKUP_LIMIT` (8) nearest pools, and called from the browser so location
stays between the browser and the routing providers. When every tier comes
up empty, the page shows a desert.

## Privacy

The browser asks for your location and uses it **only in the page**, snapped
to a ~50 m grid before any routing provider sees it. There is no Swimmm
server to send it to — the site is static files. There is no other user data.

## Develop

```sh
npm install
npm run dev        # fetches city data once (~20 h cache in .city-cache/)
npm test           # unit tests (vitest)
npm run test:e2e   # Playwright e2e (fixture data, no city traffic)
npm run build && npm run preview   # the real static build
```

Environment variables (build-time):

- `PUBLIC_MAPBOX_TOKEN` — Mapbox public (pk.) token enabling travel-time
  filtering; omit to build without it
- `SWIMMM_DATA_FILE` — load the schedule from a local JSON file instead of
  the city (used by e2e tests)
- `BASE_PATH` — subpath the site is served under (the deploy workflow sets
  `/<repo>` for GitHub Pages; assets are relative so builds work anywhere)
- `PW_CHROMIUM_PATH` — use a preinstalled Chromium for Playwright instead of a
  downloaded one (e.g. `/opt/pw-browsers/chromium` in CI sandboxes)

Outbound fetches honour `HTTPS_PROXY`/`NO_PROXY` (via undici's
`EnvHttpProxyAgent`), which matters in sandboxed/CI environments; with no proxy
configured it behaves like plain `fetch`.

E2e sessions are seeded around a fixed midday Toronto anchor and the tests pin
the browser clock to it (`tests/e2e/fixture-time.js`), so the suite gives the
same result whatever time it runs at.

## CI

`.github/workflows/tests.yml` runs the unit and e2e suites, **on demand only**
— nothing runs on push, or when a pull request is opened or updated. Start it
either way:

- add the `run-tests` label to a pull request (remove and re-add to re-run);
  the result attaches to the PR's checks
- run it from the Actions tab against any branch

The `run-tests` label has to exist in the repo before it can be applied; GitHub
lets you create it inline the first time you add it.
