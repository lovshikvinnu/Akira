import { createServerFn } from "@tanstack/react-start";
import { AkiraState } from "../shared/types/store-types";

export const getInitialState = createServerFn({ method: "GET" }).handler(async (): Promise<any> => {
  // Dynamic imports to prevent better-sqlite3 from leaking into browser packages
  const {
    projectRepository,
    noteRepository,
    sessionRepository,
    taskRepository,
    settingsRepository,
    vaultFileRepository,
    vaultFolderRepository,
  } = await import("./repositories");

  const projects = projectRepository.getAll();
  const tasks = taskRepository.getAll();
  const notes = noteRepository.getAll();
  const sessions = sessionRepository.getAll();
  const vaultFiles = vaultFileRepository.getAll();
  const vaultFolders = vaultFolderRepository.getAll();

  const activeSessionRaw = settingsRepository.get("active_session");
  const activeSession = activeSessionRaw ? JSON.parse(activeSessionRaw) : null;

  const profileRaw = settingsRepository.get("profile");
  const profile = profileRaw
    ? JSON.parse(profileRaw)
    : {
        name: "Lovshik",
        role: "Developer",
        motto: "Building Akira",
      };

  const lastProjectIdRaw = settingsRepository.get("last_project_id");
  const lastProjectId = lastProjectIdRaw ? JSON.parse(lastProjectIdRaw) : null;

  const chatRaw = settingsRepository.get("chat");
  const chat = chatRaw ? JSON.parse(chatRaw) : [];

  const streaksRaw = settingsRepository.get("streaks");
  const streaks = streaksRaw ? JSON.parse(streaksRaw) : [];

  return {
    projects,
    tasks,
    notes,
    sessions,
    activeSession,
    profile,
    lastProjectId,
    chat,
    streaks,
    memories: [],
    vaultFiles,
    vaultFolders,
  };
});
