import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/brain-dump")({
  beforeLoad: () => {
    throw redirect({
      to: "/notes",
      replace: true,
    });
  },
  component: () => null,
});
