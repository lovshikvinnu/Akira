import type { Profile, ChatMessage, HabitStreak } from "../../../shared/types/store-types";
import {
  persistUpdateProfile,
  persistUpdateLastProjectId,
  persistUpdateChat,
  persistUpdateStreaks,
  persistGetSetting,
  persistSetSetting,
  persistDeleteSetting,
} from "../server";

export const settingsService = {
  getProfile() {
    throw new Error("settingsService.getProfile should be read via getInitialState on startup");
  },
  async updateProfile(patch: Partial<Profile>, currentProfile: Profile): Promise<void> {
    const profile = { ...currentProfile, ...patch };
    await persistUpdateProfile({ data: profile });
  },
  async updateLastProjectId(id: string | null): Promise<void> {
    await persistUpdateLastProjectId({ data: id });
  },
  async updateChat(chat: ChatMessage[]): Promise<void> {
    await persistUpdateChat({ data: chat });
  },
  async updateStreaks(streaks: HabitStreak[]): Promise<void> {
    await persistUpdateStreaks({ data: streaks });
  },
  async get(key: string): Promise<string | null> {
    return persistGetSetting({ data: key });
  },
  async set(key: string, value: string): Promise<void> {
    await persistSetSetting({ data: { key, value } });
  },
  async delete(key: string): Promise<void> {
    await persistDeleteSetting({ data: key });
  },
};
