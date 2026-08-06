import calendarSourceSlice, {
  hydrateSource,
  recordHistory,
  shiftHistoryForUndo,
  shiftHistoryForRedo,
  setPlannerAndTemplate,
} from "@/redux/slices/calendarSourceSlice";
import type {
  Planner,
  EventTemplate,
  Category,
  Queue,
  PlannerDependency,
} from "@/types/prisma";

const reducer = calendarSourceSlice.reducer;

const plannerA = [{ id: "a" }] as unknown as Planner[];
const plannerB = [{ id: "b" }] as unknown as Planner[];
const templateA = [{ id: "t1" }] as unknown as EventTemplate[];
const emptySource = {
  planner: [] as Planner[],
  template: [] as EventTemplate[],
  categories: [] as Category[],
  queues: [] as Queue[],
  dependencies: [] as PlannerDependency[],
};

const seeded = () =>
  reducer(
    undefined,
    hydrateSource({ ...emptySource, planner: plannerA, template: templateA }),
  );

describe("calendarSource history", () => {
  it("recordHistory pushes the current arrays by reference and clears future", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));

    expect(state.past).toHaveLength(1);
    expect(state.past[0].planner).toBe(plannerA);
    expect(state.past[0].template).toBe(templateA);
    expect(state.future).toHaveLength(0);

    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerB, template: templateA }),
    );
    state = reducer(state, shiftHistoryForUndo());
    expect(state.future).toHaveLength(1);

    state = reducer(state, recordHistory({ label: "test edit" }));
    expect(state.future).toHaveLength(0);
  });

  it("undo shift moves the current snapshot onto future and pops past", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));
    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerB, template: templateA }),
    );

    state = reducer(state, shiftHistoryForUndo());
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(1);
    expect(state.future[0].planner).toBe(plannerB);
    // The arrays themselves are untouched — the thunk performs the restore.
    expect(state.planner).toBe(plannerB);
  });

  it("redo shift is symmetric", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));
    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerB, template: templateA }),
    );
    state = reducer(state, shiftHistoryForUndo());
    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerA, template: templateA }),
    );

    state = reducer(state, shiftHistoryForRedo());
    expect(state.past).toHaveLength(1);
    expect(state.past[0].planner).toBe(plannerA);
    expect(state.future).toHaveLength(0);
  });

  it("the label travels with the entry across both stacks", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));
    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerB, template: templateA }),
    );
    state = reducer(state, shiftHistoryForUndo());
    expect(state.future[0].label).toBe("test edit");
    state = reducer(state, shiftHistoryForRedo());
    expect(state.past[0].label).toBe("test edit");
  });

  it("shift reducers are no-ops on empty stacks", () => {
    const state = seeded();
    expect(reducer(state, shiftHistoryForUndo()).future).toHaveLength(0);
    expect(reducer(state, shiftHistoryForRedo()).past).toHaveLength(0);
  });

  it("past is capped at 50 entries, dropping the oldest", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));
    const oldest = state.past[0];
    for (let i = 0; i < 54; i++) {
      state = reducer(state, recordHistory({ label: "test edit" }));
    }
    expect(state.past).toHaveLength(50);
    expect(state.past.includes(oldest)).toBe(false);
  });

  it("hydrateSource clears both stacks", () => {
    let state = seeded();
    state = reducer(state, recordHistory({ label: "test edit" }));
    state = reducer(
      state,
      setPlannerAndTemplate({ planner: plannerB, template: templateA }),
    );
    state = reducer(state, shiftHistoryForUndo());
    expect(state.past.length + state.future.length).toBeGreaterThan(0);

    state = reducer(state, hydrateSource(emptySource));
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });
});
