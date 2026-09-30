/**
 * Explicit historical-search intent: which requests search past conversations,
 * which do not, and what is searched for.
 *
 * The negatives matter as much as the positives. A false trigger quotes
 * unrelated old messages into the prompt; people mention their chat history
 * far more often than they ask AKIRA to search it.
 */
import { describe, it, expect } from "vitest";

import {
  asksForProvenance,
  detectHistoricalSearch,
} from "../src/genesis/context/historical-search-intent";

describe("explicit requests search past conversations", () => {
  const cases: [string, string[]][] = [
    ["Search our previous chats. What sensor did we use for FieldSense?", ["sensor", "fieldsense"]],
    ["look through our old conversations for the tile supplier", ["tile", "supplier"]],
    ["Can you check our previous conversation about the grout?", ["grout"]],
    ["find what we discussed about FieldSense", ["fieldsense"]],
    ["find what we decided on the kitchen budget", ["kitchen", "budget"]],
    ["search my chat history for Verilog", ["verilog"]],
    ["please go through our past chats and find the BME280 notes", ["bme280", "notes"]],
    ["look back through our earlier conversations: which router did I buy?", ["router", "buy"]],
    ["SEARCH THE CHATS for pilot", ["pilot"]],
  ];
  for (const [prompt, terms] of cases) {
    it(JSON.stringify(prompt), () => {
      expect(detectHistoricalSearch(prompt)).toEqual({ terms });
    });
  }

  it("recognises a request that names nothing to find, with no terms", () => {
    expect(detectHistoricalSearch("search our previous chats")).toEqual({ terms: [] });
  });
});

describe("mentions of history do not", () => {
  const negatives = [
    "I remember our previous chat",
    "we discussed this before",
    "the chat history page is slow",
    "our old conversation was fun",
    "What sensor did we use for FieldSense?",
    "search the web for humidity sensors",
    "can you search for flights to Tokyo",
    "check my tasks for today",
    "I searched our previous chats yesterday and found nothing",
    "don't search our old chats, just answer",
    "do not look through our previous conversations",
    "let's start a new chat",
    "that conversation with Sarah went well",
    "what did we discuss?",
    "",
  ];
  for (const prompt of negatives) {
    it(JSON.stringify(prompt), () => {
      expect(detectHistoricalSearch(prompt)).toBeNull();
    });
  }
});

describe("asking where a recalled answer came from", () => {
  const asks = [
    "what sensor did we use, and when did we decide that?",
    "what's the source for that?",
    "where did you get that from?",
    "where did that come from?",
    "which conversation was that in?",
    "what date did I say it?",
    "can you quote the exact words?",
    "how do you know?",
    "show me the message",
    "please verify it",
  ];
  for (const prompt of asks) {
    it(JSON.stringify(prompt), () => {
      expect(asksForProvenance(prompt)).toBe(true);
    });
  }

  const plain = [
    "Search our previous chats. What sensor did we use for FieldSense?",
    "find what we discussed about FieldSense",
    "look through our old conversations for the tile supplier",
    "what did we decide about the budget?",
  ];
  for (const prompt of plain) {
    it(`not: ${JSON.stringify(prompt)}`, () => {
      expect(asksForProvenance(prompt)).toBe(false);
    });
  }
});
