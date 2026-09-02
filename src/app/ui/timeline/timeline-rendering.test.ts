import { test } from "vitest";
import { RendererRegistry } from "./RendererRegistry";
import { groupEventsByDate } from "./utils/grouping";
import { formatTime, formatDateTime } from "./utils/time";
import { TimelineEvent } from "@/akira-os/timeline/types";

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

test("RendererRegistry - Resolve Cards and Details", () => {
  // Resolve known event type
  const taskCard = RendererRegistry.resolveCard("task.completed");
  const taskDetail = RendererRegistry.resolveDetail("task.completed");

  if (!taskCard || taskCard.name === "GenericEventCard") {
    throw new Error("task.completed should resolve to specialized card renderer");
  }
  if (!taskDetail || taskDetail.name === "GenericEventDetail") {
    throw new Error("task.completed should resolve to specialized detail renderer");
  }

  // Resolve unknown/unregistered event type (fallback test)
  const unknownCard = RendererRegistry.resolveCard("custom.unregistered.event");
  const unknownDetail = RendererRegistry.resolveDetail("custom.unregistered.event");

  assertEquals(
    unknownCard.name,
    "GenericEventCard",
    "Unregistered card should fall back to GenericEventCard",
  );
  assertEquals(
    unknownDetail.name,
    "GenericEventDetail",
    "Unregistered detail should fall back to GenericEventDetail",
  );
});

test("Time Utilities - Absolute and Detailed Formatters", () => {
  const isoTime = "2026-07-17T14:30:00.000Z";
  const formattedTime = formatTime(isoTime);

  // Verify it returns a formatted time string containing a separator
  assertEquals(formattedTime.includes(":"), true, "Formatted time should contain a colon");

  const invalidTime = formatTime("invalid-date-string");
  assertEquals(invalidTime, "", "Invalid time strings should format to empty string");
});

test("Grouping Utility - Segment Events Chronologically", () => {
  const now = new Date();

  // Create mock timestamps
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0).toISOString();
  const yesterdayIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const earlierIso = new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString();

  const mockEvents: TimelineEvent[] = [
    {
      id: "evt-today",
      eventType: "task.completed",
      projectId: "proj-1",
      payload: { title: "Today task" },
      payloadVersion: 1,
      timestamp: todayIso,
    },
    {
      id: "evt-yesterday",
      eventType: "note.created",
      projectId: "proj-1",
      payload: { title: "Yesterday note" },
      payloadVersion: 1,
      timestamp: yesterdayIso,
    },
    {
      id: "evt-earlier",
      eventType: "session.started",
      projectId: null,
      payload: {},
      payloadVersion: 1,
      timestamp: earlierIso,
    },
  ];

  const groups = groupEventsByDate(mockEvents);

  assertEquals(groups.length, 3, "Should segment into 3 distinct chronological groups");
  assertEquals(groups[0].title, "Today", "First group must be Today");
  assertEquals(groups[0].items[0].id, "evt-today", "Today group should contain today event");

  assertEquals(groups[1].title, "Yesterday", "Second group must be Yesterday");
  assertEquals(
    groups[1].items[0].id,
    "evt-yesterday",
    "Yesterday group should contain yesterday event",
  );

  assertEquals(groups[2].title, "Earlier", "Third group must be Earlier");
  assertEquals(groups[2].items[0].id, "evt-earlier", "Earlier group should contain earlier event");
});
