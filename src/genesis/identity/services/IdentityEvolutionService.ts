import {
  IdentityVersion,
  IdentitySnapshot,
  IdentityChange,
  IdentityTimeline,
  IdentityChangeType,
} from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class IdentityEvolutionService {
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
   * Retrieves the current timeline of updates.
   */
  public getTimeline(identityId: string): IdentityTimeline | null {
    return this.repository.getTimeline(identityId);
  }

  /**
   * Returns all recorded versions of the identity profile.
   */
  public getVersions(identityId: string): IdentityVersion[] {
    return this.repository.getVersions(identityId);
  }

  /**
   * Returns a specific version details.
   */
  public getVersion(versionId: string): IdentityVersion | null {
    return this.repository.getVersion(versionId);
  }

  /**
   * Returns a specific snapshot details.
   */
  public getSnapshot(snapshotId: string): IdentitySnapshot | null {
    return this.repository.getSnapshot(snapshotId);
  }

  /**
   * Retrieves the latest active version.
   */
  public getLatestVersion(identityId: string): IdentityVersion | null {
    const versions = this.getVersions(identityId);
    if (versions.length === 0) return null;
    return versions[versions.length - 1];
  }

  /**
   * Resolves or initializes the timeline record.
   */
  public getOrCreateTimeline(identityId: string): IdentityTimeline {
    let timeline = this.repository.getTimeline(identityId);
    if (!timeline) {
      timeline = {
        identityId,
        timelineId: uid(),
        versions: [],
        changes: [],
        updatedAt: new Date().toISOString(),
      };
      this.repository.saveTimeline(timeline);
    }
    return timeline;
  }

  /**
   * Compiles a snapshot of the current graph nodes, edges, and confidence states.
   */
  public createSnapshot(identityId: string, changeSummary: string): IdentitySnapshot {
    const graph = this.repository.getGraph();
    const snapshotId = uid();

    const snapshot: IdentitySnapshot = {
      id: snapshotId,
      identityId,
      nodes: graph.nodes.map((node) => ({ ...node })),
      edges: graph.edges.map((edge) => ({ ...edge })),
      graphVersion: graph.graphVersion,
      timestamp: new Date().toISOString(),
    };

    this.repository.createSnapshot(snapshot);

    eventService.record(
      Events.IDENTITY_SNAPSHOT_CREATED as any,
      "Identity Snapshot Created",
      `Compiled identity snapshot: ${snapshotId} - ${changeSummary}`,
      null,
      null,
      { snapshot },
    );

    return snapshot;
  }

  /**
   * Appends a new immutable version to the timeline.
   */
  public createVersion(
    identityId: string,
    changeSummary: string,
    calculationVersion: number,
    changeType?: IdentityChangeType,
    targetId?: string,
    changeDetails?: string,
  ): IdentityVersion {
    // 1. Create Graph Snapshot
    const snapshot = this.createSnapshot(identityId, changeSummary);

    // 2. Load Timeline and link previous Version
    const timeline = this.getOrCreateTimeline(identityId);
    const previousVersionId =
      timeline.versions.length > 0
        ? timeline.versions[timeline.versions.length - 1].versionId
        : null;

    // 3. Formulate Reference to current Confidence values
    const confidenceMap: Record<string, { score: number; level: string }> = {};
    for (const node of snapshot.nodes) {
      const conf = this.repository.getConfidence(node.id);
      if (conf) {
        confidenceMap[node.id] = { score: conf.score, level: conf.level };
      }
    }
    const confidenceSnapshotReference = JSON.stringify(confidenceMap);

    // 4. Create new Version
    const versionId = uid();
    const version: IdentityVersion = {
      versionId,
      identityId,
      createdAt: new Date().toISOString(),
      previousVersionId,
      changeSummary,
      confidenceSnapshotReference,
      calculationVersion,
      snapshotId: snapshot.id,
    };

    this.repository.createVersion(version);

    // 5. Append changes to timeline
    timeline.versions.push(version);

    if (changeType && targetId) {
      const change: IdentityChange = {
        id: uid(),
        versionId,
        changeType,
        targetId,
        details: changeDetails || changeSummary,
        timestamp: new Date().toISOString(),
      };
      timeline.changes.push(change);
    }

    timeline.updatedAt = new Date().toISOString();
    this.repository.saveTimeline(timeline);

    // 6. Dispatch events
    eventService.record(
      Events.IDENTITY_VERSION_CREATED as any,
      "Identity Version Created",
      `Created identity version: ${versionId} - ${changeSummary}`,
      null,
      null,
      { version },
    );

    eventService.record(
      Events.IDENTITY_TIMELINE_UPDATED as any,
      "Identity Timeline Updated",
      `Appended version ${versionId} to timeline of ${identityId}`,
      null,
      null,
      { timeline },
    );

    return version;
  }
}

export const identityEvolutionService = new IdentityEvolutionService();
