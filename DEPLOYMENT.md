# Deployment notes

Swimmm is a fully static site: the build fetches City of Toronto data once and
bakes it into prerendered HTML (~30 KB gzipped). There is no server, no
database, and no API at runtime.

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
