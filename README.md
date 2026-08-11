# Swimmm

One-screen mobile site answering: **when could I go for a swim?**

Not a directory of pools — a handful of *dips*: concrete appointments with a
departure time, a way of getting there, and a booked window in the water. The
archived `/v1` answers the older question ("which pools have a swim today, and
which are closest and soonest?") and shows the difference.

Proof of concept. SvelteKit (Svelte 5), fully static — city data is fetched at
build time and baked into the prerendered page (~30 KB gzipped). No accounts,
no map, no runtime backend; grayscale UI with one accent color.

## Routes

| Route | What |
| --- | --- |
| `/` | the live site — the concierge, offering dips ([below](#dips)) |
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

## Dips

A **dip** is what the live site offers: a location, a way of getting there, a
one-way travel time, and a booked window in the water.

```
leave 1:40 · walk 20 min · in the water 2:00–2:45 at Regent Park
```

It is deliberately narrower than the drop-in session it comes from. A session
running 1–4 p.m. yields one 45-minute dip, not three hours of open water,
because a three-hour block is a listing again and the reader is back to doing
the arithmetic themselves. How long a dip is, is a user setting
(`DIP_DURATION_OPTIONS` = 30/45/60, default 45, `?dip=30` per visit): a dip
takes the length you asked for whenever the session has room for it, and
shortens a step at a time when it doesn't — which costs it appeal and is said
out loud on the card, never hidden.

**Appeal** — which dips are worth offering — lives alone in
`src/lib/appeal.js`, with every number it uses in `config.js` `APPEAL`, so
retuning the concierge's taste never means editing the code that applies it.
A dip qualifies when its mode gets you there inside that mode's threshold:

| Mode | Within | Notes |
| --- | --- | --- |
| walk | 15 min | preferred over everything |
| bike | 20 min | |
| transit | 20 min | at most one connection |
| drive | 20 min | last resort |

Mode is the dominant term and the order is a guarantee, not a tendency: the
`BASE` scores are spaced 40 apart against a maximum swing of 33 from the other
terms (proximity within the mode's range, and the shortfall penalty), so the
sweetest drive in Toronto still loses to the worst qualifying transit trip.
Tests pin that at both extremes. Adding a consideration — weather, water
temperature, a facility rating — means adding one entry to `TERMS`, which
joins the score and the printed breakdown without touching anything else.

**Reach** is a field on the dip, not an assumption behind it, because a trip
can't always be routed:

```
{ routed: true,  mode, minutes }   a trip Mapbox or Transitous measured
{ routed: false, km }              a straight line, and we say so
```

A travel *time* is never estimated. The concepts at `/v2` guess one at
4.8 km/h because a gallery has to draw something; a departure time is a
promise, and an estimated "leave at 1:40" is how you miss a swim. So when
routing is unavailable — no token, Mapbox down, or one pool it can find no
road to — the dip keeps its window in the water, drops its departure time,
and shows the straight-line distance instead, with a dashed edge and a
banner. The reader can judge how long 2.3 km takes them; we won't pretend to.
`APPEAL.DISTANCE.BASE` is 0 against the routed modes' 40–160, so every
distance-only dip ranks below every routed one — prefer what we can vouch for.

`DIP_SELECTION` turns the ranked list into the handful actually shown: five,
spread so no two overlap in the water by more than 10 minutes and no pool
appears more than twice — so a reader with a free afternoon can ask "I'm free
between 2 and 4, what are my options?" rather than being told about 2 p.m.
five times. When the day genuinely offers nothing else the spread rule gives
way and overlapping dips are shown anyway, drawn side by side.

**Which day** — `planDay` shows today whenever today still has a reachable
swim ahead of the clock, and otherwise the next day that does, up to a week
out. One rule covers three cases: tonight's swims are over (so it offers
tomorrow); nothing has opened yet, so the whole day is still ahead of you (so
it offers today); the city has shut for a holiday (so it skips the day
entirely). A day whose swims are all out of reach counts as shut, because
from the reader's side it is.

### The day planner

The offer is drawn as a single column with a real time axis, after `/v2`'s
Concept 02 — but turned through ninety degrees in what it is about. The
concept put one column per pool and asked you to compare fourteen; this has
one column, your afternoon, with the dips arranged down it at a fixed two
pixels per minute, so distance down the page *is* time. Each dip carries the
hatched run of its trip immediately above it: the thing a wall calendar can
never tell you, and the reason a dip is an appointment rather than an opening
time. The layout arithmetic (`src/lib/dips/layout.js`) is separate from the
component and unit-tested, including the calendar-style packing for the
uncommon overlapping case.

### Where are you?

There is no default origin. Decline the location prompt — or open the page in
a frame, where it still refuses to raise a prompt a hostile parent could dress
up — and it asks: a silhouette of Toronto with the city's pools marked, which
you tap to place yourself. A precisely routed trip from a place you are not
standing is a worse lie than an approximate one from where you are. The pools
earn their place as landmarks; a bare outline is hard to find yourself on.
Arrow keys move the marker about a kilometre a press (five with shift) and
Enter confirms, so it is not a tap-only control. No tiles and no third-party
map: the projection is forty lines in `src/lib/dips/placemap.js`.

## Travel times

A Mapbox public token (`PUBLIC_MAPBOX_TOKEN`) buys walking, cycling and
driving times from the [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/);
transit comes from [Transitous](https://transitous.org)
(`TRANSIT_PROVIDER` in `config.js`) — a free, community-run MOTIS routing API
over transit agencies' official GTFS feeds (the TTC's, for Toronto).

Both are called from the browser, so the user's location goes to the routing
providers and nowhere else — there is no Swimmm server for it to reach.
Transitous costs one request per pool, so it is only asked when Mapbox's modes
haven't already filled the handful, and only about the pools they couldn't
reach; the `LOOKUP_LIMIT` (8) nearest are queried at most. Which modes are
fetched follows `APPEAL.MODES`, so teaching the concierge a new one is a
config edit. Without a token the site still works — see **Reach** above.

The archived `/v1` predates all this and is sealed with its own copy: it
fetches walking and cycling only, hides swims beyond `DEFAULT_MAX_TRAVEL_MIN`
(60) minutes or leaving less than `DEFAULT_MIN_SWIM_MIN` (30) in the water
(`?max=45&swim=20`), surfaces a **top pick** via the tier cascade in
`TOP_RESULT` (≤ 15 min walk, else ≤ 20 min bike, else ≤ 30 min transit with at
most one connection), and shows a desert when no tier yields anything.

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
`/v2` follows the same rule, and falls back to measuring from Nathan Phillips
Square when you decline. The live site has no such fallback — it asks you to
place yourself instead ([above](#where-are-you)), because measuring precisely
from somewhere you aren't is the more misleading of the two.

## Develop

```sh
npm install
npm run dev        # fetches city data once (~20 h cache in .city-cache/)
npm test           # unit tests (vitest)
npm run test:e2e   # Playwright e2e (fixture data, no city traffic)
npm run build && npm run preview   # the real static build
```

Environment variables (build-time):

- `PUBLIC_MAPBOX_TOKEN` — Mapbox public (pk.) token enabling routed travel
  times; omit to build without it. The live site then offers dips measured as
  straight-line distances and says so, rather than inventing a departure time
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
