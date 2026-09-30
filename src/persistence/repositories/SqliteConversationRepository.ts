if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteConversationRepository.ts must only be loaded on the server side.",
  );
}

import type { ChatConversation, ChatMessage } from "../../shared/types/store-types";
import type { ConversationRepository } from "../../contracts/repositories/ConversationRepository";
import { getDatabaseConnection } from "../connection";

/** The setting that holds the chat archive `routes/chat.tsx` reads. */
export const CHAT_ARCHIVE_KEY = "akira:chat:history:v1";

interface MessageRow {
  id: string;
  conversation_id: string;
  role: ChatMessage["role"];
  text: string;
  created_at: string;
}

/**
 * The chat archive, stored twice on purpose during this phase.
 *
 * `routes/chat.tsx` reads the archive as one JSON blob in `settings`, and the
 * UI is unchanged. The `conversations` / `chat_messages` tables are the
 * first-class copy that search indexes and that later retrieval will read.
 *
 * Two copies drift unless there is exactly one way to write them. `save`
 * writes both in one transaction, so neither can land without the other, and
 * `syncFromArchive` re-derives the tables from the blob at every start, which
 * is also how an existing archive is migrated and how a past drift is
 * repaired. The blob is the source of truth; the tables are its mirror.
 */
export class SqliteConversationRepository implements ConversationRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  save(conversations: ChatConversation[]): void {
    const db = this.getDb();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(CHAT_ARCHIVE_KEY, JSON.stringify(conversations), new Date().toISOString());
      this.mirror(conversations);
    })();
  }

  syncFromArchive(): void {
    const row = this.getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(CHAT_ARCHIVE_KEY) as { value: string } | undefined;
    let archive: unknown = [];
    if (row) {
      try {
        archive = JSON.parse(row.value);
      } catch (err) {
        // Refuse rather than mirror garbage over the tables: an unreadable
        // blob is not an empty archive, and treating it as one would delete
        // every row.
        console.error(
          "[conversations] chat archive is not valid JSON; tables left as they are:",
          err,
        );
        return;
      }
    }
    if (!Array.isArray(archive)) {
      console.error("[conversations] chat archive is not an array; tables left as they are.");
      return;
    }
    const db = this.getDb();
    db.transaction(() => this.mirror(archive as ChatConversation[]))();
  }

  getMessages(conversationId: string): ChatMessage[] {
    const rows = this.getDb()
      .prepare(
        `SELECT id, conversation_id, role, text, created_at FROM chat_messages
         WHERE conversation_id = ? ORDER BY created_at ASC, position ASC`,
      )
      .all(conversationId) as MessageRow[];
    return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, createdAt: r.created_at }));
  }

  /**
   * Makes the tables equal to `conversations`, touching only what differs.
   *
   * An unchanged row is not rewritten, so saving the whole archive after one
   * new message costs one insert, not a rewrite of every message's index row.
   * What is gone from the archive is deleted; `chat_messages` cascades from
   * `conversations`, and the FTS delete trigger removes each message's entry.
   */
  private mirror(conversations: ChatConversation[]): void {
    const db = this.getDb();
    const upsertConversation = db.prepare(
      `INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, created_at = excluded.created_at, updated_at = excluded.updated_at
       WHERE title IS NOT excluded.title OR created_at IS NOT excluded.created_at
          OR updated_at IS NOT excluded.updated_at`,
    );
    const upsertMessage = db.prepare(
      `INSERT INTO chat_messages (id, conversation_id, role, text, created_at, position)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         conversation_id = excluded.conversation_id, role = excluded.role, text = excluded.text,
         created_at = excluded.created_at, position = excluded.position
       WHERE conversation_id IS NOT excluded.conversation_id OR role IS NOT excluded.role
          OR text IS NOT excluded.text OR created_at IS NOT excluded.created_at
          OR position IS NOT excluded.position`,
    );

    const conversationIds: string[] = [];
    const messageIds: string[] = [];
    const seenMessageIds = new Set<string>();

    conversations.forEach((conv, convIndex) => {
      // Ids the archive lacks are derived, never random, so re-mirroring the
      // same archive after a restart names the same rows instead of adding
      // copies.
      const convId = conv.id || `legacy-conversation:${conv.createdAt ?? convIndex}`;
      conversationIds.push(convId);
      const createdAt = conv.createdAt || new Date(0).toISOString();
      upsertConversation.run(convId, conv.title ?? "", createdAt, conv.updatedAt || createdAt);

      (conv.messages ?? []).forEach((msg, position) => {
        let id = msg.id || `${convId}:${position}`;
        // A message id is meant to be unique across the archive. If one is
        // not, keying both on it would move the first into the second's
        // conversation; scoping the repeat keeps both.
        if (seenMessageIds.has(id)) id = `${convId}:${id}`;
        seenMessageIds.add(id);
        messageIds.push(id);
        upsertMessage.run(
          id,
          convId,
          msg.role === "user" ? "user" : "akira",
          msg.text ?? "",
          msg.createdAt || createdAt,
          position,
        );
      });
    });

    db.prepare("DELETE FROM chat_messages WHERE id NOT IN (SELECT value FROM json_each(?))").run(
      JSON.stringify(messageIds),
    );
    db.prepare("DELETE FROM conversations WHERE id NOT IN (SELECT value FROM json_each(?))").run(
      JSON.stringify(conversationIds),
    );
  }
}
