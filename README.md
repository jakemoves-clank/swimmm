# Swimmm

One-screen mobile site answering: **which City of Toronto pools have adult lane
swim today, and which are closest to me and soonest?**

Proof of concept. SvelteKit (Svelte 5), fully static — city data is fetched at
build time and baked into the prerendered page (~30 KB gzipped). No accounts,
no map, no runtime backend; grayscale UI with one accent color.

## Routes

| Route | What |
| --- | --- |
| `/` | the live site — where development happens |
| `/v1` | archived snapshot: the main page as it stood |
| `/v2` | archived snapshot: the design studies gallery (previously `/concepts`) |
| `/concepts` | signpost to `/v2`, carrying the query string with it |

Keeping `/concepts` alive is the same commitment the `/vN` scheme makes: an
address that was published once keeps resolving. It redirects in the browser
because GitHub Pages serves static files and can't issue a 301 (`static/_redirects`
does it properly on Cloudflare), and it forwards `?c=`, `?at=` and `?kind=`
rather than dumping deep links on the gallery's front page.

The `/vN` routes are **archives, not branches**. Nothing new is built on them,
and each is *sealed*: it owns its implementation under `src/routes/vN/lib/`
rather than importing `$lib`. The duplication is the point — the moment `/v1`
renders something `/` also renders, a change to `/` rewrites what the snapshot
shows, which is the one thing an archive must not do.

```
src/routes/
  +page.svelte          the live site        →  $lib/*
  v1/+page.svelte       archived snapshot    →  v1/lib/*
  v2/+page.svelte       archived snapshot    →  v2/lib/*  (incl. the concepts)
```

**The one shared seam** is `$lib/server/`, the build-time data pipeline.
`+page.server.js` runs at prerender, so a frozen copy of the loader would fail
the *whole* build — `/` included — the day the city changes its CSV format.
Sharing it means an archive can go stale, which is allowed; freezing it would
mean an archive can block a deploy, which is not. The version boundary is the
schedule payload that pipeline returns.

Because a sealed snapshot's behaviour genuinely stops moving, its tests can be
frozen too — the depth of test you can pin is exactly the depth of code you've
sealed:

| Tests | Scope |
| --- | --- |
| `tests/e2e/live/` | the live route — change these when the product changes |
| `tests/e2e/v1/`, `tests/e2e/v2/` | **frozen** specs, copied when the version was cut |
| `tests/e2e/archive.test.js` | the floor every `/vN` must clear: renders, explorable, deep links work |
| `tests/unit/v2/` | logic owned by `/v2` (the concepts model) |
| `tests/unit/archive-routes.test.js` | keeps the snapshots sealed |

When a frozen test goes red, something reached into the snapshot. **Fix the
snapshot or retire the version — never edit the assertion to match.** Rewriting
a frozen spec to agree with new behaviour is how an archive silently stops
being one.

### Adding a version

Copy `src/routes/+page.svelte`, `+page.server.js` and the `$lib` modules it
imports into `src/routes/vN/lib/`, repoint the imports to `./lib/*` (leave
`$lib/server/cityData.js` alone), copy `tests/e2e/live/` to `tests/e2e/vN/`
retargeted at `/vN`, and add the path to the `ARCHIVES` list in
`tests/e2e/archive.test.js` and `SNAPSHOTS` in `tests/unit/archive-routes.test.js`.

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
fallback and then the row's `Parent Location ID` — the complex or park the
pool sits inside. Two pools need that last step: Kidstown Water Park and
Donald D. Summerville Olympic Pools are in the city's location list but
absent from its facilities geo data under any name or address, while
L'Amoreaux Sports Complex and Woodbine Beach Park, which contain them, are
mapped. A borrowed point is the complex rather than the pool door, so it is
flagged `approx` all the way through to the card, which says "approx.
location" — being a few hundred metres out is worth far more to a reader
than not being offered the pool at all, but only if nobody is misled about
which it is. With that step every pool the city lists is now placed.

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

## Design studies — `/v2`

`/v2` is a gallery of **eleven ways to draw the same question**: *which
city pool has a swim today that I can actually get to, and how soon?* It is a
studio wall, not a second product — the main page is untouched by it, and the
route is a separate chunk, so none of d3 or the map data reaches `/`.

| # | Concept | After | Touch |
| --- | --- | --- | --- |
| 01 | The Trip Line | Marey's train schedule graph | drag departure · kind |
| 02 | The Day Planner | school timetable; Bertin's reorderable matrix | re-sort · kind |
| 03 | The Pool Clock | the 24-hour dial | tap a ring · kind |
| 04 | Swim Permitted Between | Sylianteng's parking signs | kind |
| 05 | A Map of Minutes | time-space maps | walk/bike · tap a pool |
| 06 | Your Pool | Voronoi tessellation; the choropleth | tap a territory · kind |
| 07 | The Day in Twelve Maps | Tufte's small multiples | — |
| 08 | The Almanac | Tufte's sparklines and table-graphics | sort · kind |
| 09 | Soonest Splash | the dot strip / beeswarm | kind |
| 10 | Worth the Trip | scatterplot with a reference line | walk/bike · kind |
| 11 | Strings | the nomogram; parallel coordinates | tap a string · kind |

