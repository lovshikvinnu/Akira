import {
  classifyTimePeriod,
  classifyReturnState,
  isFirstSessionToday,
  isUnusualAccessTime,
  calculateContinuityConfidence,
  calculatePresenceConfidence,
  buildPresenceContext,
} from "./index";

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  console.log(`Running: ${name}`);
  try {
    fn();
    passedTests++;
  } catch (error) {
    console.error(`  ✗ Failed: ${name}`);
    console.error(error);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ----------------------------------------------------

test("classifyTimePeriod matches hours correctly", () => {
  assertEquals(classifyTimePeriod(5), "Morning", "5:00 should be Morning");
  assertEquals(classifyTimePeriod(9), "Morning", "9:00 should be Morning");
  assertEquals(classifyTimePeriod(11), "Morning", "11:00 should be Morning");

  assertEquals(classifyTimePeriod(12), "Afternoon", "12:00 should be Afternoon");
  assertEquals(classifyTimePeriod(15), "Afternoon", "15:00 should be Afternoon");
  assertEquals(classifyTimePeriod(16), "Afternoon", "16:00 should be Afternoon");

  assertEquals(classifyTimePeriod(17), "Evening", "17:00 should be Evening");
  assertEquals(classifyTimePeriod(20), "Evening", "20:00 should be Evening");
  assertEquals(classifyTimePeriod(21), "Evening", "21:00 should be Evening");

  assertEquals(classifyTimePeriod(22), "Night", "22:00 should be Night");
  assertEquals(classifyTimePeriod(0), "Night", "0:00 should be Night");
  assertEquals(classifyTimePeriod(4), "Night", "4:00 should be Night");

  // Normalization checks
  assertEquals(classifyTimePeriod(-1), "Night", "-1:00 should map to 23:00 (Night)");
  assertEquals(classifyTimePeriod(25), "Night", "25 % 24 = 1 -> Night");
});

test("classifyReturnState handles gaps accurately", () => {
  assertEquals(
    classifyReturnState(1000, false),
    "New",
    "No prior history must result in New return state",
  );

  const sameDayGap = 2 * 60 * 60 * 1000; // 2 hours
  assertEquals(
    classifyReturnState(sameDayGap, true),
    "Same Day Return",
    "2h gap with history is Same Day Return",
  );

  const nextDayGap = 20 * 60 * 60 * 1000; // 20 hours
  assertEquals(
    classifyReturnState(nextDayGap, true),
    "Next Day Return",
    "20h gap with history is Next Day Return",
  );

  const longGap = 40 * 60 * 60 * 1000; // 40 hours
  assertEquals(
    classifyReturnState(longGap, true),
    "Long Absence",
    "40h gap with history is Long Absence",
  );
});

test("isFirstSessionToday checks day boundary", () => {
  const t0 = 1717000000000; // base timestamp

  assertEquals(isFirstSessionToday(t0, undefined), true, "No last start is always first session");

  // Gap of 2 hours, local hour is 10:00. Time since midnight is 10h, so gap < 10h (same day)
  assertEquals(
    isFirstSessionToday(t0, t0 - 2 * 3600000, 10),
    false,
    "2h gap on same day is not first session",
  );

  // Gap of 12 hours, local hour is 10:00. Time since midnight is 10h, so gap > 10h (crossed midnight)
  assertEquals(
    isFirstSessionToday(t0, t0 - 12 * 3600000, 10),
    true,
    "12h gap at 10 AM crossed midnight, so first session",
  );

  // Default hour fallback
  assertEquals(
    isFirstSessionToday(t0, t0 - 30 * 3600000),
    true,
    "30h gap crossed 24h day boundary",
  );
});

test("isUnusualAccessTime flags off-peak hours", () => {
  assertEquals(isUnusualAccessTime(2), true, "2:00 should be flagged unusual");
  assertEquals(isUnusualAccessTime(23), true, "23:00 should be flagged unusual");
  assertEquals(isUnusualAccessTime(10), false, "10:00 should not be flagged unusual");
});

test("calculateConfidence values decay correctly", () => {
  // Continuity Confidence (max decay gap: 2 hours)
  assertEquals(calculateContinuityConfidence(0), 1.0, "0 gap is 1.0 continuity");
  assertEquals(calculateContinuityConfidence(3600000), 0.5, "1h gap is 0.5 continuity");
  assertEquals(calculateContinuityConfidence(7200000), 0.0, "2h gap is 0.0 continuity");
  assertEquals(calculateContinuityConfidence(10000000), 0.0, "Over max decay gap is 0.0");

  // Presence Confidence (max idle gap: 15 mins)
  assertEquals(calculatePresenceConfidence(0), 1.0, "0 idle is 1.0 presence");
  assertEquals(calculatePresenceConfidence(450000), 0.5, "7.5m idle is 0.5 presence");
  assertEquals(calculatePresenceConfidence(900000), 0.0, "15m idle is 0.0 presence");
});

test("buildPresenceContext produces complete outputs with provenance", () => {
  const currentStart = Date.now();
  const context = buildPresenceContext({
    currentTemporalReference: currentStart,
    lastSessionEndReference: currentStart - 1 * 60 * 60 * 1000, // 1h gap
    lastSessionStartReference: currentStart - 5 * 60 * 60 * 1000,
    lastEventTemporalReference: currentStart - 5 * 60 * 1000, // 5 mins ago
    hasPriorHistory: true,
    recentProjectId: "akira-core",
    activeSessionType: "Focus",
    localHourOfDay: 14,
  });

  assertEquals(context.origin, "PresenceEngine", "Provenance origin must be PresenceEngine");
  assertEquals(
    context.evidence.currentSessionStart,
    currentStart,
    "Evidence session start should match input",
  );
  assertEquals(context.evidence.recentProjectId, "akira-core", "Evidence project ID should match");
  assertEquals(context.sessionType, "Focus", "Session type should match");
  assertEquals(context.returnState, "Same Day Return", "1h gap should be Same Day Return");
  assertEquals(context.timePeriod, "Afternoon", "14h should be Afternoon");
  assertEquals(
    context.resumedConversation,
    false,
    "1h gap with open conversation should not be resumed (exceeds 30m threshold)",
  );
  assertEquals(context.continuityConfidence, 0.5, "1h gap matches 0.5 continuity confidence");
  assertEquals(context.presenceConfidence, 0.67, "5 min idle matches ~0.67 presence confidence");
});

// ----------------------------------------------------

console.log(`\nTest Run Completed: ${passedTests} / ${totalTests} Passed.`);
if (passedTests < totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
