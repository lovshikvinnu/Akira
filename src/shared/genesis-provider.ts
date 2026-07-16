import type { MemoryEvent } from "./types/event-types";
import type { ChatMessage } from "./types/store-types";
import type { CompanionState } from "@/genesis/context/state/types";

type StoreProvider = {
  getMemories: () => MemoryEvent[];
  getChat: () => ChatMessage[];
  saveMemory: (event: MemoryEvent) => void;
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

export function saveMemory(event: MemoryEvent): void {
  if (!storeProvider) {
    return;
  }
  storeProvider.saveMemory(event);
}

export function getCompanionState(): CompanionState | null {
  if (!companionStateProvider) {
    return null;
  }
  return companionStateProvider();
}
