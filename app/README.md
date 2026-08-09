# app

Next.js App Router root. Two routes share one shell: chat at `/` and the Data Explorer at `/explorer`.

- `layout.tsx` — root layout/shell.
- `page.tsx` — chat route (`/`); reads `?dataset=` / `?report=` deep links from the Explorer.
- `globals.css` — Tailwind CSS v4 global styles.
- `favicon.ico` — app icon.
- `api/` — Route Handlers (backend-for-frontend) that hold the Databricks PAT and talk to the Databricks backend. See [api/README.md](api/README.md).
- `components/` — chat UI components. See [components/README.md](components/README.md).
- `hooks/` — chat-side React hooks. See [hooks/README.md](hooks/README.md).
- `explorer/` — Data Explorer route, components, and hooks. See [explorer/README.md](explorer/README.md).
