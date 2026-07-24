import {
  IdentityProfile,
  IdentitySummary,
  IdentityHealth,
  IdentityCompleteness,
  IdentityInterest,
  IdentitySkill,
  IdentityGoal,
  IdentityHabit,
  IdentityPreference,
  IdentityValue,
  IdentityRelationship,
  IdentityPersonality,
} from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { identityInterestService } from "./IdentityInterestService";
import { identitySkillService } from "./IdentitySkillService";
import { identityGoalService } from "./IdentityGoalService";
import { identityHabitService } from "./IdentityHabitService";
import { identityPreferenceService } from "./IdentityPreferenceService";
import { identityValueService } from "./IdentityValueService";
import { identityRelationshipService } from "./IdentityRelationshipService";
import { identityPersonalityService } from "./IdentityPersonalityService";
import { identityValidationService } from "./IdentityValidationService";

export class IdentityContextProvider {
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

  public getCurrentProfile(identityId: string): IdentityProfile {
    const interests = identityInterestService.getInterests(identityId);
    const skills = identitySkillService.getSkills(identityId);
    const goals = identityGoalService.getGoals(identityId);
    const habits = identityHabitService.getHabits(identityId);
    const preferences = identityPreferenceService.getPreferences(identityId);
    const values = identityValueService.getValues(identityId);
    const relationships = identityRelationshipService.getRelationships(identityId);
    const personalityTraits = identityPersonalityService.getPersonalityTraits(identityId);

    const graph = this.repository.getGraph();
    const totalAspectsCount = graph.nodes.length;
    let highConfidenceAspectsCount = 0;
    let confidenceSum = 0;

    for (const node of graph.nodes) {
      const score = node.confidence?.score || 0.0;
      confidenceSum += score;
      if (score >= 0.7) {
        highConfidenceAspectsCount++;
      }
    }

    const averageScore = totalAspectsCount > 0 ? confidenceSum / totalAspectsCount : 0.0;

    const timeline = this.repository.getTimeline(identityId);
    const versionsCount = timeline?.versions.length || 0;
    const recentChanges = timeline?.changes.slice(-5).reverse() || [];

    const health = this.getIdentityHealth(identityId);
    const completeness = this.getIdentityCompleteness(identityId);

    return {
      identityId,
      profileVersion: versionsCount,
      generatedAt: new Date().toISOString(),
      interests,
      skills,
      goals,
      habits,
      preferences,
      values,
      relationships,
      personalityTraits,
      confidenceSummary: {
        averageScore,
        highConfidenceAspectsCount,
        totalAspectsCount,
      },
      identityHealth: health,
      completeness: completeness.score,
      recentChanges,
    };
  }

  public getIdentitySummary(identityId: string): IdentitySummary {
    const interests = identityInterestService.getInterests(identityId);
    const skills = identitySkillService.getSkills(identityId);
    const goals = identityGoalService.getGoals(identityId);
    const habits = identityHabitService.getHabits(identityId);
    const values = identityValueService.getValues(identityId);

    const primaryInterests = interests
      .filter((i) => i.status === "Active")
      .map((i) => i.topic);

    const skillWeight = { Expert: 4, Advanced: 3, Intermediate: 2, Novice: 1 };
    const strongestSkills = skills
      .filter((s) => s.status === "Active")
      .sort((a, b) => skillWeight[b.level] - skillWeight[a.level])
      .slice(0, 3)
      .map((s) => s.name);

    const activeGoals = goals
      .filter((g) => g.status === "Active")
      .map((g) => g.title);

    const dominantHabits = habits
      .filter((h) => h.status === "Active" && (h.strength.level === "Strong" || h.strength.level === "Automatic"))
      .map((h) => h.name);

    const coreValues = values
      .filter((v) => v.status === "Active" && (v.strength.level === "Strong" || v.strength.level === "Immutable"))
      .map((v) => v.name);

    const shortSummary = `Primary interests: ${
      primaryInterests.length > 0 ? primaryInterests.join(", ") : "None"
    }. Active goals: ${activeGoals.length > 0 ? activeGoals.join(", ") : "None"}.`;

    const longSummary = `Current cognitive user profile values: ${
      coreValues.length > 0 ? coreValues.join(", ") : "None"
    }. Demonstrated capabilities: ${
      strongestSkills.length > 0 ? strongestSkills.join(", ") : "None"
    }. Established routines: ${
      dominantHabits.length > 0 ? dominantHabits.join(", ") : "None"
    }.`;

    return {
      primaryInterests,
      strongestSkills,
      activeGoals,
      dominantHabits,
      coreValues,
      shortSummary,
      longSummary,
    };
  }

