/**
 * Direct-drive tests for the static travel pass. Unlike the full-pipeline
 * suites these hand-build the slot fabric and call staticEventTravelPass
 * straight — the pass only needs a slots array and a TravelManager, no slot
 * fabric generation.
 *
 * Covered regressions:
 *  - an entry travel that exactly consumes its category must not skip the
 *    following category's entry edge
 *  - cascade fallbacks must keep the leg ledger balanced (a replayed
 *    same-pair leg survives a bypass-cascade trespass fallback; the
 *    absorb-and-replan fallback re-tracks what it untracked)
 *  - odd travel times split on whole-minute boundaries at category-to-
 *    category bleeds
 *  - absorbed category time never resurfaces as a leading free Available
 *  - a transition at the array edge (missing prev) is still placed
 *  - no zero-duration slots survive a pass
 */

import { EventType, PlannerType } from "@/types/prisma";
import { TimeSlotManager } from "@/utils/calendar-generation/core/TimeSlotManager";
import { TravelManager } from "@/utils/calendar-generation/core/TravelManager";
import { staticEventTravelPass } from "@/utils/calendar-generation/helpers/TravelManager/staticEventTravelPass";
import { TravelTimeEntry } from "@/utils/calendar-generation/models/SchedulingModels";
import {
  AvailableSlot,
  CategorySlot,
  OccupiedSlot,
  Slot,
  TravelSlot,
} from "@/utils/calendar-generation/models/TimeSlot";

const HOME = "home";
const WORK = "work";
const GYM = "gym";

const BASE = new Date("2026-03-04T08:00:00");
const at = (minutes: number) => new Date(BASE.getTime() + minutes * 60000);

function buildMatrix(
  entries: Array<[string, string, number]>,
): Map<string, TravelTimeEntry> {
  const matrix = new Map<string, TravelTimeEntry>();
  for (const [from, to, minutes] of entries) {
    matrix.set(`${from}->${to}`, {
      fromLocationId: from,
      toLocationId: to,
      rushHourMinutes: minutes,
      regularMinutes: minutes,
      nightMinutes: minutes,
    });
  }
  return matrix;
}

function makeTravelManager(
  entries: Array<[string, string, number]>,
): TravelManager {
  return new TravelManager(new TimeSlotManager(BASE, 0), 0, buildMatrix(entries));
}

function available(
  startMin: number,
  endMin: number,
  prev: string | null,
  next: string | null,
): AvailableSlot {
  return {
    type: "available",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    prevLocationId: prev,
    nextLocationId: next,
  };
}

function category(
  startMin: number,
  endMin: number,
  categoryId: string,
  loc: string,
  prev: string | null,
  next: string | null,
): CategorySlot {
  return {
    type: "category",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    currentLocationId: loc,
    prevLocationId: prev,
    nextLocationId: next,
    categoryId,
    isStrictCategory: false,
  };
}

function occupied(startMin: number, endMin: number, loc: string): OccupiedSlot {
  return {
    type: "occupied",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    eventId: `occupied-${startMin}`,
    plannerType: PlannerType.plan,
    eventType: EventType.planner,
    locationId: loc,
  };
}

function travelShard(
  startMin: number,
  endMin: number,
  from: string,
  to: string,
  originalType: "available" | "category",
): TravelSlot {
  return {
    type: "travel",
    start: at(startMin),
    end: at(endMin),
    durationMinutes: endMin - startMin,
    eventId: `travel-${startMin}`,
    eventType: EventType.travel,
    travelType: "preliminary",
    travelFromLocationId: from,
    travelToLocationId: to,
    insufficientTravel: false,
    requiredTravelMinutes: 0,
    travelId: `travel-${startMin}`,
    originalType,
    originalSourceStart: at(startMin),
    originalSourceEnd: at(endMin),
    ...(originalType === "category"
      ? { originalCategoryId: "prior-category", originalLocationId: from }
      : { originalPrevLocationId: from, originalNextLocationId: from }),
  };
}

