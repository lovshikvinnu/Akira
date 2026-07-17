# Initiative Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 09-initiative-engine.md
>
> _This document defines the Initiative Engine, the proactive action decision subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

For a growth companion to act as a trustworthy teammate, it must know when to speak and, equally importantly, when to remain silent. Most proactive AI systems attempt to maximize engagement by sending constant notifications, generating unsolicited summaries, or interrupting focus, which creates fatigue and erodes user trust.

AKIRA establishes proactive boundaries via the **Initiative Engine**. This subsystem evaluates whether any proactive companion action is appropriate given the current context, answering the question: _"Given the current Resolved Context, should the Companion proactively do anything?"_

The relationship between architectural stages flows as follows:

```
 Resolved Context
        │
        ▼
Initiative Evaluation
        │
        ▼
Initiative Decision
        │
        ▼
  Conversation  ◄─── Proactive suggestions or questions are injected here
```

- **Resolved Context**: The aggregated situation snapshot compiled by the Context Resolution Engine.
- **Initiative Evaluation**: The analytical phase evaluating the opportunity, timing, and evidence.
- **Initiative Decision**: The single output deciding the course of action (which often defaults to silence).
- **Conversation**: Active dialogue, where proactive initiatives are introduced if decided.

By separating initiative from conversation and response generation, the engine ensures that proactivity is evaluated objectively before any text is written or displayed.

---

## 2. Responsibilities

The Initiative Engine evaluates opportunities and decides actions:

- **Initiative Evaluation**: Analyzes the Resolved Context to determine if a proactive suggestion, question, or check-in is helpful.
- **Opportunity Assessment**: Identifies key moments where assistance is useful (e.g. at return times or when goals block).
- **User Autonomy Protection**: Ensures companion actions respect user focus and do not coerce behavior.
- **Timing Awareness**: Resolves whether the current timing is appropriate (e.g., avoiding check-ins during deep work focus).
- **Confidence Evaluation**: Verifies that the evidence supporting an initiative is strong.
- **Priority Assessment**: Compares competing options to choose the single most helpful intervention.
- **Decision to Remain Silent**: Evaluates if the companion should stay silent, keeping silence as the default state.
- **Initiative Confidence**: Calculates certainty values for proposed actions.

---

## 3. Non-Responsibilities

The Initiative Engine restricts its scope to decision-making:

- **Generate Responses**: It does not formulate greetings, text descriptions, or dialogue.
- **Create Memories**: It does not write persistent history event logs.
- **Modify Identity**: It does not adjust trait ratings or change user profiles.
- **Manage Goals**: It does not create or complete user milestones.
- **Detect Habits**: It does not identify routines or streaks.
- **Resolve Context**: It does not prioritize or reconcile raw inputs.
- **Replace User Decisions**: It does not perform tasks or choose actions on behalf of the user.
- **Maximize Engagement**: It does not design loops to increase user screen time.
- **Manipulate Behavior**: It does not coerce, guilt, or pressure the user.

---

## 4. Initiative Lifecycle

Initiative options are evaluated through a structured conceptual progression:

```
Resolved Context Available
            │
            ▼
   Evaluate Opportunity
            │
            ▼
    Assess Confidence
            │
            ▼
   Assess User Benefit
            │
            ▼
         Choose:
 ┌──────────┼───────────────┬───────────────────┐
 ▼          ▼               ▼                   ▼
No Action  Gentle Suggestion Clarifying Question Helpful Reminder
 └──────────┬───────────────┴───────────────────┘
            │
            ▼
  Wait for User Response ──► Evaluates user interaction to verify timing
```

1. **Resolved Context Available**: Ingests the output of the Context Resolution Engine.
2. **Evaluate Opportunity**: Analyzes timestamps, goals, and focus states.
3. **Assess Confidence**: Confirms that the underlying context features high confidence scores.
4. **Assess User Benefit**: Verifies that taking initiative provides a clear advantage over remaining silent.
5. **Choose**: Selects the appropriate outcome from the defined options:
   - **No Action (Default)**: The companion remains silent.
   - **Gentle Suggestion**: Proposes a project or task link without insisting.
   - **Clarifying Question**: Inquires about ambiguous goals or conflicting data.
   - **Helpful Reminder**: Highlights outstanding deadlines or blockers if appropriate.
6. **Wait for User Response**: Monitors user interaction to evaluate the success and timing of the intervention.

