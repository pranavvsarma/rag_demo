/**
 * Diagnostic-only route: GET /api/_probe/[id] simply echoes back the dynamic
 * route param it received. Used to sanity-check that Next.js route param
 * parsing (including the `Promise<params>` async-params convention) is
 * working as expected, without touching any real data or backend.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ id });
}
