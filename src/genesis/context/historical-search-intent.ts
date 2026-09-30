/**
 * Does the user explicitly ask to search past conversations, and for what?
 *
 * Explicit only. v0 of Historical Recall never runs because GENESIS lacks an
 * answer; it runs because the user told AKIRA to look. So the triggers are
 * imperatives naming the archive -- "search our previous chats", "look through
 * our old conversations", "find what we discussed about X" -- and not the many
 * ways people merely mention it: "I remember our previous chat", "we discussed
 * this before", "the chat history page is slow". A missed trigger costs the
 * user a rephrase; a false one puts unrelated old messages into the prompt.
 */

/** Messages retrieved per search. See the sizing note on HISTORICAL_MESSAGE_CHARS. */
export const HISTORICAL_RESULT_LIMIT = 5;

/**
 * Longest message quoted into the prompt. Measured on a real archive: user
 * turns p99 41 chars; AKIRA replies p50 178, p90 384, max 971. 600 keeps most
 * replies whole and bounds the whole section at ~3,000 chars (~750 tokens)
 * with the limit above.
 */
export const HISTORICAL_MESSAGE_CHARS = 600;

const ARCHIVE =
  String.raw`(?:(?:our|my|the)\s+)?(?:(?:previous|past|old|older|earlier|prior|last)\s+)?` +
  String.raw`(?:chat\s+history|conversation\s+history|chats?|conversations?)`;

const TRIGGERS: RegExp[] = [
  // search / look through / check / go through ... <archive>
  new RegExp(
    String.raw`\b(?:search|scan|browse|check|look\s+(?:through|in|at|back\s+(?:through|at|in))|go\s+(?:back\s+)?through|dig\s+(?:through|into))\s+(?:through\s+|in\s+)?${ARCHIVE}\b`,
    "i",
  ),
  // find what we discussed / talked about / said / decided (about X)
  /\bfind\s+(?:out\s+)?what\s+(?:we|i)\s+(?:discussed|talked\s+about|said|decided|agreed)(?:\s+(?:about|on|for|regarding))?\b/i,
];

