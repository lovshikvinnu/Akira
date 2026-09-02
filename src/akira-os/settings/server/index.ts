import { createServerFn } from "@tanstack/react-start";
import type { Profile, ChatMessage, HabitStreak } from "../../../shared/types/store-types";
import type { MemoryEvent } from "../../../shared/types/event-types";

export const persistUpdateProfile = createServerFn({ method: "POST" })
  .validator((profile: Profile) => profile)
  .handler(async ({ data: profile }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.set("profile", JSON.stringify(profile));
  });

export const persistUpdateLastProjectId = createServerFn({ method: "POST" })
  .validator((id: string | null) => id)
  .handler(async ({ data: id }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    if (id === null) {
      settingsRepository.delete("last_project_id");
    } else {
      settingsRepository.set("last_project_id", JSON.stringify(id));
    }
  });

export const persistUpdateChat = createServerFn({ method: "POST" })
  .validator((chat: ChatMessage[]) => chat)
  .handler(async ({ data: chat }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.set("chat", JSON.stringify(chat));
  });

export const persistUpdateStreaks = createServerFn({ method: "POST" })
  .validator((streaks: HabitStreak[]) => streaks)
  .handler(async ({ data: streaks }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.set("streaks", JSON.stringify(streaks));
  });

/**
 * Persists the GENESIS MemoryEvent stream.
 *
 * This is the whole durable cognitive layer: candidates, memories, stories,
 * importance, relationships and understandings are all rebuilt from it on
 * startup, so none of them are stored. Kept as a settings blob rather than a
 * table because it is read wholesale at boot, never queried by field, and
 * bounded by the retention policy — the same shape as `chat` and `streaks`.
 */
export const persistUpdateMemories = createServerFn({ method: "POST" })
  .validator((memories: MemoryEvent[]) => memories)
  .handler(async ({ data: memories }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.set("genesis_memories", JSON.stringify(memories));
  });

export const persistGetSetting = createServerFn({ method: "GET" })
  .validator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    return settingsRepository.get(key);
  });

export const persistSetSetting = createServerFn({ method: "POST" })
  .validator((input: { key: string; value: string }) => input)
  .handler(async ({ data: { key, value } }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.set(key, value);
  });

export const persistDeleteSetting = createServerFn({ method: "POST" })
  .validator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { settingsRepository } = await import("../../../persistence/repositories");
    settingsRepository.delete(key);
  });
