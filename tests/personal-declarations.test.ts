import { describe, it, expect, beforeEach } from "vitest";
import { memoryService, validationEngine } from "../src/genesis/memory/memory-service";
import { candidateService } from "../src/genesis/candidate/candidate-service";
import { eventService } from "../src/genesis/events/event-service";
import { understandingEngine } from "../src/genesis/understanding/engine";
import { identityService } from "../src/genesis/understanding/identity-service";
import { identityService as identityFoundationService } from "../src/genesis/identity";

describe("GENESIS - Personal Declaration Understanding", () => {
  beforeEach(() => {
    // Re-initialize and clear state
    memoryService.clearHistory();
    candidateService.clearHistory();
    validationEngine.initialize();
    memoryService.initialize();
    understandingEngine.dispose();
    understandingEngine.initialize();
    identityService.clearHistory();
    
    // Setup clean identity graph repository
    identityFoundationService.initialize();
  });

  describe("Goals", () => {
    it("should extract goal from 'My dream is to become a pilot.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: My dream is to become a pilot."
      );
      
      const understandings = understandingEngine.getUnderstandings();
      const goalU = understandings.find((u) => u.category === "Goal");
      expect(goalU).toBeDefined();
      expect(goalU?.canonicalKey).toBe("goal:become-a-pilot");
      expect(goalU?.confidence).toBe("High");
      expect(goalU?.status).toBe("Active");

      // Verify Identity Observations (Emergent Cache)
      const observations = identityService.getObservations();
      const goalObs = observations.find((o) => o.category === "Aspiration");
      expect(goalObs).toBeDefined();
      expect(goalObs?.name).toBe("become a pilot"); // exact user wording preserved

      // Verify Core Identity Graph
      const identity = identityFoundationService.getIdentity();
      expect(identity).not.toBeNull();
      const goals = identityFoundationService.getGoals(identity!.id);
      expect(goals.some((g) => g.title === "become a pilot")).toBe(true);
    });

    it("should extract goal from 'Pilot is my dream.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: Pilot is my dream."
      );
      
      const understandings = understandingEngine.getUnderstandings();
      const goalU = understandings.find((u) => u.category === "Goal");
      expect(goalU).toBeDefined();
      expect(goalU?.canonicalKey).toBe("goal:pilot");

      const observations = identityService.getObservations();
      const goalObs = observations.find((o) => o.category === "Aspiration");
      expect(goalObs?.name).toBe("pilot"); // first letter lowercased because it was the first word
    });

    it("should extract goal from 'My goal is to build AKIRA.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: My goal is to build AKIRA."
      );
      
      const understandings = understandingEngine.getUnderstandings();
      const goalU = understandings.find((u) => u.category === "Goal");
      expect(goalU).toBeDefined();
      expect(goalU?.canonicalKey).toBe("goal:build-akira");

      const observations = identityService.getObservations();
      const goalObs = observations.find((o) => o.category === "Aspiration");
      expect(goalObs?.name).toBe("build AKIRA"); // exact casing preserved
    });

    it("should extract goal from 'I aspire to become a researcher.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I aspire to become a researcher."
      );
      
      const understandings = understandingEngine.getUnderstandings();
      const goalU = understandings.find((u) => u.category === "Goal");
      expect(goalU).toBeDefined();
      expect(goalU?.canonicalKey).toBe("goal:become-a-researcher");

      const observations = identityService.getObservations();
      const goalObs = observations.find((o) => o.category === "Aspiration");
      expect(goalObs?.name).toBe("become a researcher"); // exact casing preserved
    });
  });

  describe("Profession Invariance (Generic / Domain-Agnostic Checking)", () => {
    const professions = ["doctor", "engineer", "scientist", "teacher", "programmer"];

    professions.forEach((prof) => {
      it(`should treat '${prof}' generically and extract it cleanly with lowercase casing`, () => {
        // Test capitalized first word
        const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        const query = `${capitalize(prof)} is my dream.`;
        
        eventService.record(
          "note_created",
          "Workspace Interaction",
          `User query: ${query}`
        );

        const understandings = understandingEngine.getUnderstandings();
        const goalU = understandings.find((u) => u.category === "Goal");
        expect(goalU).toBeDefined();
        expect(goalU?.canonicalKey).toBe(`goal:${prof}`);

        const observations = identityService.getObservations();
        const goalObs = observations.find((o) => o.category === "Aspiration");
        expect(goalObs?.name).toBe(prof);
      });
    });
  });

  describe("Interests", () => {
    it("should extract interest from 'I love robotics.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I love robotics."
      );

      const understandings = understandingEngine.getUnderstandings();
      const interestU = understandings.find((u) => u.category === "Interest");
      expect(interestU).toBeDefined();
      expect(interestU?.canonicalKey).toBe("interest:robotics");

      const observations = identityService.getObservations();
      const interestObs = observations.find((o) => o.category === "Interest");
      expect(interestObs?.name).toBe("robotics");

      const identity = identityFoundationService.getIdentity();
      const interests = identityFoundationService.getInterests(identity!.id);
      expect(interests.some((i) => i.topic === "robotics")).toBe(true);
    });

    it("should extract interest from 'I'm interested in embedded systems.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I'm interested in embedded systems."
      );

      const understandings = understandingEngine.getUnderstandings();
      const interestU = understandings.find((u) => u.category === "Interest");
      expect(interestU).toBeDefined();
      expect(interestU?.canonicalKey).toBe("interest:embedded-systems");
    });
  });

  describe("Preferences", () => {
    it("should extract preference from 'I prefer tea.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I prefer tea."
      );

      const understandings = understandingEngine.getUnderstandings();
      const prefU = understandings.find((u) => u.category === "Preference");
      expect(prefU).toBeDefined();
      expect(prefU?.canonicalKey).toBe("preference:tea");

      const observations = identityService.getObservations();
      const prefObs = observations.find((o) => o.category === "Preference");
      expect(prefObs?.name).toBe("tea");

      const identity = identityFoundationService.getIdentity();
      const prefs = identityFoundationService.getPreferences(identity!.id);
      expect(prefs.some((p) => p.value === "tea")).toBe(true);
    });

    it("should extract preference from 'I dislike coffee.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I dislike coffee."
      );

      const understandings = understandingEngine.getUnderstandings();
      const prefU = understandings.find((u) => u.category === "Preference");
      expect(prefU).toBeDefined();
      expect(prefU?.canonicalKey).toBe("preference:dislike-coffee");

      const observations = identityService.getObservations();
      const prefObs = observations.find((o) => o.category === "Preference");
      expect(prefObs?.name).toBe("dislike coffee");
    });
  });

  describe("Values", () => {
    it("should extract value from 'I value honesty.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I value honesty."
      );

      const understandings = understandingEngine.getUnderstandings();
      const valueU = understandings.find((u) => u.category === "Value");
      expect(valueU).toBeDefined();
      expect(valueU?.canonicalKey).toBe("value:honesty");

      const observations = identityService.getObservations();
      const valueObs = observations.find((o) => o.category === "Value");
      expect(valueObs?.name).toBe("honesty");

      const identity = identityFoundationService.getIdentity();
      const values = identityFoundationService.getValues(identity!.id);
      expect(values.some((v) => v.name === "honesty")).toBe(true);
    });

    it("should extract value from 'Integrity is important to me.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: Integrity is important to me."
      );

      const understandings = understandingEngine.getUnderstandings();
      const valueU = understandings.find((u) => u.category === "Value");
      expect(valueU).toBeDefined();
      expect(valueU?.canonicalKey).toBe("value:integrity");
    });
  });

  describe("Habits", () => {
    it("should extract habit from 'I exercise every morning.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I exercise every morning."
      );

      const understandings = understandingEngine.getUnderstandings();
      const habitU = understandings.find((u) => u.category === "Habit");
      expect(habitU).toBeDefined();
      expect(habitU?.canonicalKey).toBe("habit:exercise");

      const observations = identityService.getObservations();
      const habitObs = observations.find((o) => o.category === "Habit");
      expect(habitObs?.name).toBe("exercise");

      const identity = identityFoundationService.getIdentity();
      const habits = identityFoundationService.getHabits(identity!.id);
      expect(habits.some((h) => h.name === "exercise")).toBe(true);
    });

    it("should extract habit from 'I usually study at night.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: I usually study at night."
      );

      const understandings = understandingEngine.getUnderstandings();
      const habitU = understandings.find((u) => u.category === "Habit");
      expect(habitU).toBeDefined();
      expect(habitU?.canonicalKey).toBe("habit:study-at-night");
    });
  });

  describe("Negative Cases", () => {
    it("should NOT extract goal from 'The pilot landed safely.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: The pilot landed safely."
      );

      const understandings = understandingEngine.getUnderstandings();
      const goalU = understandings.find((u) => u.category === "Goal");
      expect(goalU).toBeUndefined();
    });

    it("should NOT extract preference from 'Coffee is available.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: Coffee is available."
      );

      const understandings = understandingEngine.getUnderstandings();
      const prefU = understandings.find((u) => u.category === "Preference");
      expect(prefU).toBeUndefined();
    });

    it("should NOT extract interest from 'Robotics is a field of engineering.'", () => {
      eventService.record(
        "note_created",
        "Workspace Interaction",
        "User query: Robotics is a field of engineering."
      );

      const understandings = understandingEngine.getUnderstandings();
      const interestU = understandings.find((u) => u.category === "Interest");
      expect(interestU).toBeUndefined();
    });
  });
});
