# app/api/_probe

Diagnostic-only route, not part of the product surface.

- `[id]/route.ts` — `GET /api/_probe/[id]` echoes back the dynamic route param it received. Used to sanity-check Next.js's async `Promise<params>` route-param parsing without touching any real data or backend.