  public getIdentityHealth(identityId: string): IdentityHealth {
    const valResult = identityValidationService.validateIdentity(identityId);
    const graph = this.repository.getGraph();

    let status: "Healthy" | "Partial" | "Sparse" | "Conflicted" = "Healthy";
    let reason = "Identity structure conforms to configuration parameters.";

    if (valResult.errors.length > 0) {
      status = "Conflicted";
      reason = "Identity contains graph errors or consistency conflicts.";
    } else if (valResult.warnings.length > 0) {
      status = "Partial";
      reason = "Identity contains warnings that should be addressed.";
    } else if (graph.nodes.length < 3) {
      status = "Sparse";
      reason = "Identity profile is too sparse for deep cognitive personalization.";
    }

    return {
      status,
      reason,
      errors: valResult.errors,
      warnings: valResult.warnings,
    };
  }

  public getIdentityCompleteness(identityId: string): IdentityCompleteness {
    const dimensions = {
      interests: identityInterestService.getInterests(identityId).length > 0,
      skills: identitySkillService.getSkills(identityId).length > 0,
      goals: identityGoalService.getGoals(identityId).length > 0,
      habits: identityHabitService.getHabits(identityId).length > 0,
      preferences: identityPreferenceService.getPreferences(identityId).length > 0,
      values: identityValueService.getValues(identityId).length > 0,
      relationships: identityRelationshipService.getRelationships(identityId).length > 0,
      personalityTraits: identityPersonalityService.getPersonalityTraits(identityId).length > 0,
    };

    const totalDimensionsCount = Object.keys(dimensions).length;
    const populatedDimensionsCount = Object.values(dimensions).filter(Boolean).length;
    const score = Math.round((populatedDimensionsCount / totalDimensionsCount) * 100);

    return {
      score,
      populatedDimensionsCount,
      totalDimensionsCount,
      dimensionStatus: dimensions,
    };
  }

  /* Expose top aspect lists */

  public getCurrentGoals(identityId: string): IdentityGoal[] {
    return identityGoalService.getGoals(identityId).filter((g) => g.status === "Active");
  }

  public getTopInterests(identityId: string): IdentityInterest[] {
    return identityInterestService
      .getInterests(identityId)
      .filter((i) => i.status === "Active")
      .sort((a, b) => b.strength.score - a.strength.score);
  }

  public getTopSkills(identityId: string): IdentitySkill[] {
    const levelScores = { Expert: 4, Advanced: 3, Intermediate: 2, Novice: 1 };
    return identitySkillService
      .getSkills(identityId)
      .filter((s) => s.status === "Active")
      .sort((a, b) => levelScores[b.level] - levelScores[a.level]);
  }

  public getDominantHabits(identityId: string): IdentityHabit[] {
    return identityHabitService
      .getHabits(identityId)
      .filter((h) => h.status === "Active" && (h.strength.level === "Strong" || h.strength.level === "Automatic"));
  }

  public getCoreValues(identityId: string): IdentityValue[] {
    return identityValueService
      .getValues(identityId)
      .filter((v) => v.status === "Active" && (v.strength.level === "Strong" || v.strength.level === "Immutable"));
  }

  public getPersonalityTraits(identityId: string): IdentityPersonality[] {
    return identityPersonalityService.getPersonalityTraits(identityId).filter((p) => p.status === "Active");
  }

  public getImportantRelationships(identityId: string): IdentityRelationship[] {
    return identityRelationshipService
      .getRelationships(identityId)
      .filter((r) => r.status === "Active" && (r.strength.level === "Close" || r.strength.level === "Intimate"));
  }
}

export const identityContextProvider = new IdentityContextProvider();
