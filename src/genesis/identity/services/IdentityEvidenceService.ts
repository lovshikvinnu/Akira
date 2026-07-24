import { IdentityEvidence, EvidenceSourceType, EvidenceMetadata } from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class IdentityEvidenceService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  /**
   * Initializes the service, optionally setting a new repository.
   */
  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
  }

  /**
   * Set the active repository dynamically.
   */
  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
  }

  /**
   * Get the active repository.
   */
  public getRepository(): IdentityRepository {
    return this.repository;
  }

  /**
   * Retrieves evidence by its ID.
   */
  public getEvidence(evidenceId: string): IdentityEvidence | null {
    return this.repository.getEvidence(evidenceId);
  }

  /**
   * Retrieves all evidence supporting a specific node.
   */
  public getEvidenceByNode(nodeId: string): IdentityEvidence[] {
    return this.repository.getEvidenceByNode(nodeId);
  }

  /**
   * Creates a new evidence artifact, links it to the node, and triggers identity.evidence.created.
   */
  public addEvidence(
    nodeId: string,
    sourceType: EvidenceSourceType,
    sourceId: string,
    contentReference?: string,
    metadata?: EvidenceMetadata,
  ): IdentityEvidence {
    const node = this.repository.getNode(nodeId);
    if (!node) {
      throw new Error(`Cannot add evidence: target node "${nodeId}" does not exist.`);
    }

    const evidence: IdentityEvidence = {
      id: uid(),
      nodeId,
      sourceType,
      sourceId,
      contentReference,
      metadata: metadata || {},
      weight: typeof metadata?.weight === "number" ? metadata.weight : 1.0,
      status: typeof metadata?.status === "string" ? metadata.status : "Active",
      originEngine: typeof metadata?.originEngine === "string" ? metadata.originEngine : "Manual",
      createdAt: new Date().toISOString(),
    };

    this.repository.saveEvidence(evidence);

    // Link node to the evidence
    if (!node.evidenceIds.includes(evidence.id)) {
      node.evidenceIds.push(evidence.id);
      this.repository.saveNode(node);
    }

    eventService.record(
      Events.IDENTITY_EVIDENCE_CREATED as any,
      "Identity Evidence Created",
      `Recorded supporting evidence of type "${sourceType}" for aspect node "${nodeId}"`,
      null,
      null,
      { evidence },
    );

    return evidence;
  }

  /**
   * Updates an evidence record and triggers identity.evidence.updated.
   */
  public updateEvidence(
    evidenceId: string,
    patch: Partial<Omit<IdentityEvidence, "id" | "nodeId" | "createdAt">>,
  ): IdentityEvidence | null {
    const evidence = this.repository.getEvidence(evidenceId);
    if (!evidence) return null;

    const updated: IdentityEvidence = {
      ...evidence,
      ...patch,
    };

    this.repository.updateEvidence(updated);

    eventService.record(
      Events.IDENTITY_EVIDENCE_UPDATED as any,
      "Identity Evidence Updated",
      `Updated evidence record: "${evidenceId}"`,
      null,
      null,
      { evidence: updated, patch },
    );

    return updated;
  }

  /**
   * Removes an evidence record, unlinks it from its node, and triggers identity.evidence.deleted.
   */
  public removeEvidence(evidenceId: string): boolean {
    const evidence = this.repository.getEvidence(evidenceId);
    if (!evidence) return false;

    // Unlink from target node if linked
    const node = this.repository.getNode(evidence.nodeId);
    if (node) {
      node.evidenceIds = node.evidenceIds.filter((id) => id !== evidenceId);
      this.repository.saveNode(node);
    }

    this.repository.deleteEvidence(evidenceId);

    eventService.record(
      Events.IDENTITY_EVIDENCE_DELETED as any,
      "Identity Evidence Deleted",
      `Removed evidence record: "${evidenceId}"`,
      null,
      null,
      { evidence },
    );

    return true;
  }

  /**
   * Links an existing evidence record to an aspect node and triggers identity.evidence.linked.
   */
  public linkEvidenceToNode(nodeId: string, evidenceId: string): boolean {
    const node = this.repository.getNode(nodeId);
    const evidence = this.repository.getEvidence(evidenceId);

    if (!node || !evidence) return false;

    let modified = false;

    if (!node.evidenceIds.includes(evidenceId)) {
      node.evidenceIds.push(evidenceId);
      this.repository.saveNode(node);
      modified = true;
    }

    if (evidence.nodeId !== nodeId) {
      evidence.nodeId = nodeId;
      this.repository.saveEvidence(evidence);
      modified = true;
    }

    if (modified) {
      eventService.record(
        Events.IDENTITY_EVIDENCE_LINKED as any,
        "Identity Evidence Linked",
        `Linked evidence "${evidenceId}" to aspect node "${nodeId}"`,
        null,
        null,
        { nodeId, evidenceId },
      );
    }

    return true;
  }

  /**
   * Unlinks an evidence record from an aspect node and triggers identity.evidence.unlinked.
   */
  public unlinkEvidenceFromNode(nodeId: string, evidenceId: string): boolean {
    const node = this.repository.getNode(nodeId);
    const evidence = this.repository.getEvidence(evidenceId);

    if (!node || !evidence) return false;
    if (!node.evidenceIds.includes(evidenceId)) return false;

    node.evidenceIds = node.evidenceIds.filter((id) => id !== evidenceId);
    this.repository.saveNode(node);

    if (evidence.nodeId === nodeId) {
      evidence.nodeId = ""; // Clear link
      this.repository.saveEvidence(evidence);
    }

    eventService.record(
      Events.IDENTITY_EVIDENCE_UNLINKED as any,
      "Identity Evidence Unlinked",
      `Unlinked evidence "${evidenceId}" from aspect node "${nodeId}"`,
      null,
      null,
      { nodeId, evidenceId },
    );

    return true;
  }

  /* Reserved APIs (No implementation required for this sprint) */

  /**
   * Finds evidence matching criteria.
   * Reserved for future implementation.
   */
  public findEvidence(): IdentityEvidence[] {
    return [];
  }
}

export const identityEvidenceService = new IdentityEvidenceService();
