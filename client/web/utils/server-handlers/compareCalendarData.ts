"use client";

import {
  Planner,
  SimpleEvent,
  EventTemplate,
  EventExtendedProps,
  Category,
  CategoryTimeWindow,
  CategoryEvent,
  TravelEvent,
  EngineMessage,
  Queue,
  QueueMember,
  PlannerDependency,
} from "@/types/prisma";
import type {
  SerializedLocation,
  SerializedTravelTime,
} from "@/redux/slices/schedulingSettingsSlice";
import { objectsAreEqual } from "../generalUtils";
import { syncCalendarData } from "@/actions/calendar-actions/syncCalendarData";

type ChangeGroup<T> = {
  create: T[];
  update: T[];
  destroy: T[];
};

type PlannerChange = Planner;
type CalendarChange = Omit<SimpleEvent, "extendedProps">;
type TemplateChange = EventTemplate;
type ExtendedPropsChange = EventExtendedProps;
// timeSlots is a related table — flattened across categories and diffed as
// its own group below so a window edit doesn't look like a category update.
type CategoryChange = Omit<Category, "timeSlots">;
type CategoryTimeWindowChange = CategoryTimeWindow;
type CategoryEventChange = CategoryEvent;
type TravelEventChange = TravelEvent;
type EngineMessageChange = EngineMessage;
// members is a related table — flattened across queues and diffed as its own
// group (the categories/timeSlots pattern).
type QueueChange = Omit<Queue, "members">;
type QueueMemberChange = QueueMember;
// Dependency rows are immutable: created or deleted, never updated.
type DependencyChange = PlannerDependency;
// Only the editable own-row fields. address/lat/lng/placeId are server-
// authoritative (Google Places) and never flow back from the client.
type LocationChange = SerializedLocation;
// Custom override fields are client-editable. Google base values + identity
// fields stay server-authoritative; create flows through direct actions
// (refreshAllTravelTimes / fetchMissingTravelTimes) because they need a
// Google distance lookup, and destroy is handled by location cascade.
type TravelTimeChange = SerializedTravelTime;

export type DatabaseChanges = {
  planner: ChangeGroup<PlannerChange>;
  calendar: ChangeGroup<CalendarChange>;
  template: ChangeGroup<TemplateChange>;
  extendedProps: ChangeGroup<ExtendedPropsChange>;
  category: ChangeGroup<CategoryChange>;
  categoryTimeWindow: ChangeGroup<CategoryTimeWindowChange>;
  categoryEvent: ChangeGroup<CategoryEventChange>;
  travelEvent: ChangeGroup<TravelEventChange>;
  engineMessage: ChangeGroup<EngineMessageChange>;
  queue: ChangeGroup<QueueChange>;
  queueMember: ChangeGroup<QueueMemberChange>;
  dependency: ChangeGroup<DependencyChange>;
  location: ChangeGroup<LocationChange>;
  travelTime: ChangeGroup<TravelTimeChange>;
};

// Keyed inputs: each group pairs the current arrays with the last
// server-confirmed snapshot. Optional groups skip their diff entirely when
// absent, matching the old optional-positional-pair behavior.
type SyncedGroup<T> = { current: T[]; previous: T[] };

export type SyncInputs = {
  planner: SyncedGroup<Planner>;
  calendar: SyncedGroup<SimpleEvent>;
  template?: SyncedGroup<EventTemplate>;
  categories?: SyncedGroup<Category>;
  categoryEvents?: SyncedGroup<CategoryEvent>;
  travelEvents?: SyncedGroup<TravelEvent>;
  engineMessages?: SyncedGroup<EngineMessage>;
  queues?: SyncedGroup<Queue>;
  dependencies?: SyncedGroup<PlannerDependency>;
  locations?: SyncedGroup<SerializedLocation>;
  travelTimes?: SyncedGroup<SerializedTravelTime>;
};

const deepCopyGroup = <T>(
  group: SyncedGroup<T> | undefined,
): SyncedGroup<T> | undefined =>
  group
    ? {
        current: JSON.parse(JSON.stringify(group.current)) as T[],
        previous: JSON.parse(JSON.stringify(group.previous)) as T[],
      }
    : undefined;

