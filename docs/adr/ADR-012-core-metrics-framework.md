# ADR-012: Core Metrics Framework

## Status
Proposed / Accepted

## Context
With the base Analytics engine and SQLite repository established in Sprint 1.1, Sprint 1.2 requires implementing concrete production metric calculators for Productivity, Activity, Projects, Vault, Search, and Sessions. These calculators must remain range-agnostic, timezone-aware, and performant under large datasets, without violating the core principle of *exclusive consumption of the Event Store* or creating dependencies on business modules.

## Decision
We enforce the following architectural patterns for the Core Metrics framework:

### 1. Range-Agnostic Calculator Execution
- Calculators must not keep hardcoded logic for Daily, Weekly, or Monthly periods.
- Instead, the calculators consume a simple array of events. The `AnalyticsEngine` performs the date boundary splitting and timezone-offset adjustments, grouping events into daily, weekly, or monthly buckets, and feeding each bucket's events to the calculators.

### 2. Timezone Boundary Management via UTC Math
- We reject relying on browser locale dependencies or large timezone packages (like Moment or Luxon).
- Timezone offsets are specified in positive/negative minutes (e.g., IST is +330, EST is -300).
- Timestamps are adjusted using absolute milliseconds offset arithmetic prior to extracting date strings, ensuring correct boundary calculation on the server side:
  `localTime = new Date(eventTime + offsetMinutes * 60 * 1000)`

### 3. Business-Decoupled Core Metrics
- **Productivity Score Formula**: The score is calculated deterministically:
  `Productivity Score = (completed * 10) + (created * 2) - (reopened * 5) + (completed === created && created > 0 ? 20 : 0)`
- **Dormant Projects Identification**: The list of all known projects is compiled solely by scanning the Event Store history for project identity events. Any project that exists historically but lacks events in the active query range is classified as dormant.
- **Search Term Frequencies**: Frequencies are aggregated in a map and sorted, returning the top searched terms and tracking repeated queries without querying external search history databases.
- **Focus Sessions**: Durations are normalized from minutes in the event payload to standard focus seconds to facilitate average and peak calculations.

## Consequences
- **Testability**: Calculators are 100% testable in isolation. Out-of-order, duplicates, timezone adjustments, and empty histories are validated quickly.
- **Maintainability**: New calendar grouping structures (e.g., quarters, years) can be introduced at the engine/clock layer without altering calculator implementations.
- **Performance**: High-volume load tests verify that aggregating 2,000 events takes less than 30ms, ensuring background processes remain extremely light.
