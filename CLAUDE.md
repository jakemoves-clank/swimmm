# Swimmm

Static SvelteKit (Svelte 5) site: which City of Toronto pools have an adult
drop-in swim today, and which can you actually get to. Fully prerendered, city
data baked in at build time, no runtime backend. See README.md for the full
picture.

```sh
npm test           # unit (vitest) — ~1s, includes the archive guards below
npm run test:e2e   # Playwright, fixture data, never contacts the city
npm run build
```

## The one thing to know before editing: `/v1` and `/v2` are sealed archives

`src/routes/v1/` and `src/routes/v2/` are **archived snapshots of the site at
earlier stages**, not routes under development. Each owns its own copy of the
client code under `src/routes/vN/lib/`, and `src/routes/v1/lib/*` is
byte-identical to parts of `src/lib/*`.

**That duplication is deliberate and load-bearing. Do not remove it.**

It looks exactly like something worth cleaning up, and it is the single most
likely way this repo gets broken. The moment `/v1` renders anything `/` also
renders, a change to `/` rewrites what the snapshot shows — which is the one
thing an archive must never do.

So, concretely:

- **Never** refactor shared markup or logic out of a `vN/` route into `$lib` or
  a shared component, and never point a `vN/` import at `$lib` (the sole
  exception is `$lib/server/**`, below).
- **Never** "fix" a failing test under `tests/e2e/v1/` or `tests/e2e/v2/` by
  editing its assertions. Those are frozen specs. Red means something reached
  into the snapshot: fix the snapshot, or retire the version entirely.
- **Never** build new features on a `vN/` route, or import from one into `/`.
- Dead-code and duplication tools will flag `src/routes/*/lib/**`. They are
  wrong here. Leave it.

`tests/unit/archive-routes.test.js` enforces all of this and will fail loudly.
If you hit it, the fix is to stop, not to relax the test.

### The deliberate exception: `$lib/server/**`

The snapshots share the build-time data pipeline (`$lib/server/cityData.js`,
`transform.js`). `+page.server.js` runs at prerender, so a frozen copy of the
loader would fail the **whole** build — `/` included — the day the city changes
its data format. An archive is allowed to go stale; it is not allowed to block
a deploy. The version boundary is the schedule payload that pipeline returns.

### Where things live

| Path | What |
| --- | --- |
| `src/routes/+page.svelte`, `src/lib/**` | the live site — normal development happens here |
| `src/routes/vN/**` | sealed snapshots — treat as read-only |
| `tests/e2e/live/` | the live route's suite — change these when behaviour changes |
| `tests/e2e/vN/` | **frozen** specs — never edit to match new behaviour |
| `tests/e2e/archive.test.js` | the floor every `/vN` must clear |
| `tests/unit/archive-routes.test.js` | keeps the snapshots sealed |

Adding a new version: see "Adding a version" in README.md.

## Other notes

- City data is fetched only at build time and cached ~20 h in `.city-cache/`.
  Tests never contact the city (`SWIMMM_DATA_FILE`).
- CI: `guard.yml` runs the unit suite on every push. The full e2e suite
  (`tests.yml`) is on demand — add the `run-tests` label to a PR, or dispatch
  it — to keep runner usage bounded.
- The CSP is hash-based and asserted to be violation-free by
  `tests/e2e/csp.test.js`; adding inline styles or scripts will break it.
