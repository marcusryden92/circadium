import { decideEdit, type EditContext } from "../../../calendar-core/edit/decideEdit";
import type {
  TemplateCalendarEvent,
  PlannerCalendarEvent,
  CategoryCalendarEvent,
  TravelCalendarEvent,
  ExternalCalendarEvent,
} from "../../../calendar-core/model/calendarEvent";
import { EventType } from "../../../contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const monday = new Date(2026, 10, 23, 10, 0);
const mondayEnd = new Date(2026, 10, 23, 11, 0);

function makeTemplateEvent(opts?: {
  moved?: boolean;
  editable?: boolean;
}): TemplateCalendarEvent {
  return {
    kind: EventType.template,
    id: "tmpl1|2026-11-23T10:00",
    title: "Sleep",
    start: monday,
    end: mondayEnd,
    editable: opts?.editable ?? true,
    templateId: "tmpl1",
    occurrenceKey: "2026-11-23T10:00",
    moved: opts?.moved ?? false,
    color: "#333",
  };
}

function makePlannerEvent(opts?: {
  id?: string;
  editable?: boolean;
}): PlannerCalendarEvent {
  return {
    kind: EventType.planner,
    id: opts?.id ?? "plan1",
    title: "Meeting",
    start: monday,
    end: mondayEnd,
    editable: opts?.editable ?? true,
    color: "#000",
    borderColor: "#000",
    props: null,
  };
}

function makePlanOccurrenceEvent(): PlannerCalendarEvent {
  return {
    kind: EventType.planner,
    id: "plan1|2026-11-23T10:00",
    title: "Weekly sync",
    start: monday,
    end: mondayEnd,
    editable: true,
    color: "#000",
    borderColor: "#000",
    props: null,
  };
}

function makeCategoryEvent(): CategoryCalendarEvent {
  return {
    kind: EventType.category,
    id: "cat1",
    title: "Work",
    start: monday,
    end: mondayEnd,
    editable: false,
    categoryId: "c1",
    categoryName: "Work",
    categoryColor: "#00f",
    isStrict: false,
    trespassingStart: false,
    trespassingEnd: false,
  };
}

function makeTravelEvent(): TravelCalendarEvent {
  return {
    kind: EventType.travel,
    id: "travel1",
    title: "Commute",
    start: monday,
    end: mondayEnd,
    editable: false,
    fromLocationId: "loc1",
    toLocationId: "loc2",
    fromLocationName: "Home",
    toLocationName: "Office",
    travelMinutes: 30,
    requiredTravelMinutes: null,
    insufficientTravel: false,
    overconstrained: false,
  };
}

