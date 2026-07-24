import { ComponentType } from "react";
import { EventCardProps, EventDetailProps } from "./types";
import { GenericEventCard } from "./renderers/GenericEventCard";
import { GenericEventDetail } from "./renderers/GenericEventDetail";

// Specialized imports
import { TaskEventCard, TaskEventDetail } from "./renderers/TaskEventCard";
import { NoteEventCard, NoteEventDetail } from "./renderers/NoteEventCard";
import { SessionEventCard, SessionEventDetail } from "./renderers/SessionEventCard";
import { ProjectEventCard, ProjectEventDetail } from "./renderers/ProjectEventCard";

class RendererRegistryClass {
  private cardMap = new Map<string, ComponentType<EventCardProps>>();
  private detailMap = new Map<string, ComponentType<EventDetailProps>>();

  public register(
    eventType: string,
    cardComponent: ComponentType<EventCardProps>,
    detailComponent?: ComponentType<EventDetailProps>,
  ): void {
    this.cardMap.set(eventType, cardComponent);
    if (detailComponent) {
      this.detailMap.set(eventType, detailComponent);
    }
  }

  public resolveCard(eventType: string): ComponentType<EventCardProps> {
    return this.cardMap.get(eventType) || GenericEventCard;
  }

  public resolveDetail(eventType: string): ComponentType<EventDetailProps> {
    return this.detailMap.get(eventType) || GenericEventDetail;
  }
}

export const RendererRegistry = new RendererRegistryClass();

// Register Task Event Renderers
RendererRegistry.register("task.created", TaskEventCard, TaskEventDetail);
RendererRegistry.register("task.completed", TaskEventCard, TaskEventDetail);
RendererRegistry.register("task.updated", TaskEventCard, TaskEventDetail);
RendererRegistry.register("task.deleted", TaskEventCard, TaskEventDetail);
RendererRegistry.register("mission.completed", TaskEventCard, TaskEventDetail);

// Register Note Event Renderers
RendererRegistry.register("note.created", NoteEventCard, NoteEventDetail);
RendererRegistry.register("note.edited", NoteEventCard, NoteEventDetail);
RendererRegistry.register("note.deleted", NoteEventCard, NoteEventDetail);

// Register Session Event Renderers
RendererRegistry.register("session.started", SessionEventCard, SessionEventDetail);
RendererRegistry.register("session.ended", SessionEventCard, SessionEventDetail);

// Register Project Event Renderers
RendererRegistry.register("project.created", ProjectEventCard, ProjectEventDetail);
RendererRegistry.register("project.updated", ProjectEventCard, ProjectEventDetail);
RendererRegistry.register("project.continued", ProjectEventCard, ProjectEventDetail);
RendererRegistry.register("project.deleted", ProjectEventCard, ProjectEventDetail);
