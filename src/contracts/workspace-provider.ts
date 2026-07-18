import type { AkiraState } from "../shared/types/store-types";

/**
 * WorkspaceProvider defines the read-only contract that abstracts read access 
 * to the local workspace data store (reality layer) for the GENESIS subsystem.
 */
export interface WorkspaceProvider {
  getState(): AkiraState;
  subscribe(listener: () => void): () => void;
}

let activeWorkspaceProvider: WorkspaceProvider | null = null;

/**
 * Registers the active WorkspaceProvider implementation.
 * Typically called by the AKIRA OS persistence/store initialization.
 */
export function registerWorkspaceProvider(provider: WorkspaceProvider): void {
  activeWorkspaceProvider = provider;
}

/**
 * Retrieves the registered WorkspaceProvider.
 * Used by GENESIS context services to read workspace state.
 */
export function getWorkspaceProvider(): WorkspaceProvider {
  if (!activeWorkspaceProvider) {
    throw new Error(
      "WorkspaceProvider has not been registered! Ensure AKIRA OS is initialized before starting GENESIS services."
    );
  }
  return activeWorkspaceProvider;
}
