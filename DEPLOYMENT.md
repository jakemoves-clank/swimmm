# Deployment notes

Swimmm is a fully static site: the build fetches City of Toronto data once and
bakes it into prerendered HTML (~51 KB gzipped). There is no server, no
database, and no API at runtime.

That payload carries every lane and leisure session the city has published,
not just today's — roughly six weeks ahead. It has to: deploys are gated on
the city publishing new data, so the page must still be right on a day nobody
rebuilt it. The lane/leisure toggle is therefore a client-side filter over
data already in the page, and costs no request.

## GitHub Pages (current target)

`.github/workflows/deploy.yml` handles everything:

1. In repo Settings → Pages, set **Source: GitHub Actions**.
2. Add `PUBLIC_MAPBOX_TOKEN` under Settings → Secrets and variables → Actions
   → **Variables**, scoped to the **repository**.

   A variable rather than a secret because the token is public either way —
   it's compiled into the bundle and served to every visitor, so a secret
   would hide it from the Actions logs but not from View Source. The URL
   restriction below is what actually protects it.

   Repository- rather than environment-scoped because an environment variable
   reaches only jobs that declare that environment, and the build job joins
   none by design: it runs third-party code, so it stays least-privileged
   (see the `permissions` notes in `deploy.yml`). Granting it the pages
   environment just to read a token would undo that.

   Without a token the site still builds and lists every swim — it just can't
   show walk/bike/transit times or a top pick. The build warns rather than
   failing, and each run's summary records `Travel times: on` or `off`, so
   check there first if travel times go missing.
3. Merge to `main`. Pushes deploy immediately; a daily cron checks the city's
   CKAN stamp against the deployed `stamp.txt` and rebuilds only when the city
   publishes new data (~weekly) — the site never contacts the city at runtime.

## Pull request previews

To get a preview at `https://<owner>.github.io/swimmm/pr-<N>/`:

1. Label the PR **`preview`**.
2. Actions → **Deploy to GitHub Pages** → **Run workflow** → branch **`main`**.

Remove the label, or merge or close the PR, and the preview disappears on the
next deploy. Pushing to the PR does *not* refresh its preview — dispatch again
(step 2) when you want it current.

GitHub Pages gives one site per repository — there is no per-branch or per-PR
site — and `actions/deploy-pages` replaces that whole site with each artifact,
so you cannot add a folder to it. A preview therefore means **rebuilding
everything into one artifact**: the root from `main`, plus `/pr-N/` for each
labelled PR. Two consequences worth knowing:

- A push to `main` rebuilds the previews too, so it can't silently wipe them.
- The set of previews is recomputed from "open PRs carrying the label" on
  every single deploy. Nothing is tracked, so nothing needs cleaning up.

### Why a button and not a `pull_request` trigger

Because the `github-pages` environment is restricted to the default branch,
and it should stay that way. A `pull_request` run deploys from the PR's own
branch, which that policy refuses.

Relaxing the policy is the obvious fix and the wrong one: a `pull_request` run
uses the workflow file **from the PR's head**, so any PR could rewrite
`deploy.yml` and publish whatever it liked to the live site — root included.
Manual dispatch keeps the environment locked to `main` and costs three clicks.

Opt-in by label, for the same reason `run-tests` is: every deploy rebuilds
every preview, so the cost should be asked for rather than automatic. If PR
volume ever makes that unwieldy, the escape hatch is switching the publishing
source to a `gh-pages` branch, where each PR can write only its own
subdirectory — and where this whole environment question goes away.

Notes on how it stays honest:

- Only branches **in this repository** are ever built (the workflow filters on
  `head.repo`). A fork's code must not be built by the workflow that publishes
  the live site.
- Each preview builds in its own directory and only its output is copied, to
  `/pr-N/` and nowhere else — so a PR's build cannot reach the site root.
- Previews reuse the root build's already-downloaded city data via
  `SWIMMM_CACHE_DIR`, pointed at one cache directory shared by the root build
  and every preview: one download per deploy rather than one per PR. That
  directory holds the city's raw feeds, not a finished schedule, so each
  preview still runs its own `transform.js`/`cityData.js` over them — a PR
  changing the data pipeline sees that change in its own preview.
- `BASE_PATH` is the only build difference (`/swimmm/pr-N`). Assets are
  emitted relative, so nothing else changes.
- The Mapbox URL restriction below is per **origin**, not per path, so
  previews get real travel times rather than the degraded distance-only mode.

## Mapbox token (do this before launch)

The token ships to every browser and **will** be scraped. In the Mapbox
dashboard: **URL-restrict** it to `https://<owner>.github.io` (plus your
custom domain if any); use a separate localhost-restricted token for dev;
keep the account card-less or set a spending cap; rotate on odd usage.

## Moving to Cloudflare Pages later

- Point Pages at the repo; build command `npm run build`, output `build`,
  env `PUBLIC_MAPBOX_TOKEN` (+ leave `BASE_PATH` unset — assets are relative,
  so the same build works at root).
- `static/_headers` (ignored by GitHub Pages) takes effect automatically and
  restores full security headers; on GitHub Pages the CSP ships as a meta tag
  in the HTML, which is the best a header-less host can do.
- Replicate the stamp-gated rebuild with a Deploy Hook called from a scheduled
  GitHub Action, or just let pushes rebuild.

## Abuse posture

Static files on a CDN: there is no backend to rate-limit or take down. The
only quota that can be burned is the Mapbox token (mitigated by URL
restriction above) — Transitous calls come from each visitor's own IP and are
rate-limited by Transitous itself.
