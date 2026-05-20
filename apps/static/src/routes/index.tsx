import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    document.title = "bun-mono — static showcase";
  }, []);

  return <div className="p-4">Static showcase — coming soon</div>;
}
