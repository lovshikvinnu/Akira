import { SqliteProjectRepository } from "./SqliteProjectRepository";
import { SqliteNoteRepository } from "./SqliteNoteRepository";
import { SqliteSessionRepository } from "./SqliteSessionRepository";
import { SqliteTaskRepository } from "./SqliteTaskRepository";
import { SqliteSettingsRepository } from "./SqliteSettingsRepository";

export * from "./SqliteProjectRepository";
export * from "./SqliteNoteRepository";
export * from "./SqliteSessionRepository";
export * from "./SqliteTaskRepository";
export * from "./SqliteSettingsRepository";

// Expose instantiated singletons for application consumption
export const projectRepository = new SqliteProjectRepository();
export const noteRepository = new SqliteNoteRepository();
export const sessionRepository = new SqliteSessionRepository();
export const taskRepository = new SqliteTaskRepository();
export const settingsRepository = new SqliteSettingsRepository();
