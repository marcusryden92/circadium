import { addDays } from "date-fns";
import {
  transition,
  confirmLongPress,
  cancel,
  reset,
  computePreview,
} from "../../../calendar-core/interaction/dragMachine";
import type {
  NormalizedPointerEvent,
  GridMetrics,
  DragState,
  DragMachineConfig,
  DraggingState,
  AllowHook,
} from "../../../calendar-core/interaction/types";
import type { CalendarEvent as CalEvent } from "../../../calendar-core/model/calendarEvent";
import { EventType } from "../../../contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const monday = new Date(2026, 10, 23); // Mon Nov 23 2026
const range = { start: monday, end: addDays(monday, 7) };

const metrics: GridMetrics = {
  hourHeight: 60,
  columnWidth: 100,
  visibleRange: range,
  snapMinutes: 5,
  scrollTop: 0,
  scrollHeight: 1440,
  viewportHeight: 600,
};

const config: DragMachineConfig = {
  longPressDelay: 300,
  moveThreshold: 5,
};

function ptr(
  phase: NormalizedPointerEvent["phase"],
  x: number,
  y: number,
  time = 0,
): NormalizedPointerEvent {
  return { phase, x, y, time };
}

function makePlannerEvent(
  id: string,
  startHour: number,
  endHour: number,
  day = monday,
): CalEvent {
  const start = new Date(day);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(endHour, 0, 0, 0);
  return {
    kind: EventType.planner,
    id,
    title: "Test",
    start,
    end,
    editable: true,
    color: "#000",
    borderColor: "#000",
    props: null,
  };
}

const idle: DragState = { phase: "idle" };

// ---------------------------------------------------------------------------
// Tap (no drag)
// ---------------------------------------------------------------------------