/** "don't search our old chats" is not a request to search them. */
const NEGATED =
  /\b(?:don'?t|do\s+not|never|no\s+need\s+to|stop)\s+(?:\w+\s+){0,2}(?:search|scan|browse|check|look|go|dig|find)\b/i;

/** Words that carry the request, not the thing searched for. */
const STOPWORDS = new Set(
  (
    "a an the and or but if then so to of in on at for from by with about as into over " +
    "i me my we us our you your it its this that these those there here " +
    "is am are was were be been being do does did done doing have has had having " +
    "can could would should will shall may might must " +
    "what which who whom whose when where why how whatever " +
    "use used using say said tell told talk talked discuss discussed decide decided agree agreed " +
    "remember recall know find search look check go through back dig scan browse please " +
    "chat chats conversation conversations history previous past old older earlier prior last " +
    "again ever before any some something anything thing things"
  ).split(" "),
);

const MAX_TERMS = 8;

export interface HistoricalSearchIntent {
  /** Content words to search for; empty when the user named nothing to find. */
  terms: string[];
}

export function detectHistoricalSearch(prompt: string): HistoricalSearchIntent | null {
  const text = prompt.trim();
  if (!text || NEGATED.test(text)) return null;

  const trigger = TRIGGERS.map((re) => re.exec(text)).find((m) => m !== null);
  if (!trigger) return null;

  const rest = text.slice(0, trigger.index) + " " + text.slice(trigger.index + trigger[0].length);
  return { terms: subjectTerms(rest) };
}

/** The words that name what is being asked about: not stopwords, deduplicated, capped. */
function subjectTerms(text: string, extraStopwords?: Set<string>): string[] {
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || extraStopwords?.has(raw) || terms.includes(raw))
      continue;
    terms.push(raw);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

// ---------------------------------------------------------------------------
// Automatic: a question about the user's own past, asked without "search".
// ---------------------------------------------------------------------------

/**
 * A past act by the user or by the user and AKIRA together. Each pattern needs
 * "I" or "we" *and* a past-tense construction *and* a verb of the kind a
 * conversation records -- decided, used, said, chose -- so "what did Einstein
 * say", "how does a CPU work" and "which sensor should we use" do not match.
 * Conservative on purpose: a false positive quotes unrelated old messages.
 */
const PAST_ACT_VERB = String.raw`(?:discuss|talk|decide|choose|chose|pick|use|say|said|tell|told|mention|agree|settle|go\s+with|build|built|make|made|plan|name|call|work\s+on|buy|bought|want|need)\w*`;

const PAST_REFERENCE: RegExp[] = [
  // what / which ... did we|I <verb>: "what did we decide about the CPU"
  new RegExp(
    String.raw`\b(?:what|which|who|where|when|how)\b[^?.!]{0,40}?\b(?:did|had)\s+(?:we|i)\s+(?:(?:ever|once|originally|finally|actually|first)\s+)?${PAST_ACT_VERB}\b`,
    "i",
  ),
  // that <thing> we|I <past verb>: "that sensor we used", "that thing we worked on"
  new RegExp(
    String.raw`\bthat\s+(?:\w+\s+){1,2}(?:we|i)\s+(?:used|chose|picked|built|made|mentioned|discussed|decided\s+on|settled\s+on|worked\s+on|talked\s+about|bought|planned|named|called|wanted)\b`,
    "i",
  ),
  // do you remember what I said / we decided ...
  new RegExp(
    String.raw`\b(?:do|did)\s+you\s+(?:remember|recall)\s+(?:what|which|when|where|how|the)\b[^?.!]{0,40}?\b(?:i|we)\s+(?:said|told|mentioned|discussed|decided|chose|used|talked|wanted|planned|picked|settled)\b`,
    "i",
  ),
];

const QUESTION = /\?\s*$|^\s*(?:what|which|who|where|when|how|why|do|did|can|could|would)\b/i;

/** Past-act verbs name the question's shape, not its subject. */
const PAST_ACT_STOPWORDS = new Set(
  "work worked working choose chose chosen pick picked settle settled mention mentioned want wanted need needed time went".split(
    " ",
  ),
);

/**
 * A question that plausibly asks about the user's own past, and its subject.
 *
 * null unless all three hold: it is a question, it frames a past act by "I"
 * or "we", and it names something -- "what did we do?" names nothing, so
 * there is nothing to search for. This decides only that history *may* be
 * searched; whether it is searched also depends on GENESIS not already
 * holding the answer (see `genesisCovers` in context-engine).
 */
export function detectHistoricalQuestion(prompt: string): HistoricalSearchIntent | null {
  const text = prompt.trim();
  if (!text || !QUESTION.test(text)) return null;
  if (!PAST_REFERENCE.some((re) => re.test(text))) return null;
  const terms = subjectTerms(text, PAST_ACT_STOPWORDS);
  return terms.length > 0 ? { terms } : null;
}

/**
 * Does the user want to know where a recalled answer came from? Changes only
 * how the Historical Recall section tells the model to answer -- cite the date
 * and quote, instead of answering plainly -- never what is retrieved.
 */
const PROVENANCE = new RegExp(
  [
    String.raw`\b(?:source|sources|cite|citation|quote|verify|verification|proof)\b`,
    String.raw`\bwhere\s+(?:did|does)\s+(?:that|this|it)\s+come\s+from\b`,
    String.raw`\bwhere\s+did\s+you\s+(?:get|find|see|read)\b`,
    String.raw`\bhow\s+do\s+you\s+know\b`,
    String.raw`\bwhen\s+did\s+(?:we|i|you)\b`,
    String.raw`\b(?:what|which)\s+(?:date|day|conversation|chat)\b`,
    String.raw`\bshow\s+me\s+(?:the|that|where)\b`,
    String.raw`\bexact\s+(?:words|message|wording)\b`,
  ].join("|"),
  "i",
);

export function asksForProvenance(prompt: string): boolean {
  return PROVENANCE.test(prompt);
}
