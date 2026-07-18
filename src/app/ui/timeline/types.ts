import { TimelineEvent } from "@/akira-os/timeline/types";

export interface EventCardProps {
  event: TimelineEvent;
  onOpenDetails: () => void;
}

export interface EventDetailProps {
  event: TimelineEvent;
}
