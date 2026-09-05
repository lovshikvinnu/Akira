/**
 * Short informal input reaches a reply; genuine ambiguity still asks.
 *
 * Reported live: "hi" answered normally, "hii" came back with a clarifying
 * question, and "how ae you dng" -- four words, three misspelled -- answered
 * normally. Reproduced through the resolver and the real system instruction:
 *
 *     "hi"                 conf 0.70  clarify false
 *     "hii"                conf 0.25  clarify true   candidates
 *                          ["general concept","project term","something else"]
 *     "helloo" "yo" "sup" "thx"        same as "hii"
 *     "pilot"              conf 0.28  clarify true   candidates
 *                          ["career","project","aviation term","testing methodology"]
 *     "how ae you dng"     conf 0.70  clarify false
 *
 * Two faults in one branch, `words.length === 1 && !isTrivial`, where
 * `isTrivial` is an exact-match list of ten words.
 *
 * The candidates were invented. "general concept", "project term" and
 * "something else" are not readings of anything and were emitted for every
 * unknown word regardless of input, then printed to the model as "Possible
 * Interpretations" under an instruction to ask about them and assume none.
 *
 * And unfamiliar was being treated as ambiguous. Ambiguity means a word has
 * several known meanings -- what `AMBIGUOUS_DICTIONARY` records, and why
 * "pilot" still asks. An unrecognised greeting has no competing readings to
 * choose between, so there is nothing to ask about.
 *
 * WHY THE POSITIVE CONTROLS MATTER HERE
 * -------------------------------------
 * Deleting clarification altogether would satisfy every "does not ask" case in
 * this file. Each of them is paired with an input that must still ask.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect, beforeAll } from "vitest";

await import("../src/genesis/index");
const { akira } = await import("../src/persistence/akira-store");
const { intentResolver } = await import("../src/genesis/understanding/intent-resolver");
const { contextRelevanceSelector } =
  await import("../src/genesis/context/context-relevance-selector");
const { contextService } = await import("../src/genesis/context/context-service");
const { promptBuilder } = await import("../src/genesis/context/ai/prompt-builder");
const { describeProviderFailure } = await import("../src/genesis/context/ai/provider-error");

const CLARIFY_INSTRUCTION = "Ask one concise clarification question";

const resolve = (prompt: string) => intentResolver.resolveIntent(prompt, []);

/** The system instruction the model is actually handed for this input. */
function instructionFor(prompt: string): string {
  const resolution = resolve(prompt);
  const selection = contextRelevanceSelector.selectContext(
    prompt,
    contextService.getActiveContext() ?? undefined,
    null,
  );
  return promptBuilder.buildSystemInstruction(prompt, selection, resolution);
}

beforeAll(() => {
  akira.initializeState(akira.getState());
});

describe("AKIRA does not invent interpretations", () => {
  for (const input of ["hii", "helloo", "yo", "sup", "thx", "kubernetes"]) {
    it(`offers no candidates for "${input}"`, () => {
      const resolution = resolve(input);
      expect(resolution.candidates, "interpretations were manufactured").toEqual([]);
      for (const invented of ["general concept", "project term", "something else"]) {
        expect(instructionFor(input)).not.toContain(invented);
      }
    });
  }

  it("still offers the real ones a word actually has", () => {
    // The positive control for the cases above. `AMBIGUOUS_DICTIONARY` records
    // that "pilot" resolves to a career, a project or a test -- readings with
    // evidence behind them, which must survive.
    const resolution = resolve("pilot");
    expect(resolution.candidates.map((c) => c.name)).toEqual([
      "career",
      "project",
      "aviation term",
      "testing methodology",
    ]);
    expect(instructionFor("pilot")).toContain("Possible Interpretations");
  });
});

describe("uncertainty alone does not force a question", () => {
  for (const input of ["hii", "helloo", "yo", "sup", "thx"]) {
    it(`answers "${input}" instead of asking about it`, () => {
      const resolution = resolve(input);
      expect(resolution.clarificationRequired, "a greeting triggered a clarification").toBe(false);
      expect(resolution.ambiguous, "an unfamiliar word was called ambiguous").toBe(false);
      expect(instructionFor(input)).not.toContain(CLARIFY_INSTRUCTION);
    });
  }

  it("keeps the input marked as not fully understood", () => {
    // The distinction the fix rests on: still uncertain internally, just no
    // longer compelled to ask. If this became 0.7 the branch would be gone
    // rather than corrected.
    const resolution = resolve("hii");
    expect(resolution.confidence).toBeLessThan(resolve("hi").confidence);
    expect(resolution.confidence).toBeGreaterThan(0);
  });

  it("still asks when a word genuinely has several meanings", () => {
    const resolution = resolve("pilot");
    expect(resolution.clarificationRequired, "genuine ambiguity stopped asking").toBe(true);
    expect(resolution.ambiguous).toBe(true);
    expect(instructionFor("pilot")).toContain(CLARIFY_INSTRUCTION);
  });

  it("still asks when there is no input at all", () => {
    const resolution = resolve("   ");
    expect(resolution.clarificationRequired, "empty input stopped asking").toBe(true);
  });

  it("leaves the inputs that already worked alone", () => {
    for (const input of ["hi", "hello", "thanks", "how ae you dng", "whats the capital of india"]) {
      const resolution = resolve(input);
      expect(resolution.clarificationRequired, `"${input}" started asking`).toBe(false);
      expect(resolution.confidence, `"${input}" lost confidence`).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe("a rate limit reads as a rate limit", () => {
  const KEYED = true;

  it("names the limit and not the network", () => {
    for (const raw of [
      "429 Too Many Requests",
      "Rate limit exceeded for this model",
      "You have exceeded your quota",
    ]) {
      const failure = describeProviderFailure(new Error(raw), "OpenRouter", KEYED);
      expect(failure.kind, `"${raw}" was not read as a rate limit`).toBe("rate-limited");
      expect(failure.message, "the provider's own text reached the user").not.toContain(raw);
      expect(failure.message.toLowerCase()).not.toContain("verify your network");
      expect(failure.message.toLowerCase()).toContain("wait a moment");
    }
  });

  it("does not quote the provider or blame the network for an unknown failure", () => {
    const raw = "upstream connect error or disconnect/reset before headers";
    const failure = describeProviderFailure(new Error(raw), "Gemini", KEYED);

    expect(failure.kind).toBe("unknown");
    expect(failure.message, "raw provider text reached the user").not.toContain(raw);
    expect(failure.message.toLowerCase(), "a network fault was asserted").not.toContain("network");
    expect(failure.message).toContain("Gemini");
  });

  it("still classifies the failures that were already right", () => {
    // Positive controls. Without these, deleting every branch would pass the
    // two cases above.
    expect(describeProviderFailure(new Error("anything"), "Gemini", false).kind).toBe("no-key");
    expect(describeProviderFailure(new Error("Invalid API key"), "Gemini", KEYED).kind).toBe(
      "invalid-key",
    );
    expect(describeProviderFailure(new Error("Failed to fetch"), "Gemini", KEYED).kind).toBe(
      "network",
    );
    expect(describeProviderFailure(new Error("request timeout"), "Gemini", KEYED).kind).toBe(
      "network",
    );
  });

  it("reads a rate limit as a rate limit even though its text contains no key", () => {
    // The bare substring "key" is what the invalid-key branch tests for, so the
    // order of the two branches is load-bearing.
    const failure = describeProviderFailure(
      new Error("Rate limit reached for key sk-abc"),
      "OpenRouter",
      KEYED,
    );
    expect(failure.kind, "a rate limit was reported as an invalid key").toBe("rate-limited");
  });
});