export async function handleServerTransaction(
  clientKnownDataVersion: number,
  inputs: SyncInputs,
) {
  // Templates, category wrappers, and travel events no longer enter
  // state.engineOutput.calendar — they live in their own redux fields and
  // their own sync diff groups. SimpleEvent[] now only carries plans +
  // scheduled tasks, so no filter is needed before the diff.
  const serialized: SyncInputs = {
    planner: deepCopyGroup(inputs.planner)!,
    calendar: deepCopyGroup(inputs.calendar)!,
    template: deepCopyGroup(inputs.template),
    categories: deepCopyGroup(inputs.categories),
    categoryEvents: deepCopyGroup(inputs.categoryEvents),
    travelEvents: deepCopyGroup(inputs.travelEvents),
    engineMessages: deepCopyGroup(inputs.engineMessages),
    queues: deepCopyGroup(inputs.queues),
    dependencies: deepCopyGroup(inputs.dependencies),
    locations: deepCopyGroup(inputs.locations),
    travelTimes: deepCopyGroup(inputs.travelTimes),
  };

  const databaseChanges = compareData(serialized);

  const response = await syncCalendarData(
    databaseChanges,
    clientKnownDataVersion,
  );

  return response;
}

export function compareData(inputs: SyncInputs) {
  const {
    planner: plannerGroup,
    calendar: calendarGroup,
    template: templateGroup,
    categories: categoriesGroup,
    categoryEvents: categoryEventsGroup,
    travelEvents: travelEventsGroup,
    engineMessages: engineMessagesGroup,
    queues: queuesGroup,
    dependencies: dependenciesGroup,
    locations: locationsGroup,
    travelTimes: travelTimesGroup,
  } = inputs;

  const databaseChanges: DatabaseChanges = {
    planner: { create: [], update: [], destroy: [] },
    calendar: { create: [], update: [], destroy: [] },
    template: { create: [], update: [], destroy: [] },
    extendedProps: { create: [], update: [], destroy: [] },
    category: { create: [], update: [], destroy: [] },
    categoryTimeWindow: { create: [], update: [], destroy: [] },
    categoryEvent: { create: [], update: [], destroy: [] },
    travelEvent: { create: [], update: [], destroy: [] },
    engineMessage: { create: [], update: [], destroy: [] },
    queue: { create: [], update: [], destroy: [] },
    queueMember: { create: [], update: [], destroy: [] },
    dependency: { create: [], update: [], destroy: [] },
    location: { create: [], update: [], destroy: [] },
    travelTime: { create: [], update: [], destroy: [] },
  };

  // Check planner changes
  const plannerMap = new Map(
    plannerGroup.current.map((planner) => [planner.id, planner]),
  );
  const prevPlanMap = new Map(
    plannerGroup.previous.map((planner) => [planner.id, planner]),
  );

  // Find items to create or update
  plannerMap.forEach((item) => {
    const prevItem = prevPlanMap.get(item.id);
    if (!prevItem) {
      databaseChanges.planner.create.push(item);
    } else if (!objectsAreEqual(prevItem, item)) {
      databaseChanges.planner.update.push(item);
    }
  });

  // Find items to delete (items in previous but not in current)
  prevPlanMap.forEach((item) => {
    if (!plannerMap.has(item.id)) {
      databaseChanges.planner.destroy.push(item);
    }
  });

  // Check calendar changes
  // Note: Generated events (travel, template, category wrappers) are already filtered out
  // before this function is called
  const calendarMap = new Map(
    calendarGroup.current.map((event) => [event.id, event]),
  );
  const prevCalMap = new Map(
    calendarGroup.previous.map((event) => [event.id, event]),
  );

  // Find events to create or update
  calendarMap.forEach((event) => {
    const prevEvent = prevCalMap.get(event.id);

    if (!prevEvent) {
      const { extendedProps, ...eventCore } = event;
      databaseChanges.calendar.create.push(eventCore as CalendarChange);

      if (extendedProps) {
        databaseChanges.extendedProps.create.push({
          ...extendedProps,
          eventId: event.id,
        } as EventExtendedProps);
      }

      return;
    }

    if (!objectsAreEqual(prevEvent, event)) {
      const { extendedProps: _extendedProps, ...eventCore } = event;
      databaseChanges.calendar.update.push(eventCore as CalendarChange);
    }

    if (
      prevEvent.extendedProps &&
      event.extendedProps &&
      !objectsAreEqual(prevEvent.extendedProps, event.extendedProps)
    ) {
      databaseChanges.extendedProps.update.push({
        ...event.extendedProps,
        eventId: event.id,
      } as EventExtendedProps);
    }
  });

  // Find events to delete (events in previous but not in current)
  prevCalMap.forEach((event) => {
    if (!calendarMap.has(event.id)) {
      const { extendedProps: _extendedProps, ...eventCore } = event;
      databaseChanges.calendar.destroy.push(eventCore as CalendarChange);
    }
  });

  // Check template changes

  if (templateGroup) {
    const templateMap = new Map(
      templateGroup.current.map((template) => [template.id, template]),
    );
    const prevTempMap = new Map(
      templateGroup.previous.map((template) => [template.id, template]),
    );

    // Find templates to create or update
    templateMap.forEach((template) => {
      const prevTemplate = prevTempMap.get(template.id);
      if (!prevTemplate) {
        databaseChanges.template.create.push(template);
      } else if (!objectsAreEqual(prevTemplate, template)) {
        databaseChanges.template.update.push(template);
      }
    });

    // Find templates to delete (templates in previous but not in current)
    prevTempMap.forEach((template) => {
      if (!templateMap.has(template.id)) {
        databaseChanges.template.destroy.push(template);
      }
    });
  }

  // Categories. timeSlots are a related table — strip before diffing so a
  // change to a window doesn't look like a category update.
  if (categoriesGroup) {
    const stripTimeSlots = (c: Category) => {
      const { timeSlots: _timeSlots, ...rest } = c;
      return rest;
    };
    const currentByCategory = new Map(
      categoriesGroup.current.map((c) => [c.id, stripTimeSlots(c)]),
    );
    const prevByCategory = new Map(
      categoriesGroup.previous.map((c) => [c.id, stripTimeSlots(c)]),
    );
    currentByCategory.forEach((cat, id) => {
      const prev = prevByCategory.get(id);
      if (!prev) {
        databaseChanges.category.create.push(cat);
      } else if (!objectsAreEqual(prev, cat)) {
        databaseChanges.category.update.push(cat);
      }
    });
    prevByCategory.forEach((cat, id) => {
      if (!currentByCategory.has(id)) {
        databaseChanges.category.destroy.push(cat);
      }
    });

    // Time windows are nested under categories in Redux but stored in their
    // own table. Flatten across all categories and diff by window id so
    // reparenting, edits, and removals each surface as a discrete operation.
    // When a category is destroyed the schema sets its windows' categoryId to
    // null (onDelete: SetNull), so we explicitly destroy those windows here
    // rather than leaving orphans — they're already absent from the current
    // category tree and present in the previous one.
    const currentWindows = categoriesGroup.current.flatMap((c) => c.timeSlots);
    const prevWindows = categoriesGroup.previous.flatMap((c) => c.timeSlots);
    const currWindowMap = new Map(currentWindows.map((w) => [w.id, w]));
    const prevWindowMap = new Map(prevWindows.map((w) => [w.id, w]));
    currWindowMap.forEach((win, id) => {
      const prev = prevWindowMap.get(id);
      if (!prev) {
        databaseChanges.categoryTimeWindow.create.push(win);
      } else if (!objectsAreEqual(prev, win)) {
        databaseChanges.categoryTimeWindow.update.push(win);
      }
    });
    prevWindowMap.forEach((win, id) => {
      if (!currWindowMap.has(id)) {
        databaseChanges.categoryTimeWindow.destroy.push(win);
      }
    });
  }

  // Queues. members are a related table — strip before diffing (the
  // categories/timeSlots pattern) so a member move doesn't look like a queue
  // update, then flatten members across queues and diff by member id.
  if (queuesGroup) {
    const stripMembers = (q: Queue) => {
      const { members: _members, ...rest } = q;
      return rest;
    };
    const currentByQueue = new Map(
      queuesGroup.current.map((q) => [q.id, stripMembers(q)]),
    );
    const prevByQueue = new Map(
      queuesGroup.previous.map((q) => [q.id, stripMembers(q)]),
    );
    currentByQueue.forEach((queue, id) => {
      const prev = prevByQueue.get(id);
      if (!prev) {
        databaseChanges.queue.create.push(queue);
      } else if (!objectsAreEqual(prev, queue)) {
        databaseChanges.queue.update.push(queue);
      }
    });
    prevByQueue.forEach((queue, id) => {
      if (!currentByQueue.has(id)) {
        databaseChanges.queue.destroy.push(queue);
      }
    });

    const currentMembers = queuesGroup.current.flatMap((q) => q.members);
    const prevMembers = queuesGroup.previous.flatMap((q) => q.members);
    const currMemberMap = new Map(currentMembers.map((m) => [m.id, m]));
    const prevMemberMap = new Map(prevMembers.map((m) => [m.id, m]));
    currMemberMap.forEach((member, id) => {
      const prev = prevMemberMap.get(id);
      if (!prev) {
        databaseChanges.queueMember.create.push(member);
      } else if (!objectsAreEqual(prev, member)) {
        databaseChanges.queueMember.update.push(member);
      }
    });
    prevMemberMap.forEach((member, id) => {
      if (!currMemberMap.has(id)) {
        databaseChanges.queueMember.destroy.push(member);
      }
    });
  }

  // Dependencies. Rows are immutable — the diff only ever produces creates
  // and destroys; an id present on both sides is by definition unchanged.
  if (dependenciesGroup) {
    const currByDependency = new Map(
      dependenciesGroup.current.map((d) => [d.id, d]),
    );
    const prevByDependency = new Map(
      dependenciesGroup.previous.map((d) => [d.id, d]),
    );
    currByDependency.forEach((dep, id) => {
      if (!prevByDependency.has(id)) {
        databaseChanges.dependency.create.push(dep);
      }
    });
    prevByDependency.forEach((dep, id) => {
      if (!currByDependency.has(id)) {
        databaseChanges.dependency.destroy.push(dep);
      }
    });
  }

  // Engine emits empty createdAt/updatedAt; DB owns those fields. Strip on
  // both sides so engine output and DB-loaded rows compare cleanly.
  const stripDbMetadata = <
    T extends { createdAt?: string; updatedAt?: string },
  >(
    e: T,
  ) => {
    const { createdAt: _c, updatedAt: _u, ...rest } = e;
    return rest;
  };

  if (categoryEventsGroup) {
    const currByEvent = new Map(
      categoryEventsGroup.current.map((e) => [e.id, e]),
    );
    const prevByEvent = new Map(
      categoryEventsGroup.previous.map((e) => [e.id, e]),
    );
    currByEvent.forEach((ev, id) => {
      const prev = prevByEvent.get(id);
      if (!prev) {
        databaseChanges.categoryEvent.create.push(ev);
      } else if (!objectsAreEqual(stripDbMetadata(prev), stripDbMetadata(ev))) {
        databaseChanges.categoryEvent.update.push(ev);
      }
    });
    prevByEvent.forEach((ev, id) => {
      if (!currByEvent.has(id)) {
        databaseChanges.categoryEvent.destroy.push(ev);
      }
    });
  }

  if (travelEventsGroup) {
    const currByTravel = new Map(
      travelEventsGroup.current.map((e) => [e.id, e]),
    );
    const prevByTravel = new Map(
      travelEventsGroup.previous.map((e) => [e.id, e]),
    );
    currByTravel.forEach((ev, id) => {
      const prev = prevByTravel.get(id);
      if (!prev) {
        databaseChanges.travelEvent.create.push(ev);
      } else if (!objectsAreEqual(stripDbMetadata(prev), stripDbMetadata(ev))) {
        databaseChanges.travelEvent.update.push(ev);
      }
    });
    prevByTravel.forEach((ev, id) => {
      if (!currByTravel.has(id)) {
        databaseChanges.travelEvent.destroy.push(ev);
      }
    });
  }

  if (engineMessagesGroup) {
    const currByMessage = new Map(
      engineMessagesGroup.current.map((m) => [m.id, m]),
    );
    const prevByMessage = new Map(
      engineMessagesGroup.previous.map((m) => [m.id, m]),
    );
    currByMessage.forEach((m, id) => {
      const prev = prevByMessage.get(id);
      if (!prev) {
        databaseChanges.engineMessage.create.push(m);
      } else if (!objectsAreEqual(stripDbMetadata(prev), stripDbMetadata(m))) {
        databaseChanges.engineMessage.update.push(m);
      }
    });
    prevByMessage.forEach((m, id) => {
      if (!currByMessage.has(id)) {
        databaseChanges.engineMessage.destroy.push(m);
      }
    });
  }

  // Travel times. Only update flows through here — create needs a Google
  // distance lookup (handled by refreshAllTravelTimes / fetchMissingTravelTimes)
  // and destroy is handled by location cascade in Prisma.
  if (travelTimesGroup) {
    const currentByTravel = new Map(
      travelTimesGroup.current.map((t) => [t.id, t]),
    );
    const prevByTravel = new Map(
      travelTimesGroup.previous.map((t) => [t.id, t]),
    );
    currentByTravel.forEach((tt, id) => {
      const prev = prevByTravel.get(id);
      if (!prev) return;
      if (!objectsAreEqual(prev, tt)) {
        databaseChanges.travelTime.update.push(tt);
      }
    });
  }

  // Locations. Only update + destroy flow through here — create needs a
  // Google Places lookup and stays as a direct server action.
  if (locationsGroup) {
    const currentByLoc = new Map(locationsGroup.current.map((l) => [l.id, l]));
    const prevByLoc = new Map(locationsGroup.previous.map((l) => [l.id, l]));
    currentByLoc.forEach((loc, id) => {
      const prev = prevByLoc.get(id);
      if (!prev) {
        // Skip — direct createLocation owns this path.
        return;
      }
      if (!objectsAreEqual(prev, loc)) {
        databaseChanges.location.update.push(loc);
      }
    });
    prevByLoc.forEach((loc, id) => {
      if (!currentByLoc.has(id)) {
        databaseChanges.location.destroy.push(loc);
      }
    });
  }

  return databaseChanges;
}
