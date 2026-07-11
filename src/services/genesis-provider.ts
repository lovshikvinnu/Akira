import type { MemoryEvent } from "./events/types";
import type { ChatMessage } from "./store-types";
import type { CompanionState } from "./companion/state/types";

type StoreProvider = {
  getMemories: () => MemoryEvent[];
  getChat: () => ChatMessage[];
};

type CompanionStateProvider = () => CompanionState | null;

let storeProvider: StoreProvider | null = null;
let companionStateProvider: CompanionStateProvider | null = null;

export function registerStoreProvider(provider: StoreProvider): void {
  storeProvider = provider;
}

export function registerCompanionStateProvider(provider: CompanionStateProvider): void {
  companionStateProvider = provider;
}

export function getMemories(): MemoryEvent[] {
  if (!storeProvider) {
    return [];
  }
  return storeProvider.getMemories();
}

export function getChat(): ChatMessage[] {
  if (!storeProvider) {
    return [];
  }
  return storeProvider.getChat();
}

export function getCompanionState(): CompanionState | null {
  if (!companionStateProvider) {
    return null;
  }
  return companionStateProvider();
}