---

## 5. Initiative Decision

The primary conceptual output is the **Initiative Decision**, which captures:

- **Decision Outcome**: The selected action (Silence, Suggestion, Question, or Reminder).
- **Confidence**: Mathematical metric reflecting the certainty of the decision.
- **Supporting Evidence**: Citations referencing the resolved context details that triggered the choice.
- **User Benefit**: Documented reasoning explaining why the action is helpful.
- **Timing Suitability**: Metric evaluating the appropriateness of the current intervention window.
- **Intervention Necessity**: Evaluation showing why remaining silent was overridden.

---

## 6. Inputs

The Initiative Engine consumes a single input:

- **Resolved Context**: The unified output package of the Context Resolution Engine (from [08-context-resolution-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/08-context-resolution-engine.md)).

The engine is prohibited from consuming individual subsystem outputs (such as Goal Context or Presence Context) directly.

---

## 7. Outputs

The sole output is the **Initiative Decision**.

It is consumed by:

- **The Conversation Lifecycle**: To inject proactivity (questions, suggestions, reminders) into active dialogue streams.
- **The Reflection Engine**: To evaluate if a proactive initiative was well-received by the user.

---

## 8. Integration Points

The Initiative Engine orchestrates the transition to active behavior:

- **Context Resolution Engine**: Supplies the prioritized Situation Context.
- **Conversation Lifecycle**: Receives decisions to execute dialogue actions when appropriate.
- **Reflection Engine**: Reviews initiative outcomes at session end.
- **Companion Core**: Grounded in autonomy and character guidelines (defined in [01-companion-philosophy.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-philosophy.md)).

---

## 9. Initiative Principles

Proactivity in AKIRA is governed by the following rules:

- **Silence is the Default**: If there is no clear benefit to speaking, the companion remains silent.
- **User Autonomy Comes First**: The companion never insists, demands, or overrides user choices.
- **Help Without Interruption**: Proactive actions must never disrupt active deep focus.
- **Evidence Before Initiative**: Proactivity is triggered only by verified events and clear context details.
- **Questions Before Assumptions**: If context is ambiguous, the engine asks clarifying questions instead of making guesses.
- **Timing Matters**: Actions are scheduled to align with natural interaction transitions (e.g. at return times).
- **Never Optimize for Engagement**: The engine is designed to support real-world execution, not screen time.
- **Never Create Artificial Urgency**: Avoids visual alerts, countdowns, or urgency markers.

---

## 10. Failure Modes

The engine implements safe, predictable fallbacks for context anomalies:

- **Weak Evidence**: If the resolved context features low confidence, the engine defaults to "No Action."
- **Low Confidence**: If the proposed action's certainty is low, the engine chooses silence.
- **Ambiguous Situations**: Vague user intentions default to "No Action" or a quiet clarifying question, never bold assertions.
- **Conflicting Priorities**: If goals and tasks conflict, the engine remains silent to avoid overwhelming the user.
- **Poor Timing**: If focus metrics indicate the user is in deep work, all proactive initiatives are blocked.

---

## 11. Architectural Principles

The engine is built upon the following tenets:

- **User Autonomy**: The user maintains final control over the interaction workspace.
- **Non-Manipulative**: Excludes persuasive design and engagement metrics.
- **Evidence-Based**: Decides actions based strictly on verified inputs.
- **Explainable**: The path from context details to decision outcome is traceable.
- **Deterministic**: Logical checks process identical inputs consistently.
- **Conservative by Default**: Silence is preferred over premature action.
- **Technology Independent**: Independent of databases, languages, or UI frameworks.
- **Single Responsibility**: Focuses exclusively on deciding when proactive action is appropriate.

---

## 12. Future Compatibility

The system scales to support upcoming interaction modes:

- **Voice Companion**: Manages speaking turn-taking, ensuring the companion does not interrupt spoken user thoughts.
- **Ambient Companion**: Determines when the companion should shrink to the background or wake up.
- **Notifications**: Evaluates whether system-level notifications are necessary or should be suppressed.
- **Calendar Assistance**: Decides when to show timeline check-ins.
- **Email Assistance**: Resolves whether incoming messages require context notifications.
- **Desktop Automation**: Decides if a background automation script should run.
- **Mobile Companion**: Evaluates timing based on mobile location or travel states.
- **Wearables**: Suppresses active haptic alerts during focus periods.
