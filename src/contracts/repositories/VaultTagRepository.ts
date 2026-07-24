import { VaultTag } from "../../shared/types/store-types";

export interface VaultTagRepository {
  getById(id: string): VaultTag | undefined;
  getByName(name: string): VaultTag | undefined;
  getAll(): VaultTag[];
  getTagsForFile(fileId: string): VaultTag[];

  add(name: string): string;
  linkTagToFile(fileId: string, tagId: string): void;
  unlinkTagFromFile(fileId: string, tagId: string): void;
  rename(tagId: string, newName: string): void;
}
