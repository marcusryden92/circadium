"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useCalendarProvider } from "@/context/CalendarProvider";
import type { EventTemplate } from "@/types/prisma";
import { completeOnboarding } from "@/actions/onboarding";
import {
  reconcileRoleCategories,
  prefillRoleSelections,
  type RoleSelection,
} from "./_lib/starterCategories";
import {
  buildWeekTemplates,
  reconcileWeekTemplateRows,
  DEFAULT_WEEK,
  type WeekFormInput,
  type WeekUIState,
} from "./_lib/weekTemplates";
import { applyWorkCategory, clearWorkCategoryWindows } from "./_lib/workCategory";
import {
  applyBrainDump,
  type CommittedDump,
  type DumpItem,
} from "./_lib/brainDumpRows";
import {
  loadProgress,
  saveProgress,
  clearProgress,
  type StoredProgress,
} from "./_lib/onboardingProgress";
import { historyMessages } from "@/utils/historyMessages";
import {
  makeEmptyRow,
  type LocationRow,
} from "./_components/LocationRows";
import { WelcomeStep } from "./_steps/WelcomeStep";
import { RolesStep } from "./_steps/RolesStep";
import { LocationsStep } from "./_steps/LocationsStep";
import { WeekStep } from "./_steps/WeekStep";
import { BrainDumpStep } from "./_steps/BrainDumpStep";
import { OnboardingAIStep } from "./_steps/OnboardingAIStep";