function runPass(slots: Slot[], travelManager: TravelManager): Slot[] {
  staticEventTravelPass(true, [], slots, travelManager, undefined, 0);
  return slots;
}

const travels = (slots: Slot[]): TravelSlot[] =>
  slots.filter((s): s is TravelSlot => s.type === "travel");

function expectWellFormed(slots: Slot[]): void {
  for (const slot of slots) {
    expect(slot.end.getTime()).toBeGreaterThan(slot.start.getTime());
  }
  for (let i = 1; i < slots.length; i++) {
    expect(slots[i].start.getTime()).toBe(slots[i - 1].end.getTime());
  }
}

describe("staticEventTravelPass", () => {
  test("entry travel that exactly consumes a category still places the next category's entry travel", () => {
    const travelManager = makeTravelManager([
      [HOME, WORK, 30],
      [WORK, GYM, 20],
    ]);
    const slots: Slot[] = [
      occupied(0, 60, HOME),
      category(60, 90, "c1", WORK, HOME, GYM),
      category(90, 180, "c2", GYM, WORK, null),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    const toWork = travels(slots).filter((t) => t.travelToLocationId === WORK);
    const toGym = travels(slots).filter((t) => t.travelToLocationId === GYM);
    expect(toWork).toHaveLength(1);
    expect(toWork[0].start.getTime()).toBe(at(60).getTime());
    expect(toWork[0].end.getTime()).toBe(at(90).getTime());
    // The fully consumed category is recorded for the wrapper markers.
    expect(toWork[0].consumedCategoryIds).toContain("c1");

    // The follower category's entry edge must have run: WORK -> GYM placed
    // at its head.
    expect(toGym).toHaveLength(1);
    expect(toGym[0].start.getTime()).toBe(at(90).getTime());
    expect(toGym[0].end.getTime()).toBe(at(110).getTime());

    const gymCategory = slots.find(
      (s): s is CategorySlot => s.type === "category" && s.categoryId === "c2",
    );
    expect(gymCategory).toBeDefined();
    expect(gymCategory!.start.getTime()).toBe(at(110).getTime());
  });

  test("bypass-cascade trespass fallback keeps a replayed same-pair leg open", () => {
    const travelManager = makeTravelManager([[WORK, GYM, 40]]);
    // Simulate the expandSlots resume replay: an earlier WORK -> GYM outbound
    // travel exists in the preserved region.
    travelManager.trackLeg(WORK, GYM);

    // Entry into a 10-minute GYM category can't fit the 40-minute travel and
    // the forward cascade finds nothing (end of fabric) — trespass fallback.
    const slots: Slot[] = [
      occupied(0, 60, WORK),
      category(60, 70, "c1", GYM, WORK, null),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);
    expect(travels(slots)).toHaveLength(0);

    // The replayed leg must still be open: a GYM -> WORK trip mirrors it.
    // An unbalanced double-untrack in the fallback strips it, making this
    // read as a fresh outbound (false).
    expect(travelManager.trackLeg(GYM, WORK)).toBe(true);
  });

  test("absorb-and-replan fallback re-tracks the legs it untracked", () => {
    // No HOME -> GYM entry in the matrix, so the A -> C replan aborts after
    // untracking both legs and falls back to an insufficient travel.
    const travelManager = makeTravelManager([
      [HOME, WORK, 30],
      [WORK, GYM, 40],
    ]);
    const slots: Slot[] = [
      occupied(0, 60, HOME),
      available(60, 100, HOME, WORK),
      available(100, 120, WORK, GYM),
      occupied(120, 180, GYM),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    const insufficient = travels(slots).filter((t) => t.insufficientTravel);
    expect(insufficient.length).toBeGreaterThan(0);
    expect(
      insufficient.every((t) => t.travelToLocationId === GYM),
    ).toBe(true);

    // Both legs must be back in the ledger: the placed HOME -> WORK travel
    // and the placed (insufficient) WORK -> GYM travel each mirror-close.
    expect(travelManager.trackLeg(GYM, WORK)).toBe(true);
    expect(travelManager.trackLeg(WORK, HOME)).toBe(true);
  });

  test("odd travel time splits a category boundary on whole minutes", () => {
    const travelManager = makeTravelManager([
      [HOME, WORK, 30],
      [WORK, GYM, 45],
    ]);
    const slots: Slot[] = [
      occupied(0, 60, HOME),
      category(60, 180, "c1", WORK, HOME, GYM),
      category(180, 300, "c2", GYM, WORK, null),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    for (const slot of slots) {
      expect(slot.start.getTime() % 60000).toBe(0);
      expect(slot.end.getTime() % 60000).toBe(0);
    }

    const boundaryShards = travels(slots).filter(
      (t) => t.travelToLocationId === GYM,
    );
    expect(boundaryShards.length).toBeGreaterThan(0);
    const spanStart = Math.min(...boundaryShards.map((t) => t.start.getTime()));
    const spanEnd = Math.max(...boundaryShards.map((t) => t.end.getTime()));
    // Current side takes the ceil: 23 minutes before the boundary, 22 after.
    expect(spanStart).toBe(at(157).getTime());
    expect(spanEnd).toBe(at(202).getTime());
  });

  test("absorbed category-sourced travel time never resurfaces as a leading Available", () => {
    const travelManager = makeTravelManager([
      [HOME, WORK, 60],
      [WORK, GYM, 60],
      [HOME, GYM, 30],
    ]);
    const slots: Slot[] = [
      occupied(0, 60, HOME),
      travelShard(60, 120, HOME, WORK, "category"),
      available(120, 140, WORK, GYM),
      occupied(140, 200, GYM),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    // The replanned HOME -> GYM travel must span the whole absorbed region
    // (overconstrained), not shrink to 30 minutes behind a fabricated
    // "free at HOME" Available.
    expect(slots.filter((s) => s.type === "available")).toHaveLength(0);
    const replanned = travels(slots);
    expect(replanned.length).toBeGreaterThan(0);
    expect(replanned[0].start.getTime()).toBe(at(60).getTime());
    expect(replanned.every((t) => t.travelToLocationId === GYM)).toBe(true);
    expect(replanned.some((t) => t.overconstrained)).toBe(true);
  });

  test("absorbed available-sourced travel time is recovered as a leading Available", () => {
    const travelManager = makeTravelManager([
      [HOME, WORK, 60],
      [WORK, GYM, 60],
      [HOME, GYM, 30],
    ]);
    const slots: Slot[] = [
      occupied(0, 60, HOME),
      travelShard(60, 120, HOME, WORK, "available"),
      available(120, 140, WORK, GYM),
      occupied(140, 200, GYM),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    const leading = slots.find((s): s is AvailableSlot => s.type === "available");
    expect(leading).toBeDefined();
    expect(leading!.start.getTime()).toBe(at(60).getTime());
    expect(leading!.end.getTime()).toBe(at(110).getTime());
    expect(leading!.prevLocationId).toBe(HOME);
    expect(leading!.nextLocationId).toBe(HOME);

    const replanned = travels(slots);
    expect(replanned[0].start.getTime()).toBe(at(110).getTime());
    expect(replanned.some((t) => t.overconstrained)).toBe(false);
  });

  test("a too-small Available at the array edge still places its transition", () => {
    const travelManager = makeTravelManager([[HOME, WORK, 30]]);
    const slots: Slot[] = [
      available(0, 10, HOME, WORK),
      category(10, 120, "c1", WORK, HOME, null),
    ];

    runPass(slots, travelManager);
    expectWellFormed(slots);

    const placed = travels(slots);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed[0].start.getTime()).toBe(at(0).getTime());
    const spanEnd = Math.max(...placed.map((t) => t.end.getTime()));
    expect(spanEnd).toBe(at(30).getTime());

    const workCategory = slots.find(
      (s): s is CategorySlot => s.type === "category",
    );
    expect(workCategory!.start.getTime()).toBe(at(30).getTime());
    expect(workCategory!.trespassingStart).toBeFalsy();
  });
});
