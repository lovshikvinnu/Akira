if (typeof window !== "undefined") {
  throw new Error("akira-os/vault/VaultHashService.ts must only be loaded on the server side.");
}

import { createHash } from "crypto";
import { createReadStream } from "fs";
import { vaultFileRepository } from "../../persistence/repositories";
import { VaultFile } from "../../shared/types/store-types";

export const VaultHashService = {
  /**
   * Generates a SHA-256 hash from a file stream.
   * Ensures that large multi-GB files are never fully loaded into memory.
   */
  async generateHashFromStream(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);

      stream.on("data", (chunk) => {
        hash.update(chunk);
      });

      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });

      stream.on("error", (err) => {
        reject(err);
      });
    });
  },

  /**
   * Helper to generate hash from an in-memory buffer.
   */
  generateHashFromBuffer(buffer: Buffer): string {
    const hash = createHash("sha256");
    hash.update(buffer);
    return hash.digest("hex");
  },

  /**
   * Looks up duplicate logical files sharing the same SHA-256 hash.
   */
  findDuplicates(hash: string): VaultFile[] {
    return vaultFileRepository.getByHash(hash);
  },
};
