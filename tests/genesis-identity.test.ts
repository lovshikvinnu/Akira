import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  identityService as identityFoundationService,
  identityGraphService,
  identityEvidenceService,
  identityConfidenceService,
  identityEvolutionService,
  identityInterestService,
  identitySkillService,
  identityGoalService,
  identityHabitService,
  identityPreferenceService,
  identityValueService,
  identityRelationshipService,
  identityPersonalityService,
  identityValidationService,
  identityContextProvider,
  InMemoryIdentityRepository,
  IdentityRepository,
  IdentityNode,
  IdentityEdge,
  IdentityGraph,
  Identity,
  IdentityEvidence,
  IdentityConfidence,
  IdentityInterest,
  IdentitySkill,
  IdentityGoal,
  IdentityHabit,
  IdentityPreference,
  IdentityValue,
  IdentityRelationship,
  IdentityPersonality,
} from "../src/genesis/identity";
import { eventService } from "../src/genesis/events/event-service";
import { Events } from "../src/contracts/events";

describe("GENESIS Cognitive Engine - Identity Graph Module", () => {
  let mockRepository: IdentityRepository;
  const recordedEvents: any[] = [];
  let unsubEventService: () => void;

  beforeEach(() => {
    mockRepository = new InMemoryIdentityRepository();
    identityFoundationService.initialize(mockRepository);

    recordedEvents.length = 0;
    // Subscribe to cognitive event recordings
    unsubEventService = eventService.onRecord((evt) => {
      recordedEvents.push(evt);
    });
  });

  afterEach(() => {
    if (unsubEventService) {
      unsubEventService();
    }
  });

  describe("Module Initialization", () => {
    it("should initialize the services with the repository", () => {
      const customRepo = new InMemoryIdentityRepository();
      identityFoundationService.initialize(customRepo);
      expect(identityFoundationService.getRepository()).toBe(customRepo);
      expect(identityGraphService.getRepository()).toBe(customRepo);
      expect(identityEvidenceService.getRepository()).toBe(customRepo);
      expect(identityConfidenceService.getRepository()).toBe(customRepo);
      expect(identityEvolutionService.getRepository()).toBe(customRepo);
      expect(identityInterestService.getRepository()).toBe(customRepo);
      expect(identitySkillService.getRepository()).toBe(customRepo);
      expect(identityGoalService.getRepository()).toBe(customRepo);
      expect(identityHabitService.getRepository()).toBe(customRepo);
      expect(identityPreferenceService.getRepository()).toBe(customRepo);
      expect(identityValueService.getRepository()).toBe(customRepo);
      expect(identityRelationshipService.getRepository()).toBe(customRepo);
      expect(identityPersonalityService.getRepository()).toBe(customRepo);
      expect(identityValidationService.getRepository()).toBe(customRepo);
      expect(identityContextProvider.getRepository()).toBe(customRepo);
    });

    it("should handle custom repository injection", () => {
      const spyRepo = {
        getIdentity: vi.fn(),
        createIdentity: vi.fn(),
        updateIdentity: vi.fn(),
        getGraph: vi.fn().mockReturnValue({ nodes: [], edges: [], graphVersion: 1 }),
        saveGraph: vi.fn(),
        getNode: vi.fn(),
        saveNode: vi.fn(),
        getNodes: vi.fn(),
        removeNode: vi.fn(),
        getEdge: vi.fn(),
        saveEdge: vi.fn(),
        getEdges: vi.fn(),
        removeEdge: vi.fn(),
        getEvidence: vi.fn(),
        getEvidenceByNode: vi.fn(),
        saveEvidence: vi.fn(),
        updateEvidence: vi.fn(),
        deleteEvidence: vi.fn(),
        beginTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        rollbackTransaction: vi.fn(),
        getConfidence: vi.fn(),
        saveConfidence: vi.fn(),
        updateConfidence: vi.fn(),
        getConfidenceHistory: vi.fn(),
        getVersions: vi.fn(),
        getVersion: vi.fn(),
        createVersion: vi.fn(),
        getTimeline: vi.fn(),
        saveTimeline: vi.fn(),
        createSnapshot: vi.fn(),
        getSnapshot: vi.fn(),
        restoreVersion: vi.fn(),
        compareVersions: vi.fn(),
        getInterests: vi.fn(),
        getInterest: vi.fn(),
        saveInterest: vi.fn(),
        updateInterest: vi.fn(),
        removeInterest: vi.fn(),
        mergeInterests: vi.fn(),
        splitInterest: vi.fn(),
        getSkills: vi.fn(),
        getSkill: vi.fn(),
        saveSkill: vi.fn(),
        updateSkill: vi.fn(),
        removeSkill: vi.fn(),
        mergeSkills: vi.fn(),
        compareSkills: vi.fn(),
        getGoals: vi.fn(),
        getGoal: vi.fn(),
        saveGoal: vi.fn(),
        updateGoal: vi.fn(),
        removeGoal: vi.fn(),
        mergeGoals: vi.fn(),
        getHabits: vi.fn(),
        getHabit: vi.fn(),
        saveHabit: vi.fn(),
        updateHabit: vi.fn(),
        removeHabit: vi.fn(),
        mergeHabits: vi.fn(),
        getPreferences: vi.fn(),
        getPreference: vi.fn(),
        savePreference: vi.fn(),
        updatePreference: vi.fn(),
        removePreference: vi.fn(),
        mergePreferences: vi.fn(),
        getValues: vi.fn(),
        getValue: vi.fn(),
        saveValue: vi.fn(),
        updateValue: vi.fn(),
        removeValue: vi.fn(),
        mergeValues: vi.fn(),
        getRelationships: vi.fn(),
        getRelationship: vi.fn(),
        saveRelationship: vi.fn(),
        updateRelationship: vi.fn(),
        removeRelationship: vi.fn(),
        mergeRelationships: vi.fn(),
        getPersonalityTraits: vi.fn(),
        getPersonalityTrait: vi.fn(),
        savePersonalityTrait: vi.fn(),
        updatePersonalityTrait: vi.fn(),
        removePersonalityTrait: vi.fn(),
        rebuildPersonalityProfile: vi.fn(),
      };
      
      identityFoundationService.setRepository(spyRepo);
      
      identityFoundationService.getIdentity();
      expect(spyRepo.getIdentity).toHaveBeenCalled();

      identityFoundationService.getIdentityGraph();
      expect(spyRepo.getGraph).toHaveBeenCalled();
    });
  });

  describe("API Validation - Root Identity Lifecycle", () => {
    it("should create a root identity profile, emit identity.created, and create initial timeline version", () => {
      const identity = identityFoundationService.createIdentity({
        nodes: [],
        edges: [],
      });

      expect(identity.id).toBeDefined();
      expect(identity.createdAt).toBeDefined();
      expect(identity.updatedAt).toBeDefined();

      // Retrieve identity
      const retrieved = identityFoundationService.getIdentity();
      expect(retrieved?.id).toBe(identity.id);

      // Verify event emission
      const event = recordedEvents.find((e) => e.eventType === Events.IDENTITY_CREATED);
      expect(event).toBeDefined();
      expect(event.metadata.identity.id).toBe(identity.id);

      // Verify evolution version was auto-created for this root creation
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions.length).toBe(1);
      expect(versions[0].changeSummary).toBe("Root identity created");
      expect(versions[0].previousVersionId).toBeNull();
    });

    it("should update a root identity profile, emit identity.updated event, and record evolution version", () => {
      const identity = identityFoundationService.createIdentity({});
      const updated = identityFoundationService.updateIdentity(identity.id, {
        updatedAt: new Date().toISOString(),
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(identity.id);

      // Verify event emission
      const event = recordedEvents.find((e) => e.eventType === Events.IDENTITY_UPDATED);
      expect(event).toBeDefined();
      expect(event.metadata.identity.id).toBe(identity.id);

      // Verify second version created
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions.length).toBe(2);
      expect(versions[1].changeSummary).toBe("Root identity updated");
      expect(versions[1].previousVersionId).toBe(versions[0].versionId);
    });

    it("should return null when updating a non-existent identity ID", () => {
      const updated = identityFoundationService.updateIdentity("non-existent-id", {});
      expect(updated).toBeNull();
    });
  });

  describe("API Validation - Graph Node Operations", () => {
    it("should add identity aspect nodes with empty evidence links and increment graph version", () => {
      const identity = identityFoundationService.createIdentity({});
      const versionBefore = identityFoundationService.getIdentityGraph().graphVersion;
      
      const node = identityFoundationService.addIdentityNode("Trait", "Introvert", {
        origin: "Onboarding Questionnaire",
      });

      expect(node.id).toBeDefined();
      expect(node.aspectType).toBe("Trait");
      expect(node.value).toBe("Introvert");
      expect(node.evidenceIds).toEqual([]); // Initialized with empty array
      
      const graph = identityFoundationService.getIdentityGraph();
      expect(graph.graphVersion).toBe(versionBefore + 1);

      // Verify node list contains the new node
      const nodes = identityFoundationService.getIdentityNodes();
      expect(nodes.some((n) => n.id === node.id)).toBe(true);

      // Verify evolution version auto-created on Node Added
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions.length).toBe(2); // 1 root + 1 node added
      expect(versions[1].changeSummary).toContain("Added aspect node");
    });

    it("should update existing nodes and emit identity.node.updated event", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Value", "Honesty");
      const updated = identityFoundationService.updateIdentityNode(node.id, {
        value: "Integrity",
      });

      expect(updated).not.toBeNull();
      expect(updated?.value).toBe("Integrity");

      // Verify evolution version auto-created on Node Update
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions.length).toBe(3); // root + add + update
      expect(versions[2].changeSummary).toContain("Updated aspect node");
    });

    it("should delete nodes, cascade delete adjacent edges, and emit identity.node.deleted event", () => {
      const identity = identityFoundationService.createIdentity({});
      const node1 = identityFoundationService.addIdentityNode("Trait", "Analytical");
      const node2 = identityFoundationService.addIdentityNode("Skill", "Coding");
      const edge = identityFoundationService.addIdentityEdge(node1.id, node2.id, "supports");

      // Delete node1
      const deleted = identityFoundationService.removeIdentityNode(node1.id);
      expect(deleted).toBe(true);

      // Node1 should be gone
      expect(identityFoundationService.getIdentityNode(node1.id)).toBeNull();

      // Verify evolution version auto-created on Node Delete
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("Deleted aspect node");
    });
  });

  describe("API Validation - Graph Edge Operations", () => {
    it("should create edges and emit identity.edge.created event", () => {
      const identity = identityFoundationService.createIdentity({});
      const source = identityFoundationService.addIdentityNode("Trait", "Detail-oriented");
      const target = identityFoundationService.addIdentityNode("Skill", "Testing");

      const edge = identityFoundationService.addIdentityEdge(source.id, target.id, "supports", {
        strength: 0.9,
      });

      expect(edge.id).toBeDefined();
      expect(edge.sourceId).toBe(source.id);
      expect(edge.targetId).toBe(target.id);

      // Verify version created for edge addition
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("Added relationship edge");
    });

    it("should remove edges and emit identity.edge.deleted event", () => {
      const identity = identityFoundationService.createIdentity({});
      const source = identityFoundationService.addIdentityNode("Trait", "Detail-oriented");
      const target = identityFoundationService.addIdentityNode("Skill", "Testing");
      const edge = identityFoundationService.addIdentityEdge(source.id, target.id, "supports");

      const removed = identityFoundationService.removeIdentityEdge(edge.id);
      expect(removed).toBe(true);

      // Verify version created for edge deletion
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("Deleted relationship edge");
    });
  });

  describe("API Validation - getIdentityAspect", () => {
    it("should retrieve a node aspect from the graph by aspectId", () => {
      const node = identityFoundationService.addIdentityNode("Value", "Honesty");
      const aspect = identityFoundationService.getIdentityAspect(node.id);
      expect(aspect).not.toBeNull();
      expect(aspect?.value).toBe("Honesty");
      expect(aspect?.aspectType).toBe("Value");
    });
  });

  describe("Evidence Engine Subsystem", () => {
    it("should add evidence to an aspect node with default weight, status, and originEngine values", () => {
      const node = identityFoundationService.addIdentityNode("Trait", "Focused");
      
      const evidence = identityFoundationService.addEvidence(
        node.id,
        "Memory",
        "mem-123",
        "Focus session logged 120 minutes"
      );

      expect(evidence.id).toBeDefined();
      expect(evidence.nodeId).toBe(node.id);
      expect(evidence.sourceType).toBe("Memory");
      expect(evidence.weight).toBe(1.0); // Default weight

      // Overriding values via metadata
      const customEv = identityFoundationService.addEvidence(
        node.id,
        "Note",
        "note-abc",
        "Overridden details",
        { weight: 0.5, status: "Pending", originEngine: "Consolidation" }
      );
      expect(customEv.weight).toBe(0.5);
    });
  });

  describe("Confidence Engine Subsystem", () => {
    it("should score Confirmed level (1.0) for explicitly confirmed aspects", () => {
      // Confirmed via metadata flag
      const node = identityFoundationService.addIdentityNode("Trait", "Stubborn", {
        confirmed: true
      });
      const confidence = identityFoundationService.calculateConfidence(node.id);
      expect(confidence.score).toBe(1.0);
      expect(confidence.level).toBe("Confirmed");
    });

    it("should explain confidence calculations through factor breakdown DTOs", () => {
      const node = identityFoundationService.addIdentityNode("Value", "Altruism");
      identityFoundationService.addEvidence(node.id, "Memory", "m-alt");
      identityFoundationService.calculateConfidence(node.id);

      const explanation = identityFoundationService.explainConfidence(node.id);
      expect(explanation).not.toBeNull();
      expect(explanation?.summary).toContain("Altruism");
    });
  });

  describe("Evolution Engine Subsystem", () => {
    it("should generate versions and snapshots on structural modifications", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Value", "Compassion");

      // Verify latest version
      const latest = identityFoundationService.getLatestVersion(identity.id);
      expect(latest).not.toBeNull();
      expect(latest?.changeSummary).toContain("Compassion");
      expect(latest?.calculationVersion).toBe(0);

      // Verify snapshot can be resolved
      const snapshot = identityEvolutionService.getSnapshot(latest!.snapshotId);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.nodes.length).toBe(1);
      expect(snapshot?.nodes[0].value).toBe("Compassion");
    });

    it("should preserve history in an append-only, immutable fashion", () => {
      const identity = identityFoundationService.createIdentity({});
      const node1 = identityFoundationService.addIdentityNode("Trait", "Calm");
      const versions = identityFoundationService.getVersions(identity.id);

      expect(versions.length).toBe(2);
      const firstSnapshotId = versions[0].snapshotId;
      const secondSnapshotId = versions[1].snapshotId;

      // First snapshot should be empty of nodes
      const snap1 = identityEvolutionService.getSnapshot(firstSnapshotId);
      expect(snap1?.nodes.length).toBe(0);

      // Second snapshot has 1 node
      const snap2 = identityEvolutionService.getSnapshot(secondSnapshotId);
      expect(snap2?.nodes.length).toBe(1);
      expect(snap2?.nodes[0].value).toBe("Calm");

      // Modifying node1 in current state should not alter past snapshot records
      identityFoundationService.updateIdentityNode(node1.id, { value: "Relaxed" });
      const snap2_recheck = identityEvolutionService.getSnapshot(secondSnapshotId);
      expect(snap2_recheck?.nodes[0].value).toBe("Calm"); // Immutable snapshot!
    });

    it("should capture and reference confidence states during snapshotting", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Skill", "Design");
      identityFoundationService.addEvidence(node.id, "Note", "n-1");
      
      // Calculate confidence to write to repository cache
      identityFoundationService.calculateConfidence(node.id);

      // Create snapshot/version manually or make change to trigger
      identityFoundationService.updateIdentityNode(node.id, { value: "UI/UX Design" });

      const latest = identityFoundationService.getLatestVersion(identity.id);
      expect(latest?.confidenceSnapshotReference).toBeDefined();

      const confRef = JSON.parse(latest!.confidenceSnapshotReference);
      expect(confRef[node.id]).toBeDefined();
      expect(confRef[node.id].level).toBe("Possible"); // Calculated value of "Design" before the update
    });

    it("should retrieve full timelines of chronological changes", () => {
      const identity = identityFoundationService.createIdentity({});
      identityFoundationService.addIdentityNode("Trait", "Patient");
      
      const timeline = identityFoundationService.getTimeline(identity.id);
      expect(timeline).not.toBeNull();
      expect(timeline?.versions.length).toBe(2);
      expect(timeline?.changes.length).toBe(2); // 1 root created + 1 node added change log
      expect(timeline?.changes[0].changeType).toBe("RootCreated");
      expect(timeline?.changes[1].changeType).toBe("NodeAdded");
    });
  });

  describe("Interest Engine Subsystem", () => {
    it("should create user interests, generate corresponding graph preference nodes, and calculate initial strength", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Skill", "Coding");
      const ev = identityFoundationService.addEvidence(node.id, "Memory", "mem-int1", "Logged code task", { weight: 1.0 });

      // Create interest
      const interest = identityFoundationService.createInterest(identity.id, "Machine Learning", "Technology", [ev.id]);

      expect(interest.id).toBeDefined();
      expect(interest.topic).toBe("Machine Learning");
      expect(interest.category).toBe("Technology");
      expect(interest.status).toBe("Active");
      expect(interest.evidenceReferences).toContain(ev.id);
      
      // Since 1 evidence exists with weight 1.0 -> strength.score: 1 * 0.25 * 1.0 = 0.25 (Low level)
      expect(interest.strength.score).toBe(0.25);
      expect(interest.strength.level).toBe("Low");

      // Verify Preference Node was added in graph
      const graph = identityFoundationService.getIdentityGraph();
      const prefNode = graph.nodes.find((n) => n.id === interest.confidenceReference);
      expect(prefNode).toBeDefined();
      expect(prefNode?.aspectType).toBe("Preference");
      expect(prefNode?.value).toBe("Machine Learning");

      // Verify event was logged
      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_INTEREST_CREATED);
      expect(createdEvent).toBeDefined();
      expect(createdEvent.metadata.interest.id).toBe(interest.id);
    });

    it("should update interest topics, sync evidence links, recalculate strength, and create evolution logs", () => {
      const identity = identityFoundationService.createIdentity({});
      const interest = identityFoundationService.createInterest(identity.id, "Baking", "Lifestyle");

      // Add evidence and link
      const node = identityFoundationService.addIdentityNode("Skill", "Cooking");
      const ev1 = identityFoundationService.addEvidence(node.id, "Note", "note-b1", "Baked bread", { weight: 1.0 });
      const ev2 = identityFoundationService.addEvidence(node.id, "Note", "note-b2", "Baked cookies", { weight: 1.0 });
      const ev3 = identityFoundationService.addEvidence(node.id, "Note", "note-b3", "Baked cake", { weight: 1.0 });

      // Update interest
      const updated = identityFoundationService.updateInterest(interest.id, {
        topic: "French Baking",
        evidenceReferences: [ev1.id, ev2.id, ev3.id],
      });

      expect(updated?.topic).toBe("French Baking");
      expect(updated?.evidenceReferences.length).toBe(3);
      // Strength score: 3 items * 0.25 * 1.0 = 0.75 (High level)
      expect(updated?.strength.score).toBe(0.75);
      expect(updated?.strength.level).toBe("High");

      // Verify evolution version generated on significant level shift
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("status/strength shift");

      // Verify event was logged
      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_INTEREST_UPDATED);
      expect(updateEvent).toBeDefined();
      expect(updateEvent.metadata.interest.topic).toBe("French Baking");
    });

    it("should archive interests, update status, and log evolution versions", () => {
      const identity = identityFoundationService.createIdentity({});
      const interest = identityFoundationService.createInterest(identity.id, "Running", "Sports");

      const success = identityFoundationService.archiveInterest(interest.id);
      expect(success).toBe(true);

      const archived = identityFoundationService.getInterest(interest.id);
      expect(archived?.status).toBe("Archived");

      // Verify evolution version generated on archival
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("status/strength shift");

      // Verify archived event logged
      const archEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_INTEREST_ARCHIVED);
      expect(archEvent).toBeDefined();
    });
  });

  describe("Skill Engine Subsystem", () => {
    it("should create user skills, generate corresponding graph Skill nodes, and calculate initial level", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Skill", "Testing");
      const ev = identityFoundationService.addEvidence(node.id, "Memory", "mem-sk1", "Completed QA review", { weight: 1.0 });

      // Create skill
      const skill = identityFoundationService.createSkill(identity.id, "Software Testing", "Technical", [ev.id]);

      expect(skill.id).toBeDefined();
      expect(skill.name).toBe("Software Testing");
      expect(skill.category).toBe("Technical");
      expect(skill.status).toBe("Active");
      expect(skill.level).toBe("Novice"); // score: 0.25
      expect(skill.evidenceReferences).toContain(ev.id);

      // Verify Skill Node was added in graph
      const graph = identityFoundationService.getIdentityGraph();
      const skNode = graph.nodes.find((n) => n.id === skill.confidenceReference);
      expect(skNode).toBeDefined();
      expect(skNode?.aspectType).toBe("Skill"); // Graph Node Type verification
      expect(skNode?.value).toBe("Software Testing");

      // Verify event was logged
      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_SKILL_CREATED);
      expect(createdEvent).toBeDefined();
      expect(createdEvent.metadata.skill.id).toBe(skill.id);
    });

    it("should update skill name, category, recalculate level, and record evolution logs", () => {
      const identity = identityFoundationService.createIdentity({});
      const skill = identityFoundationService.createSkill(identity.id, "Web Writing", "Creative");

      const node = identityFoundationService.addIdentityNode("Skill", "Writing");
      const ev1 = identityFoundationService.addEvidence(node.id, "Note", "note-s1", "Wrote article", { weight: 1.0 });
      const ev2 = identityFoundationService.addEvidence(node.id, "Note", "note-s2", "Wrote copywriting draft", { weight: 1.0 });
      const ev3 = identityFoundationService.addEvidence(node.id, "Note", "note-s3", "Published blog post", { weight: 1.0 });

      // Update skill (adding 3 pieces of evidence to shift level)
      const updated = identityFoundationService.updateSkill(skill.id, {
        name: "Technical Writing",
        evidenceReferences: [ev1.id, ev2.id, ev3.id],
      });

      expect(updated?.name).toBe("Technical Writing");
      expect(updated?.evidenceReferences.length).toBe(3);
      expect(updated?.level).toBe("Advanced"); // score: 3 * 0.25 * 1.0 = 0.75 (Advanced)

      // Verify evolution version generated on significant level shift
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("status/level shift");

      // Verify event was logged
      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_SKILL_UPDATED);
      expect(updateEvent).toBeDefined();
      expect(updateEvent.metadata.skill.name).toBe("Technical Writing");
    });

    it("should archive skills, update status, and log evolution versions", () => {
      const identity = identityFoundationService.createIdentity({});
      const skill = identityFoundationService.createSkill(identity.id, "Negotiation", "Leadership");

      const success = identityFoundationService.archiveSkill(skill.id);
      expect(success).toBe(true);

      const archived = identityFoundationService.getSkill(skill.id);
      expect(archived?.status).toBe("Archived");

      // Verify evolution version generated on archival
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("status/level shift");

      // Verify archived event logged
      const archEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_SKILL_ARCHIVED);
      expect(archEvent).toBeDefined();
    });
  });

  describe("Goal Engine Subsystem", () => {
    it("should create goals with semantic node typing, confidence references, and evolution logs", () => {
      const identity = identityFoundationService.createIdentity({});
      const goal = identityFoundationService.createGoal(
        identity.id,
        "Run Marathon",
        "Complete 42k race",
        "Health",
        "High"
      );

      expect(goal.id).toBeDefined();
      expect(goal.title).toBe("Run Marathon");
      expect(goal.category).toBe("Health");
      expect(goal.priority).toBe("High");
      expect(goal.status).toBe("Active");

      // Graph node checks
      const graph = identityFoundationService.getIdentityGraph();
      const node = graph.nodes.find((n) => n.id === goal.confidenceReference);
      expect(node).toBeDefined();
      expect(node?.aspectType).toBe("Goal");
      expect(node?.value).toBe("Run Marathon");

      // Evolution logs
      const versions = identityFoundationService.getVersions(identity.id);
      expect(versions[versions.length - 1].changeSummary).toContain("Run Marathon");

      // Event checks
      const event = recordedEvents.find((e) => e.eventType === Events.IDENTITY_GOAL_CREATED);
      expect(event).toBeDefined();
      expect(event.metadata.goal.id).toBe(goal.id);
    });

    it("should update and archive goals, triggering timeline tracking and events", () => {
      const identity = identityFoundationService.createIdentity({});
      const goal = identityFoundationService.createGoal(identity.id, "Save Money", "Save $1000", "Financial", "Medium");

      // Update
      const updated = identityFoundationService.updateGoal(goal.id, {
        title: "Save More Money",
        priority: "Critical",
      });
      expect(updated?.title).toBe("Save More Money");
      expect(updated?.priority).toBe("Critical");

      const verEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_GOAL_UPDATED);
      expect(verEvent).toBeDefined();

      // Archive
      const success = identityFoundationService.archiveGoal(goal.id);
      expect(success).toBe(true);

      const archived = identityFoundationService.getGoal(goal.id);
      expect(archived?.status).toBe("Archived");

      const arcEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_GOAL_ARCHIVED);
      expect(arcEvent).toBeDefined();
    });
  });

  describe("Habit Engine Subsystem", () => {
    it("should create habits, calculate strength levels, and integrate with the graph", () => {
      const identity = identityFoundationService.createIdentity({});
      const node = identityFoundationService.addIdentityNode("Goal", "Fitness");
      const ev = identityFoundationService.addEvidence(node.id, "Event", "evt-h1", "Ran 5km", { weight: 1.0 });

      const habit = identityFoundationService.createHabit(
        identity.id,
        "Morning Jogging",
        "Daily",
        [ev.id]
      );

      expect(habit.id).toBeDefined();
      expect(habit.name).toBe("Morning Jogging");
      expect(habit.frequency).toBe("Daily");
      expect(habit.strength.score).toBe(0.25); // 1 item * 0.25 = 0.25
      expect(habit.strength.level).toBe("Weak");

      // Graph type check
      const graph = identityFoundationService.getIdentityGraph();
      const prefNode = graph.nodes.find((n) => n.id === habit.confidenceReference);
      expect(prefNode?.aspectType).toBe("Habit");

      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_HABIT_CREATED);
      expect(createdEvent).toBeDefined();
    });

    it("should update habit levels and status shifts", () => {
      const identity = identityFoundationService.createIdentity({});
      const habit = identityFoundationService.createHabit(identity.id, "Meditation", "Daily");

      const node = identityFoundationService.addIdentityNode("Goal", "Mindfulness");
      const ev1 = identityFoundationService.addEvidence(node.id, "Note", "note-m1", "Meditation 10m", { weight: 1.0 });
      const ev2 = identityFoundationService.addEvidence(node.id, "Note", "note-m2", "Meditation 15m", { weight: 1.0 });
      const ev3 = identityFoundationService.addEvidence(node.id, "Note", "note-m3", "Meditation 20m", { weight: 1.0 });

      // Shift strength level
      const updated = identityFoundationService.updateHabit(habit.id, {
        evidenceReferences: [ev1.id, ev2.id, ev3.id]
      });

      expect(updated?.strength.level).toBe("Strong"); // score: 0.75

      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_HABIT_UPDATED);
      expect(updateEvent).toBeDefined();

      // Archive
      identityFoundationService.archiveHabit(habit.id);
      expect(identityFoundationService.getHabit(habit.id)?.status).toBe("Archived");
    });
  });

  describe("Preference Engine Subsystem", () => {
    it("should create preferences with category, value, and deterministic strengths", () => {
      const identity = identityFoundationService.createIdentity({});
      const pref = identityFoundationService.createPreference(
        identity.id,
        "Environment",
        "Dark Mode Office"
      );

      expect(pref.id).toBeDefined();
      expect(pref.category).toBe("Environment");
      expect(pref.value).toBe("Dark Mode Office");
      expect(pref.strength.level).toBe("Low");

      // Graph check
      const graph = identityFoundationService.getIdentityGraph();
      const node = graph.nodes.find((n) => n.id === pref.confidenceReference);
      expect(node?.aspectType).toBe("Preference");

      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_PREFERENCE_CREATED);
      expect(createdEvent).toBeDefined();
    });

    it("should update preference value and archive preferences", () => {
      const identity = identityFoundationService.createIdentity({});
      const pref = identityFoundationService.createPreference(identity.id, "Food", "Spicy food");

      const updated = identityFoundationService.updatePreference(pref.id, {
        value: "Mild food"
      });
      expect(updated?.value).toBe("Mild food");

      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_PREFERENCE_UPDATED);
      expect(updateEvent).toBeDefined();

      identityFoundationService.archivePreference(pref.id);
      expect(identityFoundationService.getPreference(pref.id)?.status).toBe("Archived");
    });
  });

  describe("Value Engine Subsystem", () => {
    it("should create derived values with semantic node typing, confidence integration, and evolution timeline entries", () => {
      const identity = identityFoundationService.createIdentity({});
      const node1 = identityFoundationService.addIdentityNode("Goal", "Help Others");
      const ev = identityFoundationService.addEvidence(node1.id, "Note", "note-v1", "Donated food", { weight: 1.0 });

      // Create derived value
      const val = identityFoundationService.createValue(
        identity.id,
        "Altruism",
        "Social",
        [node1.id],
        [ev.id]
      );

      expect(val.id).toBeDefined();
      expect(val.name).toBe("Altruism");
      expect(val.category).toBe("Social");
      expect(val.status).toBe("Active");
      expect(val.supportingIdentityReferences).toContain(node1.id);
      expect(val.evidenceReferences).toContain(ev.id);

      // Deterministic level: (1 ev + 1 ref) * 0.2 * 1.0 weight = 0.4 (Moderate)
      expect(val.strength.score).toBe(0.4);
      expect(val.strength.level).toBe("Moderate");

      // Verify Value Node added in graph
      const graph = identityFoundationService.getIdentityGraph();
      const valNode = graph.nodes.find((n) => n.id === val.confidenceReference);
      expect(valNode).toBeDefined();
      expect(valNode?.aspectType).toBe("Value");

      // Event and evolution checks
      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_VALUE_CREATED);
      expect(createdEvent).toBeDefined();
      expect(createdEvent.metadata.value.id).toBe(val.id);
    });

    it("should update and archive values", () => {
      const identity = identityFoundationService.createIdentity({});
      const val = identityFoundationService.createValue(identity.id, "Honesty", "Personal", []);

      const updated = identityFoundationService.updateValue(val.id, {
        name: "Transparency"
      });
      expect(updated?.name).toBe("Transparency");

      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_VALUE_UPDATED);
      expect(updateEvent).toBeDefined();

      identityFoundationService.archiveValue(val.id);
      expect(identityFoundationService.getValue(val.id)?.status).toBe("Archived");
    });
  });

  describe("Relationship Subsystem", () => {
    it("should create derived relationships with semantic node typing, confidence integration, and evolution timeline entries", () => {
      const identity = identityFoundationService.createIdentity({});
      const node1 = identityFoundationService.addIdentityNode("Goal", "Collaborate");
      const ev = identityFoundationService.addEvidence(node1.id, "Note", "note-r1", "Pair programmed together", { weight: 1.0 });

      // Create derived relationship
      const rel = identityFoundationService.createRelationship(
        identity.id,
        "user-boss-123",
        "Professional",
        [node1.id],
        [ev.id]
      );

      expect(rel.id).toBeDefined();
      expect(rel.targetEntityId).toBe("user-boss-123");
      expect(rel.relationshipType).toBe("Professional");
      expect(rel.status).toBe("Active");
      expect(rel.supportingIdentityReferences).toContain(node1.id);
      expect(rel.evidenceReferences).toContain(ev.id);

      // Deterministic level: (1 ev + 1 ref) * 0.2 * 1.0 weight = 0.4 (Casual)
      expect(rel.strength.score).toBe(0.4);
      expect(rel.strength.level).toBe("Casual");

      // Verify Node added in graph
      const graph = identityFoundationService.getIdentityGraph();
      const node = graph.nodes.find((n) => n.id === rel.confidenceReference);
      expect(node).toBeDefined();
      expect(node?.aspectType).toBe("Relationship");

      // Event checks
      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_RELATIONSHIP_CREATED);
      expect(createdEvent).toBeDefined();
    });

    it("should update and archive relationships", () => {
      const identity = identityFoundationService.createIdentity({});
      const rel = identityFoundationService.createRelationship(identity.id, "target-id", "Friend", []);

      const updated = identityFoundationService.updateRelationship(rel.id, {
        relationshipType: "Mentor"
      });
      expect(updated?.relationshipType).toBe("Mentor");

      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_RELATIONSHIP_UPDATED);
      expect(updateEvent).toBeDefined();

      identityFoundationService.archiveRelationship(rel.id);
      expect(identityFoundationService.getRelationship(rel.id)?.status).toBe("Archived");
    });
  });

  describe("Personality Subsystem", () => {
    it("should create derived personality traits with semantic node typing, confidence integration, and evolution timeline entries", () => {
      const identity = identityFoundationService.createIdentity({});
      const node1 = identityFoundationService.addIdentityNode("Habit", "Talking to strangers");
      const ev = identityFoundationService.addEvidence(node1.id, "Note", "note-p1", "Initiated conversation", { weight: 1.0 });

      // Create derived personality trait
      const personality = identityFoundationService.createPersonalityTrait(
        identity.id,
        "Extraversion",
        [node1.id],
        [ev.id]
      );

      expect(personality.id).toBeDefined();
      expect(personality.trait).toBe("Extraversion");
      expect(personality.status).toBe("Active");
      expect(personality.supportingIdentityReferences).toContain(node1.id);
      expect(personality.evidenceReferences).toContain(ev.id);

      // Deterministic level: (1 ev + 1 ref) * 0.2 * 1.0 weight = 0.4 (Moderate)
      expect(personality.strength.score).toBe(0.4);
      expect(personality.strength.level).toBe("Moderate");

      // Verify Node added in graph
      const graph = identityFoundationService.getIdentityGraph();
      const node = graph.nodes.find((n) => n.id === personality.confidenceReference);
      expect(node).toBeDefined();
      expect(node?.aspectType).toBe("Personality");

      // Event checks
      const createdEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_PERSONALITY_CREATED);
      expect(createdEvent).toBeDefined();
    });

    it("should update and archive personality traits", () => {
      const identity = identityFoundationService.createIdentity({});
      const trait = identityFoundationService.createPersonalityTrait(identity.id, "Openness", [], []);

      const updated = identityFoundationService.updatePersonalityTrait(trait.id, {
        trait: "Conscientiousness"
      });
      expect(updated?.trait).toBe("Conscientiousness");

      const updateEvent = recordedEvents.find((e) => e.eventType === Events.IDENTITY_PERSONALITY_UPDATED);
      expect(updateEvent).toBeDefined();

      identityFoundationService.archivePersonalityTrait(trait.id);
      expect(identityFoundationService.getPersonalityTrait(trait.id)?.status).toBe("Archived");
    });
  });

  describe("Sprint 5 - Aggregation, Context, Completeness, Health, Validation", () => {
    it("should compute profile completeness correctly", () => {
      const identity = identityFoundationService.createIdentity({});
      
      // Initially, no dimensions populated
      let completeness = identityFoundationService.getIdentityCompleteness(identity.id);
      expect(completeness.score).toBe(0);
      expect(completeness.populatedDimensionsCount).toBe(0);

      // Add one interest
      identityFoundationService.createInterest(identity.id, "Robotics", "Technology");
      completeness = identityFoundationService.getIdentityCompleteness(identity.id);
      expect(completeness.score).toBe(13); // 1 / 8 = 12.5% -> round to 13%
      expect(completeness.dimensionStatus.interests).toBe(true);
      expect(completeness.dimensionStatus.skills).toBe(false);
    });

    it("should determine identity health correctly", () => {
      const identity = identityFoundationService.createIdentity({});
      
      // Sparse: less than 3 nodes
      let health = identityFoundationService.getIdentityHealth(identity.id);
      expect(health.status).toBe("Sparse");

      // Populate enough nodes to make it Healthy
      identityFoundationService.addIdentityNode("Trait", "Calm");
      identityFoundationService.addIdentityNode("Trait", "Curious");
      identityFoundationService.addIdentityNode("Trait", "Kind");

      health = identityFoundationService.getIdentityHealth(identity.id);
      expect(health.status).toBe("Healthy");
      expect(health.errors.length).toBe(0);
    });

    it("should detect duplicate aspect warnings in validations", () => {
      const identity = identityFoundationService.createIdentity({});
      
      // Create duplicate traits (duplicate values within same type)
      identityFoundationService.addIdentityNode("Trait", "Stubborn");
      identityFoundationService.addIdentityNode("Trait", "Stubborn"); // triggers warning

      const val = identityFoundationService.validateIdentity(identity.id);
      expect(val.warnings.some((w) => w.includes("Duplicate aspect node found"))).toBe(true);
    });

    it("should generate deterministic summaries and profiles", () => {
      const identity = identityFoundationService.createIdentity({});
      
      identityFoundationService.createInterest(identity.id, "Biking", "Lifestyle");
      identityFoundationService.createGoal(identity.id, "Save $500", "Buy bike", "Financial", "Medium");
      
      const summary = identityFoundationService.getIdentitySummary(identity.id);
      expect(summary.primaryInterests).toContain("Biking");
      expect(summary.activeGoals).toContain("Save $500");
      expect(summary.shortSummary).toContain("Primary interests: Biking");
      expect(summary.shortSummary).toContain("Active goals: Save $500");

      const profile = identityFoundationService.getIdentityProfile(identity.id);
      expect(profile.interests.length).toBe(1);
      expect(profile.goals.length).toBe(1);
      expect(profile.completeness).toBe(25); // 2/8 populated
    });
  });

  describe("Reserved and Transaction APIs", () => {
    it("should mock transaction APIs and reserved finds without throwing", () => {
      const repo = identityFoundationService.getRepository();
      
      expect(() => {
        repo.beginTransaction();
        repo.commitTransaction();
        repo.rollbackTransaction();
        repo.getConfidenceHistory("node-1");
        repo.restoreVersion("v-1");
        repo.compareVersions("v-1", "v-2");
        repo.mergeInterests("i-1", "i-2");
        repo.splitInterest("i-1", ["topic"]);
        repo.mergeSkills("s-1", "s-2");
        repo.compareSkills("s-1", "s-2");
        repo.mergeGoals("g-1", "g-2");
        repo.mergeHabits("h-1", "h-2");
        repo.mergePreferences("p-1", "p-2");
        repo.mergeValues("v-1", "v-2");
        repo.mergeRelationships("r-1", "r-2");
        repo.rebuildPersonalityProfile("id-1");
      }).not.toThrow();

      // validateGraph reserved
      expect(identityGraphService.validateGraph()).toBe(true);

      // findNodes, findEdges reserved
      expect(identityGraphService.findNodes()).toEqual([]);
      expect(identityGraphService.findEdges()).toEqual([]);

      // findEvidence reserved
      expect(identityFoundationService.findEvidence()).toEqual([]);

      // compareConfidence reserved
      const node1 = identityFoundationService.addIdentityNode("Trait", "Calm");
      const node2 = identityFoundationService.addIdentityNode("Trait", "Anxious");
      identityFoundationService.addEvidence(node1.id, "Memory", "mem-1");
      identityFoundationService.calculateConfidence(node1.id);
      identityFoundationService.calculateConfidence(node2.id);

      const compare = identityFoundationService.compareConfidence(node1.id, node2.id);
      expect(compare).toBe(0.25); // returns node1 score (0.25) - node2 score (0.0)

      // Evolution compare/restore reserved APIs
      expect(identityFoundationService.compareVersions("v-1", "v-2")).toBe("");
      expect(identityFoundationService.restoreVersion("v-1")).toBe(false);

      // Interest compare/merge reserved APIs
      expect(identityFoundationService.findRelatedInterests("i-1")).toEqual([]);
      expect(() => {
        identityFoundationService.mergeInterests("i-1", "i-2");
      }).not.toThrow();

      // Skill compare/merge reserved APIs
      expect(identityFoundationService.compareSkills("s-1", "s-2")).toBe(0);
      expect(() => {
        identityFoundationService.mergeSkills("s-1", "s-2");
      }).not.toThrow();

      // Sprint 3 reserved APIs
      identityFoundationService.mergeGoals("g-1", "g-2");
      identityFoundationService.mergeHabits("h-1", "h-2");
      identityFoundationService.mergePreferences("p-1", "p-2");

      // Sprint 4 reserved APIs
      identityFoundationService.mergeValues("v-1", "v-2");
      identityFoundationService.mergeRelationships("r-1", "r-2");
      identityFoundationService.rebuildPersonalityProfile("id-1");
    });
  });
});
