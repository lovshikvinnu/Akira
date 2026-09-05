/**
 * What happened in a past session must keep having happened.
 *
 * `sessions.tsx` attributes cognitive outcomes to a session by asking which of
 * them fall inside `[startedAt, endedAt]`. Events, candidates and memories were
 * asked with their immutable `timestamp`. Stories and identity observations
 * were asked with `updatedAt`, which is a mutation instant: it moves every time
 * the thing is touched.
 *
 * So a story created during a session in March and reinforced today stopped
 * falling inside March's window and started falling inside today's. The old
 * session quietly lost an entry, and a session the outcome had nothing to do
 * with gained one. The record eroded as the user kept working, which is the
 * opposite of what a history is for.
 *
 * These cases pin the direction of the failure rather than only its absence:
 * the reinforced story must still be in the session it was created in, AND must
 * not appear in the later one.
 */
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";

import { selectSessionOutcomes } from "../src/akira-os/sessions/session-outcomes";

const MARCH = { startedAt: "2026-03-01T09:00:00.000Z", endedAt: "2026-03-01T11:00:00.000Z" };
const TODAY = { startedAt: "2026-09-06T09:00:00.000Z", endedAt: "2026-09-06T11:00:00.000Z" };

/** Created inside the March session, touched again today. */
const reinforcedStory = {
  id: "story-march",
  title: "Personal Growth Reflections",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
};

/** Same shape, for an identity observation. */
const reinforcedObservation = {
  id: "obs-march",
  name: "Reflective",
  createdAt: "2026-03-01T10:30:00.000Z",
  updatedAt: "2026-09-06T10:30:00.000Z",
};

const eventInMarch = { id: "evt-march", timestamp: "2026-03-01T09:30:00.000Z" };
const eventToday = { id: "evt-today", timestamp: "2026-09-06T09:30:00.000Z" };

const sources = {
  events: [eventInMarch, eventToday],
  candidates: [eventInMarch, eventToday],
  promoted: [eventInMarch, eventToday],
  stories: [reinforcedStory],
  identity: [reinforcedObservation],
};

describe("a session from months ago", () => {
  it("still contains what was created during it", () => {
    const outcomes = selectSessionOutcomes(MARCH, sources);

    // The guard: the fixture really does describe something created in March
    // and mutated later, or the assertions below prove nothing.
    expect(reinforcedStory.createdAt < MARCH.endedAt).toBe(true);
    expect(reinforcedStory.updatedAt > MARCH.endedAt).toBe(true);

    expect(outcomes.stories.map((s) => s.id)).toEqual(["story-march"]);
    expect(outcomes.identity.map((o) => o.id)).toEqual(["obs-march"]);
  });

  it("keeps the event-sourced outcomes it always kept", () => {
    // These already used an immutable instant. They are asserted so a change to
    // the shared helper cannot quietly move them onto a mutation field.
    const outcomes = selectSessionOutcomes(MARCH, sources);

    expect(outcomes.events.map((e) => e.id)).toEqual(["evt-march"]);
    expect(outcomes.candidates.map((c) => c.id)).toEqual(["evt-march"]);
    expect(outcomes.promoted.map((m) => m.id)).toEqual(["evt-march"]);
  });
});

describe("today's session", () => {
  it("does not claim an outcome that merely got touched today", () => {
    const outcomes = selectSessionOutcomes(TODAY, sources);

    // The other half of the erosion: the March story used to arrive here.
    expect(outcomes.stories).toEqual([]);
    expect(outcomes.identity).toEqual([]);

    // And today's own events still land, so this is not filtering everything.
    expect(outcomes.events.map((e) => e.id)).toEqual(["evt-today"]);
  });
});

describe("an outcome created and never touched again", () => {
  it("is attributed the same either way", () => {
    // The case where both fields agree. It must keep working, or the fix would
    // be trading one wrong answer for another.
    const stable = {
      id: "story-stable",
      title: "Project Arc: Kitchen Renovation",
      createdAt: "2026-03-01T10:15:00.000Z",
      updatedAt: "2026-03-01T10:15:00.000Z",
    };

    const outcomes = selectSessionOutcomes(MARCH, { ...sources, stories: [stable] });
    expect(outcomes.stories.map((s) => s.id)).toEqual(["story-stable"]);
  });
});
