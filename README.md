# Lazy Salesman

A browser-based, manual trip-planning tool. Upload a CSV of addresses, see them as
pins on a map, and build routes by hand. The "lazy salesman" is a *human* — the app
supports your judgment instead of solving the Traveling Salesman Problem
algorithmically.

The app is **routes-first**: stops are assigned to routes (not drivers); each route
has its own name and color. There is no driver entity. A project can have multiple
depots, and each route can independently pick a start depot and an end depot
(either may be empty; they may differ; check `Loop` to return to the start depot).

## Setup

Requires Node ≥ 20 and npm ≥ 10.

```bash
npm install
npm run dev    # opens http://localhost:5173
```

## Mapbox token (required)

Geocoding addresses and computing route drive-times both call the Mapbox API.
**Without a token, CSV import and route ETA are blocked.** There is no mock
fallback — this is by design.

1. Sign in at https://account.mapbox.com → **Tokens** → **Create a token**.
2. **Leave the default Public scopes checked.** Mapbox grants every token access
   to Styles, Tilesets, **Geocoding**, and **Directions** by default — there is
   no separate `geocoding:read` or `directions:read` scope to enable. The
   pre-checked public scopes (`STYLES:TILES`, `STYLES:READ`, `FONTS:READ`,
   `DATASETS:READ`, `VISION:READ`) are everything this app needs. **Do not check
   any Secret scopes** — those would expose write access to your account.
3. Recommended: under **Token restrictions → URLs**, add
   `http://localhost:5173/*` for local dev (and your deploy origin once hosted)
   so the token only works from your domain.
4. In the app, click the **gear icon** (top-right) → paste the token → **Save**.

The token lives in `localStorage["lazysalesman.mapbox_token"]` on your machine
only. It is never logged and never included in JSON exports.

## Building a route

Once you have stops on the map (after CSV import lands in Phase 2):

1. Click **+ Add depot** in the sidebar — paste an address or click on the map.
   Repeat to add more depots.
2. Click **Import CSV** in the top bar — walk the 5-step wizard (upload → map
   columns → label template → geocode preview → save template).
3. Click **+ New route** in the sidebar. The route auto-enters edit mode.
4. In the Active Route panel, pick **Start** and **End** depots (independently —
   they can differ). Check **Loop** to return to the start depot.
5. Click pins on the map to add or remove them. Drag stops in the sidebar to
   reorder.
6. Click **✓ Done editing** to commit. Toggle the route's checkbox in the filter
   panel to dim/hide its pins.

## Exporting

Each route exports as a Google Maps deep link (auto-splits past 10 stops into
`Part 1 of N`, `Part 2 of N`, …) plus a plain-text address list. **Download all**
bundles every route's artifacts into a single ZIP.

## Backup

Settings → **Export project as JSON**. Import the same file on another browser or
device to restore depots, routes, stops, and the geocode cache.

## Build & deploy

```bash
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

Deploy `dist/` as a static SPA — Cloudflare Pages, Netlify, and GitHub Pages all
work. Add the deploy origin to the Mapbox token's URL restriction.

## Known limits

- Single project at a time in the v1 UI.
- Address editing post-geocode requires re-importing the CSV.
- Desktop-first; mobile is a separate design pass.

## Sample data for testing

The Notion spec's Appendix A has a 4-row test CSV that exercises every quirk the
importer handles: split address fields, PII columns (name, email, phone), a
duplicate column header, dirty data, and submission IDs. Use it to verify the
wizard's auto-detection and the "Needs attention" flow once Phase 2 lands.
