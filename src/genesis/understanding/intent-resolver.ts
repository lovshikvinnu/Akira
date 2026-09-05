import { getWorkspaceProvider } from "../../contracts/workspace-provider";
import { UnderstandingCategory } from "./types";

export interface IntentCandidate {
  name: string;
  description?: string;
}

export interface Intent {
  type: "Goal" | "Project" | "Workspace" | "Factual" | "Identity" | "General";
  category?: UnderstandingCategory | null;
  detail?: string;
}

export interface IntentResolution {
  intent: Intent | null;
  confidence: number;
  ambiguous: boolean;
  clarificationRequired: boolean;
  candidates: IntentCandidate[];
}

export interface IntentHistoryMessage {
  role: "user" | "akira" | "model";
  text: string;
}

export const AMBIGUOUS_DICTIONARY: Record<string, string[]> = {
  pilot: ["career", "project", "aviation term", "testing methodology"],
  python: ["programming language", "snake species", "comedy group"],
  apple: ["fruit", "technology company", "record label"],
};

export const intentResolver = {
  resolveIntent(prompt: string, history: IntentHistoryMessage[] = []): IntentResolution {
    const cleanPrompt = prompt
      .trim()
      .toLowerCase()
      .replace(/[?,.!:;]/g, "");
    const words = cleanPrompt.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return {
        intent: null,
        confidence: 0,
        ambiguous: true,
        clarificationRequired: true,
        candidates: [],
      };
    }

    // 1. Get project names and tags dynamically from active workspace
    const projectNamesAndTags: string[] = [];
    try {
      const state = getWorkspaceProvider().getState();
      if (state && state.projects) {
        for (const p of state.projects) {
          if (p.name) projectNamesAndTags.push(p.name.toLowerCase());
          if (p.tag) projectNamesAndTags.push(p.tag.toLowerCase());
        }
      }
    } catch (e) {
      // Ignore if provider not initialized
    }

    // 2. Check for trivial/conversational greetings or signs off
    const isTrivial =
      words.length === 1 &&
      ["hello", "hi", "hey", "thanks", "thank", "ok", "okay", "bye", "yes", "no"].includes(
        words[0],
      );

    // 3. Evaluate High Confidence cases first to prevent incorrect ambiguity flags
    // Explicit personal declarations
    if (
      cleanPrompt.includes("dream is to") ||
      cleanPrompt.includes("my dream is") ||
      cleanPrompt.includes("my goal is") ||
      cleanPrompt.includes("want to become a") ||
      cleanPrompt.startsWith("i want to")
    ) {
      return {
        intent: { type: "Goal", category: "Goal" },
        confidence: 0.95,
        ambiguous: false,
        clarificationRequired: false,
        candidates: [],
      };
    }

    // Explicit project references (e.g. contains exact project name/tag)
    const matchedProject = projectNamesAndTags.find((proj) => cleanPrompt.includes(proj));
    if (matchedProject && !["pilot", "python", "apple"].includes(cleanPrompt)) {
      return {
        intent: { type: "Project", category: "Project", detail: matchedProject },
        confidence: 0.95,
        ambiguous: false,
        clarificationRequired: false,
        candidates: [],
      };
    }

    // Explicit implementation requests
    if (
      cleanPrompt.startsWith("build a") ||
      cleanPrompt.startsWith("create a") ||
      cleanPrompt.startsWith("implement") ||
      cleanPrompt.startsWith("develop") ||
      cleanPrompt.startsWith("code a")
    ) {
      return {
        intent: { type: "Workspace" },
        confidence: 0.9,
        ambiguous: false,
        clarificationRequired: false,
        candidates: [],
      };
    }

    // Explicit factual questions
    if (
      cleanPrompt.startsWith("how do i") ||
      cleanPrompt.startsWith("what is a") ||
      cleanPrompt.startsWith("why does") ||
      cleanPrompt.startsWith("explain")
    ) {
      return {
        intent: { type: "Factual" },
        confidence: 0.9,
        ambiguous: false,
        clarificationRequired: false,
        candidates: [],
      };
    }

    // 4. Medium Confidence Cases: Partial references supported by recent conversation
    const isContextualWord = ["continue", "next", "go on", "resume"].includes(cleanPrompt);
    let contextualProject: string | null = null;
    if (isContextualWord) {
      // Scan history backward for any mentioned project names or tags
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i].text.toLowerCase();

        let foundProject: any = null;
        try {
          const state = getWorkspaceProvider().getState();
          if (state && state.projects) {
            foundProject = state.projects.find(
              (p: any) =>
                (p.name && msg.includes(p.name.toLowerCase())) ||
                (p.tag && msg.includes(p.tag.toLowerCase())),
            );
          }
        } catch (e) {}

        if (foundProject) {
          contextualProject = foundProject.tag || foundProject.name.toLowerCase();
          break;
        }
      }

      if (contextualProject) {
        return {
          intent: { type: "Workspace", detail: contextualProject },
          confidence: 0.85,
          ambiguous: false,
          clarificationRequired: false,
          candidates: [],
        };
      }
    }

    // 5. Low Confidence Cases: Ambiguous inputs & single-word queries
    const dictionaryMatch = Object.keys(AMBIGUOUS_DICTIONARY).find(
      (key) => cleanPrompt === key || words.includes(key),
    );

    if (dictionaryMatch && !isTrivial) {
      const candidates = AMBIGUOUS_DICTIONARY[dictionaryMatch].map((name) => ({ name }));
      return {
        intent: null,
        confidence: 0.28,
        ambiguous: true,
        clarificationRequired: true,
        candidates,
      };
    }

    if (words.length === 1 && !isTrivial) {
      // Unfamiliar is not the same as ambiguous, and this branch treated it as
      // if it were.
      //
      // `isTrivial` is an exact-match list of ten words, so "hi" passed and
      // "hii", "helloo", "yo", "sup" and "thx" all landed here: confidence
      // 0.25, `clarificationRequired`, and three candidates. Meanwhile
      // "how ae you dng" -- four words, three of them misspelled -- reached the
      // default below and was answered normally. Length decided it, not
      // comprehensibility.
      //
      // The candidates were the worse half. "general concept", "project term"
      // and "something else" are not readings of anything; they were emitted
      // for every unknown word regardless of input, and `prompt-builder` prints
      // them to the model as "Possible Interpretations" under an instruction to
      // ask about them and assume none. So AKIRA asked the user to choose
      // between three possibilities it had invented.
      //
      // Ambiguity means a word has several known meanings, which is what
      // `AMBIGUOUS_DICTIONARY` records and why the branch above still clarifies:
      // "pilot" really does resolve to a career, a project or a test, and those
      // candidates come from evidence. An unfamiliar word has no competing
      // readings to choose between, so there is nothing to ask about -- and a
      // greeting the parser does not recognise is still answerable.
      //
      // The confidence stays low because the input genuinely is not understood.
      // What changes is that low confidence no longer compels a question.
      return {
        intent: { type: "General" },
        confidence: 0.4,
        ambiguous: false,
        clarificationRequired: false,
        candidates: [],
      };
    }

    // Default fallback
    return {
      intent: { type: "General" },
      confidence: 0.7,
      ambiguous: false,
      clarificationRequired: false,
      candidates: [],
    };
  },

  generateClarificationResponse(prompt: string, candidates: IntentCandidate[]): string {
    const cleanPrompt = prompt.trim();
    const listItems = candidates.map((c) => {
      if (c.name === "career") return "becoming an aircraft pilot";
      if (c.name === "project") {
        return `a project named "${cleanPrompt.charAt(0).toUpperCase() + cleanPrompt.slice(1)}"`;
      }
      if (c.name === "testing methodology") return "pilot testing";
      if (c.name === "aviation term") return "aviation term";

      if (c.name === "programming language") return "programming language";
      if (c.name === "snake species") return "snake species";
      if (c.name === "comedy group") return "comedy group";

      if (c.name === "fruit") return "fruit";
      if (c.name === "technology company") return "technology company";
      if (c.name === "record label") return "record label";

      return c.description || c.name;
    });

    return (
      `I want to make sure I understand what you mean by "${cleanPrompt}."\n\n` +
      `Did you mean:\n\n` +
      listItems.map((item) => `• ${item}`).join("\n") +
      `\n• something else`
    );
  },
};
