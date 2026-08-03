import { ChatWindow } from "@/app/components/ChatWindow";

/** A repeated query param arrives as an array; only the first value is used. */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * `?dataset=<id>` and `?report=<id>` are the Data Explorer's "Ask in chat"
 * deep links. Reading them here (rather than with useSearchParams) keeps the
 * client tree free of a Suspense boundary; it does opt this page into dynamic
 * rendering, which is fine — nothing on it was static anyway.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <ChatWindow
        datasetId={one(params.dataset)}
        reportId={one(params.report)}
      />
    </div>
  );
}
