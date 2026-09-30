import { createServerFn } from "@tanstack/react-start";

/**
 * Deletes the data the reset dialog promises to delete.
 *
 * `akira.reset()` was `state = seed(); emit();` -- it replaced the in-memory
 * store and touched the database not at all. The user saw an empty workspace
 * and a "reset to defaults" toast, and on the next boot `getInitialState()`
 * read every row back. Measured: one project, one task, one note, one chat
 * message and fourteen memory events, all still on disk after the reset.
 *
 * So the reset was a no-op that survived exactly until reload, under a button
 * labelled "Reset all local data".
 *
 * WHAT THIS DELETES, AND WHY EXACTLY THIS
 * ---------------------------------------
 * The dialog names four things -- "Projects, missions, notes and chat" -- and
 * `seed()` returns all of them empty, so "restored to defaults" means gone
 * rather than replaced with samples. Those four are deleted here.
 *
 * `genesis_memories` is deleted with them although the dialog does not name it,
 * because it is the cognitive record *of* those four rather than separate user
 * data. Two consequences of keeping it decided this: a memory's `description`
 * holds the note's text verbatim, so AKIRA would go on recalling the contents
 * of notes the user had just deleted; and every memory's `relatedProjectId` and
 * `relatedNoteId` would point at rows that no longer exist.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH
 * -------------------------------------
 * Vault files and folders, the profile, habit streaks, the timeline, search
 * history and analytics. None is named by the dialog, and the vault in
 * particular is independent user data -- deleting someone's files under a
 * button that says "projects, missions, notes and chat" is the one failure
 * mode worse than deleting nothing. Whether reset should reach any of them is a
 * product question, not something to infer from a label.
 *
 * THE CHAT ARCHIVE IS KEPT -- AN OPEN PRODUCT QUESTION
 * ----------------------------------------------------
 * "chat" above is the *open conversation* only. The archive of every past
 * conversation -- the `akira:chat:history:v1` setting and its
 * `conversations` / `chat_messages` mirror, with their search index rows --
 * is not touched, so a reset leaves every earlier conversation in the
 * sidebar and in the database. The dialog says "chat will be restored to
 * defaults", which a user may reasonably read as the archive too.
 *
 * Deliberately unchanged in the storage-only phase that added the tables.
 * It must be decided before anything feeds the archive to the model: once
 * historical recall reads it, a reset that keeps it means a user's old
 * conversations can resurface after they asked for a clean slate.
 *
 * SESSIONS ARE DELETED, EXPLICITLY
 * --------------------------------
 * This comment used to list sessions as untouched, but `DELETE FROM projects`
 * cascaded onto them, so a reset has always emptied session history -- and
 * `seed()` empties it in the store. Sessions now outlive a deleted project
 * (ON DELETE SET NULL, for the retention window), which would have silently
 * turned reset into "keep every session, unattributed, forever". The behaviour
 * users have had is kept by saying so. The running session goes with its
 * project, as it does on a single project delete.
 *
 * ATOMIC BECAUSE HALF-DELETED IS WORSE THAN UNDELETED
 * ---------------------------------------------------
 * One transaction. A partial reset would leave tasks pointing at projects that
 * no longer exist, which is a worse state than the one being escaped.
 */
export const persistResetLocalData = createServerFn({ method: "POST" }).handler(async () => {
  const { getDatabaseConnection } = await import("./connection");
  const db = getDatabaseConnection();

  db.transaction(() => {
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM notes").run();
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM projects").run();
    // Settings is a key-value table shared with the profile, streaks and the
    // last-project pointer, so these are removed by key rather than truncated.
    db.prepare(
      "DELETE FROM settings WHERE key IN ('chat', 'genesis_memories', 'last_project_id', 'active_session')",
    ).run();
  })();
});
