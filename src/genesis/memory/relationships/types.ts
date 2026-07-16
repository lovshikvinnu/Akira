export type RelationshipType = "Related" | "Continues" | "Part Of" | "Caused By" | "References";

export type MemoryRelationship = {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  type: RelationshipType;
  evidence: string;
  timestamp: string;
};