const TOTAL_STEPS = 6;

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const {
    categories,
    template,
    locations,
    userId,
    isLoaded,
    updateAll,
    updatePlannerArray,
  } = useCalendarProvider();

  // Parsed once per mount; every initializer below reads from this instead of
  // re-reading localStorage.
  const [initialProgress] = useState<StoredProgress | null>(() =>
    loadProgress(userId),
  );

  // Resume where the user left off; steps are non-destructive so a stale index
  // is harmless.
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (initialProgress && typeof initialProgress.stepIndex === "number") {
      return Math.min(Math.max(initialProgress.stepIndex, 0), TOTAL_STEPS - 1);
    }
    return 0;
  });

  // Step form state. Prefills that depend on server data (existing roles,
  // existing locations, the Work location auto-pick) run as effects below —
  // the overlay mounts before the initial fetch resolves, so a mount-time
  // initializer would always see empty arrays.
  const [roles, setRoles] = useState<RoleSelection[]>([]);
  const [locationRows, setLocationRows] = useState<LocationRow[]>([
    makeEmptyRow("Home"),
    makeEmptyRow("Work"),
  ]);
  const [week, setWeek] = useState<WeekUIState>(
    () => initialProgress?.week ?? DEFAULT_WEEK,
  );

  // Brain-dump jots; the id on each becomes the Planner row id (idempotency
  // key), so re-committing on Back/forward upserts instead of duplicating.
  const [dumpItems, setDumpItems] = useState<DumpItem[]>(
    () => initialProgress?.dumpItems ?? [],
  );

  const [finishing, setFinishing] = useState(false);

  // What this flow committed, so re-committing (Back/forward, or a resumed
  // session) reconciles instead of stacking duplicates. Roles and week track
  // owned ids for removal/replace; the dump tracks a per-id snapshot so a
  // re-commit only overwrites fields the user actually re-edited.
  const roleCommittedIds = useRef<Set<string>>(
    new Set(initialProgress?.roleCommittedIds ?? []),
  );
  const weekTemplateIds = useRef<Set<string>>(
    new Set(initialProgress?.weekTemplateIds ?? []),
  );
  const weekWorkApplied = useRef<boolean>(
    initialProgress?.weekWorkApplied ?? false,
  );
  const dumpCommitted = useRef<Map<string, CommittedDump>>(
    new Map(
      (initialProgress?.dumpCommitted ?? []).map((d) => [
        d.id,
        { title: d.title, type: d.type },
      ]),
    ),
  );
  const aiConversationId = useRef<string | null>(
    initialProgress?.aiConversationId ?? null,
  );

  // Touched flags gate the data-driven prefills: once the user has edited a
  // step's state, a late-arriving snapshot must not overwrite it.
  const rolesTouched = useRef(false);
  const rowsTouched = useRef(false);
  const weekTouched = useRef(initialProgress?.week != null);

  const handleRolesChange = useCallback((next: RoleSelection[]) => {
    rolesTouched.current = true;
    setRoles(next);
  }, []);
  const handleRowsChange = useCallback((next: LocationRow[]) => {
    rowsTouched.current = true;
    setLocationRows(next);
  }, []);
  const handleWeekChange = useCallback((next: WeekUIState) => {
    weekTouched.current = true;
    setWeek(next);
  }, []);

  // Prefill picked roles from existing top-level categories once the initial
  // snapshot lands (returning user, or a resumed session whose roles were
  // already committed). Without this a resumed Roles step renders empty and a
  // Continue would deselect-and-delete every owned role.
  const rolesPrefilled = useRef(false);
  useEffect(() => {
    if (!isLoaded || rolesPrefilled.current) return;
    rolesPrefilled.current = true;
    if (rolesTouched.current) return;
    const prefill = prefillRoleSelections(categories);
    if (prefill.length > 0) setRoles(prefill);
  }, [isLoaded, categories]);

  // Prefill location rows from existing locations when they hydrate (they load
  // asynchronously via UserProvider, independent of the calendar fetch).
  const rowsPrefilled = useRef(false);
  useEffect(() => {
    if (rowsPrefilled.current || rowsTouched.current) return;
    if (locations.length === 0) return;
    rowsPrefilled.current = true;
    setLocationRows([
      ...locations.map((l) => ({
        key: uuidv4(),
        name: l.name,
        query: l.address,
        selected: null,
        createdId: l.id,
      })),
      makeEmptyRow(),
    ]);
  }, [locations]);

  // Auto-pick a location named "Work" for the work-hours block the first time
  // one exists — including the one the user just created on the Locations
  // step. Never fires once the user has edited the Week form.
  const workLocationAutoPicked = useRef(initialProgress?.week != null);
  useEffect(() => {
    if (workLocationAutoPicked.current || weekTouched.current) return;
    const workLocation = locations.find(
      (l) => l.name.trim().toLowerCase() === "work",
    );
    if (!workLocation) return;
    workLocationAutoPicked.current = true;
    setWeek((prev) =>
      prev.workLocationId ? prev : { ...prev, workLocationId: workLocation.id },
    );
  }, [locations]);

  const persistProgress = useCallback(
    (step: number) => {
      saveProgress(userId, {
        version: 4,
        stepIndex: step,
        roleCommittedIds: [...roleCommittedIds.current],
        weekTemplateIds: [...weekTemplateIds.current],
        week: weekTouched.current ? week : null,
        weekWorkApplied: weekWorkApplied.current,
        dumpItems,
        dumpCommitted: [...dumpCommitted.current].map(([id, s]) => ({
          id,
          title: s.title,
          type: s.type,
        })),
        aiConversationId: aiConversationId.current,
      });
    },
    [dumpItems, week, userId],
  );

  useEffect(() => {
    persistProgress(stepIndex);
  }, [stepIndex, persistProgress]);

  const handleAiConversationIdChange = useCallback(
    (id: string | null) => {
      if (aiConversationId.current === id) return;
      aiConversationId.current = id;
      persistProgress(stepIndex);
    },
    [persistProgress, stepIndex],
  );

  const goNext = useCallback(
    () => setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1)),
    [],
  );
  const goBack = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);

  const commitRoles = useCallback(() => {
    const nowIso = new Date().toISOString();
    // A stable candidate id per selection keeps the reconcile deterministic;
    // the whole reconcile runs here (against the provider's current
    // categories) so the owned-id set advances in the same synchronous pass —
    // no side effects inside a state updater. Safe because commits are gated
    // on isLoaded and this flow is the only categories writer while the
    // overlay is up.
    const candidateIds = new Map(
      roles.map((r) => [r.name.trim().toLowerCase(), uuidv4()] as const),
    );
    const { categories: nextCategories, ownedIds } = reconcileRoleCategories(
      categories,
      roles,
      roleCommittedIds.current,
      candidateIds,
      userId,
      nowIso,
    );
    roleCommittedIds.current = ownedIds;
    updateAll(undefined, undefined, undefined, nextCategories, undefined, undefined, {
      label: historyMessages.onboarding.commit,
    });
  }, [roles, categories, updateAll, userId]);

  const commitWeek = useCallback(() => {
    // Home-based blocks (sleep, routines) default to a location named "Home"
    // when the user has one — mirrors the Work-location auto-pick. Absent a
    // Home location, they stay Anywhere (null).
    const homeLocationId =
      locations.find((l) => l.name.trim().toLowerCase() === "home")?.id ?? null;
    const form: WeekFormInput = {
      sleep: week.sleepEnabled
        ? { start: week.sleepStart, end: week.sleepEnd, locationId: homeLocationId }
        : null,
      work: week.workEnabled
        ? {
            start: week.workStart,
            end: week.workEnd,
            days: week.workDays,
            locationId: week.workLocationId,
          }
        : null,
      exercise: week.exerciseEnabled
        ? {
            start: week.exerciseStart,
            end: week.exerciseEnd,
            days: week.exerciseDays,
          }
        : null,
      morning: week.morningEnabled
        ? { start: week.morningStart, end: week.morningEnd, locationId: homeLocationId }
        : null,
      evening: week.eveningEnabled
        ? { start: week.eveningStart, end: week.eveningEnd, locationId: homeLocationId }
        : null,
    };
    const nowIso = new Date().toISOString();
    // Mint templates outside the updater, reusing the previously committed row
    // for any unchanged block so a Back/forward pass produces an empty diff
    // instead of a delete+create per block.
    const prevOwned = weekTemplateIds.current;
    const prevOwnedRows = template.filter((t) => prevOwned.has(t.id));
    const built = reconcileWeekTemplateRows(
      prevOwnedRows,
      buildWeekTemplates(form, userId, nowIso),
    );
    weekTemplateIds.current = new Set(built.map((t) => t.id));
    const templateUpdater = (prev: EventTemplate[]) => [
      ...prev.filter((t) => !prevOwned.has(t.id)),
      ...built,
    ];
    // Sleep rides as a template; work hours become windows on a Work category
    // (nested under Professional). Disabling work after a commit clears the
    // windows this flow applied — the reconcile has to work in both
    // directions. Both go in one updateAll so they share a regen.
    const hasWork = Boolean(form.work && form.work.days.length > 0);
    updateAll(
      undefined,
      undefined,
      templateUpdater,
      hasWork
        ? (prev) => applyWorkCategory(prev, form.work, userId, nowIso)
        : weekWorkApplied.current
          ? (prev) => clearWorkCategoryWindows(prev, nowIso)
          : undefined,
      undefined,
      undefined,
      { label: historyMessages.onboarding.commit },
    );
    weekWorkApplied.current = hasWork;
  }, [week, template, locations, updateAll, userId]);

  const commitBrainDump = useCallback(() => {
    const nowIso = new Date().toISOString();
    const items = dumpItems;
    const prevCommitted = dumpCommitted.current;
    updatePlannerArray(
      (prev) => applyBrainDump(prev, items, prevCommitted, userId, nowIso),
      historyMessages.onboarding.commit,
    );
    dumpCommitted.current = new Map(
      items.map((it) => [it.id, { title: it.title.trim(), type: it.type }]),
    );
  }, [dumpItems, updatePlannerArray, userId]);

  const finish = useCallback(async () => {
    setFinishing(true);
    let stamped = false;
    try {
      await completeOnboarding();
      stamped = true;
    } catch {
      // Don't trap the user if the stamp fails; every surface this flow sets
      // up (roles, locations, week, capture) is reachable on its own.
    }
    // Only clear progress once the stamp landed — otherwise the server gate
    // re-shows onboarding on the next load, and we want it to resume where the
    // user was (with their jots) rather than restart from scratch.
    if (stamped) {
      clearProgress(userId);
    }
    onComplete();
  }, [onComplete, userId]);

  switch (stepIndex) {
    case 0:
      return (
        <WelcomeStep
          stepIndex={0}
          totalSteps={TOTAL_STEPS}
          onGetStarted={goNext}
          onSkipSetup={finish}
          finishing={finishing}
        />
      );
    case 1:
      return (
        <RolesStep
          stepIndex={1}
          totalSteps={TOTAL_STEPS}
          selections={roles}
          onChange={handleRolesChange}
          onBack={goBack}
          continueDisabled={!isLoaded}
          onContinue={() => {
            commitRoles();
            goNext();
          }}
          onSkip={goNext}
        />
      );
    case 2:
      return (
        <LocationsStep
          stepIndex={2}
          totalSteps={TOTAL_STEPS}
          rows={locationRows}
          onRowsChange={handleRowsChange}
          onBack={goBack}
          continueDisabled={!isLoaded}
          onContinue={goNext}
          onSkip={goNext}
        />
      );
    case 3:
      return (
        <WeekStep
          stepIndex={3}
          totalSteps={TOTAL_STEPS}
          value={week}
          onChange={handleWeekChange}
          onBack={goBack}
          continueDisabled={!isLoaded}
          onContinue={() => {
            commitWeek();
            goNext();
          }}
          onSkip={goNext}
        />
      );
    case 4:
      return (
        <BrainDumpStep
          stepIndex={4}
          totalSteps={TOTAL_STEPS}
          items={dumpItems}
          onChange={setDumpItems}
          onBack={goBack}
          continueDisabled={!isLoaded}
          onContinue={() => {
            commitBrainDump();
            goNext();
          }}
          onSkip={goNext}
        />
      );
    default:
      return (
        <OnboardingAIStep
          stepIndex={5}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onFinish={finish}
          onSkip={finish}
          finishing={finishing}
          resumeConversationId={aiConversationId.current}
          onConversationIdChange={handleAiConversationIdChange}
        />
      );
  }
}
