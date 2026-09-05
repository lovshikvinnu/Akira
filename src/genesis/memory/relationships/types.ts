export type RelationshipType = "Related" | "Continues" | "Part Of" | "Caused By" | "References";

/**
 * Where a link came from, kept apart from what the link claims.
 *
 * Two of the four rules match on an identifier the user themselves set:
 * `relatedProjectId` for "Part Of", `relatedNoteId` for "References". Those
 * memories are related because the user filed them together, and the link is a
 * restatement of something already true in the workspace.
 *
 * The other two are the system's reading of the record. "Continues" decides
 * that one work session carries on from another; "Caused By" decides that a
 * completion was caused by a creation, and it decides it by looking for the
 * words "completed"/"100%" and "initiated"/"created" in prose. Nobody stated
 * either. They are the strongest claims the module makes and the least
 * evidenced.
 *
 * Before this field the two kinds were the same record. `evidence` reads like
 * a distinction but it is a sentence, so nothing could act on it: the
 * Relationships importance signal counts `rels.length` and an inferred
 * causality raised a memory's importance exactly as much as a project the user
 * put it in -- and importance decides what is recalled into the prompt.
 *
 * "Unlinked" is not a value here. A pair with insufficient evidence produces no
 * record at all, which is already how absence is represented; adding a stored
 * row to mean "no relationship" would invent state for every pair that was ever
 * compared.
 */
export type RelationshipBasis =
  /** Both memories carry the same user-set identifier. */
  | "Fact"
  /** The system read the record this way. Nobody said it. */
  | "Inference";

export type MemoryRelationship = {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  type: RelationshipType;
  /** See {@link RelationshipBasis}. Never derived from `evidence` prose. */
  basis: RelationshipBasis;
  evidence: string;
  timestamp: string;
};
