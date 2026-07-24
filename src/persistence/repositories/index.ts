import { SqliteProjectRepository } from "./SqliteProjectRepository";
import { SqliteNoteRepository } from "./SqliteNoteRepository";
import { SqliteSessionRepository } from "./SqliteSessionRepository";
import { SqliteTaskRepository } from "./SqliteTaskRepository";
import { SqliteSettingsRepository } from "./SqliteSettingsRepository";
import { SqliteTimelineRepository } from "./SqliteTimelineRepository";
import { SqliteSearchHistoryRepository } from "./SqliteSearchHistoryRepository";
import { SqliteSearchRepository } from "./SqliteSearchRepository";
import { SqliteVaultFileRepository } from "./SqliteVaultFileRepository";
import { SqliteVaultFolderRepository } from "./SqliteVaultFolderRepository";
import { SqliteVaultTagRepository } from "./SqliteVaultTagRepository";

export * from "./SqliteProjectRepository";
export * from "./SqliteNoteRepository";
export * from "./SqliteSessionRepository";
export * from "./SqliteTaskRepository";
export * from "./SqliteSettingsRepository";
export * from "./SqliteTimelineRepository";
export * from "./SqliteSearchHistoryRepository";
export * from "./SqliteSearchRepository";
export * from "./SqliteVaultFileRepository";
export * from "./SqliteVaultFolderRepository";
export * from "./SqliteVaultTagRepository";

// Expose instantiated singletons for application consumption
export const projectRepository = new SqliteProjectRepository();
export const noteRepository = new SqliteNoteRepository();
export const sessionRepository = new SqliteSessionRepository();
export const taskRepository = new SqliteTaskRepository();
export const settingsRepository = new SqliteSettingsRepository();
export const timelineRepository = new SqliteTimelineRepository();
export const searchHistoryRepository = new SqliteSearchHistoryRepository();
export const searchRepository = new SqliteSearchRepository();
export const vaultFileRepository = new SqliteVaultFileRepository();
export const vaultFolderRepository = new SqliteVaultFolderRepository();
export const vaultTagRepository = new SqliteVaultTagRepository();
