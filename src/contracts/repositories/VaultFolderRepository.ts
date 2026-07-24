import { VaultFolder } from "../../shared/types/store-types";

export interface VaultFolderRepository {
  getById(id: string): VaultFolder | undefined;
  getByParent(parentId: string | null): VaultFolder[];
  getAll(): VaultFolder[];
  add(input: { id?: string; name: string; parentId: string | null }): string;
  update(id: string, patch: Partial<Omit<VaultFolder, "id" | "createdAt">>): void;
  delete(id: string): void; // logical delete that cascades

  // Recursive CTE Circular Check
  isCircularMove(folderId: string, targetParentId: string): boolean;
}
