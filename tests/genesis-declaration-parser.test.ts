/**
 * `parseDeclaration`, and the third parse site that used to sit beside it.
 *
 * `PersonalDeclarationRule` asked the parser up to three times per memory:
 *
 *   1  parseDeclaration(memory.description)
 *   2  parseDeclaration(memory.title)                     -- if 1 missed
 *   3  parseDeclaration(description.split("User query submitted to AKIRA: ")[1])
 *      with surrounding quotes stripped                   -- if 1 and 2 missed
 *
 * Site 3 exists because chat turns reached the rule wrapped in
 * `User query submitted to AKIRA: "<what the user typed>"`. But site 1 already
 * strips that exact prefix, and the quote stripping too, so site 3 can only
 * ever run on input site 1 has already rejected -- and it hands the parser a
 * string site 1 has already normalised to the same value.
 *
 * That is the claim, and it is the kind that is easy to assert and easy to get
 * wrong, so it is tested rather than argued: the corpus below runs both the
 * two-site and the three-site pipelines and requires them to agree on every
 * case, including the wrapped forms site 3 was written for.
 *
 * This test is written to pass BEFORE site 3 is removed and after. That is what
 * makes it evidence of redundancy rather than a description of the new code.
 */
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import { parseDeclaration, type Declaration } from "../src/genesis/understanding/declaration";

/** The pipeline as it stood, all three sites. */
function withSiteThree(description: string, title = ""): Declaration | null {
  const text = description || "";
  let match = parseDeclaration(text);
  if (!match && title) match = parseDeclaration(title);
  if (!match && text.includes("User query submitted to AKIRA: ")) {
    const queryText = text.split("User query submitted to AKIRA: ")[1];
    if (queryText) {
      const cleanQuery = queryText.replace(/^["']|["']$/g, "");
      match = parseDeclaration(cleanQuery);
    }
  }
  return match;
}

/** The pipeline without it. */
function withoutSiteThree(description: string, title = ""): Declaration | null {
  const text = description || "";
  let match = parseDeclaration(text);
  if (!match && title) match = parseDeclaration(title);
  return match;
}

const SENTENCES = [
  // Recognised, one per category the parser knows.
  "I want to become a pilot",
  "My goal is to learn Verilog",
  "My dream is to sail the Atlantic",
  "I aspire to write a compiler",
  "Running a marathon is my goal",
  "I love long flights at night",
  "I enjoy pairing on Fridays",
  "I prefer dark roast",
  "I believe the parser is wrong",
  "I care deeply about privacy",
  "I always forget this command",
  "I usually start at six",
  "I run every morning",
  "I meditate every day",
  // Not recognised, including the near-misses that matter.
  "I want to run a marathon",
  "how do I wire the FPGA clock",
  "what did I do last tuesday",
  "",
  "   ",
  "I",
  "I want to become",
];

/** Every wrapper a chat turn has ever reached the rule inside. */
const WRAPPERS: ((s: string) => string)[] = [
  (s) => s,
  (s) => `User query submitted to AKIRA: "${s}"`,
  (s) => `User query submitted to AKIRA: ${s}`,
  (s) => `User query: "${s}"`,
  (s) => `Query submitted to AKIRA: "${s}"`,
  (s) => `User query submitted: "${s}"`,
  (s) => `Captured thought: "${s}"`,
  (s) => `Completed task: "${s}"`,
];

describe("the third parse site is redundant", () => {
  it("agrees with the two-site pipeline on every sentence and wrapper", () => {
    let checked = 0;
    for (const sentence of SENTENCES) {
      for (const wrap of WRAPPERS) {
        const description = wrap(sentence);
        for (const title of ["", "Note Created", "Workspace Interaction", sentence]) {
          expect(
            withoutSiteThree(description, title),
            `disagreement on ${JSON.stringify(description)} / title ${JSON.stringify(title)}`,
          ).toEqual(withSiteThree(description, title));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
  });

  it("still extracts a declaration from the wrapper legacy memories carry", () => {
    // The reason the prefix stripping stays. Chat turns are no longer written
    // to the durable stream, but the ones written before the boundary moved are
    // still in it and age out rather than being migrated.
    expect(parseDeclaration('User query submitted to AKIRA: "I want to become a pilot"')).toEqual({
      category: "Goal",
      content: "become a pilot",
    });
  });

  it("gives the same answer wrapped and unwrapped", () => {
    for (const sentence of SENTENCES) {
      const bare = parseDeclaration(sentence);
      for (const wrap of WRAPPERS.slice(1, 6)) {
        expect(
          parseDeclaration(wrap(sentence)),
          `wrapper changed the parse of "${sentence}"`,
        ).toEqual(bare);
      }
    }
  });
});

describe("what the parser does and does not recognise", () => {
  /**
   * Pinned so the promotion gate's behaviour is legible from one place. The
   * misses are not defects to fix here -- widening the parser at the same time
   * as moving the chat boundary would make it impossible to attribute a change
   * in what gets remembered to one or the other.
   */
  it("recognises the forms it was built for", () => {
    expect(parseDeclaration("I want to become a pilot")?.category).toBe("Goal");
    expect(parseDeclaration("My goal is to learn Verilog")).toEqual({
      category: "Goal",
      content: "learn Verilog",
    });
    expect(parseDeclaration("I love long flights")?.category).toBe("Interest");
    expect(parseDeclaration("I prefer dark roast")?.category).toBe("Preference");
    expect(parseDeclaration("I care deeply about privacy")?.category).toBe("Value");
    expect(parseDeclaration("I run every morning")?.category).toBe("Habit");
  });

  it("returns null for an ordinary question, which is most of chat", () => {
    expect(parseDeclaration("how do I wire the FPGA clock")).toBeNull();
    expect(parseDeclaration("what did I do last tuesday")).toBeNull();
    expect(parseDeclaration("is the parser finished")).toBeNull();
    expect(parseDeclaration("")).toBeNull();
  });

  it('has "i want to become" but no bare "i want to"', () => {
    // The trap that cost a session an hour: phrase a fixture with the bare form
    // and the whole promotion path reads as broken when it is working.
    expect(parseDeclaration("I want to become a pilot")).not.toBeNull();
    expect(parseDeclaration("I want to run a marathon")).toBeNull();
  });
});
