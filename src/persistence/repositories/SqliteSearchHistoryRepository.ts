if (typeof window !== "undefined") {
  throw new Error(
    "persistence/repositories/SqliteSearchHistoryRepository.ts must only be loaded on the server side.",
  );
}

import {
  SearchHistoryEntry,
  SearchHistoryRepository,
} from "../../contracts/repositories/SearchHistoryRepository";
import { getDatabaseConnection } from "../connection";

interface SearchHistoryRow {
  id: string;
  query: string;
  searched_at: string;
  result_count: number;
}

export class SqliteSearchHistoryRepository implements SearchHistoryRepository {
  private getDb() {
    return getDatabaseConnection();
  }

  getRecent(limit: number): SearchHistoryEntry[] {
    const rows = this.getDb()
      .prepare("SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?")
      .all(limit) as SearchHistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      searchedAt: row.searched_at,
      resultCount: row.result_count,
    }));
  }

  add(query: string, resultCount: number): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use INSERT OR REPLACE since query has UNIQUE constraint with ON CONFLICT REPLACE in schema
    this.getDb()
      .prepare(
        `
        INSERT OR REPLACE INTO search_history (id, query, searched_at, result_count)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(id, trimmed, now, resultCount);

    // Maintain database footprint to max 50 history entries
    this.getDb()
      .prepare(
        `
        DELETE FROM search_history
        WHERE id NOT IN (
          SELECT id FROM search_history
          ORDER BY searched_at DESC
          LIMIT 50
        )
      `,
      )
      .run();
  }

  delete(id: string): void {
    this.getDb().prepare("DELETE FROM search_history WHERE id = ?").run(id);
  }

  clearAll(): void {
    this.getDb().prepare("DELETE FROM search_history").run();
  }
}
