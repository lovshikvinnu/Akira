import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const vaultSearchSchema = z.object({
  folderId: z.string().nullable().optional(),
  view: z.enum(["grid", "list"]).catch("grid").optional(),
  sort: z.enum(["name", "createdAt", "updatedAt", "size", "type"]).catch("name").optional(),
  dir: z.enum(["asc", "desc"]).catch("asc").optional(),
  favorites: z.boolean().catch(false).optional(),
  deleted: z.boolean().catch(false).optional(),
  tag: z.string().nullable().optional(),
});

export const Route = createFileRoute("/vault")({
  validateSearch: (search) => vaultSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/tools/vault",
      search: search,
      replace: true,
    });
  },
  component: () => null,
});

// Re-export server actions for backwards compatibility
export { getRawFileBase64, uploadMockFileServer } from "../akira-os/vault";
