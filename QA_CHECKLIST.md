# AKIRA Developer QA Checklist & System Verification

This checklist validates the stability, cognitive integrity, user experience, and accessibility of AKIRA (v2.15.0-alpha) for the Internal Alpha release.

---

## 1. Work Sessions & Session Continuity

- [ ] **Active Session Lifecycles**
  - Verify that `startSession(projectId, task)` correctly initializes the session in `akira-store`.
  - Verify that `endSession(notes)` consolidates the session data and appends it to the `sessions` state history.
- [ ] **Crash Recovery & Browser Reloads**
  - Trigger a browser refresh or close the tab during an active work session.
  - Verify that the active session state is automatically restored on reload.
  - Verify that the workspace outcome accumulators (events, candidates, memories) are reconstructed dynamically from historical logs without duplicating write updates to the Brain.
- [ ] **Session History View (`/sessions`)**
  - Verify that the new Sessions page lists all completed sessions correctly with duration and start timestamp.
  - Click a completed session and verify that the Reflection Summary modal opens displaying the correct events, memory candidates, story updates, and identity observations resolved during that specific session's timeframe.
  - Verify that clicking "Return Home" or using keyboard navigation works seamlessly.

## 2. Memory Engine & Cognitive Pipelines

- [ ] **Memory Pipeline & Event Logging**
  - Send a message to AKIRA. Verify that the event is logged to the Event Inspector.
  - Verify that candidate nodes are generated for meaningful observations (e.g. repeated actions, key milestones).
- [ ] **Story Narrative Engine**
  - Verify that when a user announces progress, story nodes are initialized, updated, or marked completed.
  - Verify that stories are linked to memories.
- [ ] **Identity & Traits Engine**
  - Verify that user preferences, hobbies, or personality observations are translated into traits with confidence levels.
  - Verify that trait observations update onboarding hypotheses.
- [ ] **Recall Cache & Retrieval**
  - Verify that when context packages are built, previous relevant memories are retrieved via `recallService`.
  - Verify that recall hits populate the context builder package.

## 3. Brain Inspector & Debugger (`/brain`)

- [ ] **Real-time Pipeline Flowchart**
  - Open `/brain`. Verify that the SVG flowchart renders correctly.
  - Send a message in another window or mock a pipeline event and verify that the corresponding node flashes with telemetry highlight indicators.
- [ ] **Logs Viewer**
  - Click the **Logs** tab in `/brain`.
  - Verify that real-time structured logs (INFO, WARN, ERROR) are displayed chronologically.
  - Search/filter the logs. Verify that search behaves responsively.
  - Click a log entry with `details` and verify it expands to show the formatted JSON detail.
  - Click **Clear Logs** and verify the history is cleared.
- [ ] **Performance Limits**
  - Verify that the events, candidates, and memories tabs limit DOM rendering to 100 entries.
  - Verify that the "+ Show 100 More" button expands the list limits correctly.

## 4. Error Boundaries & Resilience

- [ ] **Root Error Boundary**
  - Mock a component crash on any page.
  - Verify that the recovery card renders.
  - Check that the stack trace is completely hidden from normal users.
  - Toggle Developer Mode on in Settings, refresh the error page, and verify the "Developer Debug Info" panel is visible with "Show Stack Trace" and "Copy Details" buttons.
  - Click "Copy Details". Verify it copies the error message and stack trace to the clipboard.

## 5. UI Polishing & Accessibility

- [ ] **Empty States & Loading Indicators**
  - Clear local storage. Verify that the polished `EmptyState` component renders for empty searches, empty session histories, and empty memory inspector feeds.
  - Verify that loading indicators animate correctly during AI reasoning streams.
- [ ] **Visual Transitions**
  - Navigate between routes. Verify that pages fade and slide in smoothly using the new `animate-page-enter` transition.
- [ ] **Accessibility (a11y)**
  - Navigate the entire application using only the keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`).
  - Verify that all active controls, buttons, and inputs display clear visual focus outlines.
  - Check that inputs and buttons use appropriate HTML semantic elements and possess clear screen-reader labels.
