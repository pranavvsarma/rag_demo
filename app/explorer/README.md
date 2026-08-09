# app/explorer

The Data Explorer route (`/explorer`): upload datasets to a Unity Catalog Volume, preview them, build charts, save charts as named reports, and export PNG/PDF — no cluster or SQL warehouse required.

- `page.tsx` — the `/explorer` route.
- `components/` — three-pane layout and Explorer-specific UI. See [components/README.md](components/README.md).
- `hooks/` — data-fetching hooks for datasets and reports. See [hooks/README.md](hooks/README.md).