describe("tap (no drag)", () => {
  it("start → pending, end → idle (tap releases before long-press)", () => {
    const r1 = transition(idle, ptr("start", 50, 300), metrics, config, null, "create");
    expect(r1.state.phase).toBe("pending");
    expect(r1.startTimer).toBeDefined();

    const r2 = transition(r1.state, ptr("end", 50, 300), metrics, config, null, "create");
    expect(r2.state.phase).toBe("idle");
    expect(r2.cancelTimer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Long-press then move (move drag)
// ---------------------------------------------------------------------------

describe("long-press then move", () => {
  it("pending → confirmLongPress → dragging → move → commit", () => {
    const event = makePlannerEvent("e1", 10, 11);

    const r1 = transition(idle, ptr("start", 50, 600), metrics, config, event, "move");
    expect(r1.state.phase).toBe("pending");

    const r2 = confirmLongPress(r1.state, config);
    expect(r2.state.phase).toBe("dragging");
    const dragging = r2.state as DraggingState;
    expect(dragging.kind).toBe("move");
    expect(dragging.allowed).toBe(true);

    const r3 = transition(dragging, ptr("move", 50, 630), metrics, config, event, "move");
    expect(r3.state.phase).toBe("dragging");

    const r4 = transition(r3.state, ptr("end", 50, 630), metrics, config, event, "move");
    expect(r4.state.phase).toBe("committed");
  });
});

// ---------------------------------------------------------------------------
// Long-press cancelled by scroll (move threshold exceeded)
// ---------------------------------------------------------------------------

describe("long-press cancelled by scroll", () => {
  it("pending → large move → idle (cancelled as scroll)", () => {
    const r1 = transition(idle, ptr("start", 50, 300), metrics, config, null, "create");
    expect(r1.state.phase).toBe("pending");

    // Move far enough to exceed the threshold
    const r2 = transition(
      r1.state,
      ptr("move", 50, 320),
      metrics,
      config,
      null,
      "create",
    );
    expect(r2.state.phase).toBe("idle");
    expect(r2.cancelTimer).toBeDefined();
  });

  it("small move stays in pending", () => {
    const r1 = transition(idle, ptr("start", 50, 300), metrics, config, null, "create");
    // Move within threshold
    const r2 = transition(
      r1.state,
      ptr("move", 52, 302),
      metrics,
      config,
      null,
      "create",
    );
    expect(r2.state.phase).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Move drag commit
// ---------------------------------------------------------------------------

describe("move drag commit", () => {
  it("full move sequence: start → pending → long-press → move → end", () => {
    const event = makePlannerEvent("e1", 9, 10);

    const r1 = transition(idle, ptr("start", 50, 540), metrics, config, event, "move");
    expect(r1.state.phase).toBe("pending");

    const r2 = confirmLongPress(r1.state, config);
    expect(r2.state.phase).toBe("dragging");

    // Move to a new time (y = 600 → 10:00)
    const r3 = transition(
      r2.state,
      ptr("move", 50, 600),
      metrics,
      config,
      event,
      "move",
    );
    expect(r3.state.phase).toBe("dragging");

    const r4 = transition(
      r3.state,
      ptr("end", 50, 600),
      metrics,
      config,
      event,
      "move",
    );
    expect(r4.state.phase).toBe("committed");
    if (r4.state.phase === "committed") {
      expect(r4.state.kind).toBe("move");
      expect(r4.state.startHit.minute).toBe(540);
      expect(r4.state.endHit.minute).toBe(600);
    }
  });
});

// ---------------------------------------------------------------------------
// Resize start edge
// ---------------------------------------------------------------------------

describe("resize-start edge", () => {
  it("drags the top edge up to extend the event", () => {
    const event = makePlannerEvent("e1", 10, 11);

    const r1 = transition(
      idle,
      ptr("start", 50, 600),
      metrics,
      config,
      event,
      "resize-start",
    );
    const r2 = confirmLongPress(r1.state, config);
    expect(r2.state.phase).toBe("dragging");

    // Move up: y = 540 → 9:00 (earlier start)
    const r3 = transition(
      r2.state,
      ptr("move", 50, 540),
      metrics,
      config,
      event,
      "resize-start",
    );
    expect(r3.state.phase).toBe("dragging");

    const r4 = transition(
      r3.state,
      ptr("end", 50, 540),
      metrics,
      config,
      event,
      "resize-start",
    );
    expect(r4.state.phase).toBe("committed");
    if (r4.state.phase === "committed") {
      expect(r4.state.kind).toBe("resize-start");
    }
  });
});

// ---------------------------------------------------------------------------
// Resize end edge
// ---------------------------------------------------------------------------

describe("resize-end edge", () => {
  it("drags the bottom edge down to extend the event", () => {
    const event = makePlannerEvent("e1", 10, 11);

    const r1 = transition(
      idle,
      ptr("start", 50, 660),
      metrics,
      config,
      event,
      "resize-end",
    );
    const r2 = confirmLongPress(r1.state, config);

    // Move down: y = 720 → 12:00 (later end)
    const r3 = transition(
      r2.state,
      ptr("move", 50, 720),
      metrics,
      config,
      event,
      "resize-end",
    );
    const r4 = transition(
      r3.state,
      ptr("end", 50, 720),
      metrics,
      config,
      event,
      "resize-end",
    );
    expect(r4.state.phase).toBe("committed");
    if (r4.state.phase === "committed") {
      expect(r4.state.kind).toBe("resize-end");
    }
  });
});

// ---------------------------------------------------------------------------
// Create by drag
// ---------------------------------------------------------------------------

describe("create-by-drag", () => {
  it("draws a range on empty space", () => {
    const r1 = transition(
      idle,
      ptr("start", 50, 540),
      metrics,
      config,
      null,
      "create",
    );
    const r2 = confirmLongPress(r1.state, config);

    const r3 = transition(
      r2.state,
      ptr("move", 50, 660),
      metrics,
      config,
      null,
      "create",
    );
    const r4 = transition(
      r3.state,
      ptr("end", 50, 660),
      metrics,
      config,
      null,
      "create",
    );
    expect(r4.state.phase).toBe("committed");
    if (r4.state.phase === "committed") {
      expect(r4.state.kind).toBe("create");
      expect(r4.state.startHit.minute).toBe(540);
      expect(r4.state.endHit.minute).toBe(660);
    }
  });
});

// ---------------------------------------------------------------------------
// Live allow hook rejecting mid-drag
// ---------------------------------------------------------------------------

describe("allow hook rejecting mid-drag", () => {
  it("rejected → commit becomes cancel", () => {
    const denyHook: AllowHook = () => false;
    const denyConfig: DragMachineConfig = { ...config, allowHook: denyHook };
    const event = makePlannerEvent("e1", 10, 11);

    const r1 = transition(
      idle,
      ptr("start", 50, 600),
      metrics,
      denyConfig,
      event,
      "move",
    );
    const r2 = confirmLongPress(r1.state, denyConfig);
    expect(r2.state.phase).toBe("dragging");
    if (r2.state.phase === "dragging") {
      expect(r2.state.allowed).toBe(false);
    }

    const r3 = transition(
      r2.state,
      ptr("move", 50, 660),
      metrics,
      denyConfig,
      event,
      "move",
    );
    expect(r3.state.phase).toBe("dragging");
    if (r3.state.phase === "dragging") {
      expect(r3.state.allowed).toBe(false);
    }

    // End while not allowed → cancelled
    const r4 = transition(
      r3.state,
      ptr("end", 50, 660),
      metrics,
      denyConfig,
      event,
      "move",
    );
    expect(r4.state.phase).toBe("cancelled");
  });

  it("hook can flip from deny to allow as the pointer moves", () => {
    let allowed = false;
    const flipHook: AllowHook = () => allowed;
    const flipConfig: DragMachineConfig = { ...config, allowHook: flipHook };
    const event = makePlannerEvent("e1", 10, 11);

    const r1 = transition(
      idle,
      ptr("start", 50, 600),
      metrics,
      flipConfig,
      event,
      "move",
    );
    const r2 = confirmLongPress(r1.state, flipConfig);
    expect((r2.state as DraggingState).allowed).toBe(false);

    // Move while still denied
    const r3 = transition(
      r2.state,
      ptr("move", 50, 660),
      metrics,
      flipConfig,
      event,
      "move",
    );
    expect((r3.state as DraggingState).allowed).toBe(false);

    // Now allow
    allowed = true;
    const r4 = transition(
      r3.state,
      ptr("move", 50, 720),
      metrics,
      flipConfig,
      event,
      "move",
    );
    expect((r4.state as DraggingState).allowed).toBe(true);

    // Commit succeeds now
    const r5 = transition(
      r4.state,
      ptr("end", 50, 720),
      metrics,
      flipConfig,
      event,
      "move",
    );
    expect(r5.state.phase).toBe("committed");
  });
});

// ---------------------------------------------------------------------------
// Cancel from various phases
// ---------------------------------------------------------------------------

describe("cancel", () => {
  it("cancel from pending cancels the timer", () => {
    const r1 = transition(idle, ptr("start", 50, 300), metrics, config, null, "create");
    const r2 = cancel(r1.state);
    expect(r2.state.phase).toBe("cancelled");
    expect(r2.cancelTimer).toBeDefined();
  });

  it("cancel from dragging", () => {
    const event = makePlannerEvent("e1", 10, 11);
    const r1 = transition(idle, ptr("start", 50, 600), metrics, config, event, "move");
    const r2 = confirmLongPress(r1.state, config);
    const r3 = cancel(r2.state);
    expect(r3.state.phase).toBe("cancelled");
  });

  it("cancel from idle is a no-op", () => {
    const r = cancel(idle);
    expect(r.state.phase).toBe("idle");
  });

  it("pointer cancel during dragging", () => {
    const event = makePlannerEvent("e1", 10, 11);
    const r1 = transition(idle, ptr("start", 50, 600), metrics, config, event, "move");
    const r2 = confirmLongPress(r1.state, config);
    const r3 = transition(
      r2.state,
      ptr("cancel", 50, 600),
      metrics,
      config,
      event,
      "move",
    );
    expect(r3.state.phase).toBe("cancelled");
  });

  it("pointer cancel during pending", () => {
    const r1 = transition(idle, ptr("start", 50, 300), metrics, config, null, "create");
    const r2 = transition(r1.state, ptr("cancel", 50, 300), metrics, config, null, "create");
    expect(r2.state.phase).toBe("idle");
    expect(r2.cancelTimer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe("reset", () => {
  it("returns idle from any state", () => {
    expect(reset().state.phase).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// computePreview
// ---------------------------------------------------------------------------

describe("computePreview", () => {
  it("returns a preview for a move drag", () => {
    const event = makePlannerEvent("e1", 10, 11);
    const dragging: DraggingState = {
      phase: "dragging",
      kind: "move",
      event,
      startHit: { day: monday, minute: 600 },
      currentHit: { day: monday, minute: 660 },
      allowed: true,
    };
    const preview = computePreview(dragging, event, "move");
    expect(preview).not.toBeNull();
    expect(preview!.startMinute).toBe(660);
    expect(preview!.endMinute).toBe(720);
  });

  it("returns a preview for create drag", () => {
    const dragging: DraggingState = {
      phase: "dragging",
      kind: "create",
      event: null,
      startHit: { day: monday, minute: 540 },
      currentHit: { day: monday, minute: 660 },
      allowed: true,
    };
    const preview = computePreview(dragging, null, "create");
    expect(preview).not.toBeNull();
    expect(preview!.startMinute).toBe(540);
    expect(preview!.endMinute).toBe(660);
  });

  it("resize-end extends the event", () => {
    const event = makePlannerEvent("e1", 10, 11);
    const dragging: DraggingState = {
      phase: "dragging",
      kind: "resize-end",
      event,
      startHit: { day: monday, minute: 660 },
      currentHit: { day: monday, minute: 720 },
      allowed: true,
    };
    const preview = computePreview(dragging, event, "resize-end");
    expect(preview).not.toBeNull();
    expect(preview!.startMinute).toBe(600);
    expect(preview!.endMinute).toBe(720);
  });

  it("resize-start shortens from the top", () => {
    const event = makePlannerEvent("e1", 10, 12);
    const dragging: DraggingState = {
      phase: "dragging",
      kind: "resize-start",
      event,
      startHit: { day: monday, minute: 600 },
      currentHit: { day: monday, minute: 660 },
      allowed: true,
    };
    const preview = computePreview(dragging, event, "resize-start");
    expect(preview).not.toBeNull();
    expect(preview!.startMinute).toBe(660);
    expect(preview!.endMinute).toBe(720);
  });
});

// ---------------------------------------------------------------------------
// Outside-grid start is ignored
// ---------------------------------------------------------------------------

describe("outside grid", () => {
  it("start event outside grid stays idle", () => {
    const r = transition(idle, ptr("start", -10, -10), metrics, config, null, "create");
    expect(r.state.phase).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// Confirm long-press from non-pending state is a no-op
// ---------------------------------------------------------------------------

describe("confirmLongPress from non-pending", () => {
  it("idle → no-op", () => {
    const r = confirmLongPress(idle, config);
    expect(r.state.phase).toBe("idle");
  });
});
