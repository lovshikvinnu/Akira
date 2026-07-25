import {
  IdentityNode,
  IdentityEdge,
  IdentityGraph,
  IdentityAspectType,
  IdentityEdgeType,
} from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { identityConfidenceService } from "./IdentityConfidenceService";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class IdentityGraphService {
  private repository: IdentityRepository;
  private graphVersion = 1;

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
   * Returns the entire Identity Graph.
   */
  public getIdentityGraph(): IdentityGraph {
    const rawGraph = this.repository.getGraph() || {};
    const nodes = (rawGraph.nodes || []).map((node) => ({
      ...node,
      confidence: identityConfidenceService.getConfidence(node.id) || undefined,
    }));
    return {
      nodes,
      edges: rawGraph.edges || [],
      graphVersion: this.graphVersion,
    };
  }

  /**
   * Retrieves a single node by its ID.
   */
  public getIdentityNode(nodeId: string): IdentityNode | null {
    const node = this.repository.getNode(nodeId);
    if (!node) return null;
    return {
      ...node,
      confidence: identityConfidenceService.getConfidence(nodeId) || undefined,
    };
  }

  /**
   * Returns all active nodes in the Identity Graph.
   */
  public getIdentityNodes(): IdentityNode[] {
    const nodes = this.repository.getNodes();
    return nodes.map((node) => ({
      ...node,
      confidence: identityConfidenceService.getConfidence(node.id) || undefined,
    }));
  }

  /**
   * Adds a new node to the Identity Graph and emits the identity.node.created event.
   */
  public addIdentityNode(
    aspectType: IdentityAspectType,
    value: string,
    metadata?: Record<string, unknown>,
  ): IdentityNode {
    const node: IdentityNode = {
      id: uid(),
      aspectType,
      value,
      evidenceIds: [], // Maintain references to evidence without embedding objects
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.repository.saveNode(node);
    this.graphVersion++;

    eventService.record(
      Events.IDENTITY_NODE_CREATED as any,
      "Identity Node Created",
      `Created identity aspect node "${aspectType}" with value "${value}"`,
      null,
      null,
      { node },
    );

    return node;
  }

  /**
   * Updates an existing node in the Identity Graph and emits the identity.node.updated event.
   */
  public updateIdentityNode(
    nodeId: string,
    patch: Partial<Omit<IdentityNode, "id" | "createdAt">>,
  ): IdentityNode | null {
    const node = this.repository.getNode(nodeId);
    if (!node) return null;

    const updated: IdentityNode = {
      ...node,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.repository.saveNode(updated);
    this.graphVersion++;

    eventService.record(
      Events.IDENTITY_NODE_UPDATED as any,
      "Identity Node Updated",
      `Updated identity aspect node "${node.aspectType}" value to "${updated.value}"`,
      null,
      null,
      { node: updated, patch },
    );

    return updated;
  }

  /**
   * Removes a node from the Identity Graph.
   * Deletes all connecting edges and emits the identity.node.deleted event.
   */
  public removeIdentityNode(nodeId: string): boolean {
    const node = this.repository.getNode(nodeId);
    if (!node) return false;

    // Remove any connected edges first to maintain referential integrity
    const edges = this.repository.getEdges();
    for (const edge of edges) {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        this.removeIdentityEdge(edge.id);
      }
    }

    this.repository.removeNode(nodeId);
    this.graphVersion++;

    eventService.record(
      Events.IDENTITY_NODE_DELETED as any,
      "Identity Node Deleted",
      `Deleted identity aspect node of type "${node.aspectType}"`,
      null,
      null,
      { node },
    );

    return true;
  }

  /**
   * Adds a relationship edge between two nodes and emits the identity.edge.created event.
   */
  public addIdentityEdge(
    sourceId: string,
    targetId: string,
    type: IdentityEdgeType,
    metadata?: Record<string, unknown>,
  ): IdentityEdge {
    const sourceNode = this.repository.getNode(sourceId);
    const targetNode = this.repository.getNode(targetId);

    if (!sourceNode || !targetNode) {
      throw new Error(
        `Cannot create edge: source node "${sourceId}" or target node "${targetId}" does not exist.`,
      );
    }

    const edge: IdentityEdge = {
      id: uid(),
      sourceId,
      targetId,
      type,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.repository.saveEdge(edge);
    this.graphVersion++;

    eventService.record(
      Events.IDENTITY_EDGE_CREATED as any,
      "Identity Edge Created",
      `Created relationship "${type}" between "${sourceNode.value}" and "${targetNode.value}"`,
      null,
      null,
      { edge },
    );

    return edge;
  }

  /**
   * Removes a relationship edge and emits the identity.edge.deleted event.
   */
  public removeIdentityEdge(edgeId: string): boolean {
    const edge = this.repository.getEdge(edgeId);
    if (!edge) return false;

    this.repository.removeEdge(edgeId);
    this.graphVersion++;

    eventService.record(
      Events.IDENTITY_EDGE_DELETED as any,
      "Identity Edge Deleted",
      `Deleted relationship edge: "${edgeId}"`,
      null,
      null,
      { edge },
    );

    return true;
  }

  /**
   * Returns all edges in the Identity Graph.
   */
  public getIdentityEdges(): IdentityEdge[] {
    return this.repository.getEdges();
  }

  /* Reserved APIs (No implementation required for this sprint) */

  /**
   * Validates the structural integrity of the graph.
   * Reserved for future implementation.
   */
  public validateGraph(): boolean {
    return true;
  }

  /**
   * Searches for nodes in the graph matching criteria.
   * Reserved for future implementation.
   */
  public findNodes(): IdentityNode[] {
    return [];
  }

  /**
   * Searches for edges in the graph matching criteria.
   * Reserved for future implementation.
   */
  public findEdges(): IdentityEdge[] {
    return [];
  }
}

export const identityGraphService = new IdentityGraphService();
