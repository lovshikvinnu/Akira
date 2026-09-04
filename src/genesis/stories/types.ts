export type StoryStatus = "Active" | "Completed" | "Archived";

export type Story = {
  id: string;
  title: string;
  summary: string;
  status: StoryStatus;
  relatedMemoryIds: string[];
  ruleProvenance: string;
  createdAt: string;
  updatedAt: string;
};
