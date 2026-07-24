/* eslint-disable @typescript-eslint/no-explicit-any */
import { AkiraEvent } from "../event-types";
import { EventSubscriber } from "../subscriber";

export class TimelineSubscriber implements EventSubscriber {
  readonly id = "timeline-subscriber";

  constructor(private timelineRepository: any) {}

  async onEvent(event: AkiraEvent): Promise<void> {
    if (!this.isEventSupported(event.type)) {
      return;
    }

    // Extract project ID from the event payload
    let projectId: string | null = null;
    if (event.payload) {
      const payload = event.payload as any;
      if (typeof payload.projectId === "string") {
        projectId = payload.projectId;
      } else if (typeof payload.relatedProjectId === "string") {
        projectId = payload.relatedProjectId;
      } else if (typeof payload.id === "string" && (payload.color || payload.icon)) {
        // Payload is a project entity itself
        projectId = payload.id;
      }
    }

    // Fallback search trigger check
    if (!projectId && event.entityId && event.type.startsWith("project.")) {
      projectId = event.entityId;
    }

    // Construct Timeline Event reusing AkiraEvent.id to prevent duplication
    const timelineEvent = {
      id: event.id,
      eventType: event.type,
      projectId,
      payload: event.payload ? { ...(event.payload as any) } : {},
      payloadVersion: 1,
      timestamp: event.timestamp,
    };

    try {
      this.timelineRepository.insert(timelineEvent);
    } catch (err) {
      console.error(
        `[TimelineSubscriber] Failed to insert timeline event for type "${event.type}":`,
        err,
      );
      throw err;
    }
  }

  private isEventSupported(type: string): boolean {
    const supportedTypes = [
      "project.created",
      "project.updated",
      "project.continued",
      "project.deleted",
      "task.created",
      "task.completed",
      "task.updated",
      "task.deleted",
      "mission.completed",
      "note.created",
      "note.edited",
      "note.deleted",
      "session.started",
      "session.ended",
      "vault.file.uploaded",
      "vault.file.renamed",
      "vault.file.moved",
      "vault.file.deleted",
      "vault.file.restored",
      "vault.folder.created",
      "vault.folder.deleted",
      "vault.folder.moved",
    ];
    return supportedTypes.includes(type);
  }
}
