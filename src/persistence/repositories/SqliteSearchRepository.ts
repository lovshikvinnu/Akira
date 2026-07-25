if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteSearchRepository.ts must only be loaded on the server side.",
  );
}

import { SearchRequest, SearchResult } from "../../contracts/search";
import { SearchRepository } from "../../contracts/repositories/SearchRepository";
import { getDatabaseConnection } from "../connection";

export class SqliteSearchRepository implements SearchRepository {
  // Configurable ranking parameters
  public static BM25_WEIGHT = 10.0;
  public static RECENCY_WEIGHT = 20.0;

  private getDb() {
    return getDatabaseConnection();
  }

  /**
   * Helper to execute operations with exponential backoff on database locks (SQLITE_BUSY)
   */
  private executeWithRetry<T>(fn: () => T, retries = 3, delay = 50): T {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return fn();
      } catch (err: any) {
        attempt++;
        const isLocked =
          err?.code === "SQLITE_BUSY" ||
          err?.message?.includes("busy") ||
          err?.message?.includes("locked");
        if (isLocked && attempt < retries) {
          const sleepTime = delay * Math.pow(2, attempt);
          const start = Date.now();
          // Synchronous spin sleep suitable for Node.js worker/SSR environment
          while (Date.now() - start < sleepTime) {
            // wait
          }
          continue;
        }
        throw err;
      }
    }
    throw new Error("Maximum database retry attempts exceeded");
  }

  search(request: SearchRequest): SearchResult[] {
    return this.executeWithRetry(() => {
      const { query, limit = 50, scope } = request;
      const sanitizedQuery = query.trim();

      if (!sanitizedQuery) {
        return [];
      }

      const cleanTokens = sanitizedQuery
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .map((t) => `${t}*`);

      if (cleanTokens.length === 0) {
        return [];
      }

      const ftsExpression = cleanTokens.join(" ");
      let scopeClause = "";
      const params: unknown[] = [
        SqliteSearchRepository.BM25_WEIGHT,
        SqliteSearchRepository.RECENCY_WEIGHT,
        ftsExpression,
      ];

      if (scope && scope.length > 0) {
        const placeholders = scope.map(() => "?").join(", ");
        scopeClause = `AND entity_type IN (${placeholders})`;
        params.push(...scope);
      }

      params.push(limit);

      const sql = `
        SELECT 
          entity_id,
          entity_type,
          title,
          content,
          updated_at,
          bm25(fts_workspace) AS raw_score,
          (
            -bm25(fts_workspace) * ? + 
            (? / (julianday('now') - julianday(updated_at) + 1.0))
          ) AS relevance_score
        FROM fts_workspace
        WHERE fts_workspace MATCH ?
        ${scopeClause}
        ORDER BY relevance_score DESC
        LIMIT ?
      `;

      const start = performance.now();
      try {
        const rows = this.getDb()
          .prepare(sql)
          .all(...params) as Array<{
          entity_id: string;
          entity_type: string;
          title: string;
          content: string;
          updated_at: string;
          raw_score: number;
          relevance_score: number;
        }>;

        const results = rows.map((row) => ({
          id: row.entity_id,
          type: row.entity_type as SearchResult["type"],
          title: row.title,
          description: row.content || "",
          score: parseFloat((row.relevance_score || 0).toFixed(2)),
          metadata: {
            updatedAt: row.updated_at,
            rawScore: row.raw_score,
          },
        }));

        const duration = performance.now() - start;
        if (duration > 100) {
          console.warn(
            `[Slow Query] Search query "${query}" took ${duration.toFixed(2)}ms (results: ${results.length})`,
          );
        }

        return results;
      } catch (error) {
        console.error("FTS5 Search failed, falling back to basic LIKE query:", error);
        const fallbackResults = this.fallbackLikeSearch(sanitizedQuery, limit, scope);

        const duration = performance.now() - start;
        if (duration > 100) {
          console.warn(
            `[Slow Query Fallback] Search query "${query}" took ${duration.toFixed(2)}ms`,
          );
        }
        return fallbackResults;
      }
    });
  }

  private fallbackLikeSearch(query: string, limit: number, scope?: string[]): SearchResult[] {
    const term = `%${query}%`;
    const params: unknown[] = [term, term];
    let scopeClause = "";

    if (scope && scope.length > 0) {
      const placeholders = scope.map(() => "?").join(", ");
      scopeClause = `AND entity_type IN (${placeholders})`;
      params.push(...scope);
    }
    params.push(limit);

    const sql = `
      SELECT entity_id, entity_type, title, content, updated_at
      FROM fts_workspace
      WHERE (title LIKE ? OR content LIKE ?)
      ${scopeClause}
      ORDER BY updated_at DESC
      LIMIT ?
    `;

    try {
      const rows = this.getDb()
        .prepare(sql)
        .all(...params) as Array<{
        entity_id: string;
        entity_type: string;
        title: string;
        content: string;
        updated_at: string;
      }>;

      return rows.map((row) => ({
        id: row.entity_id,
        type: row.entity_type as SearchResult["type"],
        title: row.title,
        description: row.content || "",
        score: 1.0,
        metadata: {
          updatedAt: row.updated_at,
          fallback: true,
        },
      }));
    } catch (e) {
      console.error("Search fallback query failed completely:", e);
      return [];
    }
  }

  verifyIntegrity(): boolean {
    return this.executeWithRetry(() => {
      try {
        const db = this.getDb();

        // 1. Run internal SQLite FTS5 integrity check statement
        db.prepare("INSERT INTO fts_workspace(fts_workspace) VALUES('integrity-check')").run();

        // 2. Cross-reference source tables to ensure all entity records are indexed
        const entities = [
          { table: "projects", type: "project" },
          { table: "tasks", type: "task" },
          { table: "notes", type: "note" },
          { table: "sessions", type: "session" },
          { table: "timeline_events", type: "timeline" },
        ];

        let hasMismatch = false;
        for (const ent of entities) {
          const sourceCount = (
            db.prepare(`SELECT COUNT(*) as cnt FROM ${ent.table}`).get() as { cnt: number }
          ).cnt;
          const ftsCount = (
            db
              .prepare(`SELECT COUNT(*) as cnt FROM fts_workspace WHERE entity_type = ?`)
              .get(ent.type) as { cnt: number }
          ).cnt;
          if (sourceCount !== ftsCount) {
            console.warn(
              `[Integrity Mismatch] Source table "${ent.table}" has ${sourceCount} items, but FTS5 table has ${ftsCount} index items.`,
            );
            hasMismatch = true;
          }
        }

        if (hasMismatch) {
          console.warn("Index mismatch detected. Rebuilding FTS5 workspace index...");
          db.prepare("INSERT INTO fts_workspace(fts_workspace) VALUES('rebuild')").run();
        }

        return true;
      } catch (error) {
        console.error("FTS5 integrity check failed, rebuilding index:", error);
        try {
          this.getDb().prepare("INSERT INTO fts_workspace(fts_workspace) VALUES('rebuild')").run();
          return true;
        } catch (rebuildError) {
          console.error("FTS5 index rebuild failed completely:", rebuildError);
          return false;
        }
      }
    });
  }
}
