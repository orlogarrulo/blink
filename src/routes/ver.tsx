import { createFileRoute } from "@tanstack/react-router";
import { ShareViews } from "@/components/share-views";

export const Route = createFileRoute("/ver")({
  validateSearch: (search: Record<string, unknown>) => ({
    d: typeof search.d === "string" ? search.d : "",
  }),
  component: VerPage,
});

function VerPage() {
  const { d } = Route.useSearch();
  return <ShareViews code={d} />;
}
