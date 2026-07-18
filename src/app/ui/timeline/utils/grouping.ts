import { TimelineEvent } from "@/akira-os/timeline/types";

export interface TimelineGroup {
  title: string;
  items: TimelineEvent[];
}

export function groupEventsByDate(events: TimelineEvent[]): TimelineGroup[] {
  if (events.length === 0) return [];

  const today: TimelineEvent[] = [];
  const yesterday: TimelineEvent[] = [];
  const earlierThisWeek: TimelineEvent[] = [];
  const earlier: TimelineEvent[] = [];

  const now = new Date();

  // Start of today (local time)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Start of yesterday (local time)
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  // Start of this week (7 days ago)
  const startOfThisWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

  events.forEach((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    if (eventTime >= startOfToday) {
      today.push(event);
    } else if (eventTime >= startOfYesterday) {
      yesterday.push(event);
    } else if (eventTime >= startOfThisWeek) {
      earlierThisWeek.push(event);
    } else {
      earlier.push(event);
    }
  });

  const groups: TimelineGroup[] = [];
  if (today.length > 0) groups.push({ title: "Today", items: today });
  if (yesterday.length > 0) groups.push({ title: "Yesterday", items: yesterday });
  if (earlierThisWeek.length > 0) {
    groups.push({ title: "Earlier this Week", items: earlierThisWeek });
  }
  if (earlier.length > 0) groups.push({ title: "Earlier", items: earlier });

  return groups;
}