function makeExternalEvent(): ExternalCalendarEvent {
  return {
    kind: EventType.external,
    id: "ext1",
    title: "External",
    start: monday,
    end: mondayEnd,
    editable: false,
    sourceId: "src1",
    uid: "uid1",
    busy: true,
    allDay: false,
    sourceName: "Google",
    accent: null,
  };
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function buildContext(opts?: {
  hasMoved?: boolean;
  isRecurring?: boolean;
  templateResolvable?: boolean;
  planResolvable?: boolean;
}): EditContext {
  return {
    hasMovedException: () => opts?.hasMoved ?? false,
    planIsRecurring: () => opts?.isRecurring ?? false,
    resolveTemplateOccurrence: () =>
      (opts?.templateResolvable ?? true)
        ? {
            templateId: "tmpl1",
            templateTitle: "Sleep",
            occurrenceKey: "2026-11-23T10:00",
            recurrenceExceptions: null,
          }
        : null,
    resolvePlanOccurrence: () =>
      (opts?.planResolvable ?? false)
        ? {
            planId: "plan1",
            planTitle: "Weekly sync",
            occurrenceKey: "2026-11-23T10:00",
            recurrenceExceptions: null,
            recurrence: '{"freq":"weekly","interval":1}',
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Template: not customized → askScope
// ---------------------------------------------------------------------------

describe("template events", () => {
  it("not customized → askScope for move", () => {
    const ctx = buildContext({ hasMoved: false });
    const result = decideEdit(makeTemplateEvent(), "move", ctx);
    expect(result.action).toBe("askScope");
    if (result.action === "askScope") {
      expect(result.entityType).toBe("template");
      expect(result.editKind).toBe("move");
      expect(result.entityId).toBe("tmpl1");
    }
  });

  it("not customized → askScope for resize", () => {
    const ctx = buildContext({ hasMoved: false });
    const result = decideEdit(makeTemplateEvent(), "resize", ctx);
    expect(result.action).toBe("askScope");
    if (result.action === "askScope") {
      expect(result.editKind).toBe("resize");
    }
  });

  it("not customized → askScope for delete", () => {
    const ctx = buildContext({ hasMoved: false });
    const result = decideEdit(makeTemplateEvent(), "delete", ctx);
    expect(result.action).toBe("askScope");
    if (result.action === "askScope") {
      expect(result.editKind).toBe("delete");
    }
  });

  // Template: already customized → apply directly (skip prompt)
  it("already customized → apply with occurrence data for move", () => {
    const ctx = buildContext({ hasMoved: true });
    const result = decideEdit(makeTemplateEvent({ moved: true }), "move", ctx);
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("single");
      if (result.scope === "single") {
        expect(result.entityId).toBe("tmpl1");
        expect(result.entityType).toBe("template");
        expect(result.occurrenceKey).toBe("2026-11-23T10:00");
      }
    }
  });

  it("already customized → apply for resize", () => {
    const ctx = buildContext({ hasMoved: true });
    const result = decideEdit(
      makeTemplateEvent({ moved: true }),
      "resize",
      ctx,
    );
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("single");
    }
  });

  it("already customized → apply for delete", () => {
    const ctx = buildContext({ hasMoved: true });
    const result = decideEdit(
      makeTemplateEvent({ moved: true }),
      "delete",
      ctx,
    );
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("single");
    }
  });

  // Template: unresolvable occurrence → reject
  it("unresolvable → reject", () => {
    const ctx = buildContext({ templateResolvable: false });
    const result = decideEdit(makeTemplateEvent(), "move", ctx);
    expect(result.action).toBe("reject");
  });

  // Template: not editable → reject
  it("not editable → reject", () => {
    const ctx = buildContext();
    const result = decideEdit(
      makeTemplateEvent({ editable: false }),
      "move",
      ctx,
    );
    expect(result.action).toBe("reject");
  });
});

// ---------------------------------------------------------------------------
// Plan occurrence: recurring, not customized → askScope
// ---------------------------------------------------------------------------

describe("plan occurrence events", () => {
  it("recurring, not customized → askScope", () => {
    const ctx = buildContext({
      planResolvable: true,
      isRecurring: true,
      hasMoved: false,
    });
    const result = decideEdit(makePlanOccurrenceEvent(), "move", ctx);
    expect(result.action).toBe("askScope");
    if (result.action === "askScope") {
      expect(result.entityType).toBe("plan");
      expect(result.entityId).toBe("plan1");
    }
  });

  it("recurring, already customized → apply with occurrence data", () => {
    const ctx = buildContext({
      planResolvable: true,
      isRecurring: true,
      hasMoved: true,
    });
    const result = decideEdit(makePlanOccurrenceEvent(), "move", ctx);
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("single");
      if (result.scope === "single") {
        expect(result.entityId).toBe("plan1");
        expect(result.entityType).toBe("plan");
      }
    }
  });

  it("not recurring → direct apply (no occurrence data)", () => {
    const ctx = buildContext({
      planResolvable: true,
      isRecurring: false,
    });
    const result = decideEdit(makePlanOccurrenceEvent(), "move", ctx);
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("direct");
    }
  });
});

// ---------------------------------------------------------------------------
// Non-recurring planner event → apply
// ---------------------------------------------------------------------------

describe("non-recurring planner events", () => {
  it("non-occurrence planner → direct apply", () => {
    const ctx = buildContext({ planResolvable: false });
    const result = decideEdit(makePlannerEvent(), "move", ctx);
    expect(result.action).toBe("apply");
    if (result.action === "apply") {
      expect(result.scope).toBe("direct");
    }
  });

  it("non-editable planner → reject", () => {
    const ctx = buildContext();
    const result = decideEdit(
      makePlannerEvent({ editable: false }),
      "move",
      ctx,
    );
    expect(result.action).toBe("reject");
  });
});

// ---------------------------------------------------------------------------
// Non-editable event types → reject
// ---------------------------------------------------------------------------

describe("non-editable event types", () => {
  it("category → reject", () => {
    const ctx = buildContext();
    const result = decideEdit(makeCategoryEvent(), "move", ctx);
    expect(result.action).toBe("reject");
  });

  it("travel → reject", () => {
    const ctx = buildContext();
    const result = decideEdit(makeTravelEvent(), "move", ctx);
    expect(result.action).toBe("reject");
  });

  it("external → reject", () => {
    const ctx = buildContext();
    const result = decideEdit(makeExternalEvent(), "move", ctx);
    expect(result.action).toBe("reject");
  });
});
