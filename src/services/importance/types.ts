export type SignalType =
  "User Intent" | "Reinforcement" | "Story Influence" | "Milestone" | "Recency" | "Relationships";

export type ImportanceSignal = {
  type: SignalType;
  strength: number; // Range 0.0 to 1.0
  explanation: string;
};

export type MemoryImportance = {
  memoryId: string;
  signals: ImportanceSignal[];
  signalHistory: { signals: ImportanceSignal[]; timestamp: string; reason: string }[];
  updatedAt: string;
};
