import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VaultWorkspace } from "../components/vault/VaultWorkspace";
import { Shell } from "../app/shell/Shell";

// Import the extracted server functions from akira-os/vault
import { getRawFileBase64, uploadMockFileServer } from "../akira-os/vault";

export { getRawFileBase64, uploadMockFileServer };

// 1. Router Search Validator
const vaultSearchSchema = z.object({
  folderId: z.string().nullable().optional(),
  view: z.enum(["grid", "list"]).catch("grid").optional(),
  sort: z.enum(["name", "createdAt", "updatedAt", "size", "type"]).catch("name").optional(),
  dir: z.enum(["asc", "desc"]).catch("asc").optional(),
  favorites: z.boolean().catch(false).optional(),
  deleted: z.boolean().catch(false).optional(),
  tag: z.string().nullable().optional(),
});

export const Route = createFileRoute("/tools/vault")({
  validateSearch: (search) => vaultSearchSchema.parse(search),
  component: VaultPageRoute,
});

function VaultPageRoute() {
  return (
    <Shell layoutMode="fit">
      <VaultWorkspace />
    </Shell>
  );
}

export default VaultPageRoute;
