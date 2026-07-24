import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";

export class IdentityValidationService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
  }

  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
  }

  public getRepository(): IdentityRepository {
    return this.repository;
  }

  public validateIdentity(identityId: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const graphRes = this.validateGraph(identityId);
    const evRes = this.validateEvidence(identityId);
    const timeRes = this.validateTimeline(identityId);

    const errors = [...graphRes.errors, ...evRes.errors, ...timeRes.errors];
    const warnings = [...graphRes.warnings, ...evRes.warnings, ...timeRes.warnings];

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  public validateGraph(identityId: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const graph = this.repository.getGraph();
    const nodeMap = new Map<string, typeof graph.nodes[0]>();

    // 1. Detect duplicate aspect values within the same aspect type
    const aspectValueKeys = new Set<string>();

    for (const node of graph.nodes) {
      nodeMap.set(node.id, node);

      const key = `${node.aspectType}:${node.value.trim().toLowerCase()}`;
      if (aspectValueKeys.has(key)) {
        warnings.push(`Duplicate aspect node found: type "${node.aspectType}" with value "${node.value}"`);
      } else {
        aspectValueKeys.add(key);
      }
    }

    // 2. Validate Edges
    for (const edge of graph.edges) {
      if (!edge.sourceId || !edge.targetId) {
        errors.push(`Edge "${edge.id}" has missing source or target identifiers`);
        continue;
      }
      if (!nodeMap.has(edge.sourceId)) {
        errors.push(`Edge "${edge.id}" references non-existent source node "${edge.sourceId}"`);
      }
      if (!nodeMap.has(edge.targetId)) {
        errors.push(`Edge "${edge.id}" references non-existent target node "${edge.targetId}"`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  public validateEvidence(identityId: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const graph = this.repository.getGraph();
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const allEvidence = this.repository.findEvidence ? this.repository.findEvidence() : [];

    // 1. Check all evidence in repository points to valid node IDs
    for (const ev of allEvidence) {
      if (!nodeIds.has(ev.nodeId)) {
        errors.push(`Evidence "${ev.id}" points to non-existent graph node "${ev.nodeId}"`);
      }
    }

    // 2. Check all nodes list valid evidence IDs
    for (const node of graph.nodes) {
      for (const evId of node.evidenceIds) {
        const ev = this.repository.getEvidence(evId);
        if (!ev) {
          errors.push(`Graph node "${node.id}" references non-existent evidence ID "${evId}"`);
        } else if (ev.nodeId !== node.id) {
          warnings.push(`Evidence ID "${evId}" is linked to node "${node.id}" but references nodeId "${ev.nodeId}" internally`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  public validateTimeline(identityId: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const timeline = this.repository.getTimeline(identityId);
    if (!timeline) {
      return { isValid: true, errors, warnings };
    }

    const versions = timeline.versions;
    const versionMap = new Map(versions.map((v) => [v.versionId, v]));

    for (let i = 0; i < versions.length; i++) {
      const ver = versions[i];

      // Verify previous version reference
      if (ver.previousVersionId !== null) {
        if (!versionMap.has(ver.previousVersionId)) {
          errors.push(`Timeline version "${ver.versionId}" references non-existent previous version "${ver.previousVersionId}"`);
        }
      } else if (i > 0) {
        // Warning: multiple root-like versions
        warnings.push(`Timeline version "${ver.versionId}" at index ${i} has no previousVersionId (detached root)`);
      }

      // Verify snapshot exists
      const snapshot = this.repository.getSnapshot(ver.snapshotId);
      if (!snapshot) {
        errors.push(`Timeline version "${ver.versionId}" references non-existent snapshot "${ver.snapshotId}"`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const identityValidationService = new IdentityValidationService();