Every concept gets **at most two things you can touch**, and each has its own
palette so the forms can be compared rather than the styling.

All eleven read one derived model (`src/routes/v2/lib/concepts/model.js`), so eleven very
different pictures are provably drawing the same arithmetic. The quantity they
all turn on is neither distance nor start time but the moment you could be *in
the water*:

```
inWater = max(now + travel, session start)
swimMin = session end − inWater
```

A swim counts as reachable when `swimMin ≥ DEFAULT_MIN_SWIM_MIN`. Pools the
city never geocoded stay on the lists — Swimmm never hides a swim it can't
assess — but can never be the *answer*, because we don't know how far they are.

Two knobs, both announced on the page when they are in play:

- `?c=<slug>` — deep-link a concept (the nav writes it as you browse)
- `?at=13:00` — move the reader's clock. A gallery has to be legible at 2 a.m.
  when every pool in Toronto is shut; without an override all eleven concepts
  would draw an empty city. When nothing is left today and no `?at=` is given,
  the page rehearses the day at 1 p.m. and says so in a banner.

Without a Mapbox token the concepts fall back to straight-line estimates —
4.8 km/h walking, 15 km/h cycling, ×4/π for the street grid (the average ratio
of grid distance to straight-line distance) — and every concept's footer says
"estimated" rather than dressing a guess up as a routed time.

The map concepts draw on `src/routes/v2/lib/geo/torontoOutline.js`, the city boundary
dissolved from the [Neighbourhoods](https://open.toronto.ca/dataset/neighbourhoods/)
dataset and simplified to 839 points (~16 KB). Regenerate it with
`node scripts/build-city-outline.mjs` — a hand-run script, not part of the
build, since the municipal boundary changes about never.

## Privacy

The browser asks for your location and uses it **only in the page**, snapped
to a ~50 m grid before any routing provider sees it. There is no Swimmm
server to send it to — the site is static files. There is no other user data.
`/v2` follows the same rule, and falls back to measuring from Nathan
Phillips Square when you decline.

## Develop

```sh
npm install
npm run dev        # fetches city data once (~20 h cache in .city-cache/)
npm test           # unit tests (vitest)
npm run test:e2e   # Playwright e2e (fixture data, no city traffic)
npm run build && npm run preview   # the real static build
```

Environment variables (build-time):

- `PUBLIC_MAPBOX_TOKEN` — Mapbox public (pk.) token. **Required for the root
  page**: v3 offers dips, a dip states a departure time, and it won't state
  one it hasn't routed — so a build without a token yields a `/` that can only
  apologise and link the city's schedules. `/v1` and `/v2` still degrade
  gracefully without it (straight-line distances, labelled as estimates)
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

Split by cost, so the cheap half can run unprompted and the expensive half
can't be triggered by a stranger.

`.github/workflows/guard.yml` runs the **unit suite on every push** (~1s of
tests; no browsers, no build). It exists because the archive seal is only worth
having if it fires without anyone remembering to ask — a guard behind a manual
trigger is not a guard. `push` rather than `pull_request` is deliberate: a
fork's commits live in the fork and never fire a push event here, so this can
only be started by someone with write access and no volume of pull requests can
run it.

`.github/workflows/tests.yml` runs the unit **and** e2e suites — the expensive
one, since it downloads chromium and webkit — **on demand only**. Nothing runs
on push, or when a pull request is opened or updated. Start it either way:

- add the `run-tests` label to a pull request (remove and re-add to re-run);
  the result attaches to the PR's checks
- run it from the Actions tab against any branch

The `run-tests` label has to exist in the repo before it can be applied; GitHub
lets you create it inline the first time you add it.

Label a PR **`preview`**, then run `deploy.yml` against `main` from the Actions
tab, and it is built to `/swimmm/pr-<N>/`. Pages hosts one site per repo and
each deploy replaces it wholesale, so every deploy rebuilds the root from
`main` *plus* every labelled PR into a single artifact — which is what stops a
push to `main` from wiping the previews. It's a button rather than a
`pull_request` trigger so the `github-pages` environment can stay locked to
`main`; see DEPLOYMENT.md.

`.github/workflows/deploy.yml` runs the unit suite too, as a step in its build
job before the build itself — so a red suite fails the job before it uploads a
Pages artifact, and nothing gets published. It costs no extra runner time (that
job already installs the dependencies) and it means a deploy can't outrun the
guards. `main` is unprotected, so this step — not a required status check — is
what stands between a broken invariant and production; add branch protection
with `guard` as a required check if you want the belt as well as the braces.
