/**
 * Explicit historical-search intent: which requests search past conversations,
 * which do not, and what is searched for.
 *
 * The negatives matter as much as the positives. A false trigger quotes
 * unrelated old messages into the prompt; people mention their chat history
 * far more often than they ask AKIRA to search it.
 */
import { describe, it, expect } from "vitest";

import { detectHistoricalSearch } from "../src/genesis/context/historical-search-intent";

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
